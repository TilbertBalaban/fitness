import { fromCanonicalKg, toCanonicalKg, type WeightUnit } from '@fitness/api-contracts';
import { eq } from 'drizzle-orm';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  applyKeypadPress,
  nextKeypadField,
  NumericKeypadView,
  type KeypadField,
  type KeypadPress,
} from '@/components/NumericKeypad';
import { type SetRowValues } from '@/components/SetRow';
import { countCompletedWorkingSets, ExerciseStripView, type ExerciseStripExercise } from '@/components/ExerciseStrip';
import { clampPagerIndex, ExercisePagerView } from '@/components/ExercisePager';
import { ExercisePageView } from '@/components/ExercisePage';
import { authClient } from '@/lib/auth-client';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { logSet, startWorkoutFromProgram, updateLoggedSet } from '@/lib/db/log-set';
import { loadNextUp, type NextUpData } from '@/lib/db/programs/next-up-query';
import type { ProgramCycle, ProgramDay } from '@/lib/db/programs/load-program';
import { loadLiveSession, type LiveSessionData, type LoggedSetRow, type SessionExerciseRow } from '@/lib/db/session-query';
import { userPreference } from '@/lib/db/schema';
import { resolveNextUp, type NextUp } from '@/lib/programs/next-up';
import { SessionModeProvider } from '@/lib/session/session-mode';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';

export type WorkoutScreenState = 'error' | 'loading' | 'no-session' | 'ready';

export interface WorkoutScreenStateInput {
  failed: boolean;
  session: LiveSessionData | null;
  nextUp: NextUp<ProgramDay, ProgramCycle> | null;
}

// In the exact shape of deriveHomeScreenState (index.tsx): failed beats everything, `session`
// staying null with `nextUp` still unresolved means the read has not landed yet, and `nextUp`
// only ever gets resolved once `loadLiveSession` has confirmed there is no session to show instead.
export function deriveWorkoutScreenState({ failed, session, nextUp }: WorkoutScreenStateInput): WorkoutScreenState {
  if (failed) return 'error';
  if (session !== null) return 'ready';
  if (nextUp !== null) return 'no-session';
  return 'loading';
}

async function loadWeightUnit(userId: string, db = getPowerSync()): Promise<WeightUnit> {
  const [row] = await db
    .select({ weightUnit: userPreference.weightUnit })
    .from(userPreference)
    .where(eq(userPreference.id, userId));
  return (row?.weightUnit as WeightUnit | undefined) ?? DEFAULT_WEIGHT_UNIT;
}

export interface WorkoutScreenRead {
  session: LiveSessionData | null;
  nextUp: NextUp<ProgramDay, ProgramCycle> | null;
  weightUnit: WeightUnit;
}

export type WorkoutScreenReadResult = WorkoutScreenRead | { failed: true };

export interface WorkoutScreenLoaders {
  loadSession?: (userId: string | null) => Promise<LiveSessionData | null>;
  loadNextUpData?: (userId: string | null) => Promise<NextUpData>;
  loadUnit?: (userId: string) => Promise<WeightUnit>;
}

// The whole body of the screen's read, extracted so the read/failure/resolve sequence is
// exercised without a renderer — same technique as index.tsx's readNextUp.
export async function readWorkoutScreenData(
  userId: string | null,
  loaders: WorkoutScreenLoaders = {},
): Promise<WorkoutScreenReadResult> {
  const loadSession = loaders.loadSession ?? ((id: string | null) => loadLiveSession(id, getPowerSync()));
  const loadNextUpData = loaders.loadNextUpData ?? ((id: string | null) => loadNextUp(id, getPowerSync()));
  const loadUnit = loaders.loadUnit ?? ((id: string) => loadWeightUnit(id, getPowerSync()));

  try {
    const session = await loadSession(userId);
    if (session) {
      const weightUnit = userId ? await loadUnit(userId) : DEFAULT_WEIGHT_UNIT;
      return { session, nextUp: null, weightUnit };
    }

    const nextUpData = await loadNextUpData(userId);
    const nextUp = resolveNextUp<ProgramDay, ProgramCycle>({
      routine: nextUpData.routine,
      days: nextUpData.days,
      cycles: nextUpData.cycles,
      history: nextUpData.history,
      today: nextUpData.today,
    });
    return { session: null, nextUp, weightUnit: DEFAULT_WEIGHT_UNIT };
  } catch (error) {
    console.error('workout screen load failed', error);
    return { failed: true };
  }
}

// Reps/RIR prefill from the session_exercise snapshot every time a fresh draft slot opens (D-16);
// weight starts blank (Task 3 fills it from history). EMPTY_PRESCRIPTION's nulls flow straight
// through — a one-off exercise's draft carries no target and formatFieldValue renders the dash.
export function defaultDraftValues(exercise: SessionExerciseRow): SetRowValues {
  const reps = exercise.targetRepMax ?? exercise.targetRepMin;
  return {
    weight: null,
    reps: reps === null ? null : String(reps),
    rir: exercise.targetRir === null ? null : String(exercise.targetRir),
  };
}

export interface ActiveFieldState {
  exerciseId: string;
  setId: string | null;
  field: KeypadField;
  value: string | null;
  touched: boolean;
}

export interface RowOverride {
  weightKg?: string | null;
  reps?: number;
  rir?: number | null;
  completed?: boolean;
}

export interface ResolvedSetRow {
  setId: string | null;
  setIndex: number;
  values: SetRowValues;
  completed: boolean;
}

interface BuildSetRowsActiveField {
  setId: string | null;
  field: KeypadField;
  value: string | null;
  touched: boolean;
}

// Warm-up rows always render ahead of working rows, regardless of raw set_index — RESEARCH.md
// Pitfall 2: set_index is a flat, strictly-incrementing counter across the whole session_exercise,
// not a "which came first" signal, so a warm-up added after working sets already exist would sort
// after them without this explicit bucket-then-concat step.
function orderForDisplay(existingSets: LoggedSetRow[]): LoggedSetRow[] {
  const warmups = existingSets.filter((row) => row.setType === 'warmup');
  const working = existingSets.filter((row) => row.setType !== 'warmup');
  return [...warmups, ...working];
}

// Existing rows (DB truth, patched by any local override not yet reflected by a reload) plus
// exactly one trailing draft — the tracer's one-set-at-a-time model, which is what keeps a
// completed row's assigned set_index always equal to its position in this list (LOG-07 ordering).
export function buildSetRows(
  existingSets: LoggedSetRow[],
  rowOverrides: Record<string, RowOverride>,
  draftValues: SetRowValues,
  weightUnit: WeightUnit,
  activeField: BuildSetRowsActiveField | null,
): ResolvedSetRow[] {
  const ordered = orderForDisplay(existingSets);
  const rows: ResolvedSetRow[] = ordered.map((row) => {
    const override = rowOverrides[row.id];
    const weightKg = override?.weightKg !== undefined ? override.weightKg : row.weightKg;
    const reps = override?.reps !== undefined ? override.reps : row.reps;
    const rir = override?.rir !== undefined ? override.rir : row.rir;
    const completed = override?.completed !== undefined ? override.completed : row.completed;

    let values: SetRowValues = {
      weight: fromCanonicalKg(weightKg, weightUnit),
      reps: String(reps),
      rir: rir === null ? null : String(rir),
    };
    if (activeField && activeField.setId === row.id && activeField.touched) {
      values = { ...values, [activeField.field]: activeField.value };
    }

    return { setId: row.id, setIndex: row.setIndex, values, completed };
  });

  let draft = draftValues;
  if (activeField && activeField.setId === null && activeField.touched) {
    draft = { ...draft, [activeField.field]: activeField.value };
  }
  rows.push({ setId: null, setIndex: existingSets.length + 1, values: draft, completed: false });

  return rows;
}

const WEIGHT_STEP_KG = 2.5;
const WEIGHT_STEP_LB = 0.5;
const INTEGER_STEP = 1;

export function stepAmountFor(field: KeypadField, weightUnit: WeightUnit): number {
  if (field !== 'weight') return INTEGER_STEP;
  return weightUnit === 'lb' ? WEIGHT_STEP_LB : WEIGHT_STEP_KG;
}

export interface WorkoutScreenViewProps {
  screenState: WorkoutScreenState;
  colors: ThemeColors;
  exercises: ExerciseStripExercise[];
  currentExerciseId: string | null;
  currentIndex: number;
  pagerWidth: number;
  rowsByExercise: Record<string, ResolvedSetRow[]>;
  activeField: ActiveFieldState | null;
  starting: boolean;
  canStartWorkout: boolean;
  nextUpHeading: string | null;
  weightUnit: WeightUnit;
  onStartWorkout: () => void;
  onSelectExercise: (exerciseId: string) => void;
  onIndexChange: (index: number) => void;
  onAddExercise: () => void;
  onFieldPress: (exerciseId: string, setId: string | null, field: KeypadField, currentValue: string | null) => void;
  onKeypadPress: (press: KeypadPress) => void;
  onSubmitField: () => void;
  onCheckmarkPress: (exerciseId: string, setId: string | null) => void;
}

// Hook-free — direct-invocable by Jest with no renderer, matching CycleStripView/DayDeckView.
// `colors` arrives as a prop; SessionModeProvider is mounted by the default export below, not
// here, so this component's own output is identical whether or not a mode provider wraps it.
// ExerciseStripView/ExercisePagerView/ExercisePageView/NumericKeypadView are all separate,
// independently-tested component boundaries composed here as real JSX — a test that needs to see
// inside one of them calls it directly with the props this view handed it, the same technique
// established for SetRowView/NumericKeypadView/PrimaryButton in the tracer task.
export function WorkoutScreenView({
  screenState,
  colors,
  exercises,
  currentExerciseId,
  currentIndex,
  pagerWidth,
  rowsByExercise,
  activeField,
  starting,
  canStartWorkout,
  nextUpHeading,
  weightUnit,
  onStartWorkout,
  onSelectExercise,
  onIndexChange,
  onAddExercise,
  onFieldPress,
  onKeypadPress,
  onSubmitField,
  onCheckmarkPress,
}: WorkoutScreenViewProps) {
  if (screenState === 'error') {
    return (
      <View className="mt-xl gap-sm px-lg">
        <Text className="text-heading font-semibold text-foreground">Workout couldn&apos;t load</Text>
        <Text className="text-body font-normal text-foreground-muted">
          Restart the app to try again. Your programs and history are safe.
        </Text>
      </View>
    );
  }

  if (screenState === 'loading') {
    return (
      <View className="mt-xl gap-sm px-lg">
        <View className="rounded-md bg-surface" style={{ height: 64 }} />
      </View>
    );
  }

  if (screenState === 'no-session') {
    return (
      <View className="mt-xl gap-md px-lg">
        <Text className="text-heading font-semibold text-foreground">
          {canStartWorkout ? (nextUpHeading ?? 'Start today’s workout') : 'No active program'}
        </Text>
        {canStartWorkout ? (
          <PrimaryButton label="Start Workout" onPress={onStartWorkout} submitting={starting} />
        ) : (
          <Text className="text-body font-normal text-foreground-muted">
            Build or activate a program, or start a one-off workout.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ExerciseStripView
        exercises={exercises}
        currentExerciseId={currentExerciseId}
        colors={colors}
        onSelectExercise={onSelectExercise}
        onAddExercise={onAddExercise}
      />
      <ExercisePagerView
        exercises={exercises}
        index={currentIndex}
        onIndexChange={onIndexChange}
        width={pagerWidth}
        renderExercise={(exercise) => (
          <ExercisePageView
            exerciseName={exercise.name}
            rows={rowsByExercise[exercise.id] ?? []}
            activeField={activeField && activeField.exerciseId === exercise.id ? { setId: activeField.setId, field: activeField.field } : null}
            colors={colors}
            onFieldPress={(setId, field, currentValue) => onFieldPress(exercise.id, setId, field, currentValue)}
            onCheckmarkPress={(setId) => onCheckmarkPress(exercise.id, setId)}
          />
        )}
      />

      {activeField ? (
        <NumericKeypadView
          field={activeField.field}
          stepAmount={stepAmountFor(activeField.field, weightUnit)}
          colors={colors}
          onPress={onKeypadPress}
          onSubmit={onSubmitField}
        />
      ) : null}
    </View>
  );
}

export interface UseWorkoutScreenOptions {
  userId: string | null;
  // Present only for the __durability harness (workout-screen.spec.ts): routes every read/write
  // this hook makes at the harness's isolated test database instead of the production singleton,
  // the same seam every db-accepting helper in this file already exposes.
  db?: WriteDb;
}

export type WorkoutScreenViewModel = Omit<WorkoutScreenViewProps, 'colors'>;

// The whole screen's state machine, extracted so __durability.web.tsx's workout-screen harness
// mode can mount the exact same behaviour against its own database — the real WorkoutScreenView,
// driven by real DOM clicks in a real browser, is what workout-screen.spec.ts proves (D-01).
export function useWorkoutScreen({ userId, db }: UseWorkoutScreenOptions): WorkoutScreenViewModel {
  const [read, setRead] = useState<WorkoutScreenReadResult | null>(null);
  const [activeField, setActiveField] = useState<ActiveFieldState | null>(null);
  const [draftValuesByExercise, setDraftValuesByExercise] = useState<Record<string, SetRowValues>>({});
  const [rowOverrides, setRowOverrides] = useState<Record<string, RowOverride>>({});
  const [starting, setStarting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { width: pagerWidth } = useWindowDimensions();
  const lastSessionIdRef = useRef<string | null>(null);

  // Resets the pager back to the first exercise only when the open session's identity actually
  // changes (a fresh start, or a different device's session synced in) — not on every reload, or
  // completing a set on exercise 3 would yank the pager back to exercise 1 the instant the
  // checkmark landed.
  const applyReadResult = useCallback((result: WorkoutScreenReadResult) => {
    const nextSessionId = !('failed' in result) ? (result.session?.session.id ?? null) : null;
    if (lastSessionIdRef.current !== nextSessionId) {
      lastSessionIdRef.current = nextSessionId;
      setCurrentIndex(0);
    }

    setRead(result);
    setRowOverrides({});
    if (!('failed' in result) && result.session) {
      const session = result.session;
      setDraftValuesByExercise((current) => {
        const drafts = { ...current };
        for (const exercise of session.exercises) {
          if (!(exercise.id in drafts)) drafts[exercise.id] = defaultDraftValues(exercise);
        }
        return drafts;
      });
    }
  }, []);

  const loadersFor = useCallback(
    (): WorkoutScreenLoaders =>
      db
        ? {
            loadSession: (id) => loadLiveSession(id, db),
            loadNextUpData: (id) => loadNextUp(id, db),
            loadUnit: (id) => loadWeightUnit(id, db),
          }
        : {},
    [db],
  );

  const reload = useCallback(async (): Promise<WorkoutScreenReadResult> => {
    const result = await readWorkoutScreenData(userId, loadersFor());
    applyReadResult(result);
    return result;
  }, [userId, applyReadResult, loadersFor]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const result = await readWorkoutScreenData(userId, loadersFor());
        if (!active) return;
        applyReadResult(result);
      })();
      return () => {
        active = false;
      };
    }, [userId, applyReadResult, loadersFor]),
  );

  const failed = read !== null && 'failed' in read;
  const liveSession = read !== null && !('failed' in read) ? read.session : null;
  const nextUp = read !== null && !('failed' in read) ? read.nextUp : null;
  const weightUnit = read !== null && !('failed' in read) ? read.weightUnit : DEFAULT_WEIGHT_UNIT;
  const screenState = deriveWorkoutScreenState({ failed, session: liveSession, nextUp });

  const sessionExercises = liveSession?.exercises ?? [];
  const safeIndex = clampPagerIndex(currentIndex, sessionExercises.length);
  const currentExercise = sessionExercises[safeIndex] ?? null;

  const exercises: ExerciseStripExercise[] = sessionExercises.map((exercise) => {
    const existingSets = liveSession?.setsByExerciseId[exercise.id] ?? [];
    const completedWorkingSets = countCompletedWorkingSets(
      existingSets.map((row) => ({ setType: row.setType, completed: rowOverrides[row.id]?.completed ?? row.completed })),
    );
    return {
      id: exercise.id,
      name: exercise.exerciseName,
      completedWorkingSets,
      targetSets: exercise.targetSets ?? 0,
    };
  });

  const rowsByExercise: Record<string, ResolvedSetRow[]> = {};
  for (const exercise of sessionExercises) {
    const existingSets = liveSession?.setsByExerciseId[exercise.id] ?? [];
    const draftValues = draftValuesByExercise[exercise.id] ?? defaultDraftValues(exercise);
    const activeFieldForExercise = activeField && activeField.exerciseId === exercise.id ? activeField : null;
    rowsByExercise[exercise.id] = buildSetRows(existingSets, rowOverrides, draftValues, weightUnit, activeFieldForExercise);
  }

  async function handleStartWorkout() {
    if (!nextUp || nextUp.kind !== 'workout' || starting) return;
    setStarting(true);
    try {
      await startWorkoutFromProgram(
        {
          routineDayId: nextUp.day.id,
          cycleId: nextUp.cycle?.id ?? null,
          slots: nextUp.day.slots.map((slot) => ({
            routineExerciseId: slot.id,
            exerciseId: slot.exerciseId,
            orderIndex: slot.orderIndex,
          })),
        },
        db,
      );
      await reload();
    } finally {
      setStarting(false);
    }
  }

  function handleSelectExercise(exerciseId: string) {
    const index = sessionExercises.findIndex((exercise) => exercise.id === exerciseId);
    if (index === -1) return;
    setActiveField(null);
    setCurrentIndex(index);
  }

  function handleIndexChange(index: number) {
    setActiveField(null);
    setCurrentIndex(clampPagerIndex(index, sessionExercises.length));
  }

  function handleAddExercise() {
    // No-op this task — 05-06 wires this to ExercisePickerModal in multi-select mode.
  }

  function handleFieldPress(exerciseId: string, setId: string | null, field: KeypadField, currentValue: string | null) {
    setActiveField({ exerciseId, setId, field, value: currentValue, touched: false });
  }

  function handleKeypadPress(press: KeypadPress) {
    setActiveField((current) =>
      current ? { ...current, value: applyKeypadPress(current.value, press), touched: true } : current,
    );
  }

  async function handleSubmitField() {
    if (!activeField) return;
    const exercise = sessionExercises.find((candidate) => candidate.id === activeField.exerciseId);
    if (!exercise) return;
    const existingSets = liveSession?.setsByExerciseId[exercise.id] ?? [];
    const draftValues = draftValuesByExercise[exercise.id] ?? defaultDraftValues(exercise);

    let updatedDraft = draftValues;
    let updatedOverride: RowOverride | undefined;

    if (activeField.touched) {
      if (activeField.setId === null) {
        updatedDraft = { ...draftValues, [activeField.field]: activeField.value };
        setDraftValuesByExercise((current) => ({ ...current, [exercise.id]: updatedDraft }));
      } else {
        const setId = activeField.setId;
        if (activeField.field === 'weight') {
          await updateLoggedSet({ id: setId, weight: { value: activeField.value, unit: weightUnit } }, db);
          updatedOverride = { weightKg: toCanonicalKg(activeField.value, weightUnit) };
        } else if (activeField.field === 'reps') {
          const reps = activeField.value === null ? 0 : Number(activeField.value);
          await updateLoggedSet({ id: setId, reps }, db);
          updatedOverride = { reps };
        } else {
          const rir = activeField.value === null ? null : Number(activeField.value);
          await updateLoggedSet({ id: setId, rir }, db);
          updatedOverride = { rir };
        }
        setRowOverrides((current) => ({ ...current, [setId]: { ...current[setId], ...updatedOverride } }));
      }
    }

    const next = nextKeypadField(activeField.field);
    if (next === null) {
      setActiveField(null);
      return;
    }

    const row = activeField.setId ? existingSets.find((r) => r.id === activeField.setId) ?? null : null;
    let nextValue: string | null;
    if (activeField.setId === null) {
      nextValue = updatedDraft[next];
    } else if (row) {
      const merged = { ...rowOverrides[row.id], ...updatedOverride };
      const weightKg = merged.weightKg !== undefined ? merged.weightKg : row.weightKg;
      const reps = merged.reps !== undefined ? merged.reps : row.reps;
      const rir = merged.rir !== undefined ? merged.rir : row.rir;
      nextValue =
        next === 'weight' ? fromCanonicalKg(weightKg, weightUnit) : next === 'reps' ? String(reps) : rir === null ? null : String(rir);
    } else {
      nextValue = null;
    }

    setActiveField({ exerciseId: exercise.id, setId: activeField.setId, field: next, value: nextValue, touched: false });
  }

  async function handleCheckmarkPress(exerciseId: string, setId: string | null) {
    const exercise = sessionExercises.find((candidate) => candidate.id === exerciseId);
    if (!exercise) return;
    const existingSets = liveSession?.setsByExerciseId[exercise.id] ?? [];

    if (setId === null) {
      const draftValues = draftValuesByExercise[exercise.id] ?? defaultDraftValues(exercise);
      // LOG-07: reps must hold a value to reach completed=true — rejected without writing.
      if (draftValues.reps === null || draftValues.reps === '') return;
      await logSet(
        {
          sessionExerciseId: exercise.id,
          weight: { value: draftValues.weight, unit: weightUnit },
          reps: Number(draftValues.reps),
          rir: draftValues.rir === null ? null : Number(draftValues.rir),
          completed: true,
        },
        db,
      );
      setActiveField(null);
      await reload();
      return;
    }

    const row = existingSets.find((r) => r.id === setId);
    if (!row) return;
    const currentCompleted = rowOverrides[setId]?.completed ?? row.completed;
    const nextCompleted = !currentCompleted;
    await updateLoggedSet({ id: setId, completed: nextCompleted }, db);
    setRowOverrides((current) => ({ ...current, [setId]: { ...current[setId], completed: nextCompleted } }));
  }

  const nextUpHeading =
    nextUp && nextUp.kind === 'workout' ? (nextUp.cycle ? `${nextUp.day.name} · ${nextUp.cycle.name}` : nextUp.day.name) : null;

  return {
    screenState,
    exercises,
    currentExerciseId: currentExercise?.id ?? null,
    currentIndex: safeIndex,
    pagerWidth,
    rowsByExercise,
    activeField,
    starting,
    canStartWorkout: nextUp?.kind === 'workout',
    nextUpHeading,
    weightUnit,
    onStartWorkout: () => void handleStartWorkout(),
    onSelectExercise: handleSelectExercise,
    onIndexChange: handleIndexChange,
    onAddExercise: handleAddExercise,
    onFieldPress: handleFieldPress,
    onKeypadPress: handleKeypadPress,
    onSubmitField: () => void handleSubmitField(),
    onCheckmarkPress: (exerciseId, setId) => void handleCheckmarkPress(exerciseId, setId),
  };
}

export default function WorkoutScreen() {
  const colors = useThemeColors();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  const vm = useWorkoutScreen({ userId });

  return (
    <SessionModeProvider mode="live">
      <WorkoutScreenView {...vm} colors={colors} />
    </SessionModeProvider>
  );
}

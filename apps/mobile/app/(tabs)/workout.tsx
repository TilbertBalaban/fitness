import { fromCanonicalKg, toCanonicalKg, type WeightUnit } from '@fitness/api-contracts';
import { eq } from 'drizzle-orm';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  applyKeypadPress,
  nextKeypadField,
  NumericKeypadView,
  type KeypadField,
  type KeypadPress,
} from '@/components/NumericKeypad';
import { SetRowView, type SetRowValues } from '@/components/SetRow';
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

// Existing rows (DB truth, patched by any local override not yet reflected by a reload) plus
// exactly one trailing draft — the tracer's one-set-at-a-time model, which is what keeps a
// completed row's assigned set_index always equal to its position in this list (LOG-07 ordering).
export function buildSetRows(
  existingSets: LoggedSetRow[],
  rowOverrides: Record<string, RowOverride>,
  draftValues: SetRowValues,
  weightUnit: WeightUnit,
  activeField: ActiveFieldState | null,
): ResolvedSetRow[] {
  const rows: ResolvedSetRow[] = existingSets.map((row) => {
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
  exerciseName: string | null;
  rows: ResolvedSetRow[];
  activeField: ActiveFieldState | null;
  starting: boolean;
  canStartWorkout: boolean;
  nextUpHeading: string | null;
  weightUnit: WeightUnit;
  onStartWorkout: () => void;
  onFieldPress: (setId: string | null, field: KeypadField, currentValue: string | null) => void;
  onKeypadPress: (press: KeypadPress) => void;
  onSubmitField: () => void;
  onCheckmarkPress: (setId: string | null) => void;
}

// Hook-free — direct-invocable by Jest with no renderer, matching CycleStripView/DayDeckView.
// `colors` arrives as a prop; SessionModeProvider is mounted by the default export below, not
// here, so this component's own output is identical whether or not a mode provider wraps it.
export function WorkoutScreenView({
  screenState,
  colors,
  exerciseName,
  rows,
  activeField,
  starting,
  canStartWorkout,
  nextUpHeading,
  weightUnit,
  onStartWorkout,
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
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
        <Text className="mb-md text-heading font-semibold text-foreground">{exerciseName}</Text>
        {rows.map((row) => (
          <SetRowView
            key={row.setId ?? `draft-${row.setIndex}`}
            setIndex={row.setIndex}
            values={row.values}
            completed={row.completed}
            activeField={activeField && activeField.setId === row.setId ? activeField.field : null}
            colors={colors}
            onFieldPress={(field) => onFieldPress(row.setId, field, row.values[field])}
            onCheckmarkPress={() => onCheckmarkPress(row.setId)}
          />
        ))}
      </ScrollView>

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
  const [draftValues, setDraftValues] = useState<SetRowValues>({ weight: null, reps: null, rir: null });
  const [rowOverrides, setRowOverrides] = useState<Record<string, RowOverride>>({});
  const [starting, setStarting] = useState(false);

  const applyReadResult = useCallback((result: WorkoutScreenReadResult) => {
    setRead(result);
    setRowOverrides({});
    if (!('failed' in result) && result.session) {
      const firstExercise = result.session.exercises[0];
      if (firstExercise) {
        setDraftValues(defaultDraftValues(firstExercise));
      }
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

  const firstExercise = liveSession?.exercises[0] ?? null;
  const existingSets = firstExercise ? (liveSession?.setsByExerciseId[firstExercise.id] ?? []) : [];
  const rows = firstExercise ? buildSetRows(existingSets, rowOverrides, draftValues, weightUnit, activeField) : [];

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

  function handleFieldPress(setId: string | null, field: KeypadField, currentValue: string | null) {
    setActiveField({ setId, field, value: currentValue, touched: false });
  }

  function handleKeypadPress(press: KeypadPress) {
    setActiveField((current) =>
      current ? { ...current, value: applyKeypadPress(current.value, press), touched: true } : current,
    );
  }

  async function handleSubmitField() {
    if (!activeField || !firstExercise) return;

    let updatedDraft = draftValues;
    let updatedOverride: RowOverride | undefined;

    if (activeField.touched) {
      if (activeField.setId === null) {
        updatedDraft = { ...draftValues, [activeField.field]: activeField.value };
        setDraftValues(updatedDraft);
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

    setActiveField({ setId: activeField.setId, field: next, value: nextValue, touched: false });
  }

  async function handleCheckmarkPress(setId: string | null) {
    if (!firstExercise) return;

    if (setId === null) {
      // LOG-07: reps must hold a value to reach completed=true — rejected without writing.
      if (draftValues.reps === null || draftValues.reps === '') return;
      await logSet(
        {
          sessionExerciseId: firstExercise.id,
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
    exerciseName: firstExercise?.exerciseName ?? null,
    rows,
    activeField,
    starting,
    canStartWorkout: nextUp?.kind === 'workout',
    nextUpHeading,
    weightUnit,
    onStartWorkout: () => void handleStartWorkout(),
    onFieldPress: handleFieldPress,
    onKeypadPress: handleKeypadPress,
    onSubmitField: () => void handleSubmitField(),
    onCheckmarkPress: (setId) => void handleCheckmarkPress(setId),
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

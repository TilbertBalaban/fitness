// This is D-32's `editing` subtree: the past-tense half of the workout screen, physically
// separated into its own module so the live-session machinery is structurally UNREACHABLE from
// here rather than merely unused. Nothing in this file imports scheduleRestAlert or
// shouldAutoAdvance — grep this file for either name and it reports zero code occurrences (05-10
// Task 2 acceptance criteria). Sets are written through the exact same logSet/updateLoggedSet path
// the live screen uses (D-01's durability applies identically); the only things missing are rest
// scheduling and auto-advance, because a past workout being corrected is not a running session.
import { toCanonicalKg, fromCanonicalKg, type WeightUnit } from '@fitness/api-contracts';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Text, useWindowDimensions, View } from 'react-native';
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
import { ExercisePage } from '@/components/ExercisePage';
import { ExercisePickerModal, type PickerCatalogRow } from '@/components/ExercisePickerModal';
import { SessionDateField, formatEditingHeader } from '@/components/SessionDateField';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { logSet, setSessionDate, updateLoggedSet } from '@/lib/db/log-set';
import { loadWeightUnit } from '@/lib/db/preferences';
import { addExerciseToSession } from '@/lib/db/session-mutations';
import {
  loadSessionTree,
  previousSetReferencesForSession,
  type LiveSessionData,
  type PreviousSetReferenceMap,
} from '@/lib/db/session-query';
import {
  buildSetRows,
  defaultDraftValues,
  EMPTY_PAGE_DATA,
  stepAmountFor,
  type ActiveFieldState,
  type ExercisePageData,
  type ResolvedSetRow,
  type RowOverride,
} from '@/lib/session/set-row-builders';
import { resolveSessionScreenMode, SessionModeProvider } from '@/lib/session/session-mode';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg';
const HISTORY_ROUTE = '/(tabs)/history';
const LIVE_WORKOUT_ROUTE = '/(tabs)/workout';

export type EditingWorkoutScreenState = 'error' | 'loading' | 'ready';

export interface EditingWorkoutScreenViewProps {
  screenState: EditingWorkoutScreenState;
  colors: ThemeColors;
  localDate: string;
  exercises: ExerciseStripExercise[];
  currentExerciseId: string | null;
  currentIndex: number;
  pagerWidth: number;
  rowsByExercise: Record<string, ResolvedSetRow[]>;
  pageDataByExercise: Record<string, ExercisePageData>;
  activeField: ActiveFieldState | null;
  weightUnit: WeightUnit;
  showAddExercisePicker: boolean;
  onDateChange: (date: Date, timezone: string) => void;
  onSelectExercise: (exerciseId: string) => void;
  onIndexChange: (index: number) => void;
  onAddExercise: () => void;
  onConfirmAddExercise: (rows: PickerCatalogRow[]) => void;
  onCancelAddExercisePicker: () => void;
  onExerciseChanged: () => void;
  onFieldPress: (exerciseId: string, setId: string | null, field: KeypadField, currentValue: string | null) => void;
  onReferenceTap: (exerciseId: string, setId: string | null, field: 'weight' | 'reps') => void;
  onKeypadPress: (press: KeypadPress) => void;
  onSubmitField: () => void;
  onCheckmarkPress: (exerciseId: string, setId: string | null) => void;
  onDone: () => void;
}

// Hook-free — direct-invocable by Jest with no renderer, matching WorkoutScreenView's own
// convention. The header region here is the "editing" row of UI-SPEC's Session Modes table: a
// single centred formatEditingHeader line plus SessionDateField, never a RestTimerBar, and the
// primary action is Done — never Finish Workout.
export function EditingWorkoutScreenView({
  screenState,
  colors,
  localDate,
  exercises,
  currentExerciseId,
  currentIndex,
  pagerWidth,
  rowsByExercise,
  pageDataByExercise,
  activeField,
  weightUnit,
  showAddExercisePicker,
  onDateChange,
  onSelectExercise,
  onIndexChange,
  onAddExercise,
  onConfirmAddExercise,
  onCancelAddExercisePicker,
  onExerciseChanged,
  onFieldPress,
  onReferenceTap,
  onKeypadPress,
  onSubmitField,
  onCheckmarkPress,
  onDone,
}: EditingWorkoutScreenViewProps) {
  if (screenState === 'error') {
    return (
      <View className="mt-xl gap-sm px-lg">
        <PrimaryButton label="Done" onPress={onDone} />
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

  return (
    <View className="flex-1 bg-background">
      <View className="items-center gap-sm px-md py-sm">
        <Text accessibilityRole="header" className="text-center text-heading font-semibold text-foreground">
          {formatEditingHeader(localDate)}
        </Text>
        <SessionDateField localDate={localDate} onChange={onDateChange} />
      </View>

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
        renderExercise={(exercise) => {
          const pageData = pageDataByExercise[exercise.id] ?? EMPTY_PAGE_DATA;
          return (
            <ExercisePage
              exerciseName={exercise.name}
              rows={rowsByExercise[exercise.id] ?? []}
              activeField={activeField && activeField.exerciseId === exercise.id ? { setId: activeField.setId, field: activeField.field } : null}
              sessionExerciseId={pageData.sessionExerciseId}
              exerciseId={pageData.exerciseId}
              sessionId={pageData.sessionId}
              userId={pageData.userId}
              weightUnit={weightUnit}
              targets={pageData.targets}
              routineExerciseId={pageData.routineExerciseId}
              cycleId={pageData.cycleId}
              hasNote={pageData.hasNote}
              noteText={pageData.noteText}
              onExerciseChanged={onExerciseChanged}
              onFieldPress={(setId, field, currentValue) => onFieldPress(exercise.id, setId, field, currentValue)}
              onReferenceTap={(setId, field) => onReferenceTap(exercise.id, setId, field)}
              onCheckmarkPress={(setId) => onCheckmarkPress(exercise.id, setId)}
            />
          );
        }}
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

      <View className="px-md py-sm">
        <PrimaryButton label="Done" onPress={onDone} />
      </View>

      {showAddExercisePicker ? (
        <Modal animationType="slide" onRequestClose={onCancelAddExercisePicker}>
          <ExercisePickerModal dayName="this workout" onAdd={onConfirmAddExercise} onCancel={onCancelAddExercisePicker} />
        </Modal>
      ) : null}
    </View>
  );
}

export interface UseEditingWorkoutScreenOptions {
  sessionId: string;
  userId: string | null;
  db?: WriteDb;
}

export type EditingWorkoutScreenViewModel = Omit<EditingWorkoutScreenViewProps, 'colors'>;

// The editing subtree's whole state machine — loads ONE named session via loadSessionTree
// (regardless of status), never loadLiveSession's "my current session" query, and every write goes
// through the same logSet/updateLoggedSet/addExerciseToSession/setSessionDate paths the live screen
// (or Task 1) already owns. No rest-target write, no scheduleRestAlert/cancelRestAlert call, no
// shouldAutoAdvance call, no pager auto-jump — this hook simply never calls any of them.
export function useEditingWorkoutScreen({ sessionId, userId, db }: UseEditingWorkoutScreenOptions): EditingWorkoutScreenViewModel {
  const resolvedDb = db ?? getPowerSync();
  const [session, setSession] = useState<LiveSessionData | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeField, setActiveField] = useState<ActiveFieldState | null>(null);
  const [draftValuesByExercise, setDraftValuesByExercise] = useState<Record<string, SetRowValues>>({});
  const [rowOverrides, setRowOverrides] = useState<Record<string, RowOverride>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [referenceMap, setReferenceMap] = useState<PreviousSetReferenceMap>({});
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [addExercisePickerOpen, setAddExercisePickerOpen] = useState(false);
  const { width: pagerWidth } = useWindowDimensions();
  const router = useRouter();

  const reload = useCallback(async (): Promise<void> => {
    try {
      const result = await loadSessionTree(sessionId, resolvedDb);
      if (!result) {
        setFailed(true);
        return;
      }

      // resolveSessionScreenMode (D-32, UI-SPEC R10) is the ONE place the mode is decided — a
      // sessionId that turns out to name the caller's own live session (never reachable through
      // History's Edit action today, but a real possibility of this pure function's contract)
      // bounces back to the plain live route rather than this file ever rendering live-session
      // machinery it structurally does not import.
      const mode = resolveSessionScreenMode({ routeSessionId: sessionId, session: { id: result.session.id, status: result.session.status } });
      if (mode === 'live') {
        router.replace(LIVE_WORKOUT_ROUTE);
        return;
      }

      setSession(result);
      setFailed(false);
      setRowOverrides({});
      setDraftValuesByExercise((current) => {
        const drafts = { ...current };
        for (const exercise of result.exercises) {
          if (!(exercise.id in drafts)) drafts[exercise.id] = defaultDraftValues(exercise);
        }
        return drafts;
      });
      void previousSetReferencesForSession(sessionId, resolvedDb).then(setReferenceMap);
      if (userId) {
        const unit = await loadWeightUnit(userId, resolvedDb);
        setWeightUnit(unit);
      }
    } catch (error) {
      console.error('editing workout screen load failed', error);
      setFailed(true);
    }
  }, [sessionId, userId, resolvedDb, router]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        if (!active) return;
        await reload();
      })();
      return () => {
        active = false;
      };
    }, [reload]),
  );

  const screenState: EditingWorkoutScreenState = failed ? 'error' : session === null ? 'loading' : 'ready';

  const sessionExercises = session?.exercises ?? [];
  const safeIndex = clampPagerIndex(currentIndex, sessionExercises.length);
  const currentExercise = sessionExercises[safeIndex] ?? null;

  const exercises: ExerciseStripExercise[] = sessionExercises.map((exercise) => {
    const existingSets = session?.setsByExerciseId[exercise.id] ?? [];
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
  const pageDataByExercise: Record<string, ExercisePageData> = {};
  for (const exercise of sessionExercises) {
    const existingSets = session?.setsByExerciseId[exercise.id] ?? [];
    const draftValues = draftValuesByExercise[exercise.id] ?? defaultDraftValues(exercise);
    const activeFieldForExercise = activeField && activeField.exerciseId === exercise.id ? activeField : null;
    rowsByExercise[exercise.id] = buildSetRows(existingSets, rowOverrides, draftValues, weightUnit, activeFieldForExercise, {
      sessionExerciseId: exercise.id,
      referenceMap,
    });
    pageDataByExercise[exercise.id] = {
      sessionExerciseId: exercise.id,
      exerciseId: exercise.exerciseId,
      sessionId: session?.session.id ?? '',
      userId,
      targets: {
        targetSets: exercise.targetSets,
        targetRepMin: exercise.targetRepMin,
        targetRepMax: exercise.targetRepMax,
        targetRir: exercise.targetRir,
        targetRestSeconds: exercise.targetRestSeconds,
      },
      routineExerciseId: exercise.routineExerciseId,
      cycleId: null,
      hasNote: exercise.notes !== null,
      noteText: exercise.notes,
    };
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
    setAddExercisePickerOpen(true);
  }

  function handleCancelAddExercisePicker() {
    setAddExercisePickerOpen(false);
  }

  async function handleConfirmAddExercise(rows: PickerCatalogRow[]) {
    if (!session || rows.length === 0) {
      setAddExercisePickerOpen(false);
      return;
    }
    await addExerciseToSession({ sessionId: session.session.id, exerciseIds: rows.map((row) => row.id) }, resolvedDb);
    setAddExercisePickerOpen(false);
    await reload();
  }

  function handleExerciseChanged() {
    void reload();
  }

  function handleFieldPress(exerciseId: string, setId: string | null, field: KeypadField, currentValue: string | null) {
    setActiveField({ exerciseId, setId, field, value: currentValue, touched: false });
  }

  async function handleReferenceTap(exerciseId: string, setId: string | null, field: 'weight' | 'reps') {
    const exercise = sessionExercises.find((candidate) => candidate.id === exerciseId);
    if (!exercise) return;
    const existingSets = session?.setsByExerciseId[exercise.id] ?? [];
    const setIndex = setId === null ? existingSets.length + 1 : existingSets.find((row) => row.id === setId)?.setIndex;
    if (setIndex === undefined) return;

    const ref = referenceMap[`${exercise.id}:${setIndex}`];
    if (!ref) return;

    if (setId === null) {
      const draftValues = draftValuesByExercise[exercise.id] ?? defaultDraftValues(exercise);
      const value = field === 'weight' ? fromCanonicalKg(ref.weightKg, weightUnit) : String(ref.reps);
      setDraftValuesByExercise((current) => ({ ...current, [exercise.id]: { ...draftValues, [field]: value } }));
      return;
    }

    if (field === 'weight') {
      const value = fromCanonicalKg(ref.weightKg, weightUnit);
      await updateLoggedSet({ id: setId, weight: { value, unit: weightUnit } }, resolvedDb);
      setRowOverrides((current) => ({ ...current, [setId]: { ...current[setId], weightKg: ref.weightKg } }));
    } else {
      await updateLoggedSet({ id: setId, reps: ref.reps }, resolvedDb);
      setRowOverrides((current) => ({ ...current, [setId]: { ...current[setId], reps: ref.reps } }));
    }
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
    const existingSets = session?.setsByExerciseId[exercise.id] ?? [];
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
          await updateLoggedSet({ id: setId, weight: { value: activeField.value, unit: weightUnit } }, resolvedDb);
          updatedOverride = { weightKg: toCanonicalKg(activeField.value, weightUnit) };
        } else if (activeField.field === 'reps') {
          const reps = activeField.value === null ? 0 : Number(activeField.value);
          await updateLoggedSet({ id: setId, reps }, resolvedDb);
          updatedOverride = { reps };
        } else {
          const rir = activeField.value === null ? null : Number(activeField.value);
          await updateLoggedSet({ id: setId, rir }, resolvedDb);
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

  // No rest-target write, no scheduleRestAlert/cancelRestAlert call, no shouldAutoAdvance call, no
  // pager auto-jump — a completed row in editing mode is just a write, never a live-session event.
  async function handleCheckmarkPress(exerciseId: string, setId: string | null) {
    const exercise = sessionExercises.find((candidate) => candidate.id === exerciseId);
    if (!exercise) return;
    const existingSets = session?.setsByExerciseId[exercise.id] ?? [];

    if (setId === null) {
      const draftValues = draftValuesByExercise[exercise.id] ?? defaultDraftValues(exercise);
      if (draftValues.reps === null || draftValues.reps === '') return;

      await logSet(
        {
          sessionExerciseId: exercise.id,
          weight: { value: draftValues.weight, unit: weightUnit },
          reps: Number(draftValues.reps),
          rir: draftValues.rir === null ? null : Number(draftValues.rir),
          completed: true,
        },
        resolvedDb,
      );

      setActiveField(null);
      await reload();
      return;
    }

    const row = existingSets.find((r) => r.id === setId);
    if (!row) return;
    const currentCompleted = rowOverrides[setId]?.completed ?? row.completed;
    const nextCompleted = !currentCompleted;
    await updateLoggedSet({ id: setId, completed: nextCompleted }, resolvedDb);
    setRowOverrides((current) => ({ ...current, [setId]: { ...current[setId], completed: nextCompleted } }));
  }

  // LOG-21: rewrites started_at/timezone/local_date together through setSessionDate — the single
  // deliberate exception to D-06 — then reloads so the header, SessionDateField and History's own
  // ordering all reflect the new day on the next read.
  async function handleDateChange(date: Date, timezone: string) {
    if (!session) return;
    await setSessionDate(session.session.id, date, timezone, resolvedDb);
    await reload();
  }

  // Done navigates back to History without touching status or ended_at — the session was already
  // finished; editing it is not re-finishing it (UI-SPEC §Session Modes).
  function handleDone() {
    router.push(HISTORY_ROUTE);
  }

  return {
    screenState,
    localDate: session?.session.localDate ?? '',
    exercises,
    currentExerciseId: currentExercise?.id ?? null,
    currentIndex: safeIndex,
    pagerWidth,
    rowsByExercise,
    pageDataByExercise,
    activeField,
    weightUnit,
    showAddExercisePicker: addExercisePickerOpen,
    onDateChange: (date, timezone) => void handleDateChange(date, timezone),
    onSelectExercise: handleSelectExercise,
    onIndexChange: handleIndexChange,
    onAddExercise: handleAddExercise,
    onConfirmAddExercise: (rows) => void handleConfirmAddExercise(rows),
    onCancelAddExercisePicker: handleCancelAddExercisePicker,
    onExerciseChanged: handleExerciseChanged,
    onFieldPress: handleFieldPress,
    onReferenceTap: (exerciseId, setId, field) => void handleReferenceTap(exerciseId, setId, field),
    onKeypadPress: handleKeypadPress,
    onSubmitField: () => void handleSubmitField(),
    onCheckmarkPress: (exerciseId, setId) => void handleCheckmarkPress(exerciseId, setId),
    onDone: handleDone,
  };
}

export interface EditingWorkoutRouteProps {
  sessionId: string;
  userId: string | null;
  colors: ThemeColors;
  db?: WriteDb;
}

// Composes the hook and the view under an 'editing' SessionModeProvider — the single mounting
// point workout.tsx's root renders when a sessionId route param resolves to a non-live session
// (D-32). workout.tsx never imports EditingWorkoutScreenView/useEditingWorkoutScreen separately;
// it only ever renders this one component, so the editing subtree's own module boundary (and this
// file's freedom from scheduleRestAlert/shouldAutoAdvance) stays intact.
export function EditingWorkoutRoute({ sessionId, userId, colors, db }: EditingWorkoutRouteProps) {
  const vm = useEditingWorkoutScreen({ sessionId, userId, db });
  return (
    <SessionModeProvider mode="editing">
      <EditingWorkoutScreenView {...vm} colors={colors} />
    </SessionModeProvider>
  );
}

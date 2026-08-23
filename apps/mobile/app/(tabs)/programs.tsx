import { resolveTarget, type CycleKind, type ResolvedTarget, type TargetOverride } from '@fitness/api-contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { CycleStrip } from '@/components/CycleStrip';
import { DayDeck } from '@/components/DayDeck';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ExercisePickerModal, type PickerCatalogRow } from '@/components/ExercisePickerModal';
import { ExerciseSlotRow } from '@/components/ExerciseSlotRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { authClient } from '@/lib/auth-client';
import { getPowerSync } from '@/lib/db/powersync';
import {
  loadActiveRoutineId,
  loadLibraryRoutines,
  resolveLiveRoutineId,
  setProgressionFrozen,
  type LibraryRoutineRow,
} from '@/lib/db/programs/lifecycle';
import { useThemeColors } from '@/lib/theme-colors';
import {
  addCycle,
  clearCycleTarget,
  cycleErrorMessage,
  moveCycle,
  removeCycle,
  setCycleTarget,
  updateCycle,
  validateCycle,
} from '@/lib/db/programs/cycles';
import { addDay, addExercisesToDay, moveExercise, removeDay, removeExercise, renameDay } from '@/lib/db/programs/days';
import {
  loadExerciseNameMap,
  loadProgramTree,
  type ProgramCycle,
  type ProgramDay,
  type ProgramSlot,
  type ProgramTree,
} from '@/lib/db/programs/load-program';
import { setExerciseTargets, type TargetDraft } from '@/lib/db/programs/targets';

const SKELETON_ROW_COUNT = 3;

export type ProgramsScreenState = 'error' | 'loading' | 'empty' | 'no-active' | 'populated';

export interface ProgramsScreenStateInput {
  failed: boolean;
  routines: { id: string }[] | null;
  activeRoutineId?: string | null;
}

// A load failure always wins, then "still loading" (routines not read yet), then whether the user
// owns any program at all, and only then whether one of them is active. `empty` and `no-active` are
// deliberately separate: "you have nothing" and "you have not chosen" are different problems with
// different fixes, and collapsing them would send a user with five programs to the create screen.
//
// A pointer naming a routine that is not in the list — archived on another device, or deleted —
// reads as no-active rather than as a program that cannot be rendered.
export function deriveProgramsScreenState({
  failed,
  routines,
  activeRoutineId = null,
}: ProgramsScreenStateInput): ProgramsScreenState {
  if (failed) return 'error';
  if (routines === null) return 'loading';
  if (routines.length === 0) return 'empty';
  if (!activeRoutineId || !routines.some((routine) => routine.id === activeRoutineId)) return 'no-active';
  return 'populated';
}

export interface DisplayedRoutineInput {
  routineIdParam?: string;
  routines: { id: string; archivedAt: string | null }[] | null;
  activeRoutineId: string | null;
}

// deriveProgramsScreenState's rule — "a pointer naming a routine that is not in the list reads as
// no-active" — was bypassed entirely by the routeIdParam, because the builder branch tests
// displayedRoutineId before screenState is ever consulted. A param naming an archived program
// therefore rendered it fully editable, and a param naming a program this device does not have
// rendered a header and two links and nothing else. The param has to clear the same bar the pointer
// does before it is honoured.
//
// While routines is still null the param is not yet checkable, so the screen shows its loading
// state for one frame rather than opening a routine it has not verified.
export function resolveDisplayedRoutineId({
  routineIdParam,
  routines,
  activeRoutineId,
}: DisplayedRoutineInput): string | null {
  const loaded = routines ?? [];
  // Same predicate for the param and for the pointer, from the single owner of the rule (WR-09) —
  // "is this still a live routine in this list" is one question, not two.
  return resolveLiveRoutineId(loaded, routineIdParam) ?? resolveLiveRoutineId(loaded, activeRoutineId);
}

export const FREEZE_SWITCH_TITLE = 'Update Program';

// The switch is on when the program is NOT frozen: "Update Program" describes what progression is
// allowed to do, matching the MacroFactor control this is modeled on (FEATURES.md line 39). Both
// strings say what progression will and will not do; neither frames a frozen program as failing,
// because freezing is a deliberate choice and this phase implements no progression at all.
export function freezeSwitchLabel(frozen: boolean): string {
  return frozen
    ? 'Progression will leave these targets exactly as written.'
    : 'Progression can adjust these targets in future cycles.';
}

// One expanded row at a time — tapping the open row closes it, tapping a different row switches
// to it. Pure so ExerciseSlotRow's expand/collapse behavior is asserted without a rendered tree.
export function nextExpandedSlotId(current: string | null, tapped: string): string | null {
  return current === tapped ? null : tapped;
}

const TARGET_FIELDS = [
  'targetSets',
  'targetRepMin',
  'targetRepMax',
  'targetRir',
  'targetRestSeconds',
] as const satisfies readonly (keyof ResolvedTarget)[];

const CYCLE_KIND_OPTIONS: { kind: CycleKind; label: string; defaultName: string }[] = [
  { kind: 'training', label: 'Training', defaultName: '' },
  { kind: 'deload', label: 'Deload', defaultName: 'Deload' },
  { kind: 'time_off', label: 'Time off', defaultName: 'Time off' },
];

// The "Days off" field is free text on both cycle forms. Empty is null — "this cycle has no length
// of its own" — which validateCycle accepts for training/deload and rejects for time off. A
// non-numeric string parses to NaN and validateCycle rejects it; nothing here silently coerces.
export function parseCycleDuration(raw: string): number | null {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : Number(trimmed);
}

export function cycleDurationFieldValue(durationDays: number | null | undefined): string {
  return durationDays === null || durationDays === undefined ? '' : String(durationDays);
}

// A stale id — the selected cycle was deleted, or the user switched programs — degrades to the
// base prescription rather than throwing. Selecting nothing and selecting something gone mean the
// same thing to everything downstream.
export function selectedCycleOf(cycles: ProgramCycle[], selectedCycleId: string | null): ProgramCycle | null {
  if (!selectedCycleId) return null;
  return cycles.find((cycle) => cycle.id === selectedCycleId) ?? null;
}

function baseOf(slot: ProgramSlot): ResolvedTarget {
  return {
    targetSets: slot.targetSets,
    targetRepMin: slot.targetRepMin,
    targetRepMax: slot.targetRepMax,
    targetRir: slot.targetRir,
    targetRestSeconds: slot.targetRestSeconds,
  };
}

// The only place this screen resolves a target, and it delegates the actual per-field merge to the
// shared resolver in @fitness/api-contracts — the builder, the Home card and the session snapshot
// must all agree, which they only can if there is exactly one implementation of `override ?? base`.
export function resolveSlotTargets(slot: ProgramSlot, selectedCycleId: string | null): ResolvedTarget {
  const override = selectedCycleId ? (slot.overridesByCycleId[selectedCycleId] ?? null) : null;
  return resolveTarget(baseOf(slot), override);
}

// Which numbers on this row are cycle-specific rather than inherited. A zero counts: zero is a
// value, not an absence.
export function overriddenFields(slot: ProgramSlot, selectedCycleId: string | null): (keyof ResolvedTarget)[] {
  const override = selectedCycleId ? slot.overridesByCycleId[selectedCycleId] : undefined;
  if (!override) return [];
  return TARGET_FIELDS.filter((field) => (override[field] ?? null) !== null);
}

// An edit made while a cycle is selected is stored as the difference from the base, never as a
// five-column copy — a field equal to the base stays null, which is what keeps the override table
// sparse and what lets isEmptyOverride delete a row that no longer overrides anything.
export function overrideDelta(base: ResolvedTarget, next: ResolvedTarget): TargetOverride {
  const delta: TargetOverride = {};
  for (const field of TARGET_FIELDS) {
    delta[field] = next[field] === base[field] ? null : next[field];
  }
  return delta;
}

export default function ProgramsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  // A program the user was sent to explicitly — the draft a duplicate just produced, which is by
  // design not the active one. Absent on every ordinary visit, where the active pointer decides.
  const { routineId: routineIdParam } = useLocalSearchParams<{ routineId?: string }>();

  const [routines, setRoutines] = useState<LibraryRoutineRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);
  // What the builder is pointed at. The active pointer decides by default (D-26); an explicit
  // routineId param overrides it so a just-created duplicate opens straight into its own tree —
  // but only once it has been checked against the loaded, non-archived list.
  const displayedRoutineId = resolveDisplayedRoutineId({ routineIdParam, routines, activeRoutineId });
  const [tree, setTree] = useState<ProgramTree | null>(null);
  const [treeFailed, setTreeFailed] = useState(false);
  const [exerciseNames, setExerciseNames] = useState<Map<string, string> | null>(null);
  const [newDayName, setNewDayName] = useState('');
  const [renamingDayId, setRenamingDayId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
  const [pickerDayId, setPickerDayId] = useState<string | null>(null);
  // View state, never persisted and never derived from the deck's page index: comparing the same
  // day across two cycles is the point of the strip, so a chip press must not move the deck.
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [cycleFormOpen, setCycleFormOpen] = useState(false);
  const [cycleFormName, setCycleFormName] = useState('');
  const [cycleFormKind, setCycleFormKind] = useState<CycleKind>('training');
  const [cycleFormDuration, setCycleFormDuration] = useState('');
  const [cycleFormError, setCycleFormError] = useState<string | null>(null);
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const [cycleEditName, setCycleEditName] = useState('');
  // Kind and duration are staged, not written per tap: a cycle only becomes time off together with
  // the length that makes it schedulable (see updateCycle).
  const [cycleEditKind, setCycleEditKind] = useState<CycleKind>('training');
  const [cycleEditDuration, setCycleEditDuration] = useState('');
  const [cycleEditError, setCycleEditError] = useState<string | null>(null);

  // loadLibraryRoutines rather than loadRoutines: this screen needs progression_frozen for the
  // switch, and it needs archived_at so a pointer left behind on an archived program reads as
  // no-active instead of rendering a program the library has already put away.
  const reload = useCallback(async () => {
    try {
      const [loaded, pointer] = await Promise.all([
        loadLibraryRoutines(getPowerSync()),
        userId ? loadActiveRoutineId(userId, getPowerSync()) : Promise.resolve(null),
      ]);
      setRoutines(loaded.filter((routine) => routine.archivedAt === null));
      setActiveRoutineId(pointer);
      setFailed(false);
    } catch (error) {
      console.error('routine load failed', error);
      setFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [loaded, pointer] = await Promise.all([
          loadLibraryRoutines(getPowerSync()),
          userId ? loadActiveRoutineId(userId, getPowerSync()) : Promise.resolve(null),
        ]);
        if (mounted) {
          setRoutines(loaded.filter((routine) => routine.archivedAt === null));
          setActiveRoutineId(pointer);
          setFailed(false);
        }
      } catch (error) {
        console.error('routine load failed', error);
        if (mounted) setFailed(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId]);

  // Loaded once, here, and passed into every loadProgramTree call rather than re-read per call —
  // the exercise catalog rarely changes mid-session and this screen re-renders the tree on every
  // day/exercise mutation.
  const reloadTree = useCallback(
    async (routineId: string) => {
      try {
        const db = getPowerSync();
        const names = exerciseNames ?? (await loadExerciseNameMap(db));
        if (!exerciseNames) setExerciseNames(names);
        const loaded = await loadProgramTree(routineId, db, names);
        setTree(loaded);
        setTreeFailed(false);
      } catch (error) {
        console.error('program tree load failed', error);
        setTreeFailed(true);
      }
    },
    [exerciseNames],
  );

  useEffect(() => {
    if (displayedRoutineId) {
      void reloadTree(displayedRoutineId);
    } else {
      setTree(null);
    }
    // reloadTree intentionally excluded: it only changes identity when exerciseNames first loads,
    // which must not re-trigger a redundant tree reload for the same displayedRoutineId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedRoutineId]);

  const screenState = deriveProgramsScreenState({ failed, routines, activeRoutineId });

  // The freeze switch belongs to the active program only (D-16/D-26). When the screen is showing a
  // program reached by explicit navigation — a fresh duplicate, which is a draft and by definition
  // not active — there is nothing for progression to freeze yet, so the control is absent rather
  // than present-and-inert.
  const showingActiveProgram = displayedRoutineId !== null && displayedRoutineId === activeRoutineId;
  const progressionFrozen =
    routines?.find((routine) => routine.id === displayedRoutineId)?.progressionFrozen ?? false;

  const handleToggleFreeze = useCallback(
    async (updateEnabled: boolean) => {
      if (!displayedRoutineId) return;
      await setProgressionFrozen(displayedRoutineId, !updateEnabled);
      await reload();
    },
    [displayedRoutineId, reload],
  );

  const handleAddDay = useCallback(async () => {
    if (!displayedRoutineId) return;
    try {
      await addDay({ routineId: displayedRoutineId, name: newDayName });
      setNewDayName('');
      await reloadTree(displayedRoutineId);
    } catch (error) {
      console.error('add day failed', error);
    }
  }, [displayedRoutineId, newDayName, reloadTree]);

  const handleRemoveDay = useCallback(
    async (dayId: string) => {
      if (!displayedRoutineId) return;
      await removeDay(dayId);
      await reloadTree(displayedRoutineId);
    },
    [displayedRoutineId, reloadTree],
  );

  const handleRemoveExercise = useCallback(
    async (routineExerciseId: string) => {
      if (!displayedRoutineId) return;
      await removeExercise(routineExerciseId);
      await reloadTree(displayedRoutineId);
    },
    [displayedRoutineId, reloadTree],
  );

  const handleToggleExpanded = useCallback((slotId: string) => {
    setExpandedSlotId((current) => nextExpandedSlotId(current, slotId));
  }, []);

  // Exactly one branch on the current selection, and each branch calls a different single-purpose
  // helper: setExerciseTargets can only write the base row, setCycleTarget can only write an
  // override row. Neither can reach the other's table, so a mis-routed edit is not a runtime risk
  // (T-04-39).
  const handleSaveTargets = useCallback(
    async (routineExerciseId: string, draft: TargetDraft) => {
      if (!displayedRoutineId) return;

      if (selectedCycleId === null) {
        await setExerciseTargets(routineExerciseId, draft);
      } else {
        const slot = tree?.days.flatMap((day) => day.slots).find((candidate) => candidate.id === routineExerciseId);
        if (!slot) return;
        await setCycleTarget({
          routineExerciseId,
          cycleId: selectedCycleId,
          override: overrideDelta(baseOf(slot), draft),
        });
      }

      await reloadTree(displayedRoutineId);
    },
    [displayedRoutineId, reloadTree, selectedCycleId, tree],
  );

  const handleResetCycleTarget = useCallback(
    async (routineExerciseId: string) => {
      if (!displayedRoutineId || !selectedCycleId) return;
      await clearCycleTarget({ routineExerciseId, cycleId: selectedCycleId });
      await reloadTree(displayedRoutineId);
    },
    [displayedRoutineId, reloadTree, selectedCycleId],
  );

  const handleOpenCycleForm = useCallback(() => {
    setCycleFormOpen(true);
    setEditingCycleId(null);
    setCycleFormError(null);
  }, []);

  const handleCycleFormKind = useCallback((kind: CycleKind) => {
    setCycleFormKind(kind);
    setCycleFormError(null);
    // A new deload or time-off cycle is pre-filled with an editable default name, so the required
    // non-empty name is never a hurdle the user has to clear before the chip can exist.
    const preset = CYCLE_KIND_OPTIONS.find((option) => option.kind === kind)?.defaultName ?? '';
    setCycleFormName((current) => (current.trim().length === 0 ? preset : current));
  }, []);

  const handleAddCycle = useCallback(async () => {
    if (!displayedRoutineId) return;

    const draft = {
      name: cycleFormName,
      kind: cycleFormKind,
      durationDays: parseCycleDuration(cycleFormDuration),
    };
    const error = validateCycle(draft);
    if (error) {
      setCycleFormError(cycleErrorMessage(error));
      return;
    }

    try {
      const id = await addCycle({ routineId: displayedRoutineId, ...draft });
      setCycleFormOpen(false);
      setCycleFormName('');
      setCycleFormDuration('');
      setCycleFormKind('training');
      setSelectedCycleId(id);
      await reloadTree(displayedRoutineId);
    } catch (caught) {
      setCycleFormError(caught instanceof Error ? caught.message : 'Cycle could not be saved.');
    }
  }, [displayedRoutineId, cycleFormDuration, cycleFormKind, cycleFormName, reloadTree]);

  const handleEditCycle = useCallback(
    (cycleId: string) => {
      const cycle = tree?.cycles.find((candidate) => candidate.id === cycleId);
      setEditingCycleId(cycleId);
      setCycleFormOpen(false);
      setCycleEditName(cycle?.name ?? '');
      setCycleEditKind(cycle?.kind ?? 'training');
      setCycleEditDuration(cycleDurationFieldValue(cycle?.durationDays));
      setCycleEditError(null);
    },
    [tree],
  );

  // One save for the whole cycle. A kind tap alone writes nothing, so "Make Time off" can no longer
  // produce a cycle with no length — the same validateCycle gate the creation form clears.
  const handleSaveCycleEdit = useCallback(async () => {
    if (!displayedRoutineId || !editingCycleId) return;

    const draft = {
      name: cycleEditName,
      kind: cycleEditKind,
      durationDays: parseCycleDuration(cycleEditDuration),
    };
    const error = validateCycle(draft);
    if (error) {
      setCycleEditError(cycleErrorMessage(error));
      return;
    }

    try {
      await updateCycle(editingCycleId, draft);
      setEditingCycleId(null);
      await reloadTree(displayedRoutineId);
    } catch (caught) {
      setCycleEditError(caught instanceof Error ? caught.message : 'Cycle could not be saved.');
    }
  }, [displayedRoutineId, cycleEditDuration, cycleEditKind, cycleEditName, editingCycleId, reloadTree]);

  const handleSelectCycleEditKind = useCallback((kind: CycleKind) => {
    setCycleEditKind(kind);
    setCycleEditError(null);
  }, []);

  const handleMoveCycle = useCallback(
    async (direction: -1 | 1) => {
      if (!displayedRoutineId || !editingCycleId || !tree) return;
      const ordered = tree.cycles;
      const from = ordered.findIndex((cycle) => cycle.id === editingCycleId);
      const to = from + direction;
      if (from < 0 || to < 0 || to > ordered.length - 1) return;

      const withoutMoved = ordered.filter((cycle) => cycle.id !== editingCycleId);
      const beforeId = to > 0 ? (withoutMoved[to - 1]?.id ?? null) : null;
      const afterId = withoutMoved[to]?.id ?? null;

      await moveCycle({ routineId: displayedRoutineId, cycleId: editingCycleId, beforeId, afterId });
      await reloadTree(displayedRoutineId);
    },
    [displayedRoutineId, editingCycleId, reloadTree, tree],
  );

  const handleRemoveCycle = useCallback(async () => {
    if (!displayedRoutineId || !editingCycleId) return;
    await removeCycle(editingCycleId);
    if (selectedCycleId === editingCycleId) setSelectedCycleId(null);
    setEditingCycleId(null);
    await reloadTree(displayedRoutineId);
  }, [displayedRoutineId, editingCycleId, reloadTree, selectedCycleId]);

  // The gesture layer (DragHandle) and the Move up/down controls both funnel here — neither reads
  // or writes order_index itself, they only produce a toIndex/neighbour pair that this callback
  // hands straight to moveExercise (04-02), the single write path for reordering.
  const handleReorderExercise = useCallback(
    async (routineDayId: string, exerciseId: string, beforeId: string | null, afterId: string | null) => {
      if (!displayedRoutineId) return;
      await moveExercise({ routineDayId, exerciseId, beforeId, afterId });
      await reloadTree(displayedRoutineId);
    },
    [displayedRoutineId, reloadTree],
  );

  const handleAddExercises = useCallback(
    async (rows: PickerCatalogRow[]) => {
      if (!displayedRoutineId || !pickerDayId) return;
      try {
        await addExercisesToDay({ routineDayId: pickerDayId, exerciseIds: rows.map((row) => row.id) });
        setPickerDayId(null);
        await reloadTree(displayedRoutineId);
      } catch (error) {
        console.error('add exercises failed', error);
      }
    },
    [displayedRoutineId, pickerDayId, reloadTree],
  );

  const handleStartRename = useCallback((dayId: string, currentName: string) => {
    setRenamingDayId(dayId);
    setRenameValue(currentName);
  }, []);

  const handleSaveRename = useCallback(async () => {
    if (!displayedRoutineId || !renamingDayId) return;
    try {
      await renameDay(renamingDayId, renameValue);
      setRenamingDayId(null);
      await reloadTree(displayedRoutineId);
    } catch (error) {
      console.error('rename day failed', error);
    }
  }, [displayedRoutineId, renamingDayId, renameValue, reloadTree]);

  if (screenState === 'error') {
    return (
      <View className="flex-1 items-center justify-center bg-background px-lg">
        <Text className="text-center text-heading font-semibold text-foreground">
          {"Programs couldn't load"}
        </Text>
        <Text className="mt-sm text-center text-body font-normal text-foreground-muted">
          Restart the app to try again. Your programs and history are safe.
        </Text>
      </View>
    );
  }

  if (pickerDayId) {
    const pickerDay = tree?.days.find((day) => day.id === pickerDayId) ?? null;
    return (
      <ExercisePickerModal
        dayName={pickerDay?.name ?? 'this day'}
        onAdd={handleAddExercises}
        onCancel={() => setPickerDayId(null)}
      />
    );
  }

  if (displayedRoutineId) {
    return (
      <View className="flex-1 bg-background">
        <View className="mt-xl gap-md px-lg pb-2xl">
          <View className="flex-row flex-wrap gap-md">
            <Pressable
              onPress={() => router.push('/programs/library')}
              accessibilityRole="button"
              accessibilityLabel="Program Library"
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text className="text-body font-normal text-accent">Library</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/programs/new')}
              accessibilityRole="button"
              accessibilityLabel="New Program"
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text className="text-body font-normal text-accent">New Program</Text>
            </Pressable>
          </View>

          {treeFailed ? (
            <View className="items-center gap-sm">
              <Text className="text-center text-heading font-semibold text-foreground">
                {"Program couldn't load"}
              </Text>
              <Text className="text-center text-body font-normal text-foreground-muted">
                Restart the app to try again. Your programs and history are safe.
              </Text>
            </View>
          ) : tree ? (
            <>
              <Text className="text-heading font-semibold text-foreground">{tree.name}</Text>

              {showingActiveProgram ? (
                <Pressable
                  onPress={() => void handleToggleFreeze(progressionFrozen)}
                  accessibilityRole="switch"
                  accessibilityLabel={FREEZE_SWITCH_TITLE}
                  accessibilityState={{ checked: !progressionFrozen }}
                  accessibilityHint={freezeSwitchLabel(progressionFrozen)}
                  className="flex-row items-center justify-between gap-md rounded-md bg-surface px-md"
                  // The Switch's own native hit target already clears both platforms' minimums; this
                  // row exists so tapping the label toggles it too.
                  style={{ minHeight: 48 }}
                >
                  <View className="flex-1 gap-xs py-sm">
                    <Text className="text-label font-normal text-foreground-muted">{FREEZE_SWITCH_TITLE}</Text>
                    <Text className="text-label font-normal text-foreground-muted">
                      {freezeSwitchLabel(progressionFrozen)}
                    </Text>
                  </View>
                  <Switch
                    value={!progressionFrozen}
                    onValueChange={(updateEnabled) => void handleToggleFreeze(updateEnabled)}
                    trackColor={{ true: colors.accent, false: undefined }}
                  />
                </Pressable>
              ) : null}

              <CycleStrip
                cycles={tree.cycles}
                selectedCycleId={selectedCycleId}
                onSelectCycle={setSelectedCycleId}
                onAddCycle={handleOpenCycleForm}
                onEditCycle={handleEditCycle}
              />

              {tree.cycles.length === 0 ? (
                <Pressable
                  onPress={handleOpenCycleForm}
                  accessibilityRole="button"
                  accessibilityLabel="Add Cycle"
                  style={{ minHeight: 48, justifyContent: 'center' }}
                >
                  <Text className="text-body font-normal text-accent">Add Cycle</Text>
                </Pressable>
              ) : null}

              {cycleFormOpen ? (
                <View className="gap-sm rounded-md bg-surface p-md">
                  <TextField
                    label="Cycle name"
                    value={cycleFormName}
                    onChangeText={(value) => {
                      setCycleFormName(value);
                      setCycleFormError(null);
                    }}
                    error={cycleFormError}
                  />
                  <View className="flex-row gap-sm">
                    {CYCLE_KIND_OPTIONS.map((option) => (
                      <Pressable
                        key={option.kind}
                        onPress={() => handleCycleFormKind(option.kind)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: cycleFormKind === option.kind }}
                        accessibilityLabel={option.label}
                        className={`items-center justify-center rounded-md border px-md ${
                          cycleFormKind === option.kind ? 'border-accent' : 'border-foreground-muted'
                        }`}
                        style={{ minWidth: 48, minHeight: 48 }}
                      >
                        <Text
                          className={`text-label font-normal ${
                            cycleFormKind === option.kind ? 'text-accent' : 'text-foreground-muted'
                          }`}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {cycleFormKind === 'time_off' ? (
                    <TextField
                      label="Days off"
                      value={cycleFormDuration}
                      onChangeText={(value) => {
                        setCycleFormDuration(value);
                        setCycleFormError(null);
                      }}
                      keyboardType="number-pad"
                    />
                  ) : null}
                  <PrimaryButton label="Add Cycle" onPress={handleAddCycle} />
                </View>
              ) : null}

              {editingCycleId ? (
                <View className="gap-sm rounded-md bg-surface p-md">
                  <TextField
                    label="Cycle name"
                    value={cycleEditName}
                    onChangeText={(value) => {
                      setCycleEditName(value);
                      setCycleEditError(null);
                    }}
                  />
                  <View className="flex-row flex-wrap gap-sm">
                    {CYCLE_KIND_OPTIONS.map((option) => (
                      <Pressable
                        key={option.kind}
                        onPress={() => handleSelectCycleEditKind(option.kind)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: cycleEditKind === option.kind }}
                        accessibilityLabel={`Make ${option.label}`}
                        className={`items-center justify-center rounded-md border px-md ${
                          cycleEditKind === option.kind ? 'border-accent' : 'border-foreground-muted'
                        }`}
                        style={{ minWidth: 48, minHeight: 48 }}
                      >
                        <Text
                          className={`text-label font-normal ${
                            cycleEditKind === option.kind ? 'text-accent' : 'text-foreground-muted'
                          }`}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {cycleEditKind === 'time_off' ? (
                    <TextField
                      label="Days off"
                      value={cycleEditDuration}
                      onChangeText={(value) => {
                        setCycleEditDuration(value);
                        setCycleEditError(null);
                      }}
                      keyboardType="number-pad"
                      error={cycleEditError}
                    />
                  ) : null}
                  {cycleEditKind !== 'time_off' && cycleEditError ? <ErrorBanner message={cycleEditError} /> : null}
                  <PrimaryButton label="Save" onPress={handleSaveCycleEdit} />
                  <View className="flex-row flex-wrap gap-sm">
                    <Pressable
                      onPress={() => handleMoveCycle(-1)}
                      accessibilityRole="button"
                      accessibilityLabel="Move cycle earlier"
                      style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text className="text-label font-normal text-foreground-muted">Earlier</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleMoveCycle(1)}
                      accessibilityRole="button"
                      accessibilityLabel="Move cycle later"
                      style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text className="text-label font-normal text-foreground-muted">Later</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleRemoveCycle}
                      accessibilityRole="button"
                      accessibilityLabel="Remove cycle"
                      style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text className="text-label font-normal text-destructive">Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={{ minHeight: 320 }}>
                <DayDeck<ProgramDay>
                  days={tree.days}
                  renderDay={(day) => (
                    <View className="gap-sm rounded-md bg-surface p-md">
                      {renamingDayId === day.id ? (
                        <View className="gap-sm">
                          <TextField label="Day name" value={renameValue} onChangeText={setRenameValue} />
                          <PrimaryButton label="Save" onPress={handleSaveRename} />
                        </View>
                      ) : (
                        <View className="flex-row items-center justify-between gap-sm">
                          <Pressable
                            onPress={() => handleStartRename(day.id, day.name)}
                            accessibilityRole="button"
                            accessibilityLabel={`Rename ${day.name}`}
                            style={{ minHeight: 48, justifyContent: 'center', flexShrink: 1 }}
                          >
                            <Text className="text-body font-semibold text-foreground">{day.name}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleRemoveDay(day.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${day.name}`}
                            style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Text className="text-label font-normal text-destructive">Remove</Text>
                          </Pressable>
                        </View>
                      )}

                      {day.slots.length === 0 ? (
                        <View className="items-center gap-xs py-lg">
                          <Text className="text-center text-heading font-semibold text-foreground">
                            No exercises in this day
                          </Text>
                          <Text className="text-center text-body font-normal text-foreground-muted">
                            Add exercises to get this day started.
                          </Text>
                        </View>
                      ) : (
                        (() => {
                          // The exercise-count >= 2 visibility rule (04-UI-SPEC.md's D-23
                          // amendment) is computed once here, by the day page, and passed down —
                          // never recomputed per row or per platform file.
                          const orderedIds = day.slots.map((slot) => slot.id);
                          const canReorder = orderedIds.length >= 2;
                          return day.slots.map((slot, index) => (
                            <ExerciseSlotRow
                              key={slot.id}
                              slot={slot}
                              expanded={expandedSlotId === slot.id}
                              canReorder={canReorder}
                              orderedIds={orderedIds}
                              index={index}
                              resolved={resolveSlotTargets(slot, selectedCycleId)}
                              cycleSelected={selectedCycleOf(tree.cycles, selectedCycleId) !== null}
                              overriddenFields={overriddenFields(slot, selectedCycleId)}
                              onResetCycleTarget={handleResetCycleTarget}
                              onToggleExpanded={handleToggleExpanded}
                              onRemove={handleRemoveExercise}
                              onSaveTargets={handleSaveTargets}
                              onReorder={(beforeId, afterId) => void handleReorderExercise(day.id, slot.id, beforeId, afterId)}
                            />
                          ));
                        })()
                      )}

                      <Pressable
                        onPress={() => setPickerDayId(day.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Add exercises to ${day.name}`}
                        style={{ minHeight: 48, justifyContent: 'center' }}
                      >
                        <Text className="text-body font-normal text-accent">Add Exercises</Text>
                      </Pressable>
                    </View>
                  )}
                />
              </View>

              <View className="gap-sm">
                <TextField label="New day name" value={newDayName} onChangeText={setNewDayName} />
                <PrimaryButton label="Add Day" onPress={handleAddDay} />
              </View>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  if (screenState === 'loading') {
    return (
      <View className="flex-1 bg-background px-lg">
        <View className="mt-xl gap-sm">
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
            <View key={index} className="rounded-md bg-surface" style={{ height: 64 }} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
      <View className="mt-xl items-center gap-sm">
        <Text className="text-center text-heading font-semibold text-foreground">No active program</Text>
        <Text className="text-center text-body font-normal text-foreground-muted">
          Build or activate one to see what&apos;s next.
        </Text>

        {/* A user with programs but none active is sent to the library to choose; a user with no
            programs at all is sent to the create flow. Same screen state family, different fix. */}
        {screenState === 'no-active' ? (
          <Pressable
            onPress={() => router.push('/programs/library')}
            accessibilityRole="button"
            accessibilityLabel="Program Library"
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text className="text-body font-normal text-accent">Build or activate one</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/programs/new')}
            accessibilityRole="button"
            accessibilityLabel="New Program"
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text className="text-body font-normal text-accent">New Program</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

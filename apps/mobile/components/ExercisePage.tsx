import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { WARMUP_SET_TYPE, WORKING_SET_TYPE, type EquipmentType, type ResolvedTarget, type SetType, type WeightUnit } from '@fitness/api-contracts';
import { hasResolvableEquipment, resolveEquipmentBand, type ResolvedInventory } from '@fitness/plate-math';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { logSet, updateLoggedSet } from '@/lib/db/log-set';
import { detachSuperset, formSuperset, removeSessionExercise, swapSessionExercise } from '@/lib/db/session-mutations';
import { addSubEntry, clearSubEntries, removeSubEntry } from '@/lib/db/set-groups';
import { resolveGroupAddControls, type GroupAddControl } from '@/lib/session/set-row-builders';
import { detachRowPartnerName, supersetMembers, supersetPartnerLabel, type SupersetMemberInput } from '@/lib/session/superset';
import { isPerSideMode, type PerSideRowInput } from '@/lib/session/per-side';
import { ChangeSetTypeDialog } from './ChangeSetTypeDialog';
import { EquipmentAvailabilitySheet } from './EquipmentAvailabilitySheet';
import { ExerciseActionBar, type ExerciseActionId } from './ExerciseActionBar';
import { ExercisePickerModal, type PickerCatalogRow } from './ExercisePickerModal';
import type { ExerciseStripExercise } from './ExerciseStrip';
import type { KeypadField } from './NumericKeypad';
import { NoteSheet } from './NoteSheet';
import { ReorderExercisesSheet } from './ReorderExercisesSheet';
import { RemoveExerciseDialog, SessionActionSheet, type SessionExerciseActionId } from './SessionActionSheet';
import { resolveSetRowColors, SetGroupAddControl, SetRowView, type SetRowReference, type SetRowValues } from './SetRow';
import {
  FAILURE_SET_RIR,
  resolveSetTypeSelection,
  setTypePickerEffect,
  SetTypePickerSheet,
  type SetTypeSelectionEffect,
} from './SetTypePickerSheet';
import { TargetsSheet } from './TargetsSheet';
import { WarmupSheet } from './WarmupSheet';

export interface SupersetPartnerChipProps {
  sessionExerciseRows: SupersetMemberInput[];
  sessionExerciseId: string;
  onSelectExercise: (sessionExerciseId: string) => void;
}

// D-12: the `bg-secondary rounded-full` pill beneath the header and above the action bar — renders
// nothing when the shared predicate resolves no label (ungrouped, or a group shrunk to one live
// member, D-24). Tapping jumps the pager to the partner for a two-member group, and cyclically to
// the next member for a group of three or more — reusing the same jump handler the strip's own
// chips already call, never a second navigation mechanism.
export function SupersetPartnerChip({ sessionExerciseRows, sessionExerciseId, onSelectExercise }: SupersetPartnerChipProps) {
  const label = supersetPartnerLabel(sessionExerciseRows, sessionExerciseId);
  if (label === null) return null;

  const handlePress = () => {
    const members = supersetMembers(sessionExerciseRows, sessionExerciseId);
    if (members.length <= 1) return;
    const position = members.findIndex((member) => member.id === sessionExerciseId);
    const nextMember = members[(position + 1) % members.length];
    onSelectExercise(nextMember.id);
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="mb-md self-start rounded-full bg-secondary px-md py-sm"
      style={{ minHeight: 48 }}
    >
      <Text className="text-label font-normal text-foreground-muted">{label}</Text>
    </Pressable>
  );
}

export interface ExercisePageSetRow {
  setId: string | null;
  setIndex: number;
  values: SetRowValues;
  reference: SetRowReference;
  completed: boolean;
  // Optional: undefined rows render exactly as before this field existed. Populated by a caller
  // that threads set_type through (workout.tsx does not yet — see 05-06-SUMMARY.md's documented
  // integration gap); ExercisePageView never re-sorts by it, it only decides whether to render the
  // leading "W" badge on a row the caller has already ordered warm-ups-first (RESEARCH Pitfall 2).
  setType?: string;
  // Null/undefined on the trailing draft row (no logged_set to annotate yet) and on any existing
  // row with no note — drives SetRowView's note dot.
  noteText?: string | null;
  // Phase 7 D-05/D-20 — additive, same discipline as setType above.
  parentSetId?: string | null;
  side?: string | null;
  displaySetIndex?: number;
}

export interface ExercisePageActiveField {
  setId: string | null;
  field: KeypadField;
}

export interface ExercisePageViewProps {
  exerciseName: string;
  rows: ExercisePageSetRow[];
  activeField: ExercisePageActiveField | null;
  colors: ThemeColors;
  actionBarSlot?: ReactNode;
  // A draft row (null setId) supplies no handler — there is no logged_set yet to annotate.
  onSetLongPress?: (setId: string) => void;
  // Same null-setId guard as onSetLongPress — the trailing draft row has no logged_set to retype.
  onSetNumberPress?: (setId: string) => void;
  onFieldPress: (setId: string | null, field: KeypadField, currentValue: string | null) => void;
  onReferenceTap: (setId: string | null, field: 'weight' | 'reps') => void;
  onCheckmarkPress: (setId: string | null) => void;
  // Task 3 (07-05): D-08's "+ Add {type}" control and the per-child remove glyph. Both optional —
  // a caller supplying neither (WorkoutSummary.tsx's correction rows) renders unchanged (R15).
  onAddSubEntry?: (parentSetId: string) => void;
  onRemoveChild?: (setId: string) => void;
}

// Hook-free — direct-invocable by a test, matching CycleStripView/DayDeckView. `rows` arrives
// pre-ordered by the caller (workout.tsx's buildSetRows sorts warm-ups ahead of working sets
// regardless of raw set_index, per RESEARCH.md Pitfall 2) — this component only renders the order
// it is given, never re-sorts. `actionBarSlot` is the render-prop slot the stateful ExercisePage
// wrapper below fills with the Warm-up/Targets/Note/overflow action bar and its sheets (D-13).
// The warm-up badge and note dot are rendered by SetRowView itself (WINDOWS #109) — this component
// only decides the warmup/hasNote booleans from the row's own setType/noteText, it never renders
// either affordance itself.
export function ExercisePageView({
  exerciseName,
  rows,
  activeField,
  colors,
  actionBarSlot,
  onSetLongPress,
  onSetNumberPress,
  onFieldPress,
  onReferenceTap,
  onCheckmarkPress,
  onAddSubEntry,
  onRemoveChild,
}: ExercisePageViewProps) {
  // Task 3 (07-05): resolved once per render, from the rows this component already has — never
  // re-derived per row. Keyed by the group's own LAST row (the last child, or the parent itself
  // for a childless myorep, D-07) so the control renders directly beneath the correct row without
  // resolveGroupAddControls itself needing to know about row *position* (it only knows kind and
  // completion).
  const visibleAddControls = resolveGroupAddControls(rows).filter((control) => control.visible);
  const addControlByLastRowId = new Map<string, GroupAddControl>();
  for (const control of visibleAddControls) {
    const children = rows.filter((candidate) => candidate.parentSetId === control.parentSetId);
    const lastRow = children.length > 0 ? children[children.length - 1] : rows.find((candidate) => candidate.setId === control.parentSetId);
    if (lastRow?.setId) addControlByLastRowId.set(lastRow.setId, control);
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
        <Text className="mb-md text-heading font-semibold text-foreground">{exerciseName}</Text>
        {actionBarSlot ?? null}
        {rows.flatMap((row) => {
          const key = row.setId ?? `draft-${row.setIndex}`;
          const isChild = row.parentSetId != null;
          const elements: ReactNode[] = [
            <SetRowView
              key={key}
              setIndex={row.displaySetIndex ?? row.setIndex}
              values={row.values}
              reference={row.reference}
              completed={row.completed}
              activeField={activeField && activeField.setId === row.setId ? activeField.field : null}
              colors={colors}
              warmup={row.setType === WARMUP_SET_TYPE}
              hasNote={row.noteText !== null && row.noteText !== undefined}
              setType={row.setType}
              side={row.side ?? null}
              isChild={isChild}
              onSetNumberPress={row.setId && onSetNumberPress ? () => onSetNumberPress(row.setId as string) : undefined}
              onLongPress={row.setId && onSetLongPress ? () => onSetLongPress(row.setId as string) : undefined}
              onFieldPress={(field) => onFieldPress(row.setId, field, row.values[field])}
              onReferenceTap={(field) => onReferenceTap(row.setId, field)}
              onCheckmarkPress={() => onCheckmarkPress(row.setId)}
              onRemoveChild={isChild && row.setId && onRemoveChild ? () => onRemoveChild(row.setId as string) : undefined}
            />,
          ];
          const control = row.setId ? addControlByLastRowId.get(row.setId) : undefined;
          if (control) {
            elements.push(
              <SetGroupAddControl key={`${key}-add`} label={control.label} onPress={() => onAddSubEntry?.(control.parentSetId)} />,
            );
          }
          return elements;
        })}
      </ScrollView>
    </View>
  );
}

type ActiveSheet =
  | 'targets'
  | 'note'
  | 'set-note'
  | 'session'
  | 'remove-confirm'
  | 'swap'
  | 'warmup'
  | 'reorder'
  | 'equipment'
  | 'set-type'
  | 'change-set-type-confirm';

export interface ExercisePageProps
  extends Omit<ExercisePageViewProps, 'colors' | 'actionBarSlot' | 'onSetLongPress' | 'onSetNumberPress'> {
  sessionExerciseId: string;
  exerciseId: string;
  sessionId: string;
  userId: string | null;
  weightUnit: WeightUnit;
  targets: ResolvedTarget;
  routineExerciseId: string | null;
  cycleId: string | null;
  // The already-loaded strip/pager exercise list — Amendment A.3's ReorderExercisesSheet renders
  // from this rather than issuing its own query (the sheet opens from already-loaded session
  // state, E10's "no loading state of its own" rule).
  sessionExercises: ExerciseStripExercise[];
  // The same live members list Task 1 (07-07) builds in workout.tsx — every superset-group
  // question (final-member, partner label, detach-row partner name) is answered from this one
  // already-loaded list, never re-derived here.
  sessionExerciseRows: SupersetMemberInput[];
  // Jumps the pager to another exercise — reuses the strip's own jump handler (workout.tsx's
  // handleSelectExercise), never a second navigation mechanism, for both the partner chip's tap
  // and (07-08) any other cross-exercise jump this page needs.
  onSelectExercise: (sessionExerciseId: string) => void;
  // D-21's ephemeral per-exercise override (undefined defers to isPerSideMode's own
  // derived-from-data default) and its setter — both threaded from the screen state Task 2 (07-08)
  // added in workout.tsx, never a second, page-local override.
  perSideOverride: boolean | undefined;
  onSetPerSideOverride: (value: boolean) => void;
  // Threaded to TargetsSheet's own write-back call so it reaches the same database this page's
  // own reads came from, rather than TargetsSheet's default silently resolving getPowerSync()
  // again (05-12). Undefined in the few call sites that have never needed to override it —
  // TargetsSheet's own default takes over identically.
  db?: WriteDb;
  hasNote: boolean;
  noteText: string | null;
  // R11's shared inputs: the current exercise's own equipment type and the session's resolved
  // inventory, both already loaded by the caller (06-05's workout.tsx state) — this page computes
  // the Equipment row's visibility from them via the one shared predicate, never a second,
  // independently-computed check, and hands the same two values to EquipmentAvailabilitySheet so
  // it never re-derives its own answer either.
  equipmentType: EquipmentType | null;
  resolvedInventory: ResolvedInventory | null;
  equipmentProfileId: string | null;
  onExerciseChanged: () => void;
}

// The stateful wrapper: owns the action bar's local sheet-open state and wires every action-bar id
// and overflow row to its sheet or mutation, per D-13 (05-06's own integration point). Not yet
// consumed by workout.tsx — see 05-06-SUMMARY.md's "Known integration gap" — but a caller using
// this component (rather than ExercisePageView directly) gets the fully-wired action bar and
// overflow sheet with no further plumbing.
export function ExercisePage({
  sessionExerciseId,
  exerciseId,
  sessionId,
  userId,
  weightUnit,
  exerciseName,
  targets,
  routineExerciseId,
  cycleId,
  sessionExercises,
  sessionExerciseRows,
  onSelectExercise,
  perSideOverride,
  onSetPerSideOverride,
  db,
  hasNote,
  noteText,
  equipmentType,
  resolvedInventory,
  equipmentProfileId,
  onExerciseChanged,
  rows,
  activeField,
  onFieldPress,
  onReferenceTap,
  onCheckmarkPress,
}: ExercisePageProps) {
  const themeColors = useThemeColors();
  const { colorScheme } = useColorScheme();
  const colors = resolveSetRowColors(themeColors, colorScheme);
  const router = useRouter();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet | null>(null);
  const [setNoteTarget, setSetNoteTarget] = useState<{ id: string; text: string | null } | null>(null);
  const [setTypeTarget, setSetTypeTarget] = useState<{
    id: string;
    setType: SetType;
    displaySetNumber: number;
    childCount: number;
    childSetType: SetType | null;
  } | null>(null);
  // The selection stashed while ChangeSetTypeDialog (D-09's confirm) is open — discarded on
  // cancel, applied (after clearSubEntries) on confirm. Never read outside the confirm flow.
  const [pendingSetType, setPendingSetType] = useState<SetType | null>(null);
  // E1/E2 write-failure state: a failed local write renders the shipped ErrorBanner inline and
  // keeps whichever of the picker/confirm dialog is open on its pre-selection state, rather than
  // closing (Phase 6 E2/E4 precedent) — cleared every time either surface opens afresh.
  const [setTypeError, setSetTypeError] = useState<string | null>(null);

  const closeSheet = () => setActiveSheet(null);

  // R11: the one predicate the band and this row share — computed here, from the same two
  // already-loaded inputs the caller resolved, never re-derived inside SessionActionSheet or
  // EquipmentAvailabilitySheet.
  const hasEquipment = hasResolvableEquipment(
    resolveEquipmentBand({ equipmentType, targetKg: null, inventory: resolvedInventory }),
  );

  // The sheet's Superset/Detach rows resolve from the shared predicates, never re-derived at the
  // render site (D-11). `nextExerciseName` mirrors formSuperset's own "next live adjacent
  // exercise by orderIndex" pairing rule, so the row's label always names the exercise the write
  // will actually pair with.
  const orderedLiveRows = [...sessionExerciseRows].sort((a, b) => a.orderIndex - b.orderIndex);
  const currentRowIndex = orderedLiveRows.findIndex((candidate) => candidate.id === sessionExerciseId);
  const nextExerciseName = currentRowIndex === -1 ? null : (orderedLiveRows[currentRowIndex + 1]?.exerciseName ?? null);
  const supersetPartnerName = detachRowPartnerName(sessionExerciseRows, sessionExerciseId);

  // D-21: the sheet's per-side rows resolve from the one shared predicate over this page's own
  // already-loaded `rows`, never re-derived inside SessionActionSheet or at a second call site.
  // The trailing draft row (setId null) carries no side of its own and is excluded before the
  // predicate ever sees it — isPerSideMode only asks whether an EXISTING logged_set carries a side.
  const perSideRows: PerSideRowInput[] = rows
    .filter((row): row is typeof row & { setId: string } => row.setId !== null)
    .map((row) => ({
      id: row.setId,
      parentSetId: row.parentSetId ?? null,
      side: row.side ?? null,
      setType: row.setType ?? WORKING_SET_TYPE,
      completed: row.completed,
    }));
  const perSideEnabled = isPerSideMode(perSideRows, perSideOverride);

  // A draft row's setId is null, so ExercisePageView never calls this for one (05-UI-SPEC
  // Amendment A.1) — there is no logged_set yet for a draft to annotate.
  const handleSetLongPress = (setId: string) => {
    const row = rows.find((candidate) => candidate.setId === setId);
    setSetNoteTarget({ id: setId, text: row?.noteText ?? null });
    setActiveSheet('set-note');
  };

  // Mirrors handleSetLongPress exactly — a draft row's null setId is guarded by
  // ExercisePageView's own onSetNumberPress wiring (the same null-setId check onSetLongPress
  // already uses), so this is never called for the trailing draft row.
  const handleSetNumberPress = (setId: string) => {
    const row = rows.find((candidate) => candidate.setId === setId);
    if (!row || !row.setType) return;
    const firstChild = rows.find((candidate) => candidate.parentSetId === setId);
    const childCount = rows.filter((candidate) => candidate.parentSetId === setId).length;
    setSetTypeTarget({
      id: setId,
      setType: row.setType as SetType,
      displaySetNumber: row.displaySetIndex ?? row.setIndex,
      childCount,
      childSetType: (firstChild?.setType as SetType | undefined) ?? null,
    });
    setSetTypeError(null);
    setActiveSheet('set-type');
  };

  // The write for a single retype/insert-child effect — never touches weight_kg, reps, completed
  // or set_index (updateLoggedSet's named-columns-only patch discipline, CF-08). Failure
  // additionally writes FAILURE_SET_RIR in the same act (SETS-04), so the lifter never re-enters
  // the 0 the picker's own descriptor promises.
  const writeSetTypeEffect = async (
    effect: 'retype' | 'insert-child',
    selected: SetType,
    target: { id: string },
  ): Promise<void> => {
    if (effect === 'retype') {
      await updateLoggedSet(
        { id: target.id, setType: selected, ...(selected === 'failure' ? { rir: FAILURE_SET_RIR } : {}) },
        db ?? getPowerSync(),
      );
    } else {
      await logSet(
        {
          sessionExerciseId,
          setType: selected,
          parentSetId: target.id,
          weight: { value: null, unit: weightUnit },
          reps: 0,
          completed: false,
        },
        db ?? getPowerSync(),
      );
    }
  };

  // The picker's whole behavior table (resolveSetTypeSelection, 07-04), dispatched to one of four
  // branches — never a generic "set setType to X" handler (Pitfall 6). A drop/partial value can
  // structurally never reach the retype branch.
  const handleSetTypeSelect = async (selected: SetType) => {
    if (!setTypeTarget) return;
    const effect: SetTypeSelectionEffect = resolveSetTypeSelection({
      selected,
      currentSetType: setTypeTarget.setType,
      childCount: setTypeTarget.childCount,
      childSetType: setTypeTarget.childSetType,
    });

    if (effect === 'no-op') {
      closeSheet();
      return;
    }

    if (effect === 'confirm-first') {
      setPendingSetType(selected);
      setSetTypeError(null);
      setActiveSheet('change-set-type-confirm');
      return;
    }

    try {
      await writeSetTypeEffect(effect, selected, setTypeTarget);
      closeSheet();
      onExerciseChanged();
    } catch {
      setSetTypeError("Couldn't save");
    }
  };

  // D-09: clearSubEntries always runs before the pending selection's own write, and both live in
  // the same try so a failure after the delete still surfaces the write-failure banner rather than
  // silently leaving the group half-changed from the lifter's point of view.
  const handleConfirmChangeSetType = async () => {
    if (!setTypeTarget || pendingSetType === null) return;
    const selected = pendingSetType;
    try {
      await clearSubEntries(setTypeTarget.id, db ?? getPowerSync());
      await writeSetTypeEffect(setTypePickerEffect(selected), selected, setTypeTarget);
      setPendingSetType(null);
      closeSheet();
      onExerciseChanged();
    } catch {
      setSetTypeError("Couldn't save");
    }
  };

  const handleCancelChangeSetType = () => {
    setPendingSetType(null);
    closeSheet();
  };

  // Task 3 (07-05): D-08's "+ Add {type}" control. Resolves the group's kind from the same
  // resolveGroupAddControls output ExercisePageView already rendered the control from — never a
  // second, independently-derived kind. A failed write leaves the group exactly as it was
  // (addSubEntry writes nothing on its own guard failure, and a downstream write failure surfaces
  // the existing setTypeError banner) rather than optimistically adding a row.
  const handleAddSubEntry = async (parentSetId: string) => {
    const control = resolveGroupAddControls(rows).find((candidate) => candidate.parentSetId === parentSetId);
    if (!control) return;
    try {
      await addSubEntry({ sessionExerciseId, parentSetId, setType: control.kind }, db ?? getPowerSync());
      onExerciseChanged();
    } catch {
      setSetTypeError("Couldn't save");
    }
  };

  // The per-child remove glyph — deliberately un-confirmed (UI-SPEC), unlike D-09's group-level
  // delete. A failed write leaves the row present rather than optimistically removing it — the E3
  // error-state backstop this plan carries.
  const handleRemoveChild = async (setId: string) => {
    try {
      await removeSubEntry(setId, db ?? getPowerSync());
      onExerciseChanged();
    } catch {
      setSetTypeError("Couldn't save");
    }
  };

  const handleActionPress = (id: ExerciseActionId) => {
    if (id === 'targets') setActiveSheet('targets');
    else if (id === 'note') setActiveSheet('note');
    else if (id === 'overflow') setActiveSheet('session');
    // Tapping Warm-up opens the same sheet whether or not a ladder already exists for this
    // exercise (05-UI-SPEC): WarmupSheet's own defaulting logic and generateWarmupSets's own
    // delete-then-insert semantics are what make a second tap a regenerate, not a second sheet.
    else if (id === 'warmup') setActiveSheet('warmup');
  };

  // Neither Superset nor Detach shows a confirmation — both are structural, reversible edits with
  // no logged-set data loss (Switch Gym row's precedent). A rejection sets the existing
  // setTypeError state and leaves the sheet OPEN rather than closing as if the edit applied (E4).
  const handleFormSuperset = async () => {
    try {
      await formSuperset({ sessionExerciseId, sessionId }, db ?? getPowerSync());
      closeSheet();
      onExerciseChanged();
    } catch {
      setSetTypeError("Couldn't save");
    }
  };

  const handleDetachSuperset = async () => {
    try {
      await detachSuperset(sessionExerciseId, db ?? getPowerSync());
      closeSheet();
      onExerciseChanged();
    } catch {
      setSetTypeError("Couldn't save");
    }
  };

  // Neither per-side row writes to the database and neither shows a confirmation — D-22 already
  // guarantees no existing logged set is rewritten in either direction, so there is nothing
  // destructive to confirm. Neither calls onExerciseChanged, because nothing was persisted; the
  // next set the lifter logs is where the mode takes effect (UI-SPEC "Per-Side Logging").
  const handleEnablePerSide = () => {
    onSetPerSideOverride(true);
    closeSheet();
  };

  const handleDisablePerSide = () => {
    onSetPerSideOverride(false);
    closeSheet();
  };

  // Every SessionExerciseActionId is dispatched explicitly — an unhandled id must not silently
  // open the reorder sheet (the trap the plan's own instruction calls out).
  const handleSessionAction = (id: SessionExerciseActionId) => {
    if (id === 'remove') setActiveSheet('remove-confirm');
    else if (id === 'swap') setActiveSheet('swap');
    else if (id === 'equipment') setActiveSheet('equipment');
    else if (id === 'info') {
      closeSheet();
      router.push({ pathname: '/exercises/[id]', params: { id: exerciseId } });
    } else if (id === 'superset') {
      void handleFormSuperset();
    } else if (id === 'detach-superset') {
      void handleDetachSuperset();
    } else if (id === 'enable-per-side') {
      handleEnablePerSide();
    } else if (id === 'disable-per-side') {
      handleDisablePerSide();
    } else if (id === 'reorder') {
      setActiveSheet('reorder');
    }
  };

  const handleConfirmRemove = async () => {
    closeSheet();
    await removeSessionExercise(sessionExerciseId, db ?? getPowerSync());
    onExerciseChanged();
  };

  const handleSwapPick = async (pickedRows: PickerCatalogRow[]) => {
    closeSheet();
    const picked = pickedRows[0];
    if (!picked) return;
    await swapSessionExercise({ sessionExerciseId, newExerciseId: picked.id }, db ?? getPowerSync());
    onExerciseChanged();
  };

  const actionBarSlot = (
    <>
      <SupersetPartnerChip sessionExerciseRows={sessionExerciseRows} sessionExerciseId={sessionExerciseId} onSelectExercise={onSelectExercise} />
      <ExerciseActionBar hasNote={hasNote} warmupSetsEnabled onPress={handleActionPress} />

      {activeSheet === 'targets' ? (
        <TargetsSheet
          sessionExerciseId={sessionExerciseId}
          exerciseName={exerciseName}
          initial={targets}
          routineExerciseId={routineExerciseId}
          cycleId={cycleId}
          db={db}
          onDone={() => {
            closeSheet();
            onExerciseChanged();
          }}
          onCancel={closeSheet}
        />
      ) : null}

      {activeSheet === 'note' ? (
        <NoteSheet
          level="exercise"
          id={sessionExerciseId}
          initialText={noteText}
          db={db}
          onSaved={() => {
            closeSheet();
            onExerciseChanged();
          }}
          onCancel={closeSheet}
        />
      ) : null}

      {activeSheet === 'set-note' && setNoteTarget ? (
        <NoteSheet
          level="set"
          id={setNoteTarget.id}
          initialText={setNoteTarget.text}
          db={db}
          onSaved={() => {
            closeSheet();
            onExerciseChanged();
          }}
          onCancel={closeSheet}
        />
      ) : null}

      {activeSheet === 'set-type' && setTypeTarget ? (
        <SetTypePickerSheet
          setNumber={setTypeTarget.displaySetNumber}
          currentSetType={setTypeTarget.setType}
          childCount={setTypeTarget.childCount}
          childSetType={setTypeTarget.childSetType}
          errorMessage={setTypeError}
          onSelect={(setType) => void handleSetTypeSelect(setType)}
          onCancel={closeSheet}
        />
      ) : null}

      {activeSheet === 'change-set-type-confirm' && setTypeTarget ? (
        <ChangeSetTypeDialog
          subEntryCount={setTypeTarget.childCount}
          errorMessage={setTypeError}
          onConfirm={() => void handleConfirmChangeSetType()}
          onCancel={handleCancelChangeSetType}
        />
      ) : null}

      {activeSheet === 'warmup' ? (
        <WarmupSheet
          sessionExerciseId={sessionExerciseId}
          exerciseId={exerciseId}
          liveSessionId={sessionId}
          userId={userId}
          weightUnit={weightUnit}
          equipmentType={equipmentType}
          onDone={() => {
            closeSheet();
            onExerciseChanged();
          }}
          onCancel={closeSheet}
        />
      ) : null}

      {activeSheet === 'session' ? (
        <SessionActionSheet
          exerciseName={exerciseName}
          hasEquipment={hasEquipment}
          nextExerciseName={nextExerciseName}
          supersetPartnerName={supersetPartnerName}
          perSideEnabled={perSideEnabled}
          perSideAvailable
          onSelect={handleSessionAction}
          onCancel={closeSheet}
        />
      ) : null}

      {activeSheet === 'equipment' && equipmentType !== null && resolvedInventory !== null && equipmentProfileId !== null ? (
        <EquipmentAvailabilitySheet
          sessionId={sessionId}
          sessionExerciseId={sessionExerciseId}
          exerciseId={exerciseId}
          userId={userId}
          equipmentProfileId={equipmentProfileId}
          equipmentType={equipmentType}
          inventory={resolvedInventory}
          db={db}
          onDone={() => {
            closeSheet();
            onExerciseChanged();
          }}
          onCancel={closeSheet}
        />
      ) : null}

      {activeSheet === 'reorder' ? (
        <ReorderExercisesSheet
          sessionId={sessionId}
          exercises={sessionExercises}
          db={db}
          onDone={() => {
            closeSheet();
            onExerciseChanged();
          }}
        />
      ) : null}

      {activeSheet === 'remove-confirm' ? (
        <RemoveExerciseDialog onConfirm={() => void handleConfirmRemove()} onCancel={closeSheet} />
      ) : null}

      {activeSheet === 'swap' ? (
        <ExercisePickerModal dayName={`a replacement for ${exerciseName}`} onAdd={(picked) => void handleSwapPick(picked)} onCancel={closeSheet} />
      ) : null}
    </>
  );

  return (
    <ExercisePageView
      exerciseName={exerciseName}
      rows={rows}
      activeField={activeField}
      colors={colors}
      actionBarSlot={actionBarSlot}
      onSetLongPress={handleSetLongPress}
      onSetNumberPress={handleSetNumberPress}
      onFieldPress={onFieldPress}
      onReferenceTap={onReferenceTap}
      onCheckmarkPress={onCheckmarkPress}
      onAddSubEntry={(parentSetId) => void handleAddSubEntry(parentSetId)}
      onRemoveChild={(setId) => void handleRemoveChild(setId)}
    />
  );
}

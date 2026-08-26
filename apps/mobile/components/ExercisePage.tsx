import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { WARMUP_SET_TYPE, type ResolvedTarget, type WeightUnit } from '@fitness/api-contracts';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import type { WriteDb } from '@/lib/db/powersync';
import { removeSessionExercise, swapSessionExercise } from '@/lib/db/session-mutations';
import { ExerciseActionBar, type ExerciseActionId } from './ExerciseActionBar';
import { ExercisePickerModal, type PickerCatalogRow } from './ExercisePickerModal';
import type { KeypadField } from './NumericKeypad';
import { NoteSheet } from './NoteSheet';
import { RemoveExerciseDialog, SessionActionSheet, type SessionExerciseActionId } from './SessionActionSheet';
import { SetRowView, type SetRowReference, type SetRowValues } from './SetRow';
import { TargetsSheet } from './TargetsSheet';
import { WarmupSheet } from './WarmupSheet';

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
  onFieldPress: (setId: string | null, field: KeypadField, currentValue: string | null) => void;
  onReferenceTap: (setId: string | null, field: 'weight' | 'reps') => void;
  onCheckmarkPress: (setId: string | null) => void;
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
  onFieldPress,
  onReferenceTap,
  onCheckmarkPress,
}: ExercisePageViewProps) {
  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
        <Text className="mb-md text-heading font-semibold text-foreground">{exerciseName}</Text>
        {actionBarSlot ?? null}
        {rows.map((row) => (
          <SetRowView
            key={row.setId ?? `draft-${row.setIndex}`}
            setIndex={row.setIndex}
            values={row.values}
            reference={row.reference}
            completed={row.completed}
            activeField={activeField && activeField.setId === row.setId ? activeField.field : null}
            colors={colors}
            warmup={row.setType === WARMUP_SET_TYPE}
            hasNote={row.noteText !== null && row.noteText !== undefined}
            onLongPress={row.setId && onSetLongPress ? () => onSetLongPress(row.setId as string) : undefined}
            onFieldPress={(field) => onFieldPress(row.setId, field, row.values[field])}
            onReferenceTap={(field) => onReferenceTap(row.setId, field)}
            onCheckmarkPress={() => onCheckmarkPress(row.setId)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

type ActiveSheet = 'targets' | 'note' | 'set-note' | 'session' | 'remove-confirm' | 'swap' | 'warmup';

export interface ExercisePageProps extends Omit<ExercisePageViewProps, 'colors' | 'actionBarSlot' | 'onSetLongPress'> {
  sessionExerciseId: string;
  exerciseId: string;
  sessionId: string;
  userId: string | null;
  weightUnit: WeightUnit;
  targets: ResolvedTarget;
  routineExerciseId: string | null;
  cycleId: string | null;
  // Threaded to TargetsSheet's own write-back call so it reaches the same database this page's
  // own reads came from, rather than TargetsSheet's default silently resolving getPowerSync()
  // again (05-12). Undefined in the few call sites that have never needed to override it —
  // TargetsSheet's own default takes over identically.
  db?: WriteDb;
  hasNote: boolean;
  noteText: string | null;
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
  db,
  hasNote,
  noteText,
  onExerciseChanged,
  rows,
  activeField,
  onFieldPress,
  onReferenceTap,
  onCheckmarkPress,
}: ExercisePageProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet | null>(null);
  const [setNoteTarget, setSetNoteTarget] = useState<{ id: string; text: string | null } | null>(null);

  const closeSheet = () => setActiveSheet(null);

  // A draft row's setId is null, so ExercisePageView never calls this for one (05-UI-SPEC
  // Amendment A.1) — there is no logged_set yet for a draft to annotate.
  const handleSetLongPress = (setId: string) => {
    const row = rows.find((candidate) => candidate.setId === setId);
    setSetNoteTarget({ id: setId, text: row?.noteText ?? null });
    setActiveSheet('set-note');
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

  const handleSessionAction = (id: SessionExerciseActionId) => {
    if (id === 'remove') setActiveSheet('remove-confirm');
    else if (id === 'swap') setActiveSheet('swap');
    else if (id === 'info') {
      closeSheet();
      router.push({ pathname: '/exercises/[id]', params: { id: exerciseId } });
    } else {
      // 'reorder': no drag-and-drop reorder surface is specified anywhere in 05-UI-SPEC.md for
      // this phase (E10 lists the row but defines no interaction) — reorderSessionExercises is
      // built and tested as a mutation, but this row has no UI flow to drive it yet this phase.
      closeSheet();
    }
  };

  const handleConfirmRemove = async () => {
    closeSheet();
    await removeSessionExercise(sessionExerciseId);
    onExerciseChanged();
  };

  const handleSwapPick = async (pickedRows: PickerCatalogRow[]) => {
    closeSheet();
    const picked = pickedRows[0];
    if (!picked) return;
    await swapSessionExercise({ sessionExerciseId, newExerciseId: picked.id });
    onExerciseChanged();
  };

  const actionBarSlot = (
    <>
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

      {activeSheet === 'warmup' ? (
        <WarmupSheet
          sessionExerciseId={sessionExerciseId}
          exerciseId={exerciseId}
          liveSessionId={sessionId}
          userId={userId}
          weightUnit={weightUnit}
          onDone={() => {
            closeSheet();
            onExerciseChanged();
          }}
          onCancel={closeSheet}
        />
      ) : null}

      {activeSheet === 'session' ? (
        <SessionActionSheet exerciseName={exerciseName} onSelect={handleSessionAction} onCancel={closeSheet} />
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
      onFieldPress={onFieldPress}
      onReferenceTap={onReferenceTap}
      onCheckmarkPress={onCheckmarkPress}
    />
  );
}

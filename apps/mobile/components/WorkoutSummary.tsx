import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CANONICAL_KG_SCALE, formatWeight, fromCanonicalKg, type PrType, type WeightUnit } from '@fitness/api-contracts';
import { estimated1RM } from '@fitness/pr-rules';
import { updateLoggedSet } from '@/lib/db/log-set';
import { detectPrsForSession } from '@/lib/db/personal-record';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { loadSessionSummary, type ExerciseBreakdown, type SessionSummary } from '@/lib/db/summary-query';
import { formatClock } from '@/lib/rest-timer';
import { useSessionMode, type SessionScreenMode } from '@/lib/session/session-mode';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import { applyKeypadPress, nextKeypadField, NumericKeypadView, type KeypadField, type KeypadPress } from './NumericKeypad';
import { MuscleTargetList } from './MuscleTargetList';
import { PrimaryButton } from './PrimaryButton';
import { SetRowView, type SetRowValues } from './SetRow';

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// A compact single-line summary of what an exercise's completed working sets actually were — the
// PR badges and e1RM cell are rendered separately (D-31 needs the em-dash case to keep its own
// "e1RM:" label regardless of this line).
export function formatBreakdownLine(
  row: Pick<ExerciseBreakdown, 'completedSetCount' | 'totalReps' | 'topWeightKg' | 'volumeKg'>,
  unit: WeightUnit,
): string {
  const sets = `${row.completedSetCount} ${pluralize(row.completedSetCount, 'set', 'sets')}`;
  const reps = `${row.totalReps} ${pluralize(row.totalReps, 'rep', 'reps')}`;
  const topWeight = `${formatWeight(row.topWeightKg, unit)} top`;
  const volume = `${formatWeight(row.volumeKg, unit)} volume`;
  return `${sets} · ${reps} · ${topWeight} · ${volume}`;
}

// formatWeight already returns the em dash for a null value (D-31) — reused verbatim rather than
// re-deriving the same fallback here.
export function formatE1rm(bestE1rmKg: string | null, unit: WeightUnit): string {
  return formatWeight(bestE1rmKg, unit);
}

const PR_BADGE_LABEL = 'New PR';

// A plain function, called (never rendered as a JSX tag) so its returned View/Text tree is
// inlined directly into WorkoutSummaryView's own — SetRow.tsx's renderSetField established this
// fix for the exact same trap: a `<PrBadges />` element stays an opaque, unexpanded node to a test
// that walks the tree by direct invocation with no renderer.
function renderPrBadges(prTypes: PrType[]) {
  if (prTypes.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-xs">
      {prTypes.map((prType) => (
        <View key={prType} className="rounded-full bg-accent/10 px-xs py-xs">
          <Text className="text-label font-semibold text-accent">{PR_BADGE_LABEL}</Text>
        </View>
      ))}
    </View>
  );
}

export interface RowDisplay {
  e1rmDisplay: string;
  prTypes: PrType[];
}

// Isolates the PR/e1RM computation per exercise (UI-SPEC E9 error backstop) so one exercise's
// estimator throwing cannot take the whole screen down — the sets/reps/weight/volume line is
// computed independently of this and always renders. `estimateFn` defaults to the real
// estimated1RM but is swappable so a held-out test can inject a throwing stub; prTypes is bundled
// into the same try so a thrown estimator degrades the badges alongside the e1RM cell, never a
// half-trusted mix of the two.
export function deriveRowDisplay(
  row: Pick<ExerciseBreakdown, 'completedSets' | 'prTypes'>,
  weightUnit: WeightUnit,
  estimateFn: (weightKg: number, reps: number) => number | null = estimated1RM,
): RowDisplay {
  try {
    let bestE1rm: number | null = null;
    for (const set of row.completedSets) {
      if (set.weightKg === null) continue;
      const e1rm = estimateFn(Number(set.weightKg), set.reps);
      if (e1rm !== null && (bestE1rm === null || e1rm > bestE1rm)) bestE1rm = e1rm;
    }
    const bestE1rmKg = bestE1rm === null ? null : bestE1rm.toFixed(CANONICAL_KG_SCALE);
    return { e1rmDisplay: formatE1rm(bestE1rmKg, weightUnit), prTypes: row.prTypes };
  } catch {
    return { e1rmDisplay: formatE1rm(null, weightUnit), prTypes: [] };
  }
}

export interface EditingFieldState {
  setId: string;
  field: KeypadField;
  value: string | null;
}

function valuesForSet(set: ExerciseBreakdown['completedSets'][number], weightUnit: WeightUnit, editingField: EditingFieldState | null): SetRowValues {
  const editing = editingField?.setId === set.id ? editingField : null;
  return {
    weight: editing?.field === 'weight' ? editing.value : fromCanonicalKg(set.weightKg, weightUnit),
    reps: editing?.field === 'reps' ? editing.value : String(set.reps),
    rir: editing?.field === 'rir' ? editing.value : set.rir === null ? null : String(set.rir),
  };
}

const WEIGHT_STEP_KG = 2.5;
const WEIGHT_STEP_LB = 0.5;
const INTEGER_STEP = 1;

function stepAmountFor(field: KeypadField, weightUnit: WeightUnit): number {
  if (field !== 'weight') return INTEGER_STEP;
  return weightUnit === 'lb' ? WEIGHT_STEP_LB : WEIGHT_STEP_KG;
}

// A plain function, called rather than rendered as a JSX tag — same renderSetField-style
// discipline as renderPrBadges above, so the direct-invocation test walker sees every SetRowView
// this produces.
function renderExpandedRow(
  row: ExerciseBreakdown,
  weightUnit: WeightUnit,
  colors: ThemeColors,
  editingField: EditingFieldState | null,
  onFieldPress: (setId: string, field: KeypadField, currentValue: string | null) => void,
  onCheckmarkPress: (setId: string) => void,
  onKeypadPress: (press: KeypadPress) => void,
  onKeypadSubmit: () => void,
) {
  return (
    <View className="gap-xs">
      {row.completedSets.map((set) => (
        <SetRowView
          key={set.id}
          setIndex={set.setIndex}
          values={valuesForSet(set, weightUnit, editingField)}
          reference={{ weight: null, reps: null }}
          completed={set.completed}
          activeField={editingField?.setId === set.id ? editingField.field : null}
          colors={colors}
          onFieldPress={(field) => onFieldPress(set.id, field, valuesForSet(set, weightUnit, editingField)[field])}
          onReferenceTap={() => {}}
          onCheckmarkPress={() => onCheckmarkPress(set.id)}
        />
      ))}
      {editingField ? (
        <NumericKeypadView
          field={editingField.field}
          stepAmount={stepAmountFor(editingField.field, weightUnit)}
          colors={colors}
          onPress={onKeypadPress}
          onSubmit={onKeypadSubmit}
        />
      ) : null}
    </View>
  );
}

export interface WorkoutSummaryViewProps {
  summary: SessionSummary;
  weightUnit: WeightUnit;
  colors: ThemeColors;
  mode: SessionScreenMode;
  expandedSessionExerciseId: string | null;
  editingField: EditingFieldState | null;
  onDone: () => void;
  onEditPress: (sessionExerciseId: string) => void;
  onFieldPress: (setId: string, field: KeypadField, currentValue: string | null) => void;
  onCheckmarkPress: (setId: string) => void;
  onKeypadPress: (press: KeypadPress) => void;
  onKeypadSubmit: () => void;
  estimateFn?: (weightKg: number, reps: number) => number | null;
}

// Hook-free — direct-invocable by a test, matching CycleStripView/SetRowView. The Muscles Trained
// chip row is deliberately the first thing seen after the heading (05-UI-SPEC's stated focal
// point): what was accomplished, before what the numbers were. A session finished with zero
// completed sets (UI-SPEC E9 empty backstop) renders heading, duration and Done only — both the
// muscle chip row and the breakdown are structurally absent, not empty variants of themselves.
export function WorkoutSummaryView({
  summary,
  weightUnit,
  colors,
  mode,
  expandedSessionExerciseId,
  editingField,
  onDone,
  onEditPress,
  onFieldPress,
  onCheckmarkPress,
  onKeypadPress,
  onKeypadSubmit,
  estimateFn,
}: WorkoutSummaryViewProps) {
  const hasBreakdown = summary.breakdown.length > 0;

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerStyle={{ gap: 24, padding: 24 }}>
        <View className="gap-xs">
          <Text className="text-heading font-semibold text-foreground">Workout Complete</Text>
          <Text className="text-body font-normal text-foreground-muted">{formatClock(summary.durationSeconds)}</Text>
        </View>

        {hasBreakdown ? (
          <View className="gap-sm">
            <Text className="text-body font-semibold text-foreground">Muscles Trained</Text>
            <MuscleTargetList
              primaryMuscles={summary.musclesTrained.primaryMuscles}
              secondaryMuscles={summary.musclesTrained.secondaryMuscles}
            />
          </View>
        ) : null}

        {hasBreakdown ? (
          <View className="gap-md">
            <Text className="text-body font-semibold text-foreground">Per-Exercise Breakdown</Text>
            {summary.breakdown.map((row) => {
              const display = deriveRowDisplay(row, weightUnit, estimateFn);
              const isExpanded = expandedSessionExerciseId === row.sessionExerciseId;
              return (
                <View key={row.sessionExerciseId} className="gap-xs border-b border-foreground-muted/20 pb-md">
                  <View className="flex-row flex-wrap items-center justify-between gap-sm">
                    <View className="flex-row flex-wrap items-center gap-sm">
                      <Text className="text-body font-semibold text-foreground">{row.exerciseName}</Text>
                      {renderPrBadges(display.prTypes)}
                    </View>
                    {mode === 'summary-correction' ? (
                      <Pressable
                        onPress={() => onEditPress(row.sessionExerciseId)}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${row.exerciseName}`}
                        style={{ minHeight: 48, justifyContent: 'center' }}
                      >
                        <Text className="text-body font-normal text-accent">Edit</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Text className="text-body font-normal text-foreground-muted">{formatBreakdownLine(row, weightUnit)}</Text>
                  <Text className="text-body font-normal text-foreground-muted">e1RM: {display.e1rmDisplay}</Text>
                  {mode === 'summary-correction' && isExpanded
                    ? renderExpandedRow(row, weightUnit, colors, editingField, onFieldPress, onCheckmarkPress, onKeypadPress, onKeypadSubmit)
                    : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <View className="p-lg">
        <PrimaryButton label="Done" onPress={onDone} />
      </View>
    </View>
  );
}

export interface WorkoutSummaryProps {
  summary: SessionSummary;
  weightUnit: WeightUnit;
  onDone: () => void;
}

// D-32/R10: the correction affordance is gated on the SessionModeProvider's typed value, read
// once here via useSessionMode() and threaded down as an explicit prop — never re-derived from
// summary.session's own status. Owns every piece of editing UI state (which row is expanded,
// which field is mid-edit) so WorkoutSummaryView stays hook-free.
export function WorkoutSummary({ summary: initialSummary, weightUnit, onDone }: WorkoutSummaryProps) {
  const colors = useThemeColors();
  const mode = useSessionMode();
  const [summary, setSummary] = useState(initialSummary);
  const [expandedSessionExerciseId, setExpandedSessionExerciseId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditingFieldState | null>(null);

  function findSet(setId: string) {
    for (const row of summary.breakdown) {
      const set = row.completedSets.find((candidate) => candidate.id === setId);
      if (set) return set;
    }
    return null;
  }

  function handleEditPress(sessionExerciseId: string) {
    setEditingField(null);
    setExpandedSessionExerciseId((prev) => (prev === sessionExerciseId ? null : sessionExerciseId));
  }

  function handleFieldPress(setId: string, field: KeypadField, currentValue: string | null) {
    setEditingField({ setId, field, value: currentValue });
  }

  function handleKeypadPress(press: KeypadPress) {
    setEditingField((prev) => (prev ? { ...prev, value: applyKeypadPress(prev.value, press) } : prev));
  }

  // Reconciled Task 1's write path is the only source of truth here: this re-runs detection and
  // reloads the assembled summary from scratch, so a corrected number can only ever cause the
  // badges shown to CATCH UP with reality — never a stale personal_record row left standing.
  // Deleting/superseding a row a correction has since invalidated is Phase 10's recompute-on-
  // history-edit territory (LOG-18 flagged assumption); this phase only avoids CREATING a new one
  // the current numbers wouldn't support, which detectPrsForSession's own idempotency guard makes
  // safe to call again here. userId is null on this re-run — session-lifecycle.ts's own
  // stamped-server-side-on-sync-push precedent applies identically to a personal_record row
  // written from this screen; the server's ownership check re-attributes it on push regardless.
  async function refresh(db: WriteDb) {
    await detectPrsForSession(summary.session.id, null, db);
    const next = await loadSessionSummary(summary.session.id, null, db);
    if (next) setSummary(next);
  }

  async function handleKeypadSubmit() {
    if (!editingField) return;
    const { setId, field, value } = editingField;
    const db = getPowerSync();

    if (field === 'weight') {
      await updateLoggedSet({ id: setId, weight: { value, unit: weightUnit } }, db);
    } else if (field === 'reps') {
      await updateLoggedSet({ id: setId, reps: value === null ? 0 : Number(value) }, db);
    } else {
      await updateLoggedSet({ id: setId, rir: value === null ? null : Number(value) }, db);
    }

    const next = nextKeypadField(field);
    if (next === null) {
      setEditingField(null);
    } else {
      const set = findSet(setId);
      const nextValue =
        next === 'weight'
          ? fromCanonicalKg(set?.weightKg ?? null, weightUnit)
          : next === 'reps'
            ? String(set?.reps ?? '')
            : set?.rir === null || set?.rir === undefined
              ? null
              : String(set.rir);
      setEditingField({ setId, field: next, value: nextValue });
    }

    await refresh(db);
  }

  async function handleCheckmarkPress(setId: string) {
    const set = findSet(setId);
    if (!set) return;
    const db = getPowerSync();
    await updateLoggedSet({ id: setId, completed: !set.completed }, db);
    await refresh(db);
  }

  return (
    <WorkoutSummaryView
      summary={summary}
      weightUnit={weightUnit}
      colors={colors}
      mode={mode}
      expandedSessionExerciseId={expandedSessionExerciseId}
      editingField={editingField}
      onDone={onDone}
      onEditPress={handleEditPress}
      onFieldPress={handleFieldPress}
      onCheckmarkPress={(setId) => void handleCheckmarkPress(setId)}
      onKeypadPress={handleKeypadPress}
      onKeypadSubmit={() => void handleKeypadSubmit()}
    />
  );
}

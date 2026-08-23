import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DragHandle } from '@/components/DragHandle';
import type { ProgramSlot } from '@/lib/db/programs/load-program';
import type { TargetDraft } from '@/lib/db/programs/targets';
import { neighboursForIndex } from '@/lib/programs/reorder-drag';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';

// 04-UI-SPEC.md's Exercise Slot Row resolves D-25's "inline free text vs stepper" open question as
// steppers, which also resolves "what does a blank target mean" and "can an exercise save with no
// targets" structurally: a stepper cannot express a decimal, a negative or a non-integer, so
// parseTargetField's not-a-number/whole-number/negative errors can never be reached from this row.
// This departs from 04-03-PLAN.md's own <action> text, which was written against an earlier,
// TextField-based draft of D-25 and predates the UI-SPEC amendment — see the SUMMARY's Deviations
// section. targets.ts's validateTargets remains the single source of truth for the write path
// (defense in depth against any future caller that bypasses this row), but this row's steppers are
// built so the one condition validateTargets still checks — rep min > rep max — cannot be reached
// by construction (UI-SPEC R5).

// A cycle-specific number is marked with text, never colour alone (UI-SPEC's accent is reserved
// for selection and CTAs, and a colour-only marker is invisible to anyone who cannot see it).
export const CYCLE_OVERRIDE_MARKER = '· this cycle';

export type StepDirection = 'inc' | 'dec';

// Increment: null jumps to the floor, otherwise adds `step`, capped at `ceiling` (no cap when
// null). Decrement: null is a no-op (already empty), a step that would land below the floor clears
// back to null (this is how a target becomes unprescribed again), otherwise subtracts `step`.
//
// The decrement guard tests the *result*, not the current value. Testing `current <= floor` is
// only equivalent when step is 1: with rest's step of 15 and floor of 0, any value in (0, 15) —
// reachable from a program authored on another client — stepped straight past the floor into a
// negative, which the server's non-negative-integer shape check then rejects terminally.
//
// `clearToNull` is false while a cycle is selected. An override's null means "inherit", never
// "cleared" (resolveTarget's contract), so a step that cleared the value there would be written as
// "inherit this from the base" and the number would jump *up* to the base — the user presses minus
// and the readout increases. Clearing a prescription is a base-level act; inside a cycle the floor
// is a floor.
export function stepBoundedValue(
  current: number | null,
  direction: StepDirection,
  floor: number,
  ceiling: number | null,
  step = 1,
  clearToNull = true,
): number | null {
  if (direction === 'inc') {
    if (current === null) return floor;
    const next = current + step;
    return ceiling !== null ? Math.min(next, ceiling) : next;
  }
  if (current === null) return null;
  const next = current - step;
  if (next >= floor) return next;
  return clearToNull ? null : floor;
}

// The decrement that would clear is a no-op while a cycle is selected, so the control is disabled
// rather than pressable-and-inert.
export function decreaseDisabledFor(value: number | null, floor: number, clearToNull: boolean): boolean {
  if (value === null) return true;
  return !clearToNull && value <= floor;
}

export interface RepRange {
  min: number | null;
  max: number | null;
}

const REP_FLOOR = 1;
const REP_CEILING = 50;

// R5: incrementing min above the current max also raises max to match; the pair can never enter
// an invalid (min > max) state. A null max means no ordering constraint yet — nothing to pair.
export function stepRepMin(range: RepRange, direction: StepDirection, clearToNull = true): RepRange {
  const nextMin = stepBoundedValue(range.min, direction, REP_FLOOR, REP_CEILING, 1, clearToNull);
  if (direction === 'inc' && range.max !== null && nextMin !== null && nextMin > range.max) {
    return { min: nextMin, max: nextMin };
  }
  return { min: nextMin, max: range.max };
}

// The mirror rule: decrementing max below the current min also lowers min to match.
export function stepRepMax(range: RepRange, direction: StepDirection, clearToNull = true): RepRange {
  const nextMax = stepBoundedValue(range.max, direction, REP_FLOOR, REP_CEILING, 1, clearToNull);
  if (direction === 'dec' && range.min !== null && nextMax !== null && nextMax < range.min) {
    return { min: nextMax, max: nextMax };
  }
  return { min: range.min, max: nextMax };
}

function displayOrDash(value: number | null): string {
  return value === null ? '—' : `${value}`;
}

function formatRestReadout(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// The Exercise Slot Row's own collapsed-summary contract (UI-SPEC "Exercise Slot Row" section) —
// never collapses an equal rep min/max to one number; always renders the fixed four-segment
// template, substituting an em dash per null field rather than omitting a segment.
export function formatSlotSummary(draft: TargetDraft): string {
  const { targetSets, targetRepMin, targetRepMax, targetRir, targetRestSeconds } = draft;
  const allNull = targetSets === null && targetRepMin === null && targetRepMax === null && targetRir === null && targetRestSeconds === null;
  if (allNull) return 'No targets set.';

  const restDisplay = targetRestSeconds === null ? '—' : formatRestReadout(targetRestSeconds);

  return `${displayOrDash(targetSets)} sets · ${displayOrDash(targetRepMin)}–${displayOrDash(targetRepMax)} reps · ${displayOrDash(targetRir)} RIR · ${restDisplay} rest`;
}

interface TargetStepperProps {
  label: string;
  displayValue: string;
  colors: ThemeColors;
  decreaseDisabled: boolean;
  increaseDisabled: boolean;
  overridden?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}

// `[-] {value} [+]` per UI-SPEC's stepper anatomy. The readout has no fixed width (min-width 32,
// flex-shrink 1) so it grows at large OS font scales; the +/- buttons stay fixed at 48x48 since
// they are glyph-driven, not text-scaled.
//
// Called directly (`renderTargetStepper({...})`), never as a `<Component/>` element — a nested
// component descriptor's own body only runs when something actually renders it, which direct
// invocation of ExerciseSlotRowView in a test never does (no renderer in this worktree's
// lockfile). Calling this function inline embeds its returned Pressables straight into the parent
// tree, where a children-based findByType traversal can see them.
function renderTargetStepper({
  label,
  displayValue,
  colors,
  decreaseDisabled,
  increaseDisabled,
  overridden = false,
  onDecrease,
  onIncrease,
}: TargetStepperProps) {
  return (
    <View className="gap-xs">
      <View className="flex-row items-center gap-xs">
        <Text className="text-label font-normal text-foreground-muted">{label}</Text>
        {overridden ? (
          <Text
            accessibilityLabel={`${label} overridden for this cycle`}
            className="text-label font-normal text-foreground-muted"
          >
            {CYCLE_OVERRIDE_MARKER}
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-center gap-sm">
        <Pressable
          onPress={onDecrease}
          disabled={decreaseDisabled}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityState={{ disabled: decreaseDisabled }}
          className={`items-center justify-center rounded-md border border-foreground-muted ${decreaseDisabled ? 'opacity-60' : ''}`}
          style={{ minWidth: 48, minHeight: 48 }}
        >
          <Ionicons name="remove" size={20} color={colors.foregroundMuted} />
        </Pressable>

        <Text
          className="text-body font-normal text-foreground"
          style={{ minWidth: 32, flexShrink: 1, textAlign: 'center' }}
        >
          {displayValue}
        </Text>

        <Pressable
          onPress={onIncrease}
          disabled={increaseDisabled}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityState={{ disabled: increaseDisabled }}
          className={`items-center justify-center rounded-md border border-foreground-muted ${increaseDisabled ? 'opacity-60' : ''}`}
          style={{ minWidth: 48, minHeight: 48 }}
        >
          <Ionicons name="add" size={20} color={colors.foregroundMuted} />
        </Pressable>
      </View>
    </View>
  );
}

export interface ExerciseSlotRowSlot {
  id: string;
  exerciseName: string;
}

export interface ExerciseSlotRowViewProps {
  slot: ExerciseSlotRowSlot;
  expanded: boolean;
  draft: TargetDraft;
  colors: ThemeColors;
  // D-23's D-25/D-23 amendment (04-UI-SPEC.md "Day Deck & Drag Handle"): the drag handle — and its
  // Move up/down non-gesture equivalent — is hidden whenever a day has fewer than two exercises.
  // The day page computes this once (day.slots.length >= 2) and passes it down; it is never
  // recomputed per row or per platform file.
  canReorder?: boolean;
  orderedIds?: string[];
  index?: number;
  // The selected cycle's own override, resolved by the screen. With no cycle selected both are
  // inert: the base view has nothing to mark and nothing to reset to.
  cycleSelected?: boolean;
  overriddenFields?: string[];
  onResetCycleTarget?: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onStepSets: (direction: StepDirection) => void;
  onStepRepMin: (direction: StepDirection) => void;
  onStepRepMax: (direction: StepDirection) => void;
  onStepRir: (direction: StepDirection) => void;
  onStepRest: (direction: StepDirection) => void;
  onRemove: (id: string) => void;
  onReorder?: (beforeId: string | null, afterId: string | null) => void;
}

// Hook-free — direct-invocable by a test, matching the ExerciseImageTile/SwapSuggestionList split.
// Collapsed: name + summary line, zero steppers. Expanded: the collapsed content stays visible and
// five stepper fields grow in below it — no modal, no screen change, neighbouring rows unaffected.
export function ExerciseSlotRowView({
  slot,
  expanded,
  draft,
  colors,
  canReorder = false,
  orderedIds = [],
  index = 0,
  cycleSelected = false,
  overriddenFields = [],
  onResetCycleTarget,
  onToggleExpanded,
  onStepSets,
  onStepRepMin,
  onStepRepMax,
  onStepRir,
  onStepRest,
  onRemove,
  onReorder,
}: ExerciseSlotRowViewProps) {
  const isFirst = index <= 0;
  const isLast = index >= orderedIds.length - 1;
  const isOverridden = (field: string) => cycleSelected && overriddenFields.includes(field);
  const canReset = cycleSelected && overriddenFields.length > 0 && onResetCycleTarget !== undefined;
  // Inside a cycle a null means "inherit", not "cleared", so nothing here may step a value away.
  const clearToNull = !cycleSelected;

  const handleMoveUp = () => {
    if (!onReorder || isFirst) return;
    const { beforeId, afterId } = neighboursForIndex(orderedIds, slot.id, index - 1);
    onReorder(beforeId, afterId);
  };

  const handleMoveDown = () => {
    if (!onReorder || isLast) return;
    const { beforeId, afterId } = neighboursForIndex(orderedIds, slot.id, index + 1);
    onReorder(beforeId, afterId);
  };

  return (
    <View className="gap-sm rounded-md bg-surface p-md">
      <View className="flex-row items-center gap-sm">
        {canReorder && onReorder ? (
          <DragHandle exerciseName={slot.exerciseName} exerciseId={slot.id} fromIndex={index} orderedIds={orderedIds} onReorder={onReorder} />
        ) : null}
        <Pressable
          onPress={() => onToggleExpanded(slot.id)}
          accessibilityRole="button"
          accessibilityLabel={slot.exerciseName}
          accessibilityState={{ expanded }}
          className="flex-1 gap-xs"
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text className="text-body font-semibold text-foreground">{slot.exerciseName}</Text>
          <Text className="text-label font-normal text-foreground-muted">{formatSlotSummary(draft)}</Text>
        </Pressable>
      </View>

      {expanded ? (
        <View className="gap-md">
          {renderTargetStepper({
            label: 'Sets',
            overridden: isOverridden('targetSets'),
            displayValue: displayOrDash(draft.targetSets),
            colors,
            decreaseDisabled: decreaseDisabledFor(draft.targetSets, 1, clearToNull),
            increaseDisabled: false,
            onDecrease: () => onStepSets('dec'),
            onIncrease: () => onStepSets('inc'),
          })}

          <View className="flex-row flex-wrap gap-md">
            {renderTargetStepper({
              label: 'Rep min',
              overridden: isOverridden('targetRepMin'),
              displayValue: displayOrDash(draft.targetRepMin),
              colors,
              decreaseDisabled: decreaseDisabledFor(draft.targetRepMin, REP_FLOOR, clearToNull),
              increaseDisabled: draft.targetRepMin !== null && draft.targetRepMin >= REP_CEILING,
              onDecrease: () => onStepRepMin('dec'),
              onIncrease: () => onStepRepMin('inc'),
            })}
            {renderTargetStepper({
              label: 'Rep max',
              overridden: isOverridden('targetRepMax'),
              displayValue: displayOrDash(draft.targetRepMax),
              colors,
              decreaseDisabled: decreaseDisabledFor(draft.targetRepMax, REP_FLOOR, clearToNull),
              increaseDisabled: draft.targetRepMax !== null && draft.targetRepMax >= REP_CEILING,
              onDecrease: () => onStepRepMax('dec'),
              onIncrease: () => onStepRepMax('inc'),
            })}
          </View>

          {renderTargetStepper({
            label: 'RIR',
            overridden: isOverridden('targetRir'),
            displayValue: displayOrDash(draft.targetRir),
            colors,
            decreaseDisabled: decreaseDisabledFor(draft.targetRir, 0, clearToNull),
            increaseDisabled: draft.targetRir !== null && draft.targetRir >= 6,
            onDecrease: () => onStepRir('dec'),
            onIncrease: () => onStepRir('inc'),
          })}

          {renderTargetStepper({
            label: 'Rest (seconds)',
            overridden: isOverridden('targetRestSeconds'),
            displayValue: draft.targetRestSeconds === null ? '—' : formatRestReadout(draft.targetRestSeconds),
            colors,
            decreaseDisabled: decreaseDisabledFor(draft.targetRestSeconds, 0, clearToNull),
            increaseDisabled: false,
            onDecrease: () => onStepRest('dec'),
            onIncrease: () => onStepRest('inc'),
          })}

          {canReorder && onReorder ? (
            <View className="flex-row gap-sm">
              <Pressable
                onPress={handleMoveUp}
                disabled={isFirst}
                accessibilityRole="button"
                accessibilityLabel={`Move ${slot.exerciseName} up`}
                accessibilityState={{ disabled: isFirst }}
                className={isFirst ? 'opacity-60' : undefined}
                style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text className="text-label font-normal text-foreground-muted">Move up</Text>
              </Pressable>
              <Pressable
                onPress={handleMoveDown}
                disabled={isLast}
                accessibilityRole="button"
                accessibilityLabel={`Move ${slot.exerciseName} down`}
                accessibilityState={{ disabled: isLast }}
                className={isLast ? 'opacity-60' : undefined}
                style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text className="text-label font-normal text-foreground-muted">Move down</Text>
              </Pressable>
            </View>
          ) : null}

          {canReset ? (
            <Pressable
              onPress={() => onResetCycleTarget?.(slot.id)}
              accessibilityRole="button"
              accessibilityLabel={`Reset ${slot.exerciseName} to base`}
              style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text className="text-label font-normal text-accent">Reset to base</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => onRemove(slot.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${slot.exerciseName}`}
            style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text className="text-label font-normal text-destructive">Remove</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function extractDraft(slot: ProgramSlot): TargetDraft {
  return {
    targetSets: slot.targetSets,
    targetRepMin: slot.targetRepMin,
    targetRepMax: slot.targetRepMax,
    targetRir: slot.targetRir,
    targetRestSeconds: slot.targetRestSeconds,
  };
}

export interface ExerciseSlotRowProps {
  slot: ProgramSlot;
  expanded: boolean;
  canReorder?: boolean;
  orderedIds?: string[];
  index?: number;
  // What the row displays and edits: the selected cycle's resolved targets, or the slot's own base
  // values when no cycle is selected. The screen owns that resolution (it holds the selection);
  // the row never merges an override itself.
  resolved?: TargetDraft;
  cycleSelected?: boolean;
  overriddenFields?: string[];
  onResetCycleTarget?: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onRemove: (id: string) => void;
  // Resolves false when the write did not land. The row has to know: it sets the draft optimistically
  // and the resync effect only fires when the *persisted* values change, so a rejected write would
  // otherwise leave the stepper showing a number that was never stored (WR-11).
  onSaveTargets: (routineExerciseId: string, draft: TargetDraft) => Promise<boolean>;
  onReorder?: (beforeId: string | null, afterId: string | null) => void;
}

// Thin stateful wrapper. Every stepper press writes through immediately (R6 — optimistic
// local-first write, no explicit Save control) and updates local draft state right away so the
// readout never waits on the tree-reload round trip; the local draft resyncs whenever the parent
// reloads the tree with a genuinely different persisted value for this slot.
export function ExerciseSlotRow({
  slot,
  expanded,
  canReorder,
  orderedIds,
  index,
  resolved,
  cycleSelected,
  overriddenFields,
  onResetCycleTarget,
  onToggleExpanded,
  onRemove,
  onSaveTargets,
  onReorder,
}: ExerciseSlotRowProps) {
  const colors = useThemeColors();
  const displayed = resolved ?? extractDraft(slot);
  // Editing a cycle writes an override, and an override's null is "inherit", not "cleared" — so a
  // step must not be able to produce one (WR-07).
  const clearToNull = !cycleSelected;
  const [draft, setDraft] = useState<TargetDraft>(() => displayed);

  useEffect(() => {
    setDraft(displayed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slot.id,
    displayed.targetSets,
    displayed.targetRepMin,
    displayed.targetRepMax,
    displayed.targetRir,
    displayed.targetRestSeconds,
  ]);

  const applyDraft = useCallback(
    (next: TargetDraft) => {
      const previous = draft;
      setDraft(next);
      void onSaveTargets(slot.id, next)
        .then((saved) => {
          if (!saved) setDraft(previous);
        })
        .catch((error) => {
          setDraft(previous);
          console.error('save target failed', error);
        });
    },
    [draft, slot.id, onSaveTargets],
  );

  return (
    <ExerciseSlotRowView
      slot={{ id: slot.id, exerciseName: slot.exerciseName }}
      expanded={expanded}
      draft={draft}
      colors={colors}
      canReorder={canReorder}
      orderedIds={orderedIds}
      index={index}
      cycleSelected={cycleSelected}
      overriddenFields={overriddenFields}
      onResetCycleTarget={onResetCycleTarget}
      onReorder={onReorder}
      onToggleExpanded={onToggleExpanded}
      onStepSets={(direction) =>
        applyDraft({ ...draft, targetSets: stepBoundedValue(draft.targetSets, direction, 1, null, 1, clearToNull) })
      }
      onStepRepMin={(direction) => {
        const range = stepRepMin({ min: draft.targetRepMin, max: draft.targetRepMax }, direction, clearToNull);
        applyDraft({ ...draft, targetRepMin: range.min, targetRepMax: range.max });
      }}
      onStepRepMax={(direction) => {
        const range = stepRepMax({ min: draft.targetRepMin, max: draft.targetRepMax }, direction, clearToNull);
        applyDraft({ ...draft, targetRepMin: range.min, targetRepMax: range.max });
      }}
      onStepRir={(direction) =>
        applyDraft({ ...draft, targetRir: stepBoundedValue(draft.targetRir, direction, 0, 6, 1, clearToNull) })
      }
      onStepRest={(direction) =>
        applyDraft({
          ...draft,
          targetRestSeconds: stepBoundedValue(draft.targetRestSeconds, direction, 0, null, 15, clearToNull),
        })
      }
      onRemove={onRemove}
    />
  );
}

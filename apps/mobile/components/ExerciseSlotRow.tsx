import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ProgramSlot } from '@/lib/db/programs/load-program';
import type { TargetDraft } from '@/lib/db/programs/targets';
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

export type StepDirection = 'inc' | 'dec';

// Increment: null jumps to the floor, otherwise adds `step`, capped at `ceiling` (no cap when
// null). Decrement: null is a no-op (already empty), the floor clears back to null (this is how a
// target becomes unprescribed again), otherwise subtracts `step`.
export function stepBoundedValue(current: number | null, direction: StepDirection, floor: number, ceiling: number | null, step = 1): number | null {
  if (direction === 'inc') {
    if (current === null) return floor;
    const next = current + step;
    return ceiling !== null ? Math.min(next, ceiling) : next;
  }
  if (current === null) return null;
  if (current <= floor) return null;
  return current - step;
}

export interface RepRange {
  min: number | null;
  max: number | null;
}

const REP_FLOOR = 1;
const REP_CEILING = 50;

// R5: incrementing min above the current max also raises max to match; the pair can never enter
// an invalid (min > max) state. A null max means no ordering constraint yet — nothing to pair.
export function stepRepMin(range: RepRange, direction: StepDirection): RepRange {
  const nextMin = stepBoundedValue(range.min, direction, REP_FLOOR, REP_CEILING);
  if (direction === 'inc' && range.max !== null && nextMin !== null && nextMin > range.max) {
    return { min: nextMin, max: nextMin };
  }
  return { min: nextMin, max: range.max };
}

// The mirror rule: decrementing max below the current min also lowers min to match.
export function stepRepMax(range: RepRange, direction: StepDirection): RepRange {
  const nextMax = stepBoundedValue(range.max, direction, REP_FLOOR, REP_CEILING);
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
function renderTargetStepper({ label, displayValue, colors, decreaseDisabled, increaseDisabled, onDecrease, onIncrease }: TargetStepperProps) {
  return (
    <View className="gap-xs">
      <Text className="text-label font-normal text-foreground-muted">{label}</Text>
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
  onToggleExpanded: (id: string) => void;
  onStepSets: (direction: StepDirection) => void;
  onStepRepMin: (direction: StepDirection) => void;
  onStepRepMax: (direction: StepDirection) => void;
  onStepRir: (direction: StepDirection) => void;
  onStepRest: (direction: StepDirection) => void;
  onRemove: (id: string) => void;
}

// Hook-free — direct-invocable by a test, matching the ExerciseImageTile/SwapSuggestionList split.
// Collapsed: name + summary line, zero steppers. Expanded: the collapsed content stays visible and
// five stepper fields grow in below it — no modal, no screen change, neighbouring rows unaffected.
export function ExerciseSlotRowView({
  slot,
  expanded,
  draft,
  colors,
  onToggleExpanded,
  onStepSets,
  onStepRepMin,
  onStepRepMax,
  onStepRir,
  onStepRest,
  onRemove,
}: ExerciseSlotRowViewProps) {
  return (
    <View className="gap-sm rounded-md bg-surface p-md">
      <Pressable
        onPress={() => onToggleExpanded(slot.id)}
        accessibilityRole="button"
        accessibilityLabel={slot.exerciseName}
        accessibilityState={{ expanded }}
        className="gap-xs"
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text className="text-body font-semibold text-foreground">{slot.exerciseName}</Text>
        <Text className="text-label font-normal text-foreground-muted">{formatSlotSummary(draft)}</Text>
      </Pressable>

      {expanded ? (
        <View className="gap-md">
          {renderTargetStepper({
            label: 'Sets',
            displayValue: displayOrDash(draft.targetSets),
            colors,
            decreaseDisabled: draft.targetSets === null,
            increaseDisabled: false,
            onDecrease: () => onStepSets('dec'),
            onIncrease: () => onStepSets('inc'),
          })}

          <View className="flex-row flex-wrap gap-md">
            {renderTargetStepper({
              label: 'Rep min',
              displayValue: displayOrDash(draft.targetRepMin),
              colors,
              decreaseDisabled: draft.targetRepMin === null,
              increaseDisabled: draft.targetRepMin !== null && draft.targetRepMin >= REP_CEILING,
              onDecrease: () => onStepRepMin('dec'),
              onIncrease: () => onStepRepMin('inc'),
            })}
            {renderTargetStepper({
              label: 'Rep max',
              displayValue: displayOrDash(draft.targetRepMax),
              colors,
              decreaseDisabled: draft.targetRepMax === null,
              increaseDisabled: draft.targetRepMax !== null && draft.targetRepMax >= REP_CEILING,
              onDecrease: () => onStepRepMax('dec'),
              onIncrease: () => onStepRepMax('inc'),
            })}
          </View>

          {renderTargetStepper({
            label: 'RIR',
            displayValue: displayOrDash(draft.targetRir),
            colors,
            decreaseDisabled: draft.targetRir === null,
            increaseDisabled: draft.targetRir !== null && draft.targetRir >= 6,
            onDecrease: () => onStepRir('dec'),
            onIncrease: () => onStepRir('inc'),
          })}

          {renderTargetStepper({
            label: 'Rest (seconds)',
            displayValue: draft.targetRestSeconds === null ? '—' : formatRestReadout(draft.targetRestSeconds),
            colors,
            decreaseDisabled: draft.targetRestSeconds === null,
            increaseDisabled: false,
            onDecrease: () => onStepRest('dec'),
            onIncrease: () => onStepRest('inc'),
          })}

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
  onToggleExpanded: (id: string) => void;
  onRemove: (id: string) => void;
  onSaveTargets: (routineExerciseId: string, draft: TargetDraft) => Promise<void>;
}

// Thin stateful wrapper. Every stepper press writes through immediately (R6 — optimistic
// local-first write, no explicit Save control) and updates local draft state right away so the
// readout never waits on the tree-reload round trip; the local draft resyncs whenever the parent
// reloads the tree with a genuinely different persisted value for this slot.
export function ExerciseSlotRow({ slot, expanded, onToggleExpanded, onRemove, onSaveTargets }: ExerciseSlotRowProps) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState<TargetDraft>(() => extractDraft(slot));

  useEffect(() => {
    setDraft(extractDraft(slot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.id, slot.targetSets, slot.targetRepMin, slot.targetRepMax, slot.targetRir, slot.targetRestSeconds]);

  const applyDraft = useCallback(
    (next: TargetDraft) => {
      setDraft(next);
      void onSaveTargets(slot.id, next).catch((error) => {
        console.error('save target failed', error);
      });
    },
    [slot.id, onSaveTargets],
  );

  return (
    <ExerciseSlotRowView
      slot={{ id: slot.id, exerciseName: slot.exerciseName }}
      expanded={expanded}
      draft={draft}
      colors={colors}
      onToggleExpanded={onToggleExpanded}
      onStepSets={(direction) => applyDraft({ ...draft, targetSets: stepBoundedValue(draft.targetSets, direction, 1, null) })}
      onStepRepMin={(direction) => {
        const range = stepRepMin({ min: draft.targetRepMin, max: draft.targetRepMax }, direction);
        applyDraft({ ...draft, targetRepMin: range.min, targetRepMax: range.max });
      }}
      onStepRepMax={(direction) => {
        const range = stepRepMax({ min: draft.targetRepMin, max: draft.targetRepMax }, direction);
        applyDraft({ ...draft, targetRepMin: range.min, targetRepMax: range.max });
      }}
      onStepRir={(direction) => applyDraft({ ...draft, targetRir: stepBoundedValue(draft.targetRir, direction, 0, 6) })}
      onStepRest={(direction) => applyDraft({ ...draft, targetRestSeconds: stepBoundedValue(draft.targetRestSeconds, direction, 0, null, 15) })}
      onRemove={onRemove}
    />
  );
}

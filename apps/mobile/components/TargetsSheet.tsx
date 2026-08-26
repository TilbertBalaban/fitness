import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ResolvedTarget } from '@fitness/api-contracts';
import {
  decreaseDisabledFor,
  renderTargetStepper,
  stepBoundedValue,
  stepRepMax,
  stepRepMin,
  type StepDirection,
} from './ExerciseSlotRow';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import { getPowerSync, type WriteDb } from '@/lib/db/powersync';
import { setSessionExerciseTargets, writeBackTargets } from '@/lib/db/session-mutations';

function displayOrDash(value: number | null): string {
  return value === null ? '—' : `${value}`;
}

const REP_FLOOR = 1;
const REP_CEILING = 50;

export interface TargetsSheetViewProps {
  exerciseName: string;
  draft: ResolvedTarget;
  colors: ThemeColors;
  canWriteBack: boolean;
  saving: boolean;
  onStepSets: (direction: StepDirection) => void;
  onStepRepMin: (direction: StepDirection) => void;
  onStepRepMax: (direction: StepDirection) => void;
  onStepRir: (direction: StepDirection) => void;
  onStepRest: (direction: StepDirection) => void;
  onSave: () => void;
  onWriteBack: () => void;
  onCancel: () => void;
}

// Reuses ExerciseSlotRow's stepper anatomy verbatim (renderTargetStepper), never a re-styled copy
// (D-14/D-15/LOG-15). Save writes the session-only snapshot; the lower-weight "Also update my
// program" secondary action is a visually and behaviourally distinct control — write-back is the
// less common, deliberate-exception path per D-14's "session-only by default" framing.
export function TargetsSheetView({
  exerciseName,
  draft,
  colors,
  canWriteBack,
  saving,
  onStepSets,
  onStepRepMin,
  onStepRepMax,
  onStepRir,
  onStepRest,
  onSave,
  onWriteBack,
  onCancel,
}: TargetsSheetViewProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background/80 px-lg">
      <ScrollView className="max-h-full w-full max-w-[400px] rounded-md bg-surface p-lg" contentContainerStyle={{ flexGrow: 1 }}>
        <Text className="text-heading font-semibold text-foreground">{`Targets — ${exerciseName}`}</Text>

        <View className="mt-md gap-md">
          {renderTargetStepper({
            label: 'Sets',
            displayValue: displayOrDash(draft.targetSets),
            colors,
            decreaseDisabled: decreaseDisabledFor(draft.targetSets, 1, true),
            increaseDisabled: false,
            onDecrease: () => onStepSets('dec'),
            onIncrease: () => onStepSets('inc'),
          })}

          <View className="flex-row flex-wrap gap-md">
            {renderTargetStepper({
              label: 'Rep min',
              displayValue: displayOrDash(draft.targetRepMin),
              colors,
              decreaseDisabled: decreaseDisabledFor(draft.targetRepMin, REP_FLOOR, true),
              increaseDisabled: draft.targetRepMin !== null && draft.targetRepMin >= REP_CEILING,
              onDecrease: () => onStepRepMin('dec'),
              onIncrease: () => onStepRepMin('inc'),
            })}
            {renderTargetStepper({
              label: 'Rep max',
              displayValue: displayOrDash(draft.targetRepMax),
              colors,
              decreaseDisabled: decreaseDisabledFor(draft.targetRepMax, REP_FLOOR, true),
              increaseDisabled: draft.targetRepMax !== null && draft.targetRepMax >= REP_CEILING,
              onDecrease: () => onStepRepMax('dec'),
              onIncrease: () => onStepRepMax('inc'),
            })}
          </View>

          {renderTargetStepper({
            label: 'RIR',
            displayValue: displayOrDash(draft.targetRir),
            colors,
            decreaseDisabled: decreaseDisabledFor(draft.targetRir, 0, true),
            increaseDisabled: draft.targetRir !== null && draft.targetRir >= 6,
            onDecrease: () => onStepRir('dec'),
            onIncrease: () => onStepRir('inc'),
          })}

          {renderTargetStepper({
            label: 'Rest (seconds)',
            displayValue: draft.targetRestSeconds === null ? '—' : `${draft.targetRestSeconds}`,
            colors,
            decreaseDisabled: decreaseDisabledFor(draft.targetRestSeconds, 0, true),
            increaseDisabled: false,
            onDecrease: () => onStepRest('dec'),
            onIncrease: () => onStepRest('inc'),
          })}
        </View>

        <View className="mt-lg gap-sm">
          <Pressable
            onPress={onSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save"
            className="items-center justify-center rounded-md bg-accent py-sm"
            style={{ minHeight: 48, opacity: saving ? 0.6 : 1 }}
          >
            <Text className="text-body font-semibold text-white">Save</Text>
          </Pressable>

          <Pressable
            onPress={onWriteBack}
            disabled={saving || !canWriteBack}
            accessibilityRole="button"
            accessibilityLabel="Also update my program"
            className="items-center justify-center py-sm"
            style={{ minHeight: 48, opacity: canWriteBack ? 1 : 0.5 }}
          >
            <Text className="text-body font-normal text-accent">Also update my program</Text>
          </Pressable>

          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            className="items-center justify-center py-sm"
            style={{ minHeight: 48 }}
          >
            <Text className="text-body text-foreground-muted">Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export interface TargetsSheetProps {
  sessionExerciseId: string;
  exerciseName: string;
  initial: ResolvedTarget;
  // Null for a one-off exercise or one added mid-workout with no routine linkage — the flagged
  // planner assumption this plan carries forward: write-back is inert (canWriteBack false) rather
  // than inventing a routine row for an exercise that has none (LOG-15, flagged not resolved).
  routineExerciseId: string | null;
  cycleId: string | null;
  // Defaults to getPowerSync() exactly like every other write helper in this codebase — the
  // explicit param exists so a caller rendering against a different database (the durability
  // harness's isolated per-test instance, 05-12) has its write-back land in the SAME database its
  // own reads came from, rather than this sheet's write silently diverging onto the production
  // singleton regardless of what the rest of the screen is doing.
  db?: WriteDb;
  onDone: () => void;
  onCancel: () => void;
}

// Thin stateful wrapper. Save calls setSessionExerciseTargets ONLY, never writeBackTargets — a
// distinct handler entirely. "Also update my program" saves the session snapshot AND pushes the
// same values to whichever program row they resolved from, since a write-back that changed the
// program but left the currently-displayed session numbers stale would be a visible
// inconsistency the moment the sheet closes.
export function TargetsSheet({ sessionExerciseId, exerciseName, initial, routineExerciseId, cycleId, db, onDone, onCancel }: TargetsSheetProps) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState<ResolvedTarget>(initial);
  const [saving, setSaving] = useState(false);
  const canWriteBack = routineExerciseId !== null;
  const writeDb = db ?? getPowerSync();

  const handleSave = async () => {
    setSaving(true);
    try {
      await setSessionExerciseTargets(sessionExerciseId, draft, writeDb);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const handleWriteBack = async () => {
    if (routineExerciseId === null) return;
    setSaving(true);
    try {
      await setSessionExerciseTargets(sessionExerciseId, draft, writeDb);
      await writeBackTargets({ routineExerciseId, cycleId, targets: draft }, writeDb);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <TargetsSheetView
      exerciseName={exerciseName}
      draft={draft}
      colors={colors}
      canWriteBack={canWriteBack}
      saving={saving}
      onStepSets={(direction) => setDraft((d) => ({ ...d, targetSets: stepBoundedValue(d.targetSets, direction, 1, null) }))}
      onStepRepMin={(direction) =>
        setDraft((d) => {
          const range = stepRepMin({ min: d.targetRepMin, max: d.targetRepMax }, direction);
          return { ...d, targetRepMin: range.min, targetRepMax: range.max };
        })
      }
      onStepRepMax={(direction) =>
        setDraft((d) => {
          const range = stepRepMax({ min: d.targetRepMin, max: d.targetRepMax }, direction);
          return { ...d, targetRepMin: range.min, targetRepMax: range.max };
        })
      }
      onStepRir={(direction) => setDraft((d) => ({ ...d, targetRir: stepBoundedValue(d.targetRir, direction, 0, 6) }))}
      onStepRest={(direction) => setDraft((d) => ({ ...d, targetRestSeconds: stepBoundedValue(d.targetRestSeconds, direction, 0, null, 15) }))}
      onSave={() => void handleSave()}
      onWriteBack={() => void handleWriteBack()}
      onCancel={onCancel}
    />
  );
}

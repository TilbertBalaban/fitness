import { resolveTarget, type ResolvedTarget } from '@fitness/api-contracts';
import type { GeneratedProgramTree, GeneratedSlot } from '@fitness/program-generator';
import { Text, View } from 'react-native';
import { DetailSection } from '@/components/DetailSection';
import { describeDegradation } from '@/lib/programs/generation-wizard';

export const UNKNOWN_PREVIEW_EXERCISE_NAME = 'Unavailable exercise';

export function formatTargetLine(target: ResolvedTarget): string {
  const sets = target.targetSets ?? 0;
  const reps =
    target.targetRepMin !== null && target.targetRepMax !== null
      ? `${target.targetRepMin}-${target.targetRepMax}`
      : '—';
  const rir = target.targetRir === null ? '—' : `${target.targetRir}`;
  return `${sets} × ${reps} @ RIR ${rir}`;
}

// The whole periodization lives in the overrides. Rendering slot.base for every cycle would show
// four identical weeks and hide the generator's actual output, which is the bug this component
// exists to avoid. resolveTarget owns the null-means-inherit rule; it is never reimplemented here.
export function resolveSlotForCycle(slot: GeneratedSlot, cycleKey: string): ResolvedTarget {
  return resolveTarget(slot.base, slot.overridesByCycleKey[cycleKey]);
}

export interface GeneratedProgramPreviewProps {
  tree: GeneratedProgramTree;
  exerciseNames: Map<string, string>;
}

// Read-only: no database read, no write and no navigation. The name map comes from the caller,
// which already loaded it. Nothing here marks the program as generated — D-05 makes a generated
// program indistinguishable from a hand-built one, and a badge here would be the first crack in it.
export function GeneratedProgramPreview({ tree, exerciseNames }: GeneratedProgramPreviewProps) {
  return (
    <View className="gap-md">
      {/* D-21's whole mechanism: every reduction is on screen, in full, before the caller's Save
          action is reachable — never truncated, never behind a disclosure control. */}
      {tree.degradations.length > 0 ? (
        <View className="gap-xs rounded-md bg-surface p-md">
          {tree.degradations.map((entry, index) => (
            <Text key={`${entry.kind}-${entry.dayKey ?? ''}-${entry.muscleGroupId ?? ''}-${index}`} className="text-label font-normal text-foreground-muted">
              {describeDegradation(entry)}
            </Text>
          ))}
        </View>
      ) : null}

      {tree.cycles.map((cycle) => (
        <DetailSection key={cycle.key} heading={cycle.kind === 'deload' ? `${cycle.name} · Deload` : cycle.name}>
          <View className="gap-sm">
            {tree.days.map((day) => (
              <View key={day.key} className="gap-xs">
                <Text className="text-body font-semibold text-foreground">{day.name}</Text>
                {day.slots.map((slot) => (
                  <Text key={slot.key} className="text-label font-normal text-foreground-muted">
                    {exerciseNames.get(slot.exerciseId) ?? UNKNOWN_PREVIEW_EXERCISE_NAME} —{' '}
                    {formatTargetLine(resolveSlotForCycle(slot, cycle.key))}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </DetailSection>
      ))}
    </View>
  );
}

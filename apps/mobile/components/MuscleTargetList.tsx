import { Text, View } from 'react-native';
import type { MuscleTarget } from '@/lib/catalog/exercise-detail';

export interface MuscleTargetListProps {
  primaryMuscles: MuscleTarget[];
  secondaryMuscles: MuscleTarget[];
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// Renders the already-ordered primary targets as one line and, when non-empty, the secondary
// targets as a sub-line. A zero-length secondary list omits the sub-line entirely rather than
// rendering an empty one. weight_factor is an internal analytics weight, never surfaced to the
// user as a number/percentage — presenting a derived value as a measured one would mislead.
export function MuscleTargetList({ primaryMuscles, secondaryMuscles }: MuscleTargetListProps) {
  const primaryLabel = pluralize(primaryMuscles.length, 'Primary muscle', 'Primary muscles');
  const primaryNames = primaryMuscles.map((target) => target.name).join(', ');

  return (
    <View className="gap-xs">
      <Text className="text-body font-normal text-foreground-muted">
        {primaryLabel}: {primaryNames}
      </Text>
      {secondaryMuscles.length > 0 ? (
        <Text className="text-body font-normal text-foreground-muted">
          {pluralize(secondaryMuscles.length, 'Secondary muscle', 'Secondary muscles')}:{' '}
          {secondaryMuscles.map((target) => target.name).join(', ')}
        </Text>
      ) : null}
    </View>
  );
}

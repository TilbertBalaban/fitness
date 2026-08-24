import { ScrollView, Text, View } from 'react-native';
import { formatWeight, type PrType, type WeightUnit } from '@fitness/api-contracts';
import type { ExerciseBreakdown, SessionSummary } from '@/lib/db/summary-query';
import { formatClock } from '@/lib/rest-timer';
import { useThemeColors, type ThemeColors } from '@/lib/theme-colors';
import { MuscleTargetList } from './MuscleTargetList';
import { PrimaryButton } from './PrimaryButton';

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

export interface WorkoutSummaryViewProps {
  summary: SessionSummary;
  weightUnit: WeightUnit;
  colors: ThemeColors;
  onDone: () => void;
}

// Hook-free — direct-invocable by a test, matching CycleStripView/SetRowView. The Muscles Trained
// chip row is deliberately the first thing seen after the heading (05-UI-SPEC's stated focal
// point): what was accomplished, before what the numbers were.
export function WorkoutSummaryView({ summary, weightUnit, onDone }: WorkoutSummaryViewProps) {
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
            {summary.breakdown.map((row) => (
              <View key={row.sessionExerciseId} className="gap-xs border-b border-foreground-muted/20 pb-md">
                <View className="flex-row flex-wrap items-center gap-sm">
                  <Text className="text-body font-semibold text-foreground">{row.exerciseName}</Text>
                  {renderPrBadges(row.prTypes)}
                </View>
                <Text className="text-body font-normal text-foreground-muted">{formatBreakdownLine(row, weightUnit)}</Text>
                <Text className="text-body font-normal text-foreground-muted">e1RM: {formatE1rm(row.bestE1rmKg, weightUnit)}</Text>
              </View>
            ))}
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

export function WorkoutSummary(props: WorkoutSummaryProps) {
  const colors = useThemeColors();
  return <WorkoutSummaryView {...props} colors={colors} />;
}

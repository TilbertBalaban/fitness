import type { PerformanceMetricId } from '@fitness/analytics-engine';
import type { PrType } from '@fitness/api-contracts';

// The Records screen's chips and the workout summary's badges name the same four metrics for the
// same lifter. Both maps live here rather than beside their own consumers precisely so the two
// vocabularies cannot drift into disagreeing about what a record is called.
//
// Every map below is typed as a TOTAL record over the shipped PR_TYPES enum, so a fifth metric
// added to @fitness/api-contracts is a compile error here rather than a blank chip or a blank pill.

export const PR_TYPE_CHIP_LABELS: Record<PrType, string> = {
  heaviest_weight: 'Heaviest Weight',
  best_e1rm: 'Est. 1RM',
  most_reps_at_weight: 'Most Reps',
  best_set_volume: 'Best Set Volume',
};

export const PR_TYPE_BADGE_LABELS: Record<PrType, string> = {
  heaviest_weight: 'Heaviest PR',
  best_e1rm: 'Est. 1RM PR',
  most_reps_at_weight: 'Most Reps PR',
  best_set_volume: 'Volume PR',
};

// Which metric the performance screen preselects when a record row is tapped.
export const PERFORMANCE_METRIC_FOR_PR_TYPE: Record<PrType, PerformanceMetricId> = {
  heaviest_weight: 'heaviest',
  best_e1rm: 'e1rm',
  // Plotting most-reps needs a chosen weight held constant over time, which is a drill-down this
  // phase does not ship — so the metric has no series of its own. Landing on the heaviest chart is
  // the deliberate fallback: never a crash, never a switch left with nothing selected.
  most_reps_at_weight: 'heaviest',
  // Shares a name with the destination chart's metric and is NOT the same quantity: this record is
  // ONE set's weight x reps (detectPrs pushes `weightKg * reps` for a single candidate), while the
  // performance screen's `volume` is the SESSION total summed over every working-volume set. The
  // chart therefore legitimately never contains the number the row displayed. The mapping is kept
  // because session volume is still the useful drill-down — this is not an arithmetic bug.
  best_set_volume: 'volume',
};

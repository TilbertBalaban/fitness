import { PERFORMANCE_METRICS, type PerformanceMetricId } from '@fitness/analytics-engine';
import { PR_TYPES } from '@fitness/api-contracts';
import {
  PERFORMANCE_METRIC_FOR_PR_TYPE,
  PR_TYPE_BADGE_LABELS,
  PR_TYPE_CHIP_LABELS,
} from '../pr-vocabulary';

// Iterates the shipped enum rather than a hand-written list: a fifth PR_TYPES member added later
// fails here loudly instead of rendering a blank chip or a blank badge (T-9-13).
describe('the record-metric vocabulary covers every shipped metric', () => {
  it.each(PR_TYPES)('%s has a non-empty chip label', (prType) => {
    expect(PR_TYPE_CHIP_LABELS[prType]).toEqual(expect.any(String));
    expect(PR_TYPE_CHIP_LABELS[prType].length).toBeGreaterThan(0);
  });

  it.each(PR_TYPES)('%s has a non-empty badge label', (prType) => {
    expect(PR_TYPE_BADGE_LABELS[prType]).toEqual(expect.any(String));
    expect(PR_TYPE_BADGE_LABELS[prType].length).toBeGreaterThan(0);
  });

  it.each(PR_TYPES)('%s maps to a real performance metric', (prType) => {
    expect(PERFORMANCE_METRICS).toContain(PERFORMANCE_METRIC_FOR_PR_TYPE[prType]);
  });

  it('gives every metric a distinct badge label, so two badges on one exercise never read alike', () => {
    const labels = PR_TYPES.map((prType) => PR_TYPE_BADGE_LABELS[prType]);
    expect(new Set(labels).size).toBe(PR_TYPES.length);
  });
});

describe('the pinned strings', () => {
  it('names the chips exactly as the S3 metric table pins them', () => {
    expect(PR_TYPE_CHIP_LABELS).toEqual({
      heaviest_weight: 'Heaviest Weight',
      best_e1rm: 'Est. 1RM',
      most_reps_at_weight: 'Most Reps',
      best_set_volume: 'Best Set Volume',
    });
  });

  it('names the badges exactly as the Correction Notes table pins them', () => {
    expect(PR_TYPE_BADGE_LABELS).toEqual({
      heaviest_weight: 'Heaviest PR',
      best_e1rm: 'Est. 1RM PR',
      most_reps_at_weight: 'Most Reps PR',
      best_set_volume: 'Volume PR',
    });
  });
});

describe('PERFORMANCE_METRIC_FOR_PR_TYPE', () => {
  it('maps the three plottable metrics onto their own performance metric', () => {
    expect(PERFORMANCE_METRIC_FOR_PR_TYPE.heaviest_weight).toBe<PerformanceMetricId>('heaviest');
    expect(PERFORMANCE_METRIC_FOR_PR_TYPE.best_e1rm).toBe<PerformanceMetricId>('e1rm');
    expect(PERFORMANCE_METRIC_FOR_PR_TYPE.best_set_volume).toBe<PerformanceMetricId>('volume');
  });

  // Asserted by name, not assumed: most-reps has no time series of its own, and the fallback is a
  // deliberate landing place rather than a crash or an unselected switch.
  it('falls back to the heaviest metric for most-reps, which has no time series', () => {
    expect(PERFORMANCE_METRIC_FOR_PR_TYPE.most_reps_at_weight).toBe<PerformanceMetricId>('heaviest');
  });
});

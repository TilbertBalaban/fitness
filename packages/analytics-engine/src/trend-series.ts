import { countsTowardWorkingVolume, type SetType } from '@fitness/api-contracts';
import { bucketIndexForLocalDate, trailingBuckets } from './bucketing';
import { TREND_BUCKET_DAYS, TREND_WEEKS, type HistoryTrendMetricId } from './constants';

// Plain values mirroring the stored columns. 09-05's reader maps rows onto these; this module
// never touches a database and never reads a clock — the day it aggregates against arrives as an
// argument (D-10).
export interface TrendSetInput {
  id: string;
  setType: SetType;
  weightKg: string | null;
  reps: number;
  completed: boolean;
  parentSetId: string | null;
}

export interface TrendSessionInput {
  sessionId: string;
  localDate: string;
  sets: TrendSetInput[];
}

export interface TrendBucketPoint {
  key: string;
  bucketIndex: number;
  startLocalDate: string;
  endLocalDate: string;
  value: number;
}

// A closed four-branch union. The UI-SPEC forbids a zero-percent chip, an em-dash chip and an
// infinite-percentage chip against a zero denominator; an explicit not-comparable member makes all
// three unrepresentable rather than merely avoided. `unchanged` and `not-comparable` both render as
// no chip at all, but they are different facts and the card must not have to guess which it holds.
// `percent` is an unrounded magnitude — rounding is the card's, so this module never bakes in a
// display precision.
export type TrendDelta =
  | { kind: 'improving'; percent: number }
  | { kind: 'declining'; percent: number }
  | { kind: 'unchanged' }
  | { kind: 'not-comparable' };

export interface HistoryTrendResult {
  points: TrendBucketPoint[];
  currentValue: number | null;
  delta: TrendDelta;
}

export interface HistoryTrendInput {
  sessions: TrendSessionInput[];
  metric: HistoryTrendMetricId;
  todayLocalDate: string;
}

interface BucketTotals {
  volume: number;
  sets: number;
  sessionIds: Set<string>;
}

// The two set populations this file must keep apart. 09-RESEARCH names collapsing them into one as
// the phase's single most likely correctness defect.
//
// `volume` is child-inclusive: every completed set countsTowardWorkingVolume admits — a drop-set
// child and a partial included — so this figure agrees with summary-query.ts's own volumeKg.
//
// `sets` adds a third conjunct, a null parent id, which is exactly the trio
// ExerciseStrip.countCompletedWorkingSets already counts by. A drop set is therefore ONE set here
// and one set there; without the parent test it would be three on this card and one on the strip,
// for the same workout, on the same day.
//
// The predicate itself is imported from @fitness/api-contracts and never re-derived — a
// hand-written set-type comparison in this file would be a sixth copy of the rule D-17 exists to
// hold in one place.
function accumulate(sessions: TrendSessionInput[], todayLocalDate: string) {
  const buckets = trailingBuckets({
    todayLocalDate,
    bucketCount: TREND_WEEKS,
    bucketDays: TREND_BUCKET_DAYS,
  });
  const totals = buckets.map<BucketTotals>(() => ({ volume: 0, sets: 0, sessionIds: new Set<string>() }));

  for (const session of sessions) {
    const index = bucketIndexForLocalDate(session.localDate, buckets);
    // A session outside the window belongs to no bucket and is dropped, never folded into the
    // nearest one.
    if (index === null) continue;
    const bucket = totals[index];

    for (const set of session.sets) {
      if (!set.completed) continue;
      if (!countsTowardWorkingVolume(set.setType)) continue;

      bucket.sessionIds.add(session.sessionId);
      if (set.parentSetId === null) bucket.sets += 1;

      if (set.weightKg === null) continue;
      // The decimal weight string crosses into number space at this one boundary.
      const weight = Number(set.weightKg);
      if (!Number.isFinite(weight)) continue;
      bucket.volume += weight * set.reps;
    }
  }

  return { buckets, totals };
}

function valueFor(metric: HistoryTrendMetricId, totals: BucketTotals): number {
  if (metric === 'volume') return totals.volume;
  if (metric === 'sets') return totals.sets;
  return totals.sessionIds.size;
}

// A bucket qualifies only when it holds at least one session that contributed at least one
// completed working set. A non-qualifying bucket is omitted from `points` entirely rather than
// carried at zero (D-09): a chart that draws zero where nothing was logged asserts that the lifter
// trained and achieved nothing, which is a different and false claim.
//
// The one qualifying bucket that can still read zero is a week of bodyweight-only work under the
// `volume` metric — that zero is a measured total of external load, not an absence of training,
// and the same bucket reads non-zero on `sets` and `workouts`. Omitting it would erase a week the
// lifter really trained, which is the same lie in the other direction.
function qualifies(totals: BucketTotals): boolean {
  return totals.sessionIds.size > 0;
}

// The comparison is between the LAST bucket and the one immediately before it BY INDEX, never
// between the last two points. Skipping an empty window while the chip's copy says "previous seven
// days" would state something the data does not support, so that case is not-comparable.
function deltaBetween(current: number | null, previous: number | null): TrendDelta {
  if (current === null || previous === null) return { kind: 'not-comparable' };
  if (current === previous) return { kind: 'unchanged' };
  // A zero denominator has no percentage rise; the union's not-comparable member is what keeps an
  // infinite chip off the card.
  if (previous === 0) return { kind: 'not-comparable' };

  const percent = (Math.abs(current - previous) * 100) / previous;
  return current > previous ? { kind: 'improving', percent } : { kind: 'declining', percent };
}

export function historyTrendSeries({ sessions, metric, todayLocalDate }: HistoryTrendInput): HistoryTrendResult {
  const { buckets, totals } = accumulate(sessions, todayLocalDate);

  const points: TrendBucketPoint[] = [];
  for (let index = 0; index < buckets.length; index += 1) {
    if (!qualifies(totals[index])) continue;
    const bucket = buckets[index];
    points.push({
      key: bucket.key,
      bucketIndex: index,
      startLocalDate: bucket.startLocalDate,
      endLocalDate: bucket.endLocalDate,
      value: valueFor(metric, totals[index]),
    });
  }

  // [CLAUDE'S CALL] When the bucket containing the supplied day does not itself qualify, the
  // headline still shows the most recent real figure rather than blanking, and the delta above is
  // forced to not-comparable by that same bucket's absence — so no chip ever claims a comparison
  // the data does not support while the headline keeps saying something true. Reversible.
  const currentValue = points.length > 0 ? points[points.length - 1].value : null;

  const lastIndex = buckets.length - 1;
  const valueAt = (index: number): number | null =>
    index >= 0 && qualifies(totals[index]) ? valueFor(metric, totals[index]) : null;

  return { points, currentValue, delta: deltaBetween(valueAt(lastIndex), valueAt(lastIndex - 1)) };
}

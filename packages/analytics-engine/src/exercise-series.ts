import { countsTowardRecords, countsTowardWorkingVolume, type SetType } from '@fitness/api-contracts';
import { estimated1RM } from '@fitness/pr-rules';
import type { PerformanceMetricId } from './constants';

export interface ExerciseSessionSetInput {
  id: string;
  setType: SetType;
  weightKg: string | null;
  reps: number;
  completed: boolean;
  parentSetId: string | null;
}

export interface ExerciseSessionInput {
  sessionId: string;
  localDate: string;
  sets: ExerciseSessionSetInput[];
}

export interface SeriesPoint {
  key: string;
  sessionId: string;
  localDate: string;
  value: number;
}

export interface ExerciseSeries {
  points: SeriesPoint[];
  // Exactly the count ANLY-10's in-place caption names. Non-zero only for the `e1rm` metric.
  droppedAboveCapCount: number;
}

export interface ExerciseSeriesInput {
  sessions: ExerciseSessionInput[];
  metric: PerformanceMetricId;
}

interface QualifyingSet {
  weight: number;
  reps: number;
}

// The two predicates are imported from @fitness/api-contracts, never re-derived and never merged.
// `heaviest` and `e1rm` are best-metrics and take countsTowardRecords (warm-up AND partial
// excluded) so this chart can never disagree with the personal record the user was already shown
// for the same exercise; `volume` takes countsTowardWorkingVolume (warm-up only) and is
// child-inclusive, matching summary-query.ts's own volumeKg. 09-RESEARCH names collapsing these two
// into one predicate as the single most likely correctness defect in this phase.
function predicateFor(metric: PerformanceMetricId): (setType: SetType) => boolean {
  return metric === 'volume' ? countsTowardWorkingVolume : countsTowardRecords;
}

function qualifyingSets(session: ExerciseSessionInput, metric: PerformanceMetricId): QualifyingSet[] {
  const predicate = predicateFor(metric);
  const qualifying: QualifyingSet[] = [];
  for (const set of session.sets) {
    if (!set.completed) continue;
    if (!predicate(set.setType)) continue;
    if (set.weightKg === null) continue;
    // The decimal weight string crosses into number space at this one boundary.
    const weight = Number(set.weightKg);
    if (!Number.isFinite(weight)) continue;
    qualifying.push({ weight, reps: set.reps });
  }
  return qualifying;
}

function valueFor(metric: PerformanceMetricId, sets: QualifyingSet[]): number | null {
  if (metric === 'heaviest') {
    return Math.max(...sets.map((set) => set.weight));
  }
  if (metric === 'volume') {
    return sets.reduce((total, set) => total + set.weight * set.reps, 0);
  }
  let best: number | null = null;
  for (const set of sets) {
    const estimate = estimated1RM(set.weight, set.reps);
    if (estimate !== null && (best === null || estimate > best)) best = estimate;
  }
  return best;
}

export function exerciseSeries({ sessions, metric }: ExerciseSeriesInput): ExerciseSeries {
  const points: SeriesPoint[] = [];
  let droppedAboveCapCount = 0;

  for (const session of sessions) {
    const sets = qualifyingSets(session, metric);
    // No qualifying set is an absence of measurement, never a zero (D-09): a real logged zero and
    // a session the lifter never trained this exercise in must not look alike.
    if (sets.length === 0) continue;

    const value = valueFor(metric, sets);
    if (value === null) {
      // Only reachable for `e1rm`: every qualifying set was above the rep cap.
      droppedAboveCapCount += 1;
      continue;
    }

    points.push({ key: session.sessionId, sessionId: session.sessionId, localDate: session.localDate, value });
  }

  points.sort((a, b) => (a.localDate === b.localDate ? a.sessionId.localeCompare(b.sessionId) : a.localDate.localeCompare(b.localDate)));

  return { points, droppedAboveCapCount };
}

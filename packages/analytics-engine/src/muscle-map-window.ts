import type { MuscleGroupId } from '@fitness/api-contracts';
import type { MuscleVolumeCell } from './muscle-volume';
import { MUSCLE_GROUP_FIGURE_SIDE, MUSCLE_MAP_ROW_ORDER, type MuscleFigureSide } from './muscle-map';

export interface MuscleVolumeTotal {
  muscleGroupId: string;
  weightedVolumeKg: number;
  weightedSets: number;
  setCount: number;
}

// Folds a rollup source and an overlay source into one per-muscle total, discarding the date
// dimension — collapsing a daily grain into a window means exactly that. Cells arrive already
// filtered to the window by the caller (apps/mobile/lib/db/muscle-volume-query.ts); this function
// applies no date logic of its own, because a date filter here and a different one in the reader is
// exactly how the rollup half and the overlay half would start disagreeing.
export function mergeMuscleVolumeCells(
  rollupCells: MuscleVolumeCell[],
  overlayCells: MuscleVolumeCell[],
): MuscleVolumeTotal[] {
  const totals = new Map<string, MuscleVolumeTotal>();

  for (const cell of [...rollupCells, ...overlayCells]) {
    const existing = totals.get(cell.muscleGroupId) ?? {
      muscleGroupId: cell.muscleGroupId,
      weightedVolumeKg: 0,
      weightedSets: 0,
      setCount: 0,
    };
    existing.weightedVolumeKg += cell.weightedVolumeKg;
    existing.weightedSets += cell.weightedSets;
    existing.setCount += cell.setCount;
    totals.set(cell.muscleGroupId, existing);
  }

  return [...totals.values()];
}

export interface MuscleMapPoint {
  muscleGroupId: MuscleGroupId;
  side: MuscleFigureSide;
  trainingVolumeKg: number | null;
  weightedSets: number | null;
  setCount: number;
  relativeIntensity: number | null;
}

// Always nineteen points, one per member of MUSCLE_GROUPS (via MUSCLE_MAP_ROW_ORDER's combined
// membership), emitted in MUSCLE_MAP_ROW_ORDER.front order then .back order. Untrained is
// setCount === 0 — never decided by volume — because a muscle trained only with sets that carry no
// external load must still read as trained (D-10).
export function muscleMapPoints(totals: MuscleVolumeTotal[]): MuscleMapPoint[] {
  const totalsByMuscle = new Map(totals.map((total) => [total.muscleGroupId, total]));

  const orderedIds: MuscleGroupId[] = [...MUSCLE_MAP_ROW_ORDER.front, ...MUSCLE_MAP_ROW_ORDER.back];

  let maxTrainedVolume = 0;
  for (const total of totals) {
    if (total.setCount > 0 && total.weightedVolumeKg > maxTrainedVolume) maxTrainedVolume = total.weightedVolumeKg;
  }

  return orderedIds.map((muscleGroupId) => {
    const total = totalsByMuscle.get(muscleGroupId);
    const side = MUSCLE_GROUP_FIGURE_SIDE[muscleGroupId];

    if (!total || total.setCount === 0) {
      return {
        muscleGroupId,
        side,
        trainingVolumeKg: null,
        weightedSets: null,
        setCount: 0,
        relativeIntensity: null,
      };
    }

    // A zero divisor (every trained muscle has zero weighted volume) returns zero for every
    // trained point rather than a non-finite number, in the same spirit as linearScale's
    // zero-width-domain guard.
    const relativeIntensity = maxTrainedVolume === 0 ? 0 : total.weightedVolumeKg / maxTrainedVolume;

    return {
      muscleGroupId,
      side,
      trainingVolumeKg: total.weightedVolumeKg,
      weightedSets: total.weightedSets,
      setCount: total.setCount,
      relativeIntensity,
    };
  });
}

// muscleMapPoints already emits in MUSCLE_MAP_ROW_ORDER, so a first-wins scan for the
// strictly-greatest relative intensity gives the UI-SPEC's specified tie-break for free — do not
// add a sort here, it would break that tie-break.
export function topTrainedPoint(points: MuscleMapPoint[], side: MuscleFigureSide): MuscleMapPoint | null {
  let best: MuscleMapPoint | null = null;
  for (const point of points) {
    if (point.side !== side) continue;
    if (point.relativeIntensity === null) continue;
    if (best === null || point.relativeIntensity > (best.relativeIntensity ?? -Infinity)) best = point;
  }
  return best;
}

export interface MuscleContribution {
  exerciseId: string;
  exerciseName: string;
  setCount: number;
  weightedVolumeKg: number;
}

// A total order — every tie is broken, all the way down to the id — so the list cannot reshuffle
// between reads. No locale collator (no localeCompare/Intl.Collator): locale-dependent ordering
// would make the same data render in two orders on two devices.
export function rankMuscleContributions(rows: MuscleContribution[]): MuscleContribution[] {
  return [...rows].sort((a, b) => {
    if (a.weightedVolumeKg !== b.weightedVolumeKg) return b.weightedVolumeKg - a.weightedVolumeKg;
    if (a.setCount !== b.setCount) return b.setCount - a.setCount;
    if (a.exerciseName !== b.exerciseName) return a.exerciseName < b.exerciseName ? -1 : 1;
    return a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0;
  });
}

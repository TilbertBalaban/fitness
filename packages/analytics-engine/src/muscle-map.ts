import type { MuscleGroupId } from '@fitness/api-contracts';
import { PROGRESS_WINDOW_DAYS } from './constants';

// R21/R24: every window length, figure side and row position this phase uses is a named export
// here, so no call site anywhere spells a window length, a figure side or a row position for
// itself.

export const MUSCLE_MAP_WINDOWS = ['1w', '1m', '3m'] as const;
export type MuscleMapWindowId = (typeof MUSCLE_MAP_WINDOWS)[number];

// '1w' is the same seven days the Last 7 Days card already uses, by import rather than by
// coincidence — the two surfaces answer "how recent" identically.
export const MUSCLE_MAP_WINDOW_DAYS: Record<MuscleMapWindowId, number> = {
  '1w': PROGRESS_WINDOW_DAYS,
  '1m': 30,
  '3m': 90,
};

export const MUSCLE_MAP_WINDOW_CHIP_LABELS: Record<MuscleMapWindowId, string> = {
  '1w': '1 Week',
  '1m': '1 Month',
  '3m': '3 Months',
};

// The duration phrases used inside announced sentences (accessibility labels). Built by
// interpolating MUSCLE_MAP_WINDOW_DAYS rather than spelled out, so changing a window length
// changes the announced sentence for free. D-07's no-calendar-reference rule is why this is a
// separate constant from the chip labels above rather than the same one reused: a chip may say
// "1 Month" for discoverability, but an announced sentence may never imply a calendar month.
export const MUSCLE_MAP_WINDOW_LABELS: Record<MuscleMapWindowId, string> = Object.fromEntries(
  MUSCLE_MAP_WINDOWS.map((id) => [id, `the last ${MUSCLE_MAP_WINDOW_DAYS[id]} days`]),
) as Record<MuscleMapWindowId, string>;

// D-01's short-versus-long split as a data lookup, not an `if` repeated at three call sites.
export const MUSCLE_MAP_ROLLUP_WINDOWS = ['1m', '3m'] as const;
const ROLLUP_WINDOW_SET = new Set<string>(MUSCLE_MAP_ROLLUP_WINDOWS);

export function windowReadsRollup(id: MuscleMapWindowId): boolean {
  return ROLLUP_WINDOW_SET.has(id);
}

export type MuscleFigureSide = 'front' | 'back';

// Transcribed verbatim from 10-UI-SPEC.md's "Muscle -> Figure Assignment" table. This is NOT
// MUSCLE_GROUP_BODY_REGION: that map answers which anatomical region a muscle belongs to; this one
// answers which side of the body it is visible from, and conflating them produces a body map whose
// two figures disagree with each other.
export const MUSCLE_GROUP_FIGURE_SIDE: Record<MuscleGroupId, MuscleFigureSide> = {
  chest: 'front',
  front_delts: 'front',
  side_delts: 'front',
  rear_delts: 'back',
  lats: 'back',
  upper_back_traps: 'back',
  lower_back: 'back',
  biceps: 'front',
  triceps: 'back',
  forearms: 'front',
  abs: 'front',
  obliques: 'front',
  quads: 'front',
  hamstrings: 'back',
  glutes: 'back',
  calves: 'back',
  adductors: 'front',
  abductors: 'back',
  neck: 'front',
};

// The fixed vertical row order, head-to-toe, transcribed verbatim from the UI-SPEC's own two
// lists. This order is also the documented tie-break for every ranking in this phase, which is why
// it is data and not JSX.
export const MUSCLE_MAP_ROW_ORDER: Record<MuscleFigureSide, MuscleGroupId[]> = {
  front: ['neck', 'front_delts', 'side_delts', 'chest', 'biceps', 'forearms', 'abs', 'obliques', 'quads', 'adductors'],
  back: ['upper_back_traps', 'rear_delts', 'lats', 'lower_back', 'triceps', 'glutes', 'abductors', 'hamstrings', 'calves'],
};

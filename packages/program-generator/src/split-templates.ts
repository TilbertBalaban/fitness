import type { MuscleGroupId, SplitPreference } from '@fitness/api-contracts';

export interface SplitSlot {
  muscleGroupId: MuscleGroupId;
}

export interface SplitDayPattern {
  name: string;
  slots: SplitSlot[];
}

export interface SplitTemplate {
  key: string;
  dayPatterns: SplitDayPattern[];
}

function slot(muscleGroupId: MuscleGroupId): SplitSlot {
  return { muscleGroupId };
}

// D-12: a declarative table keyed by (splitPreference, daysPerWeek) — generation is table lookup
// plus filling, never procedural day invention. In THIS plan only `full_body` carries entries (2,
// 3 and 4 days); `upper_lower` and `push_pull_legs` are present as empty records so their shape is
// fixed now — 11-04 adds rows to these same records without changing resolveSplitTemplate's
// signature.
export const SPLIT_TEMPLATES: Record<Exclude<SplitPreference, 'auto'>, Record<number, SplitTemplate | undefined>> = {
  full_body: {
    2: {
      key: 'full_body_2',
      dayPatterns: [
        {
          name: 'Full Body A',
          slots: [
            slot('chest'),
            slot('lats'),
            slot('quads'),
            slot('front_delts'),
            slot('biceps'),
            slot('abs'),
          ],
        },
        {
          name: 'Full Body B',
          slots: [
            slot('chest'),
            slot('lats'),
            slot('hamstrings'),
            slot('glutes'),
            slot('side_delts'),
            slot('triceps'),
            slot('abs'),
          ],
        },
      ],
    },
    // The 3-day pattern's slots, taken together across all three days, cover chest, lats, quads,
    // hamstrings, glutes, front_delts, side_delts, biceps, triceps and abs — the full-body coverage
    // this plan's must_haves require.
    3: {
      key: 'full_body_3',
      dayPatterns: [
        {
          name: 'Full Body A',
          slots: [
            slot('chest'),
            slot('lats'),
            slot('quads'),
            slot('front_delts'),
            slot('biceps'),
            slot('abs'),
          ],
        },
        {
          name: 'Full Body B',
          slots: [
            slot('chest'),
            slot('lats'),
            slot('hamstrings'),
            slot('side_delts'),
            slot('triceps'),
            slot('abs'),
          ],
        },
        {
          name: 'Full Body C',
          slots: [
            slot('chest'),
            slot('lats'),
            slot('glutes'),
            slot('front_delts'),
            slot('side_delts'),
            slot('biceps'),
            slot('triceps'),
            slot('abs'),
          ],
        },
      ],
    },
    4: {
      key: 'full_body_4',
      dayPatterns: [
        {
          name: 'Full Body A',
          slots: [slot('chest'), slot('lats'), slot('quads'), slot('front_delts'), slot('biceps'), slot('abs')],
        },
        {
          name: 'Full Body B',
          slots: [slot('chest'), slot('lats'), slot('hamstrings'), slot('side_delts'), slot('triceps'), slot('abs')],
        },
        {
          name: 'Full Body A',
          slots: [slot('chest'), slot('lats'), slot('glutes'), slot('front_delts'), slot('biceps'), slot('abs')],
        },
        {
          name: 'Full Body B',
          slots: [slot('chest'), slot('lats'), slot('quads'), slot('side_delts'), slot('triceps'), slot('abs')],
        },
      ],
    },
  },
  // 11-04 populates these; this plan lands only the shape (empty records), never a partial or
  // guessed template.
  upper_lower: {},
  push_pull_legs: {},
};

// An explicit one-entry-per-day-count table — `auto` involves no scoring and therefore has no tie
// to break.
export const AUTO_SPLIT_BY_DAYS: Record<number, Exclude<SplitPreference, 'auto'>> = {
  2: 'full_body',
  3: 'full_body',
  4: 'upper_lower',
  5: 'push_pull_legs',
  6: 'push_pull_legs',
};

export type SplitResolution =
  | { kind: 'template'; template: SplitTemplate }
  | { kind: 'unsupported'; splitPreference: SplitPreference; daysPerWeek: number };

export function resolveSplitTemplate(splitPreference: SplitPreference, daysPerWeek: number): SplitResolution {
  const resolvedPreference = splitPreference === 'auto' ? AUTO_SPLIT_BY_DAYS[daysPerWeek] : splitPreference;
  if (resolvedPreference === undefined) {
    return { kind: 'unsupported', splitPreference, daysPerWeek };
  }

  const template = SPLIT_TEMPLATES[resolvedPreference][daysPerWeek];
  if (template === undefined) {
    return { kind: 'unsupported', splitPreference, daysPerWeek };
  }

  return { kind: 'template', template };
}

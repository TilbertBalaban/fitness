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

const PUSH_GROUPS: readonly MuscleGroupId[] = ['chest', 'front_delts', 'side_delts', 'triceps'];
const PULL_GROUPS: readonly MuscleGroupId[] = ['lats', 'upper_back_traps', 'rear_delts', 'biceps'];
const LEGS_GROUPS: readonly MuscleGroupId[] = ['quads', 'hamstrings', 'glutes', 'calves'];
const UPPER_GROUPS: readonly MuscleGroupId[] = [
  'chest',
  'lats',
  'front_delts',
  'side_delts',
  'biceps',
  'triceps',
];
const LOWER_GROUPS: readonly MuscleGroupId[] = ['quads', 'hamstrings', 'glutes', 'calves'];

function day(name: string, groups: readonly MuscleGroupId[]): SplitDayPattern {
  return { name, slots: groups.map(slot) };
}

// Abs ride on the last day of a template rather than every day: the core still gets trained every
// week, but it does not spend a slot in each session — and the last day is the one a short session
// length is least likely to trim to nothing.
function withAbsOnLastDay(dayPatterns: SplitDayPattern[]): SplitDayPattern[] {
  return dayPatterns.map((pattern, index) =>
    index === dayPatterns.length - 1
      ? { name: pattern.name, slots: [...pattern.slots, slot('abs')] }
      : pattern,
  );
}

function template(key: string, dayPatterns: SplitDayPattern[]): SplitTemplate {
  return { key, dayPatterns: withAbsOnLastDay(dayPatterns) };
}

// The day counts the table covers, matching GENERATION_INPUT_LIMITS' min/maxDaysPerWeek.
export const SUPPORTED_DAYS_PER_WEEK = [2, 3, 4, 5, 6] as const;

// "Not supported" is a declaration a test can read, never an absence a test has to infer from a
// missing key. Each pair carries the reason it is absent.
export const UNSUPPORTED_SPLIT_PAIRS = [
  // A five-day full-body week leaves no muscle group a recovery day.
  { splitPreference: 'full_body', daysPerWeek: 5 },
  // Same reason at six days, more so.
  { splitPreference: 'full_body', daysPerWeek: 6 },
  // A three-way rotation cannot fit two training days without dropping a third of it.
  { splitPreference: 'push_pull_legs', daysPerWeek: 2 },
] as const;

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
  upper_lower: {
    2: template('upper_lower_2', [day('Upper', UPPER_GROUPS), day('Lower', LOWER_GROUPS)]),
    3: template('upper_lower_3', [
      day('Upper', UPPER_GROUPS),
      day('Lower', LOWER_GROUPS),
      day('Upper', UPPER_GROUPS),
    ]),
    4: template('upper_lower_4', [
      day('Upper', UPPER_GROUPS),
      day('Lower', LOWER_GROUPS),
      day('Upper', UPPER_GROUPS),
      day('Lower', LOWER_GROUPS),
    ]),
    5: template('upper_lower_5', [
      day('Upper', UPPER_GROUPS),
      day('Lower', LOWER_GROUPS),
      day('Upper', UPPER_GROUPS),
      day('Lower', LOWER_GROUPS),
      day('Upper', UPPER_GROUPS),
    ]),
    6: template('upper_lower_6', [
      day('Upper', UPPER_GROUPS),
      day('Lower', LOWER_GROUPS),
      day('Upper', UPPER_GROUPS),
      day('Lower', LOWER_GROUPS),
      day('Upper', UPPER_GROUPS),
      day('Lower', LOWER_GROUPS),
    ]),
  },
  push_pull_legs: {
    3: template('push_pull_legs_3', [
      day('Push', PUSH_GROUPS),
      day('Pull', PULL_GROUPS),
      day('Legs', LEGS_GROUPS),
    ]),
    // A fourth day cannot start the rotation over without training push twice before pull, so it
    // is an Upper day — named for what it trains, so the repetition stays readable.
    4: template('push_pull_legs_4', [
      day('Push', PUSH_GROUPS),
      day('Pull', PULL_GROUPS),
      day('Legs', LEGS_GROUPS),
      day('Upper', UPPER_GROUPS),
    ]),
    5: template('push_pull_legs_5', [
      day('Push', PUSH_GROUPS),
      day('Pull', PULL_GROUPS),
      day('Legs', LEGS_GROUPS),
      day('Upper', UPPER_GROUPS),
      day('Lower', LOWER_GROUPS),
    ]),
    6: template('push_pull_legs_6', [
      day('Push', PUSH_GROUPS),
      day('Pull', PULL_GROUPS),
      day('Legs', LEGS_GROUPS),
      day('Push', PUSH_GROUPS),
      day('Pull', PULL_GROUPS),
      day('Legs', LEGS_GROUPS),
    ]),
  },
};

// An explicit one-entry-per-day-count table — `auto` involves no scoring and therefore has no tie
// to break. With exactly one declared entry per day count there is no way for two runs, two
// clients, or two orderings of the same data to disagree; a ranking heuristic would reintroduce
// precisely the non-determinism D-03 rules out, and the resulting week would be unexplainable to
// the user who asked for it.
export const AUTO_SPLIT_BY_DAYS: Record<number, Exclude<SplitPreference, 'auto'>> = {
  2: 'full_body',
  3: 'full_body',
  4: 'upper_lower',
  5: 'push_pull_legs',
  6: 'push_pull_legs',
};

// A day count with no entry resolves unsupported rather than snapping to the nearest count that
// does have one: handing someone a four-day program because they asked for seven is exactly the
// silent substitution D-21 forbids.
function deepFreezeTemplate(value: SplitTemplate): SplitTemplate {
  for (const pattern of value.dayPatterns) {
    pattern.slots.forEach(Object.freeze);
    Object.freeze(pattern.slots);
    Object.freeze(pattern);
  }
  Object.freeze(value.dayPatterns);
  return Object.freeze(value);
}

for (const byDays of Object.values(SPLIT_TEMPLATES)) {
  for (const candidate of Object.values(byDays)) {
    if (candidate !== undefined) {
      deepFreezeTemplate(candidate);
    }
  }
  Object.freeze(byDays);
}
Object.freeze(SPLIT_TEMPLATES);
Object.freeze(AUTO_SPLIT_BY_DAYS);

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

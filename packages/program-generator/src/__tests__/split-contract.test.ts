import { MUSCLE_GROUPS, SPLIT_PREFERENCES, type SplitPreference } from '@fitness/api-contracts';
import { GENERATION_INPUT_LIMITS } from '../result';
import {
  AUTO_SPLIT_BY_DAYS,
  resolveSplitTemplate,
  SPLIT_TEMPLATES,
  SUPPORTED_DAYS_PER_WEEK,
  UNSUPPORTED_SPLIT_PAIRS,
} from '../split-templates';
import { MUSCLE_GROUP_VOLUME_CLASS } from '../volume-landmarks';

// The enumeration is built from the imported vocabularies at runtime, never from a hand-written
// matrix: a preference appended to SPLIT_PREFERENCES later with neither a table entry nor an
// unsupported declaration must turn this suite red rather than resolving to nothing at generation
// time. That failure mode is the contract the assumption-delta `promote` decision asked for.
const CONCRETE_PREFERENCES = SPLIT_PREFERENCES.filter(
  (preference): preference is Exclude<SplitPreference, 'auto'> => preference !== 'auto',
);

const DAY_COUNTS = Array.from(
  { length: GENERATION_INPUT_LIMITS.maxDaysPerWeek - GENERATION_INPUT_LIMITS.minDaysPerWeek + 1 },
  (_, index) => GENERATION_INPUT_LIMITS.minDaysPerWeek + index,
);

const ALL_PAIRS = CONCRETE_PREFERENCES.flatMap((splitPreference) =>
  DAY_COUNTS.map((daysPerWeek) => ({ splitPreference, daysPerWeek })),
);

function isDeclaredUnsupported(splitPreference: string, daysPerWeek: number): boolean {
  return UNSUPPORTED_SPLIT_PAIRS.some(
    (pair) => pair.splitPreference === splitPreference && pair.daysPerWeek === daysPerWeek,
  );
}

describe('split table completeness', () => {
  it.each(ALL_PAIRS)(
    'resolves $splitPreference at $daysPerWeek days to a template or a declared unsupported pair',
    ({ splitPreference, daysPerWeek }) => {
      const resolution = resolveSplitTemplate(splitPreference, daysPerWeek);

      expect(['template', 'unsupported']).toContain(resolution.kind);
      if (resolution.kind === 'unsupported') {
        expect(isDeclaredUnsupported(splitPreference, daysPerWeek)).toBe(true);
      }
    },
  );

  it('declares every unsupported pair it actually returns, and returns every pair it declares', () => {
    const returned = ALL_PAIRS.filter(
      ({ splitPreference, daysPerWeek }) => resolveSplitTemplate(splitPreference, daysPerWeek).kind === 'unsupported',
    ).map(({ splitPreference, daysPerWeek }) => `${splitPreference}/${daysPerWeek}`);

    const declared = UNSUPPORTED_SPLIT_PAIRS.map((pair) => `${pair.splitPreference}/${pair.daysPerWeek}`);

    expect(returned.slice().sort()).toEqual(declared.slice().sort());
  });

  it('covers the day-count range GENERATION_INPUT_LIMITS bounds', () => {
    expect([...SUPPORTED_DAYS_PER_WEEK]).toEqual(DAY_COUNTS);
  });
});

describe('split table determinism', () => {
  it.each(ALL_PAIRS)(
    'returns identical output for repeated $splitPreference/$daysPerWeek resolutions',
    ({ splitPreference, daysPerWeek }) => {
      const first = resolveSplitTemplate(splitPreference, daysPerWeek);
      const second = resolveSplitTemplate(splitPreference, daysPerWeek);

      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    },
  );

  it('returns days in the declared dayPatterns order, index for index', () => {
    for (const { splitPreference, daysPerWeek } of ALL_PAIRS) {
      const resolution = resolveSplitTemplate(splitPreference, daysPerWeek);
      if (resolution.kind !== 'template') continue;

      const declared = SPLIT_TEMPLATES[splitPreference][daysPerWeek];
      expect(resolution.template.dayPatterns.map((pattern) => pattern.name)).toEqual(
        declared?.dayPatterns.map((pattern) => pattern.name),
      );
      expect(resolution.template.dayPatterns).toHaveLength(daysPerWeek);
    }
  });
});

describe('split table taxonomy closure', () => {
  const reachableGroups = new Set(
    Object.values(SPLIT_TEMPLATES).flatMap((byDays) =>
      Object.values(byDays).flatMap((candidate) =>
        (candidate?.dayPatterns ?? []).flatMap((pattern) => pattern.slots.map((each) => each.muscleGroupId)),
      ),
    ),
  );

  it('names only MUSCLE_GROUPS members', () => {
    const known = new Set<string>(MUSCLE_GROUPS);
    for (const groupId of reachableGroups) {
      expect(known.has(groupId)).toBe(true);
    }
  });

  // A group with no volume class resolves to an undefined band and yields a NaN set count, which
  // renders in a preview as a plausible-looking number rather than an error.
  it('gives every reachable group a MUSCLE_GROUP_VOLUME_CLASS entry', () => {
    for (const groupId of reachableGroups) {
      expect(MUSCLE_GROUP_VOLUME_CLASS[groupId]).toBeDefined();
    }
  });
});

describe('auto totality', () => {
  it('covers exactly SUPPORTED_DAYS_PER_WEEK', () => {
    expect(Object.keys(AUTO_SPLIT_BY_DAYS).map(Number).sort()).toEqual([...SUPPORTED_DAYS_PER_WEEK]);
  });

  it('targets only supported pairs', () => {
    for (const daysPerWeek of SUPPORTED_DAYS_PER_WEEK) {
      const target = AUTO_SPLIT_BY_DAYS[daysPerWeek];
      expect(resolveSplitTemplate(target, daysPerWeek).kind).toBe('template');
      expect(isDeclaredUnsupported(target, daysPerWeek)).toBe(false);
    }
  });
});

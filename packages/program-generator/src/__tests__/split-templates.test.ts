import { MUSCLE_GROUPS, type SplitPreference } from '@fitness/api-contracts';
import {
  AUTO_SPLIT_BY_DAYS,
  resolveSplitTemplate,
  SPLIT_TEMPLATES,
  SUPPORTED_DAYS_PER_WEEK,
  UNSUPPORTED_SPLIT_PAIRS,
} from '../split-templates';

function dayNames(splitPreference: SplitPreference, daysPerWeek: number): string[] {
  const resolution = resolveSplitTemplate(splitPreference, daysPerWeek);
  if (resolution.kind !== 'template') {
    throw new Error(`expected a template for ${splitPreference}/${daysPerWeek}`);
  }
  return resolution.template.dayPatterns.map((pattern) => pattern.name);
}

describe('resolveSplitTemplate', () => {
  it('resolves "auto" to the same template as the explicit preference it maps to', () => {
    const auto = resolveSplitTemplate('auto', 3);
    const explicit = resolveSplitTemplate('full_body', 3);

    expect(auto.kind).toBe('template');
    expect(explicit.kind).toBe('template');
    expect(auto).toEqual(explicit);
  });

  it('returns a template resolution for full_body at 2, 3 and 4 days', () => {
    expect(resolveSplitTemplate('full_body', 2).kind).toBe('template');
    expect(resolveSplitTemplate('full_body', 3).kind).toBe('template');
    expect(resolveSplitTemplate('full_body', 4).kind).toBe('template');
  });

  it('reports the preference and day count on an unsupported resolution, never a hard-coded absence', () => {
    const resolution = resolveSplitTemplate('push_pull_legs', 2);

    expect(resolution.kind).toBe('unsupported');
    if (resolution.kind === 'unsupported') {
      expect(resolution.splitPreference).toBe('push_pull_legs');
      expect(resolution.daysPerWeek).toBe(2);
    }
  });

  it('the full-body 3-day pattern covers chest, lats, quads, hamstrings, glutes, front_delts, side_delts, biceps, triceps and abs across the week', () => {
    const template = SPLIT_TEMPLATES.full_body[3]!;
    const covered = new Set(template.dayPatterns.flatMap((day) => day.slots.map((slot) => slot.muscleGroupId)));

    for (const muscleGroupId of [
      'chest',
      'lats',
      'quads',
      'hamstrings',
      'glutes',
      'front_delts',
      'side_delts',
      'biceps',
      'triceps',
      'abs',
    ] as const) {
      expect(covered.has(muscleGroupId)).toBe(true);
    }
  });

  it('AUTO_SPLIT_BY_DAYS has exactly one entry for each supported day count 2..6', () => {
    expect(Object.keys(AUTO_SPLIT_BY_DAYS).map(Number).sort()).toEqual([2, 3, 4, 5, 6]);
  });

  it('names upper_lower at 4 days Upper, Lower, Upper, Lower in that order', () => {
    const resolution = resolveSplitTemplate('upper_lower', 4);

    expect(resolution.kind).toBe('template');
    if (resolution.kind === 'template') {
      expect(resolution.template.dayPatterns.map((pattern) => pattern.name)).toEqual([
        'Upper',
        'Lower',
        'Upper',
        'Lower',
      ]);
    }
  });

  it('rotates upper_lower at 2 and 6 days', () => {
    expect(dayNames('upper_lower', 2)).toEqual(['Upper', 'Lower']);
    expect(dayNames('upper_lower', 6)).toEqual(['Upper', 'Lower', 'Upper', 'Lower', 'Upper', 'Lower']);
  });

  it('repeats the upper_lower rotation from its start on odd day counts', () => {
    expect(dayNames('upper_lower', 3)).toEqual(['Upper', 'Lower', 'Upper']);
    expect(dayNames('upper_lower', 5)).toEqual(['Upper', 'Lower', 'Upper', 'Lower', 'Upper']);
  });

  it('rotates push_pull_legs at 3 and 6 days', () => {
    expect(dayNames('push_pull_legs', 3)).toEqual(['Push', 'Pull', 'Legs']);
    expect(dayNames('push_pull_legs', 6)).toEqual(['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs']);
  });

  it('returns an unsupported resolution for push_pull_legs at 2 days — a three-way rotation cannot fit two days', () => {
    expect(resolveSplitTemplate('push_pull_legs', 2).kind).toBe('unsupported');
  });

  it('returns unsupported resolutions for full_body at 5 and 6 days', () => {
    expect(resolveSplitTemplate('full_body', 5).kind).toBe('unsupported');
    expect(resolveSplitTemplate('full_body', 6).kind).toBe('unsupported');
  });

  it('resolves exactly the twelve supported pairs and exactly the three declared unsupported ones', () => {
    const supported: [Exclude<SplitPreference, 'auto'>, number][] = [];
    const unsupported: [Exclude<SplitPreference, 'auto'>, number][] = [];

    for (const preference of ['full_body', 'upper_lower', 'push_pull_legs'] as const) {
      for (const daysPerWeek of SUPPORTED_DAYS_PER_WEEK) {
        const bucket = resolveSplitTemplate(preference, daysPerWeek).kind === 'template' ? supported : unsupported;
        bucket.push([preference, daysPerWeek]);
      }
    }

    expect(supported).toHaveLength(12);
    expect(unsupported).toHaveLength(3);
    expect(unsupported).toEqual(
      UNSUPPORTED_SPLIT_PAIRS.map((pair) => [pair.splitPreference, pair.daysPerWeek]),
    );
  });

  it('gives every Push, Pull, Legs, Upper and Lower day its declared muscle groups', () => {
    const groupsOf = (preference: Exclude<SplitPreference, 'auto'>, daysPerWeek: number, name: string) => {
      const resolution = resolveSplitTemplate(preference, daysPerWeek);
      if (resolution.kind !== 'template') throw new Error(`expected a template for ${preference}/${daysPerWeek}`);
      const pattern = resolution.template.dayPatterns.find((candidate) => candidate.name === name);
      return new Set(pattern?.slots.map((each) => each.muscleGroupId) ?? []);
    };

    for (const groupId of ['chest', 'front_delts', 'side_delts', 'triceps'] as const) {
      expect(groupsOf('push_pull_legs', 6, 'Push').has(groupId)).toBe(true);
    }
    for (const groupId of ['lats', 'upper_back_traps', 'rear_delts', 'biceps'] as const) {
      expect(groupsOf('push_pull_legs', 6, 'Pull').has(groupId)).toBe(true);
    }
    for (const groupId of ['quads', 'hamstrings', 'glutes', 'calves'] as const) {
      expect(groupsOf('push_pull_legs', 3, 'Legs').has(groupId)).toBe(true);
    }
    for (const groupId of ['chest', 'lats', 'front_delts', 'side_delts', 'biceps', 'triceps'] as const) {
      expect(groupsOf('upper_lower', 4, 'Upper').has(groupId)).toBe(true);
    }
    for (const groupId of ['quads', 'hamstrings', 'glutes', 'calves'] as const) {
      expect(groupsOf('upper_lower', 4, 'Lower').has(groupId)).toBe(true);
    }
  });

  it('draws every slot in the whole table from MUSCLE_GROUPS', () => {
    const known = new Set<string>(MUSCLE_GROUPS);

    for (const byDays of Object.values(SPLIT_TEMPLATES)) {
      for (const candidate of Object.values(byDays)) {
        for (const pattern of candidate?.dayPatterns ?? []) {
          for (const each of pattern.slots) {
            expect(known.has(each.muscleGroupId)).toBe(true);
          }
        }
      }
    }
  });

  it("covers every major muscle group across each supported template's week", () => {
    for (const byDays of Object.values(SPLIT_TEMPLATES)) {
      for (const candidate of Object.values(byDays)) {
        if (candidate === undefined) continue;
        const covered = new Set(candidate.dayPatterns.flatMap((pattern) => pattern.slots.map((each) => each.muscleGroupId)));

        for (const groupId of ['chest', 'lats', 'quads', 'hamstrings', 'glutes', 'front_delts', 'side_delts'] as const) {
          expect(covered.has(groupId)).toBe(true);
        }
      }
    }
  });

  it('trains abs at least once a week in every supported template', () => {
    for (const byDays of Object.values(SPLIT_TEMPLATES)) {
      for (const candidate of Object.values(byDays)) {
        if (candidate === undefined) continue;
        const covered = candidate.dayPatterns.flatMap((pattern) => pattern.slots.map((each) => each.muscleGroupId));
        expect(covered).toContain('abs');
      }
    }
  });

  it('does not mutate on read — two resolutions are deeply equal and the table is frozen', () => {
    expect(resolveSplitTemplate('upper_lower', 4)).toEqual(resolveSplitTemplate('upper_lower', 4));
    expect(Object.isFrozen(SPLIT_TEMPLATES)).toBe(true);
    expect(Object.isFrozen(SPLIT_TEMPLATES.upper_lower[4])).toBe(true);
    expect(Object.isFrozen(SPLIT_TEMPLATES.upper_lower[4]!.dayPatterns)).toBe(true);
  });

  it('resolves auto to full_body at 2 and 3, upper_lower at 4, push_pull_legs at 5 and 6', () => {
    expect(resolveSplitTemplate('auto', 2)).toEqual(resolveSplitTemplate('full_body', 2));
    expect(resolveSplitTemplate('auto', 3)).toEqual(resolveSplitTemplate('full_body', 3));
    expect(resolveSplitTemplate('auto', 4)).toEqual(resolveSplitTemplate('upper_lower', 4));
    expect(resolveSplitTemplate('auto', 5)).toEqual(resolveSplitTemplate('push_pull_legs', 5));
    expect(resolveSplitTemplate('auto', 6)).toEqual(resolveSplitTemplate('push_pull_legs', 6));
  });

  it('resolves every AUTO_SPLIT_BY_DAYS target to a supported template for its own day count', () => {
    for (const daysPerWeek of SUPPORTED_DAYS_PER_WEEK) {
      expect(resolveSplitTemplate(AUTO_SPLIT_BY_DAYS[daysPerWeek], daysPerWeek).kind).toBe('template');
      expect(resolveSplitTemplate('auto', daysPerWeek)).toEqual(
        resolveSplitTemplate(AUTO_SPLIT_BY_DAYS[daysPerWeek], daysPerWeek),
      );
    }
  });

  it('returns unsupported for auto outside the table rather than throwing or snapping to a nearby count', () => {
    expect(() => resolveSplitTemplate('auto', 7)).not.toThrow();
    expect(resolveSplitTemplate('auto', 7).kind).toBe('unsupported');
  });

  it('maps AUTO_SPLIT_BY_DAYS onto SUPPORTED_DAYS_PER_WEEK in both directions', () => {
    expect(Object.keys(AUTO_SPLIT_BY_DAYS).map(Number).sort()).toEqual([...SUPPORTED_DAYS_PER_WEEK]);
    for (const daysPerWeek of SUPPORTED_DAYS_PER_WEEK) {
      expect(AUTO_SPLIT_BY_DAYS[daysPerWeek]).toBeDefined();
    }
  });
});

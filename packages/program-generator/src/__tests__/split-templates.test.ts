import { AUTO_SPLIT_BY_DAYS, resolveSplitTemplate, SPLIT_TEMPLATES } from '../split-templates';

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

  it('returns an unsupported resolution for upper_lower in this plan, never a hard-coded absence', () => {
    const resolution = resolveSplitTemplate('upper_lower', 3);

    expect(resolution.kind).toBe('unsupported');
    if (resolution.kind === 'unsupported') {
      expect(resolution.splitPreference).toBe('upper_lower');
      expect(resolution.daysPerWeek).toBe(3);
    }
  });

  it('returns an unsupported resolution for push_pull_legs in this plan', () => {
    expect(resolveSplitTemplate('push_pull_legs', 5).kind).toBe('unsupported');
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
});

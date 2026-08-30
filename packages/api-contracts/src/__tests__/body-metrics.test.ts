import {
  BODY_METRIC_CANONICAL_UNIT,
  BODY_METRIC_KIND_LABELS,
  BODY_METRIC_KIND_ORDER,
  BODY_METRIC_KIND_SET,
  BODY_METRIC_KINDS,
} from '../body-metrics';

describe('BODY_METRIC_KINDS', () => {
  it('contains exactly 15 members, bodyweight first, body_fat_percent last, in the D-06 order', () => {
    expect(BODY_METRIC_KINDS).toEqual([
      'bodyweight',
      'neck',
      'shoulders',
      'chest',
      'left_bicep',
      'right_bicep',
      'left_forearm',
      'right_forearm',
      'waist',
      'hips',
      'left_thigh',
      'right_thigh',
      'left_calf',
      'right_calf',
      'body_fat_percent',
    ]);
  });

  it('has no duplicate members', () => {
    expect(new Set(BODY_METRIC_KINDS).size).toBe(BODY_METRIC_KINDS.length);
  });

  it('BODY_METRIC_KIND_SET contains every member of the tuple and nothing else', () => {
    expect(BODY_METRIC_KIND_SET.size).toBe(BODY_METRIC_KINDS.length);
    for (const kind of BODY_METRIC_KINDS) {
      expect(BODY_METRIC_KIND_SET.has(kind)).toBe(true);
    }
    expect(BODY_METRIC_KIND_SET.has('not_a_real_kind')).toBe(false);
  });
});

describe('BODY_METRIC_KIND_ORDER', () => {
  it('is set-equal to BODY_METRIC_KINDS, with bodyweight first and body_fat_percent last', () => {
    expect(new Set(BODY_METRIC_KIND_ORDER)).toEqual(new Set(BODY_METRIC_KINDS));
    expect(BODY_METRIC_KIND_ORDER[0]).toBe('bodyweight');
    expect(BODY_METRIC_KIND_ORDER[BODY_METRIC_KIND_ORDER.length - 1]).toBe('body_fat_percent');
  });
});

describe('BODY_METRIC_KIND_LABELS', () => {
  it('has a non-empty display label for every member of BODY_METRIC_KINDS, no member missing', () => {
    for (const kind of BODY_METRIC_KINDS) {
      const label = BODY_METRIC_KIND_LABELS[kind];
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('bodyweight is labelled Weight and body_fat_percent is labelled Body Fat %', () => {
    expect(BODY_METRIC_KIND_LABELS.bodyweight).toBe('Weight');
    expect(BODY_METRIC_KIND_LABELS.body_fat_percent).toBe('Body Fat %');
  });
});

describe('BODY_METRIC_CANONICAL_UNIT', () => {
  it('maps every member of BODY_METRIC_KINDS to exactly one of kg, cm, percent — total coverage', () => {
    for (const kind of BODY_METRIC_KINDS) {
      expect(['kg', 'cm', 'percent']).toContain(BODY_METRIC_CANONICAL_UNIT[kind]);
    }
  });

  it('bodyweight maps to kg, waist maps to cm, body_fat_percent maps to percent (D-08)', () => {
    expect(BODY_METRIC_CANONICAL_UNIT.bodyweight).toBe('kg');
    expect(BODY_METRIC_CANONICAL_UNIT.waist).toBe('cm');
    expect(BODY_METRIC_CANONICAL_UNIT.body_fat_percent).toBe('percent');
  });

  it('maps every non-bodyweight, non-body_fat_percent kind to cm — the thirteen circumference kinds', () => {
    for (const kind of BODY_METRIC_KINDS) {
      if (kind === 'bodyweight' || kind === 'body_fat_percent') continue;
      expect(BODY_METRIC_CANONICAL_UNIT[kind]).toBe('cm');
    }
  });
});

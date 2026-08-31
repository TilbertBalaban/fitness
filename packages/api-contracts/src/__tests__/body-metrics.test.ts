import { WEIGHT_UNITS } from '../units';
import {
  BODY_METRIC_CANONICAL_UNIT,
  BODY_METRIC_KIND_LABELS,
  BODY_METRIC_KIND_ORDER,
  BODY_METRIC_KIND_SET,
  BODY_METRIC_KINDS,
  resolveDisplayUnit,
  WIDGET_KIND_LABELS,
  WIDGET_KIND_SET,
  WIDGET_KINDS,
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

describe('resolveDisplayUnit (D-08 — one preference, not two)', () => {
  it('resolves bodyweight to the weight preference itself', () => {
    expect(resolveDisplayUnit('bodyweight', 'lb')).toBe('lb');
    expect(resolveDisplayUnit('bodyweight', 'kg')).toBe('kg');
  });

  it('resolves a circumference kind to inches under lb and centimetres under kg', () => {
    expect(resolveDisplayUnit('waist', 'lb')).toBe('in');
    expect(resolveDisplayUnit('waist', 'kg')).toBe('cm');
  });

  it('resolves body_fat_percent to percent regardless of the weight preference', () => {
    expect(resolveDisplayUnit('body_fat_percent', 'kg')).toBe('percent');
    expect(resolveDisplayUnit('body_fat_percent', 'lb')).toBe('percent');
  });

  it('resolves every member of BODY_METRIC_KINDS under both preferences — no kind falls through', () => {
    const seen = new Set<string>();
    for (const kind of BODY_METRIC_KINDS) {
      for (const weightUnit of WEIGHT_UNITS) {
        const resolved = resolveDisplayUnit(kind, weightUnit);
        expect(['kg', 'lb', 'cm', 'in', 'percent']).toContain(resolved);
        seen.add(resolved);
      }
    }
    // Every branch of the mapping is actually exercised by the real vocabulary, not merely typed.
    expect(seen).toEqual(new Set(['kg', 'lb', 'cm', 'in', 'percent']));
  });
});

describe('WIDGET_KINDS (D-22, shared with the body-metric vocabulary in this same module)', () => {
  it('contains exactly the six v1 widget kinds, in catalog order', () => {
    expect(WIDGET_KINDS).toEqual([
      'next_up',
      'weekly_progress',
      'recent_records',
      'muscle_heatmap',
      'bodyweight_trend',
      'history_trend',
    ]);
  });

  it('has no duplicate members', () => {
    expect(new Set(WIDGET_KINDS).size).toBe(WIDGET_KINDS.length);
  });

  it('WIDGET_KIND_SET contains every member of the tuple and nothing else — total coverage, no drift', () => {
    expect(WIDGET_KIND_SET.size).toBe(WIDGET_KINDS.length);
    for (const kind of WIDGET_KINDS) {
      expect(WIDGET_KIND_SET.has(kind)).toBe(true);
    }
    expect(WIDGET_KIND_SET.has('not_a_real_widget')).toBe(false);
  });

  it('has a non-empty display label for every member of WIDGET_KINDS, no member missing', () => {
    for (const kind of WIDGET_KINDS) {
      const label = WIDGET_KIND_LABELS[kind];
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('labels next_up as Next Up and history_trend as History Trend', () => {
    expect(WIDGET_KIND_LABELS.next_up).toBe('Next Up');
    expect(WIDGET_KIND_LABELS.history_trend).toBe('History Trend');
  });
});

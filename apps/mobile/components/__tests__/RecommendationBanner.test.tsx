import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import type { ProgressionResult } from '@fitness/progression-engine';
import { RecommendationBanner, type RecommendationBannerProps } from '../RecommendationBanner';

type AnyElement = ReactElement<Record<string, unknown>>;

function findByType(node: ReactNode, type: unknown, found: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findByType(child, type, found);
    return found;
  }
  const element = node as AnyElement;
  if (element.type === type) found.push(element);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findByType(children, type, found);
  return found;
}

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

function baseProps(overrides: Partial<RecommendationBannerProps> = {}): RecommendationBannerProps {
  return {
    result: null,
    weightUnit: 'kg',
    colors: COLORS,
    ...overrides,
  };
}

function textOf(result: ReactNode): string[] {
  return findByType(result, Text).map((el) => el.props.children as string);
}

describe('RecommendationBanner — recommendation branch', () => {
  it('renders a weight-and-reps line', () => {
    const recommendation: ProgressionResult = {
      kind: 'recommendation',
      weightKg: '102.500',
      reps: 8,
      rir: 2,
      basis: 'load_increase',
      offeredReduction: null,
    };
    const result = RecommendationBanner(baseProps({ result: recommendation }));
    const texts = textOf(result);

    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('102.50 kg');
    expect(texts[0]).toContain('8 reps');
  });

  it('converts the canonical-kg weight for display through the shared formatter', () => {
    const recommendation: ProgressionResult = {
      kind: 'recommendation',
      weightKg: '102.500',
      reps: 8,
      rir: 2,
      basis: 'hold',
      offeredReduction: null,
    };
    const result = RecommendationBanner(baseProps({ result: recommendation, weightUnit: 'lb' }));
    const texts = textOf(result);

    expect(texts[0]).toContain('lb');
    expect(texts[0]).not.toContain('kg');
  });

  it('renders a bodyweight recommendation without a weight figure', () => {
    const recommendation: ProgressionResult = {
      kind: 'recommendation',
      weightKg: null,
      reps: 12,
      rir: 3,
      basis: 'rep_increase',
      offeredReduction: null,
    };
    const result = RecommendationBanner(baseProps({ result: recommendation }));
    const texts = textOf(result);

    expect(texts[0]).toContain('12 reps');
  });
});

describe('RecommendationBanner — offered reduction', () => {
  const shortfallHoldWithOffer: ProgressionResult = {
    kind: 'recommendation',
    weightKg: '100.000',
    reps: 7,
    rir: 2,
    basis: 'shortfall_hold',
    offeredReduction: { weightKg: '80.000', reps: 7 },
  };
  const shortfallHoldWithoutOffer: ProgressionResult = {
    kind: 'recommendation',
    weightKg: '100.000',
    reps: 7,
    rir: 2,
    basis: 'shortfall_hold',
    offeredReduction: null,
  };

  it('renders the offer beneath the recommendation, as a second, distinct line', () => {
    const result = RecommendationBanner(baseProps({ result: shortfallHoldWithOffer }));
    const texts = textOf(result);

    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain('100.00 kg');
    expect(texts[1]).toContain('80.00 kg');
    expect(texts[1]).not.toEqual(texts[0]);
  });

  it('converts the offered weight for display through the shared formatter', () => {
    const result = RecommendationBanner(baseProps({ result: shortfallHoldWithOffer, weightUnit: 'lb' }));
    const texts = textOf(result);

    expect(texts[1]).toContain('lb');
    expect(texts[1]).not.toContain('kg');
  });

  it('renders nothing extra when the offer is null', () => {
    const result = RecommendationBanner(baseProps({ result: shortfallHoldWithoutOffer }));
    const texts = textOf(result);

    expect(texts).toHaveLength(1);
  });

  it('never attributes the offer to a source, coach or published method', () => {
    const result = RecommendationBanner(baseProps({ result: shortfallHoldWithOffer }));
    const texts = textOf(result);

    expect(texts.join(' ')).not.toMatch(/macrofactor|stronger by science|renaissance periodization|research[- ]backed|science[- ]based/i);
  });
});

describe('RecommendationBanner — no_history branch', () => {
  it('renders a pick-your-own-starting-weight line, never a fabricated number', () => {
    const result = RecommendationBanner(baseProps({ result: { kind: 'no_history' } }));
    const texts = textOf(result);

    expect(texts).toHaveLength(1);
    expect(texts[0]).not.toMatch(/\d/);
  });
});

describe('RecommendationBanner — unavailable branch', () => {
  it('renders a distinct line for incomplete_prescription', () => {
    const result = RecommendationBanner(baseProps({ result: { kind: 'unavailable', reason: 'incomplete_prescription' } }));
    expect(textOf(result)).toHaveLength(1);
  });

  it('renders a distinct line for no_achievable_weight, never a number', () => {
    const result = RecommendationBanner(baseProps({ result: { kind: 'unavailable', reason: 'no_achievable_weight' } }));
    const texts = textOf(result);

    expect(texts).toHaveLength(1);
    expect(texts[0]).not.toMatch(/\d/);
  });

  it('renders a distinct line for equipment_unavailable', () => {
    const result = RecommendationBanner(baseProps({ result: { kind: 'unavailable', reason: 'equipment_unavailable' } }));
    expect(textOf(result)).toHaveLength(1);
  });

  it('renders three genuinely different strings across the three unavailable reasons', () => {
    const incomplete = textOf(RecommendationBanner(baseProps({ result: { kind: 'unavailable', reason: 'incomplete_prescription' } })))[0];
    const noWeight = textOf(RecommendationBanner(baseProps({ result: { kind: 'unavailable', reason: 'no_achievable_weight' } })))[0];
    const equipment = textOf(RecommendationBanner(baseProps({ result: { kind: 'unavailable', reason: 'equipment_unavailable' } })))[0];

    expect(new Set([incomplete, noWeight, equipment]).size).toBe(3);
  });
});

describe('RecommendationBanner — null result', () => {
  it('renders nothing before the session history has resolved', () => {
    const result = RecommendationBanner(baseProps({ result: null }));
    expect(result).toBeNull();
  });
});

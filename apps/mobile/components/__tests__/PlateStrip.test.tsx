import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import type { EquipmentBandState } from '@fitness/plate-math';
import { resolveEquipmentBand } from '@fitness/plate-math';
import { PlateStripView, type PlateStripViewProps } from '../PlateStrip';

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

function baseProps(overrides: Partial<PlateStripViewProps> = {}): PlateStripViewProps {
  return {
    state: { kind: 'plates', barKg: '20.000', perSidePlatesKg: ['20.000', '10.000', '5.000'] },
    unit: 'kg',
    colors: COLORS,
    onNeighbourPress: jest.fn(),
    onRecoveryPress: jest.fn(),
    ...overrides,
  };
}

describe('PlateStripView — plates', () => {
  it('renders the bar-weight prefix and the descending stack joined by the middle-dot separator', () => {
    const result = PlateStripView(baseProps());
    const texts = findByType(result, Text).map((el) => el.props.children);

    expect(texts).toEqual(['20.00kg bar', '20.00 · 10.00 · 5.00']);
  });

  it('converts to the display unit before rendering', () => {
    const result = PlateStripView(
      baseProps({ unit: 'lb', state: { kind: 'plates', barKg: '20.000', perSidePlatesKg: ['20.000'] } }),
    );
    const texts = findByType(result, Text).map((el) => el.props.children);

    expect(texts[0]).toContain('lb bar');
  });

  it('renders an empty per-side stack (bar-only load) with no second text node', () => {
    const result = PlateStripView(baseProps({ state: { kind: 'plates', barKg: '20.000', perSidePlatesKg: [] } }));
    const texts = findByType(result, Text);

    expect(texts).toHaveLength(1);
    expect(texts[0].props.children).toBe('20.00kg bar');
  });
});

describe('PlateStripView — pair', () => {
  it('renders the loadable dumbbell pair figure', () => {
    const result = PlateStripView(baseProps({ state: { kind: 'pair', weightKg: '20.000' } }));
    const texts = findByType(result, Text).map((el) => el.props.children);

    expect(texts).toEqual(['20.00kg pair']);
  });
});

describe('PlateStripView — stack', () => {
  it('renders the stack range, increment and no base clause when none is configured', () => {
    const result = PlateStripView(
      baseProps({ state: { kind: 'stack', minKg: '5.000', maxKg: '100.000', incrementKg: '5.000', baseResistanceKg: null } }),
    );
    const texts = findByType(result, Text).map((el) => el.props.children);

    expect(texts).toEqual(['Stack 5.00–100.00kg · +5.00kg steps']);
  });

  it('appends the base-resistance clause when one is configured', () => {
    const result = PlateStripView(
      baseProps({ state: { kind: 'stack', minKg: '5.000', maxKg: '100.000', incrementKg: '5.000', baseResistanceKg: '10.000' } }),
    );
    const texts = findByType(result, Text).map((el) => el.props.children);

    expect(texts).toEqual(['Stack 5.00–100.00kg · +5.00kg steps · +10.00kg base']);
  });

  it('omits the steps clause when no increment is configured', () => {
    const result = PlateStripView(
      baseProps({ state: { kind: 'stack', minKg: '5.000', maxKg: '100.000', incrementKg: null, baseResistanceKg: null } }),
    );
    const texts = findByType(result, Text).map((el) => el.props.children);

    expect(texts).toEqual(['Stack 5.00–100.00kg']);
  });
});

describe('PlateStripView — not_loadable', () => {
  it('renders the fixed label plus two independently tappable accent neighbours at the minimum touch size, and grows the band', () => {
    const state: EquipmentBandState = { kind: 'not_loadable', lowerKg: '20.000', higherKg: '22.500' };
    const result = PlateStripView(baseProps({ state }));

    expect(result.props.style).toEqual({ minHeight: 48 });

    const pressables = findByType(result, Pressable);
    expect(pressables).toHaveLength(2);
    expect(pressables[0].props.accessibilityLabel).toBe('Use 20.00kg');
    expect(pressables[1].props.accessibilityLabel).toBe('Use 22.50kg');
  });

  it('tapping a neighbour invokes the callback with that value and nothing else', () => {
    const onNeighbourPress = jest.fn();
    const state: EquipmentBandState = { kind: 'not_loadable', lowerKg: '20.000', higherKg: '22.500' };
    const result = PlateStripView(baseProps({ state, onNeighbourPress }));

    const [lowerPressable, higherPressable] = findByType(result, Pressable);
    (lowerPressable.props.onPress as () => void)();
    expect(onNeighbourPress).toHaveBeenCalledTimes(1);
    expect(onNeighbourPress).toHaveBeenCalledWith('20.000');

    (higherPressable.props.onPress as () => void)();
    expect(onNeighbourPress).toHaveBeenCalledTimes(2);
    expect(onNeighbourPress).toHaveBeenLastCalledWith('22.500');
  });

  it('renders only the side that has a real neighbour when the other side is null', () => {
    const state: EquipmentBandState = { kind: 'not_loadable', lowerKg: null, higherKg: '22.500' };
    const result = PlateStripView(baseProps({ state }));

    const pressables = findByType(result, Pressable);
    expect(pressables).toHaveLength(1);
    expect(pressables[0].props.accessibilityLabel).toBe('Use 22.50kg');
  });
});

describe('PlateStripView — no_plates', () => {
  it('renders the fixed label plus a tappable accent recovery link at the minimum touch size, and grows the band', () => {
    const result = PlateStripView(baseProps({ state: { kind: 'no_plates' } }));

    expect(result.props.style).toEqual({ minHeight: 48 });

    const texts = findByType(result, Text).map((el) => el.props.children);
    expect(texts).toEqual(['No plates configured', 'Add plates']);

    const [pressable] = findByType(result, Pressable);
    expect(pressable.props.accessibilityLabel).toBe('Add plates');
  });

  it('tapping the recovery link invokes onRecoveryPress and nothing else', () => {
    const onRecoveryPress = jest.fn();
    const result = PlateStripView(baseProps({ state: { kind: 'no_plates' }, onRecoveryPress }));

    const [pressable] = findByType(result, Pressable);
    (pressable.props.onPress as () => void)();
    expect(onRecoveryPress).toHaveBeenCalledTimes(1);
  });
});

describe('PlateStripView — collapsed', () => {
  it('renders zero height and no text', () => {
    const result = PlateStripView(baseProps({ state: { kind: 'collapsed' } }));

    expect(result.props.style).toEqual({ height: 0 });
    expect(findByType(result, Text)).toHaveLength(0);
  });

  it.each(['kettlebell', 'bodyweight', 'band', 'medicine_ball', 'exercise_ball', 'foam_roller', 'other'] as const)(
    'collapses for %s, routed through the real band resolver',
    (equipmentType) => {
      const state = resolveEquipmentBand({
        equipmentType,
        targetKg: '20.000',
        inventory: {
          nativeUnit: 'kg',
          barbellWeightKg: '20.000',
          plates: [],
          dumbbells: [],
          machines: [],
          unavailableEquipmentTypes: [],
        },
      });

      const result = PlateStripView(baseProps({ state }));
      expect(result.props.style).toEqual({ height: 0 });
      expect(findByType(result, Text)).toHaveLength(0);
    },
  );

  it('collapses when no gym profile has resolved yet, routed through the real band resolver', () => {
    const state = resolveEquipmentBand({ equipmentType: 'barbell', targetKg: '20.000', inventory: null });
    const result = PlateStripView(baseProps({ state }));

    expect(result.props.style).toEqual({ height: 0 });
    expect(findByType(result, Text)).toHaveLength(0);
  });
});

describe('PlateStripView — error state', () => {
  it('collapses to zero height rather than throwing when a formatting call fails', () => {
    // An invalid canonical-kg string makes fromCanonicalKg throw — the defensive guard must catch
    // it and collapse the band identically to the collapsed state, never a partial render.
    const state: EquipmentBandState = { kind: 'plates', barKg: 'not-a-number', perSidePlatesKg: [] };
    const result = PlateStripView(baseProps({ state }));

    expect(result.props.style).toEqual({ height: 0 });
    expect(findByType(result, Text)).toHaveLength(0);
  });
});

describe('PlateStripView — R4 (never truncates)', () => {
  it('never truncates band text — no numberOfLines, no ellipsizeMode', () => {
    const result = PlateStripView(baseProps());
    for (const text of findByType(result, Text)) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.ellipsizeMode).toBeUndefined();
    }
  });
});

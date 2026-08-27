import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
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
    breakdown: { kind: 'loadable', barKg: '20.000', perSidePlatesKg: ['20.000', '10.000', '5.000'] },
    unit: 'kg',
    colors: COLORS,
    ...overrides,
  };
}

describe('PlateStripView', () => {
  it('renders the bar-weight prefix and the descending stack joined by the middle-dot separator', () => {
    const result = PlateStripView(baseProps());
    const texts = findByType(result, Text).map((el) => el.props.children);

    expect(texts).toEqual(['20.00kg bar', '20.00 · 10.00 · 5.00']);
  });

  it('converts to the display unit before rendering', () => {
    const result = PlateStripView(
      baseProps({
        unit: 'lb',
        breakdown: { kind: 'loadable', barKg: '20.000', perSidePlatesKg: ['20.000'] },
      }),
    );
    const texts = findByType(result, Text).map((el) => el.props.children);

    expect(texts[0]).toContain('lb bar');
  });

  it('renders an empty per-side stack (bar-only load) with no second text node', () => {
    const result = PlateStripView(baseProps({ breakdown: { kind: 'loadable', barKg: '20.000', perSidePlatesKg: [] } }));
    const texts = findByType(result, Text);

    expect(texts).toHaveLength(1);
    expect(texts[0].props.children).toBe('20.00kg bar');
  });

  it.each([
    { kind: 'not_loadable', lowerKg: null, higherKg: null } as const,
    { kind: 'no_plates' } as const,
    { kind: 'unsupported' } as const,
  ])(
    'renders zero height for the $kind state (this task; 06-05 fills in the content)',
    (breakdown) => {
      const result = PlateStripView(baseProps({ breakdown }));

      expect(result.props.style).toEqual({ height: 0 });
      expect(findByType(result, Text)).toHaveLength(0);
    },
  );

  it('never truncates band text (R4) — no numberOfLines, no ellipsizeMode', () => {
    const result = PlateStripView(baseProps());
    for (const text of findByType(result, Text)) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.ellipsizeMode).toBeUndefined();
    }
  });
});

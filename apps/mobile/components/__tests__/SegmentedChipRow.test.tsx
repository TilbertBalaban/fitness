import type { ReactElement, ReactNode } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { SegmentedChipRowView, type SegmentedChipOption, type SegmentedChipRowViewProps } from '../SegmentedChipRow';

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

const OPTIONS: SegmentedChipOption[] = [
  { id: 'heaviest', label: 'Heaviest Weight' },
  { id: 'e1rm', label: 'Est. 1RM' },
  { id: 'volume', label: 'Total Volume' },
];

function baseProps(overrides: Partial<SegmentedChipRowViewProps> = {}): SegmentedChipRowViewProps {
  return {
    groupLabel: 'Performance metric',
    options: OPTIONS,
    selectedId: 'e1rm',
    onSelect: jest.fn(),
    colors: COLORS,
    ...overrides,
  };
}

describe('SegmentedChipRowView', () => {
  it('returns null for an empty option list', () => {
    expect(SegmentedChipRowView(baseProps({ options: [] }))).toBeNull();
  });

  it('gives the container a radiogroup role carrying the supplied group label', () => {
    const result = SegmentedChipRowView(baseProps()) as AnyElement;
    const scroll = findByType(result, ScrollView)[0];

    expect(scroll.props.accessibilityRole).toBe('radiogroup');
    expect(scroll.props.accessibilityLabel).toBe('Performance metric');
  });

  it('marks exactly one chip selected and gives every chip a radio role', () => {
    const result = SegmentedChipRowView(baseProps());
    const chips = findByType(result, Pressable);

    expect(chips).toHaveLength(3);
    for (const chip of chips) {
      expect(chip.props.accessibilityRole).toBe('radio');
    }
    const selected = chips.filter((chip) => (chip.props.accessibilityState as { selected: boolean }).selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].props.accessibilityLabel).toBe('Est. 1RM');
  });

  it('renders every option label as text', () => {
    const result = SegmentedChipRowView(baseProps());
    const texts = findByType(result, Text).map((element) => element.props.children);

    expect(texts).toEqual(['Heaviest Weight', 'Est. 1RM', 'Total Volume']);
  });

  it('never truncates a long label', () => {
    const result = SegmentedChipRowView(baseProps());

    for (const text of findByType(result, Text)) {
      expect(text.props.numberOfLines).toBeUndefined();
    }
  });

  it('reports the pressed option id to onSelect', () => {
    const onSelect = jest.fn();
    const result = SegmentedChipRowView(baseProps({ onSelect }));
    const chips = findByType(result, Pressable);

    (chips[2].props.onPress as () => void)();

    expect(onSelect).toHaveBeenCalledWith('volume');
  });

  it('holds the 48-unit touch-target floor on every chip', () => {
    const result = SegmentedChipRowView(baseProps());

    for (const chip of findByType(result, Pressable)) {
      expect(chip.props.style).toMatchObject({ minWidth: 48, minHeight: 48 });
    }
  });
});

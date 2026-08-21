import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import {
  CycleStripView,
  cycleChipAccessibilityLabel,
  cycleChipLabel,
  cycleChipTone,
  type CycleStripCycle,
  type CycleStripViewProps,
} from '../CycleStrip';

// CycleStripView has no hooks (colors is a prop) — direct invocation exercises its real body, the
// technique already established for SwapSuggestionList/ExerciseSlotRow.
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

const THREE_CYCLES: CycleStripCycle[] = [
  { id: 'c1', name: 'Week 1', kind: 'training', durationDays: null },
  { id: 'c2', name: 'Deload', kind: 'deload', durationDays: null },
  { id: 'c3', name: 'Off', kind: 'time_off', durationDays: 7 },
];

function baseProps(overrides: Partial<CycleStripViewProps> = {}): CycleStripViewProps {
  return {
    cycles: THREE_CYCLES,
    selectedCycleId: null,
    colors: COLORS,
    onSelectCycle: jest.fn(),
    onAddCycle: jest.fn(),
    onEditCycle: jest.fn(),
    ...overrides,
  };
}

function chipFor(result: ReactNode, label: string) {
  return findByType(result, Pressable).find((el) => el.props.accessibilityLabel === label);
}

describe('cycleChipLabel', () => {
  it('is the user\'s own name for a training cycle', () => {
    expect(cycleChipLabel({ id: 'c1', name: 'Week 1', kind: 'training', durationDays: null })).toBe('Week 1');
  });

  it('is the user\'s own name for a deload — the kind drives the tone, not the text', () => {
    expect(cycleChipLabel({ id: 'c2', name: 'Deload', kind: 'deload', durationDays: null })).toBe('Deload');
  });

  it('carries the length on a time-off chip, the fact that chip exists to communicate', () => {
    expect(cycleChipLabel({ id: 'c3', name: 'Off', kind: 'time_off', durationDays: 7 })).toBe('Off · 7d');
  });

  it('falls back to the bare name for a time-off cycle with no duration', () => {
    expect(cycleChipLabel({ id: 'c3', name: 'Off', kind: 'time_off', durationDays: null })).toBe('Off');
  });
});

describe('cycleChipTone', () => {
  it('returns three mutually distinct tones — the block shape must never collapse to two', () => {
    const tones = [cycleChipTone('training'), cycleChipTone('deload'), cycleChipTone('time_off')].map((tone) =>
      JSON.stringify(tone),
    );

    expect(new Set(tones).size).toBe(3);
  });

  it('draws the kind without a second hex — icon, border style and opacity only', () => {
    expect(cycleChipTone('training').icon).toBeNull();
    expect(cycleChipTone('deload').borderStyle).toBe('dashed');
    expect(cycleChipTone('time_off').opacity).toBeLessThan(1);
  });

  it('never draws time-off selection with the accent — accent means trainable content ahead', () => {
    expect(cycleChipTone('training').selectionIndicator).toBe('accent-border');
    expect(cycleChipTone('deload').selectionIndicator).toBe('accent-border');
    expect(cycleChipTone('time_off').selectionIndicator).toBe('muted-underline');
  });
});

describe('cycleChipAccessibilityLabel', () => {
  it('announces the kind alongside the name rather than only a week number', () => {
    expect(cycleChipAccessibilityLabel(THREE_CYCLES[0])).toBe('Week 1, training cycle');
    expect(cycleChipAccessibilityLabel(THREE_CYCLES[1])).toBe('Deload, deload cycle');
    expect(cycleChipAccessibilityLabel(THREE_CYCLES[2])).toBe('Off · 7d, time off');
  });
});

describe('CycleStripView', () => {
  it('renders exactly three chips for three cycles', () => {
    const result = CycleStripView(baseProps());
    const chips = findByType(result, Pressable).filter((el) =>
      THREE_CYCLES.some((cycle) => el.props.accessibilityLabel === cycleChipAccessibilityLabel(cycle)),
    );

    expect(chips).toHaveLength(3);
  });

  it('marks exactly one chip selected and the others unselected', () => {
    const result = CycleStripView(baseProps({ selectedCycleId: 'c2' }));

    const states = THREE_CYCLES.map(
      (cycle) => (chipFor(result, cycleChipAccessibilityLabel(cycle))?.props.accessibilityState as { selected?: boolean })?.selected,
    );

    expect(states).toEqual([false, true, false]);
  });

  it('selects none rather than throwing when the selected id matches no cycle', () => {
    const result = CycleStripView(baseProps({ selectedCycleId: 'gone' }));

    const states = THREE_CYCLES.map(
      (cycle) => (chipFor(result, cycleChipAccessibilityLabel(cycle))?.props.accessibilityState as { selected?: boolean })?.selected,
    );

    expect(states).toEqual([false, false, false]);
  });

  it('pressing a chip calls onSelectCycle with that id and nothing else', () => {
    const onSelectCycle = jest.fn();
    const onAddCycle = jest.fn();
    const onEditCycle = jest.fn();
    const result = CycleStripView(baseProps({ onSelectCycle, onAddCycle, onEditCycle }));

    (chipFor(result, cycleChipAccessibilityLabel(THREE_CYCLES[1]))?.props.onPress as () => void)();

    expect(onSelectCycle).toHaveBeenCalledWith('c2');
    expect(onSelectCycle).toHaveBeenCalledTimes(1);
    expect(onAddCycle).not.toHaveBeenCalled();
    expect(onEditCycle).not.toHaveBeenCalled();
  });

  it('renders nothing at all with zero cycles — the strip is absent, not empty', () => {
    expect(CycleStripView(baseProps({ cycles: [] }))).toBeNull();
  });

  it('renders the Add Cycle control whenever cycles exist and calls onAddCycle', () => {
    const onAddCycle = jest.fn();
    const result = CycleStripView(baseProps({ onAddCycle }));
    const addControl = chipFor(result, 'Add Cycle');

    expect(addControl).toBeDefined();
    (addControl?.props.onPress as () => void)();
    expect(onAddCycle).toHaveBeenCalledTimes(1);
  });

  it('offers an Edit Cycle control only while a cycle is selected, and passes that id', () => {
    const onEditCycle = jest.fn();
    const unselected = CycleStripView(baseProps({ selectedCycleId: null, onEditCycle }));
    const selected = CycleStripView(baseProps({ selectedCycleId: 'c2', onEditCycle }));

    expect(chipFor(unselected, 'Edit Cycle')).toBeUndefined();

    const editControl = chipFor(selected, 'Edit Cycle');
    expect(editControl).toBeDefined();
    (editControl?.props.onPress as () => void)();
    expect(onEditCycle).toHaveBeenCalledWith('c2');
  });

  it("holds every chip's hit target at 48x48", () => {
    const result = CycleStripView(baseProps({ selectedCycleId: 'c1' }));

    for (const button of findByType(result, Pressable)) {
      const style = button.props.style as { minWidth?: number; minHeight?: number };
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  it('never truncates a chip label (R4) — no numberOfLines, no ellipsizeMode', () => {
    const result = CycleStripView(
      baseProps({ cycles: [{ id: 'c1', name: 'Accumulation block, heavy singles', kind: 'training', durationDays: null }] }),
    );

    for (const text of findByType(result, Text)) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.ellipsizeMode).toBeUndefined();
    }
  });
});

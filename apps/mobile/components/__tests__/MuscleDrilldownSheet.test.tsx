import type { ReactNode } from 'react';
import type { MuscleContribution } from '@fitness/analytics-engine';
import type { WeightUnit } from '@fitness/api-contracts';
import {
  deriveMuscleDrilldownState,
  muscleDrilldownRowLabel,
  MuscleDrilldownSheetView,
  type MuscleDrilldownSheetViewProps,
} from '../MuscleDrilldownSheet';

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };
const KG: WeightUnit = 'kg';

function findText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) findText(child, out);
    return out;
  }
  const element = node as { props?: { children?: unknown } };
  if (element.props?.children !== undefined) findText(element.props.children, out);
  return out;
}

function collect(node: ReactNode, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  const element = node as { props?: Record<string, unknown> };
  if (element.props) out.push(element.props);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) collect(children, out);
  return out;
}

function contribution(overrides: Partial<MuscleContribution> = {}): MuscleContribution {
  return {
    exerciseId: 'ex-bench',
    exerciseName: 'Barbell Bench Press',
    setCount: 8,
    weightedVolumeKg: 640,
    ...overrides,
  };
}

function baseProps(overrides: Partial<MuscleDrilldownSheetViewProps> = {}): MuscleDrilldownSheetViewProps {
  return {
    state: 'populated',
    muscleName: 'Chest',
    windowLabel: 'the last 7 days',
    volumeLabel: '182.50 kg',
    weightUnit: KG,
    contributions: [contribution()],
    colors: COLORS,
    onSelectExercise: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
}

describe('deriveMuscleDrilldownState', () => {
  it('returns error when the read failed, whatever else landed', () => {
    expect(deriveMuscleDrilldownState({ failed: true, contributions: [contribution()] })).toBe('error');
  });

  it('returns empty when it landed with no contributing exercises', () => {
    expect(deriveMuscleDrilldownState({ failed: false, contributions: [] })).toBe('empty');
  });

  it('returns empty for a null contributions value (never a loading state)', () => {
    expect(deriveMuscleDrilldownState({ failed: false, contributions: null })).toBe('empty');
  });

  it('returns populated when at least one contribution landed', () => {
    expect(deriveMuscleDrilldownState({ failed: false, contributions: [contribution()] })).toBe('populated');
  });
});

describe('muscleDrilldownRowLabel', () => {
  it('announces the exercise name, its set count, its contributed volume and which muscle it contributed to', () => {
    const label = muscleDrilldownRowLabel(contribution(), 'Chest', '640.00 kg');
    expect(label).toBe('Barbell Bench Press, 8 sets, 640.00 kg contributed to Chest');
  });

  it('uses the singular noun for one set', () => {
    const label = muscleDrilldownRowLabel(contribution({ setCount: 1 }), 'Chest', '80.00 kg');
    expect(label).toBe('Barbell Bench Press, 1 set, 80.00 kg contributed to Chest');
  });
});

describe('MuscleDrilldownSheetView — populated state', () => {
  it('renders the header, subheader and one row per contributing exercise', () => {
    const text = findText(MuscleDrilldownSheetView(baseProps())).join(' ');
    expect(text).toContain('Chest');
    expect(text).toContain('the last 7 days · 182.50 kg Training Volume');
    expect(text).toContain('Barbell Bench Press');
    expect(text).toContain('8 sets · 640.00 kg');
  });

  it('renders in exactly the order supplied, performing no sort of its own', () => {
    const second = contribution({ exerciseId: 'ex-ohp', exerciseName: 'Overhead Press', setCount: 3, weightedVolumeKg: 10 });
    const view = MuscleDrilldownSheetView(baseProps({ contributions: [second, contribution()] }));
    const text = findText(view).join(' ');
    expect(text.indexOf('Overhead Press')).toBeLessThan(text.indexOf('Barbell Bench Press'));
  });

  it('reads the subheader as Untrained (never a number) for an untrained muscle', () => {
    const text = findText(MuscleDrilldownSheetView(baseProps({ volumeLabel: null }))).join(' ');
    expect(text).toContain('the last 7 days · Untrained');
  });

  it('calls onSelectExercise once with the pressed exercise id, invoking the handler with no argument-shuffling', () => {
    const onSelectExercise = jest.fn();
    const view = MuscleDrilldownSheetView(baseProps({ onSelectExercise }));
    const [row] = collect(view).filter((props) => typeof props.onPress === 'function' && props.accessibilityLabel !== 'Close');
    (row.onPress as () => void)();
    expect(onSelectExercise).toHaveBeenCalledTimes(1);
    expect(onSelectExercise).toHaveBeenCalledWith('ex-bench');
  });

  it('sets no line clamp anywhere', () => {
    const view = MuscleDrilldownSheetView(baseProps({ contributions: [contribution({ exerciseName: 'A'.repeat(120) })] }));
    const clamped = collect(view).filter((props) => props.numberOfLines !== undefined);
    expect(clamped).toHaveLength(0);
  });
});

describe('MuscleDrilldownSheetView — empty state', () => {
  it('still renders the header and subheader, and the no-sets heading with its actionable body copy', () => {
    const text = findText(MuscleDrilldownSheetView(baseProps({ state: 'empty', contributions: [] }))).join(' ');
    expect(text).toContain('Chest');
    expect(text).toContain('the last 7 days · 182.50 kg Training Volume');
    expect(text).toContain('No sets for Chest in the last 7 days');
    expect(text).toContain('Widen the time range or log an exercise that trains this muscle.');
  });
});

describe('MuscleDrilldownSheetView — error state', () => {
  it('still renders the header row and the Close control, and shows the shipped could-not-load pattern', () => {
    const view = MuscleDrilldownSheetView(baseProps({ state: 'error' }));
    const text = findText(view).join(' ');
    expect(text).toContain('Chest');
    expect(text).toContain("Couldn't load");
    expect(text).toContain('Restart the app to try again. Your programs and history are safe.');
  });

  it('hides the subheader in the error state', () => {
    const text = findText(MuscleDrilldownSheetView(baseProps({ state: 'error' }))).join(' ');
    expect(text).not.toContain('Training Volume');
  });
});

describe('MuscleDrilldownSheetView — Close control', () => {
  it('is a text button, not an icon, at the 48x48 minimum, invoking onClose once', () => {
    const onClose = jest.fn();
    const view = MuscleDrilldownSheetView(baseProps({ onClose }));
    const [close] = collect(view).filter((props) => props.accessibilityLabel === 'Close');
    expect(close.accessibilityRole).toBe('button');
    expect(close.style).toMatchObject({ minWidth: 48, minHeight: 48 });
    (close.onPress as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('still renders and is pressable in the error state', () => {
    const view = MuscleDrilldownSheetView(baseProps({ state: 'error' }));
    const [close] = collect(view).filter((props) => props.accessibilityLabel === 'Close');
    expect(close).toBeDefined();
    expect(typeof close.onPress).toBe('function');
  });
});

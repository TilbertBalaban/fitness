import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { TargetsSheetView, type TargetsSheetViewProps } from '../TargetsSheet';

// TargetsSheet.tsx imports session-mutations.ts (for the stateful wrapper this file does not
// test — see the note below), which imports log-set.ts, which imports the real
// @powersync/react-native package — a real-module import chain this jest environment cannot parse
// (its shared-internals dependency ships ESM outside transformIgnorePatterns). Mocking powersync
// at its source, exactly like ExercisePickerModal.test.tsx/workout.test.tsx already do, keeps that
// chain from ever loading.
jest.mock('@/lib/db/powersync', () => ({ getPowerSync: jest.fn() }));

// Same direct-invocation technique as ExerciseSlotRow.test.tsx/SetRow.test.tsx — TargetsSheetView
// has no hooks, so calling it directly exercises its real body with no renderer. The stateful
// TargetsSheet wrapper (useState/useThemeColors) is, per this codebase's own established
// convention (ExerciseSlotRow.test.tsx never tests the stateful ExerciseSlotRow wrapper directly),
// exercised only through this hook-free view's distinct onSave/onWriteBack callback props.
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

function flatText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatText).join('');
  const element = node as ReactElement<{ children?: ReactNode }>;
  return element.props?.children !== undefined ? flatText(element.props.children) : '';
}

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

const FULL_TARGETS = { targetSets: 3, targetRepMin: 8, targetRepMax: 12, targetRir: 1, targetRestSeconds: 120 };

function baseProps(overrides: Partial<TargetsSheetViewProps> = {}): TargetsSheetViewProps {
  return {
    exerciseName: 'Bench Press',
    draft: FULL_TARGETS,
    colors: COLORS,
    canWriteBack: true,
    saving: false,
    onStepSets: jest.fn(),
    onStepRepMin: jest.fn(),
    onStepRepMax: jest.fn(),
    onStepRir: jest.fn(),
    onStepRest: jest.fn(),
    onSave: jest.fn(),
    onWriteBack: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}

describe('TargetsSheetView', () => {
  it('renders every one of the five stepper fields', () => {
    const result = TargetsSheetView(baseProps());
    const labels = findByType(result, Text).map(flatText);
    expect(labels).toEqual(expect.arrayContaining(['Sets', 'Rep min', 'Rep max', 'RIR', 'Rest (seconds)']));
  });

  it('renders every null field as an em dash, never 0 or NaN (one-off exercise)', () => {
    const empty = { targetSets: null, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null };
    const result = TargetsSheetView(baseProps({ draft: empty }));
    expect(findByType(result, Text).some((el) => flatText(el) === '—')).toBe(true);
    expect(findByType(result, Text).some((el) => flatText(el) === '0')).toBe(false);
    expect(findByType(result, Text).some((el) => flatText(el) === 'NaN')).toBe(false);
  });

  it('Save calls onSave and never onWriteBack — the two are distinct handlers', () => {
    const onSave = jest.fn();
    const onWriteBack = jest.fn();
    const result = TargetsSheetView(baseProps({ onSave, onWriteBack }));
    const save = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Save');

    (save?.props.onPress as () => void)();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onWriteBack).not.toHaveBeenCalled();
  });

  it('"Also update my program" calls onWriteBack and never onSave — the two are distinct handlers', () => {
    const onSave = jest.fn();
    const onWriteBack = jest.fn();
    const result = TargetsSheetView(baseProps({ onSave, onWriteBack }));
    const writeBack = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Also update my program');

    (writeBack?.props.onPress as () => void)();

    expect(onWriteBack).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('renders "Also update my program" at lower visual weight than Save (no fill, accent text only)', () => {
    const result = TargetsSheetView(baseProps());
    const writeBack = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Also update my program');
    const save = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Save');

    expect((writeBack?.props.className as string)).not.toContain('bg-accent');
    expect((save?.props.className as string)).toContain('bg-accent');
  });

  it('disables the write-back action when canWriteBack is false (LOG-15: no routine linkage)', () => {
    const result = TargetsSheetView(baseProps({ canWriteBack: false }));
    const writeBack = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Also update my program');
    expect(writeBack?.props.disabled).toBe(true);
  });

  it('every control holds the 48-height floor', () => {
    const result = TargetsSheetView(baseProps());
    for (const label of ['Save', 'Also update my program', 'Cancel']) {
      const pressable = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === label);
      expect((pressable?.props.style as { minHeight?: number })?.minHeight).toBe(48);
    }
  });
});

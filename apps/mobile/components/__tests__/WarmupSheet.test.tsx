import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { WarmupSheetView, type WarmupSheetViewProps } from '../WarmupSheet';

// WarmupSheet.tsx imports session-mutations.ts (for the stateful wrapper this file does not
// test — see the note below), which imports log-set.ts, which imports the real
// @powersync/react-native package — a real-module import chain this jest environment cannot parse.
// Mocking powersync at its source, exactly like TargetsSheet.test.tsx/ExercisePickerModal.test.tsx
// already do, keeps that chain from ever loading.
jest.mock('@/lib/db/powersync', () => ({ getPowerSync: jest.fn() }));

// Same direct-invocation technique as TargetsSheet.test.tsx — WarmupSheetView has no hooks, so
// calling it directly exercises its real body with no renderer. The stateful WarmupSheet wrapper
// (useState/useEffect) is, per this codebase's own established convention, exercised only through
// this hook-free view's distinct callback props.
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

function baseProps(overrides: Partial<WarmupSheetViewProps> = {}): WarmupSheetViewProps {
  return {
    weightText: '100',
    weightUnit: 'kg',
    count: 3,
    saving: false,
    onChangeWeight: jest.fn(),
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}

describe('WarmupSheetView', () => {
  it('renders the exact Copywriting Contract heading and confirm label', () => {
    const result = WarmupSheetView(baseProps());
    const texts = findByType(result, Text).map(flatText);
    expect(texts).toContain('Add Warm-up Sets');
    const confirm = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Add Warm-up Sets');
    expect(confirm).toBeDefined();
  });

  it("renders the body copy with the known weight and the real @fitness/pr-rules-derived count", () => {
    const result = WarmupSheetView(baseProps({ weightText: '100', weightUnit: 'kg', count: 3 }));
    const texts = findByType(result, Text).map(flatText);
    expect(texts.some((text) => text === "Based on 100 kg, we'll add 3 warm-up sets.")).toBe(true);
  });

  it('disables confirm when the working weight is blank (required field, D-16 fallback exhausted)', () => {
    const result = WarmupSheetView(baseProps({ weightText: '' }));
    const confirm = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Add Warm-up Sets');
    expect(confirm?.props.disabled).toBe(true);
  });

  it('enables confirm once a working weight is present', () => {
    const result = WarmupSheetView(baseProps({ weightText: '80' }));
    const confirm = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Add Warm-up Sets');
    expect(confirm?.props.disabled).toBe(false);
  });

  it('confirm calls onConfirm and cancel calls onCancel — distinct handlers', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = WarmupSheetView(baseProps({ onConfirm, onCancel }));

    (findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Add Warm-up Sets')?.props.onPress as () => void)();
    (findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Cancel')?.props.onPress as () => void)();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('every control holds the 48-height floor', () => {
    const result = WarmupSheetView(baseProps());
    for (const label of ['Add Warm-up Sets', 'Cancel']) {
      const pressable = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === label);
      expect((pressable?.props.style as { minHeight?: number })?.minHeight).toBe(48);
    }
  });
});

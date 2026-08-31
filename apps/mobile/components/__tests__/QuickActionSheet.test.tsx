import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { QUICK_ACTIONS, QuickActionSheetView, resolveQuickAction, type QuickActionSheetViewProps } from '../QuickActionSheet';

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

function renderView(overrides: Partial<QuickActionSheetViewProps> = {}) {
  return QuickActionSheetView({
    colors: COLORS,
    onSelect: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  });
}

describe('QUICK_ACTIONS (D-27/D-28)', () => {
  it('lists the six rows in the specified fixed order, with no destructive flag', () => {
    expect(QUICK_ACTIONS.map((action) => action.id)).toEqual([
      'quick_weigh_in',
      'quick_measurement',
      'progress_photo',
      'history',
      'new_program',
      'one_off_workout',
    ]);
  });

  it('carries no truthy destructive flag on any row — none of the six is a destructive action (S3)', () => {
    for (const action of QUICK_ACTIONS) {
      expect((action as unknown as { destructive?: boolean }).destructive).toBeFalsy();
    }
  });
});

describe('resolveQuickAction (R30)', () => {
  it("is a pure-navigation descriptor for 'history', targeting the history tab", () => {
    expect(resolveQuickAction('history')).toEqual({ kind: 'navigate', route: '/(tabs)/history' });
  });

  it("is a pure-navigation descriptor for 'new_program', targeting /programs/generate", () => {
    expect(resolveQuickAction('new_program')).toEqual({ kind: 'navigate', route: '/programs/generate' });
  });

  it("is a pure-navigation descriptor for 'one_off_workout', targeting the workout tab's one-off entry", () => {
    expect(resolveQuickAction('one_off_workout')).toEqual({ kind: 'navigate', route: '/(tabs)/workout?openOneOff=1' });
  });

  it("is an in-place descriptor carrying no route for 'quick_weigh_in'", () => {
    expect(resolveQuickAction('quick_weigh_in')).toEqual({ kind: 'in-place' });
  });

  it("is an in-place descriptor carrying no route for 'quick_measurement'", () => {
    expect(resolveQuickAction('quick_measurement')).toEqual({ kind: 'in-place' });
  });

  it("is an in-place descriptor carrying no route for 'progress_photo'", () => {
    expect(resolveQuickAction('progress_photo')).toEqual({ kind: 'in-place' });
  });
});

describe('QuickActionSheetView (S3 — exactly one state)', () => {
  it('renders all six rows, in order, for every input this view accepts — no input hides or disables a row', () => {
    const text = flatText(renderView());

    for (const action of QUICK_ACTIONS) {
      expect(text).toContain(action.label);
    }
    const order = QUICK_ACTIONS.map((action) => action.label);
    const positions = order.map((label) => text.indexOf(label));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('sets no numberOfLines on any row label', () => {
    const textNodes = findByType(renderView(), Text);
    for (const node of textNodes) {
      expect(node.props.numberOfLines).toBeUndefined();
    }
  });

  it('renders every row icon in the muted (non-accent) glyph colour, never destructive or accent', () => {
    const icons = findByType(renderView(), Ionicons);
    const rowIcons = icons.filter((icon) => QUICK_ACTIONS.some((action) => action.icon === icon.props.name));
    expect(rowIcons).toHaveLength(QUICK_ACTIONS.length);
    for (const icon of rowIcons) {
      expect(icon.props.color).toBe(COLORS.foregroundMuted);
    }
  });

  it('every row is a 48pt-minimum Pressable that reports its own action id on select', () => {
    const onSelect = jest.fn();
    const pressables = findByType(renderView({ onSelect }), Pressable);
    const rowPressables = pressables.filter((pressable) =>
      QUICK_ACTIONS.some((action) => action.label === pressable.props.accessibilityLabel),
    );
    expect(rowPressables).toHaveLength(QUICK_ACTIONS.length);
    for (const pressable of rowPressables) {
      expect((pressable.props.style as { minHeight?: number }).minHeight).toBe(48);
      const action = QUICK_ACTIONS.find((candidate) => candidate.label === pressable.props.accessibilityLabel)!;
      (pressable.props.onPress as () => void)();
      expect(onSelect).toHaveBeenCalledWith(action.id);
    }
  });
});

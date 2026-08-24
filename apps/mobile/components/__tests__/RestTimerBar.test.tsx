import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { RestTimerBarView, type RestTimerBarViewProps } from '../RestTimerBar';

// Same direct-invocation technique as SetRow.test.tsx/CycleStrip.test.tsx — RestTimerBarView has
// no hooks, so calling it directly exercises its real body with no renderer.
type AnyElement = ReactElement<Record<string, unknown>>;

function findAllByType(node: ReactNode, type: unknown, found: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findAllByType(child, type, found);
    return found;
  }
  const element = node as AnyElement;
  if (element.type === type) found.push(element);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findAllByType(children, type, found);
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

function baseProps(overrides: Partial<RestTimerBarViewProps> = {}): RestTimerBarViewProps {
  return {
    colors: COLORS,
    paused: false,
    durationText: '5:00',
    restText: '0:00',
    restActive: false,
    onPressRest: jest.fn(),
    ...overrides,
  };
}

function renderTexts(props: RestTimerBarViewProps): string[] {
  const element = RestTimerBarView(props);
  return findAllByType(element, Text).map((node) => flatText(node));
}

describe('RestTimerBarView', () => {
  it('renders the dormant rest column at 0:00 in the muted tone, same column structure as active', () => {
    const dormant = RestTimerBarView(baseProps({ restText: '0:00', restActive: false }));
    const dormantTexts = findAllByType(dormant, Text);
    const restValue = dormantTexts.find((node) => flatText(node) === '0:00');
    expect(restValue).toBeDefined();
    expect(restValue!.props.className).toContain('text-foreground-muted');

    const active = RestTimerBarView(baseProps({ restText: '1:30', restActive: true }));
    const activeTexts = findAllByType(active, Text);
    // Same two-label, two-value column structure — "Workout"/"Rest" labels plus one value each.
    expect(dormantTexts.length).toBe(activeTexts.length);
    expect(renderTexts(baseProps({ restText: '0:00', restActive: false }))).toContain('Rest');
  });

  it('renders active rest in the non-muted, foreground tone', () => {
    const active = RestTimerBarView(baseProps({ restText: '1:30', restActive: true }));
    const restValue = findAllByType(active, Text).find((node) => flatText(node) === '1:30');
    expect(restValue).toBeDefined();
    expect(restValue!.props.className).toContain('text-foreground');
    expect(restValue!.props.className).not.toContain('text-foreground-muted');
  });

  it('renders the "Paused" label with a frozen readout in the muted tone', () => {
    const element = RestTimerBarView(baseProps({ paused: true, durationText: '12:34' }));
    const texts = findAllByType(element, Text);
    expect(texts.some((node) => flatText(node) === 'Paused')).toBe(true);
    expect(texts.some((node) => flatText(node) === 'Workout')).toBe(false);
    const durationValue = texts.find((node) => flatText(node) === '12:34');
    expect(durationValue!.props.className).toContain('text-foreground-muted');
  });

  it('renders a duration past one hour in H:MM:SS', () => {
    const element = RestTimerBarView(baseProps({ durationText: '1:02:03' }));
    const texts = findAllByType(element, Text);
    expect(texts.some((node) => flatText(node) === '1:02:03')).toBe(true);
  });

  it('renders the countdown in the same tone at 5 seconds remaining as at 60 — no urgency color escalation', () => {
    const near = RestTimerBarView(baseProps({ restText: '0:05', restActive: true }));
    const far = RestTimerBarView(baseProps({ restText: '1:00', restActive: true }));
    const nearValue = findAllByType(near, Text).find((node) => flatText(node) === '0:05');
    const farValue = findAllByType(far, Text).find((node) => flatText(node) === '1:00');
    expect(nearValue!.props.className).toBe(farValue!.props.className);
  });

  it('tapping the rest column calls onPressRest', () => {
    const onPressRest = jest.fn();
    const element = RestTimerBarView(baseProps({ onPressRest }));
    const [pressable] = findAllByType(element, Pressable);
    (pressable.props as { onPress: () => void }).onPress();
    expect(onPressRest).toHaveBeenCalledTimes(1);
  });
});

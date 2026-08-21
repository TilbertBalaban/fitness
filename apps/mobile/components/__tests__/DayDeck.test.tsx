import type { ReactElement, ReactNode } from 'react';
import { TabView } from 'react-native-tab-view';
import { clampDeckIndex, DayDeckView, dayRoutes } from '../DayDeck';

// Same direct-invocation technique as SwapSuggestionList.test.tsx / ExercisePickerModal.test.tsx —
// DayDeckView has no hooks, so calling it directly is a faithful exercise of its real body.
// TabView itself is never rendered (no react-test-renderer in this worktree's lockfile); its props
// are inspected on the returned element, the same way FlashList's renderItem was extracted rather
// than executed by a virtualizer.
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

describe('dayRoutes', () => {
  it('maps each day to a { key, title } route in the given order', () => {
    expect(
      dayRoutes([
        { id: 'd1', name: 'Push' },
        { id: 'd2', name: 'Pull' },
      ]),
    ).toEqual([
      { key: 'd1', title: 'Push' },
      { key: 'd2', title: 'Pull' },
    ]);
  });
});

describe('clampDeckIndex', () => {
  it('clamps an index past the end into range', () => {
    expect(clampDeckIndex(5, 3)).toBe(2);
  });

  it('clamps a negative index to 0', () => {
    expect(clampDeckIndex(-1, 3)).toBe(0);
  });

  it('resolves to 0 for a zero-day program', () => {
    expect(clampDeckIndex(0, 0)).toBe(0);
  });
});

describe('DayDeckView', () => {
  const days = [
    { id: 'd1', name: 'Push' },
    { id: 'd2', name: 'Pull' },
  ];

  it('renders the empty-state copy and produces zero TabView elements for zero days', () => {
    const result = DayDeckView({ days: [], index: 0, onIndexChange: jest.fn(), renderDay: () => null, width: 400 });

    expect(flatText(result)).toContain('No days yet');
    expect(findByType(result, TabView)).toHaveLength(0);
  });

  it('renders exactly one TabView with a two-route navigationState and swipeEnabled true', () => {
    const result = DayDeckView({ days, index: 0, onIndexChange: jest.fn(), renderDay: () => null, width: 400 });
    const [tabView] = findByType(result, TabView);

    expect(findByType(result, TabView)).toHaveLength(1);
    expect((tabView.props.navigationState as { routes: unknown[] }).routes).toHaveLength(2);
    expect(tabView.props.swipeEnabled).toBe(true);
  });

  it("the TabView's renderTabBar prop returns null when invoked", () => {
    const result = DayDeckView({ days, index: 0, onIndexChange: jest.fn(), renderDay: () => null, width: 400 });
    const [tabView] = findByType(result, TabView);
    const renderTabBar = tabView.props.renderTabBar as () => ReactNode;

    expect(renderTabBar()).toBeNull();
  });

  it('re-clamps a stale index (pointing at a day that no longer exists) instead of rendering a blank page', () => {
    const result = DayDeckView({ days, index: 5, onIndexChange: jest.fn(), renderDay: () => null, width: 400 });
    const [tabView] = findByType(result, TabView);

    expect((tabView.props.navigationState as { index: number }).index).toBe(1);
  });
});

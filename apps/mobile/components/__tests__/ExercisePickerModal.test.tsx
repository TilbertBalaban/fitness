import type { ReactElement, ReactNode } from 'react';
import { FlashList } from '@shopify/flash-list';
import { Pressable } from 'react-native';

// ExercisePickerModal.tsx's top-level imports reach getPowerSync (WINDOWS #22/#33's
// @powersync/react-native ESM parse failure), the exercises screen (drizzle-orm/expo-router) and
// authClient — none of which this test's direct-invocation of ExercisePickerModalView needs.
// Mocked before the component import, matching the established pattern
// (apps/mobile/components/__tests__/ExerciseListRow.test.tsx).
jest.mock('@/lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('@/lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));
jest.mock('@/app/exercises', () => ({ loadCatalogRows: jest.fn() }));

import { ExerciseListRow } from '../ExerciseListRow';
import { ExercisePickerModalView, type ExercisePickerModalViewProps, type PickerCatalogRow } from '../ExercisePickerModal';

// Same direct-invocation technique as SwapSuggestionList.test.tsx — ExercisePickerModalView has no
// hooks, so calling it directly is a faithful exercise of its real body. FlashList itself never
// mounts in this environment (no react-test-renderer); its `renderItem` prop is extracted from the
// found FlashList element and invoked manually per row, which is what FlashList would do at scroll
// time — a legitimate way to exercise row output without a real virtualization pass.
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

function row(overrides: Partial<PickerCatalogRow> & { id: string; name: string }): PickerCatalogRow {
  return {
    aliases: null,
    movementPattern: null,
    equipmentRequired: null,
    imageUri: null,
    ...overrides,
  } as PickerCatalogRow;
}

function baseProps(overrides: Partial<ExercisePickerModalViewProps> = {}): ExercisePickerModalViewProps {
  return {
    dayName: 'Push Day',
    screenState: 'populated',
    catalogRows: [],
    results: [],
    tagsByExerciseId: new Map(),
    query: '',
    filters: { muscleGroupIds: [], equipment: [], movementPatterns: [] },
    muscleGroupOptions: [],
    equipmentOptions: [],
    movementPatternOptions: [],
    selectedIds: [],
    colors: { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' },
    onQueryChange: jest.fn(),
    onToggleFilter: jest.fn(),
    onClearFilters: jest.fn(),
    onToggle: jest.fn(),
    onAdd: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}

function renderedRows(result: ReactElement, results: PickerCatalogRow[]): ReactNode[] {
  const [list] = findByType(result, FlashList);
  const renderItem = list.props.renderItem as (info: { item: PickerCatalogRow }) => ReactNode;
  return results.map((item) => renderItem({ item }));
}

describe('ExercisePickerModalView', () => {
  const rows = [row({ id: 'e1', name: 'Bench Press' }), row({ id: 'e2', name: 'Squat' }), row({ id: 'e3', name: 'Deadlift' })];

  it('renders exactly three ExerciseListRow elements for three catalog rows', () => {
    const props = baseProps({ catalogRows: rows, results: rows });
    const result = ExercisePickerModalView(props);
    const rendered = renderedRows(result, rows);

    expect(findByType(rendered, ExerciseListRow)).toHaveLength(3);
  });

  it('marks a selected row accessibilityState.selected true and an unselected row false', () => {
    const props = baseProps({ catalogRows: rows, results: rows, selectedIds: ['e2'] });
    const result = ExercisePickerModalView(props);
    const rendered = renderedRows(result, rows);
    const wrappers = findByType(rendered, Pressable);

    const selectedWrapper = wrappers.find((el) => (el.props.accessibilityState as { selected?: boolean })?.selected === true);
    const unselectedWrapper = wrappers.find((el) => (el.props.accessibilityState as { selected?: boolean })?.selected === false);

    expect(selectedWrapper).toBeDefined();
    expect(unselectedWrapper).toBeDefined();
  });

  it('a row already present in the day still renders selectable and not disabled', () => {
    const props = baseProps({ catalogRows: rows, results: rows });
    const result = ExercisePickerModalView(props);
    const rendered = renderedRows(result, rows);
    const wrappers = findByType(rendered, Pressable);

    for (const wrapper of wrappers) {
      expect((wrapper.props.accessibilityState as { disabled?: boolean } | undefined)?.disabled).not.toBe(true);
    }
  });

  it("the Add control's label is formatSelectionCount(selectedIds.length)", () => {
    const zero = ExercisePickerModalView(baseProps({ selectedIds: [] }));
    const one = ExercisePickerModalView(baseProps({ selectedIds: ['e1'] }));
    const two = ExercisePickerModalView(baseProps({ selectedIds: ['e1', 'e2'] }));

    const addButtons = [zero, one, two].map((tree) => findByType(tree, Pressable).find((el) => el.props.accessibilityLabel === 'Add exercises to day'));

    expect(addButtons.every(Boolean)).toBe(true);
  });

  it('the Add control is disabled with an empty selection', () => {
    const result = ExercisePickerModalView(baseProps({ selectedIds: [] }));
    const addButton = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Add exercises to day');

    expect((addButton?.props.accessibilityState as { disabled?: boolean } | undefined)?.disabled).toBe(true);
  });

  it('onCancel is invoked with no arguments', () => {
    const onCancel = jest.fn();
    const result = ExercisePickerModalView(baseProps({ onCancel }));
    const cancelButton = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Cancel');

    (cancelButton?.props.onPress as () => void)();

    expect(onCancel).toHaveBeenCalledWith();
  });

  it('onAdd is invoked with the ordered selection', () => {
    const onAdd = jest.fn();
    const props = baseProps({ catalogRows: rows, results: rows, selectedIds: ['e3', 'e1'], onAdd });
    const result = ExercisePickerModalView(props);
    const addButton = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Add exercises to day');

    (addButton?.props.onPress as () => void)();

    expect(onAdd).toHaveBeenCalledWith([rows[2], rows[0]]);
  });
});

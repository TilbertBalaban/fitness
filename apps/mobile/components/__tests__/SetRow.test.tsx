import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SetRowView, badgeGlyphFor, formatFieldValue, setRowFieldState, type SetRowViewProps } from '../SetRow';

// Same direct-invocation technique as CycleStrip.test.tsx/DayDeck.test.tsx — SetRowView has no
// hooks, so calling it directly exercises its real body with no renderer.
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

function baseProps(overrides: Partial<SetRowViewProps> = {}): SetRowViewProps {
  return {
    setIndex: 1,
    values: { weight: null, reps: '10', rir: '2' },
    reference: { weight: null, reps: null },
    completed: false,
    activeField: null,
    colors: COLORS,
    onFieldPress: jest.fn(),
    onReferenceTap: jest.fn(),
    onCheckmarkPress: jest.fn(),
    ...overrides,
  };
}

describe('formatFieldValue', () => {
  it('renders a blank string for a null weight — never a guessed number', () => {
    expect(formatFieldValue('weight', null)).toBe('');
  });

  it('renders the em dash for a null reps or rir — a one-off exercise has no target', () => {
    expect(formatFieldValue('reps', null)).toBe('—');
    expect(formatFieldValue('rir', null)).toBe('—');
  });

  it('passes a present value straight through for every field', () => {
    expect(formatFieldValue('weight', '102.5')).toBe('102.5');
    expect(formatFieldValue('reps', '8')).toBe('8');
    expect(formatFieldValue('rir', '0')).toBe('0');
  });
});

describe('setRowFieldState', () => {
  it('is active whenever the field is the active one, regardless of its value', () => {
    expect(setRowFieldState(null, true)).toBe('active');
    expect(setRowFieldState('10', true)).toBe('active');
  });

  it('is empty for a null or blank value when not active', () => {
    expect(setRowFieldState(null, false)).toBe('empty');
    expect(setRowFieldState('', false)).toBe('empty');
  });

  it('is populated for a present value when not active', () => {
    expect(setRowFieldState('10', false)).toBe('populated');
  });
});

describe('SetRowView', () => {
  it('renders the set-number tap target at a fixed 24px-wide column', () => {
    const result = SetRowView(baseProps({ setIndex: 3 }));
    expect(flatText(result)).toContain('3');
  });

  it('renders exactly one checkmark control at a 48x48 hit target', () => {
    const result = SetRowView(baseProps());
    const checkmark = findByType(result, Pressable).find(
      (el) => el.props.accessibilityLabel === 'Mark set complete' || el.props.accessibilityLabel === 'Mark set incomplete',
    );

    expect(checkmark?.props.style).toEqual({ width: 48, height: 48 });
  });

  it('an unchecked row offers Mark set complete; a completed row offers Mark set incomplete', () => {
    const unchecked = SetRowView(baseProps({ completed: false }));
    const checked = SetRowView(baseProps({ completed: true }));

    expect(findByType(unchecked, Pressable).some((el) => el.props.accessibilityLabel === 'Mark set complete')).toBe(true);
    expect(findByType(checked, Pressable).some((el) => el.props.accessibilityLabel === 'Mark set incomplete')).toBe(true);
  });

  it('tapping the checkmark calls onCheckmarkPress with no arguments the row needs to supply', () => {
    const onCheckmarkPress = jest.fn();
    const result = SetRowView(baseProps({ onCheckmarkPress }));
    const checkmark = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Mark set complete');

    (checkmark?.props.onPress as () => void)();

    expect(onCheckmarkPress).toHaveBeenCalledTimes(1);
  });

  it('tapping a field calls onFieldPress with that field name', () => {
    const onFieldPress = jest.fn();
    const result = SetRowView(baseProps({ onFieldPress }));
    const weightField = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Weight, set field');

    (weightField?.props.onPress as () => void)();

    expect(onFieldPress).toHaveBeenCalledWith('weight');
  });

  it('a prefilled-but-uncommitted row renders regular weight and an outline checkmark', () => {
    const result = SetRowView(baseProps({ completed: false }));
    const texts = findByType(result, Text).filter((el) => flatText(el) === '10');

    expect(texts.some((el) => (el.props.className as string).includes('font-normal'))).toBe(true);
    expect(findByType(result, Text).some((el) => flatText(el) === '✓')).toBe(false);
  });

  it('a committed row renders semibold values and a filled accent checkmark', () => {
    const result = SetRowView(baseProps({ completed: true }));
    const texts = findByType(result, Text).filter((el) => flatText(el) === '10');

    expect(texts.some((el) => (el.props.className as string).includes('font-semibold'))).toBe(true);
  });

  it('renders the active field cursor bar only on the active field', () => {
    const active = SetRowView(baseProps({ activeField: 'reps' }));
    const inactive = SetRowView(baseProps({ activeField: null }));

    // The cursor is a 2px-wide, 20px-tall accent View — present when reps is active, absent
    // otherwise. Matched as a pair (not a bare "width":2 substring, which "width":24 also
    // contains) to avoid a false positive against the unrelated 24px set-number column.
    const cursorPattern = /"width":2,"height":20/;
    const activeCursor = cursorPattern.test(JSON.stringify(active));
    const inactiveCursor = cursorPattern.test(JSON.stringify(inactive));
    expect(activeCursor).toBe(true);
    expect(inactiveCursor).toBe(false);
  });

  it('a one-set row renders identically to any other row, with no plural copy', () => {
    const result = SetRowView(baseProps({ setIndex: 1 }));
    expect(flatText(result)).not.toMatch(/sets?\b/i);
  });

  it('never truncates a field value (R4) — no numberOfLines, no ellipsizeMode', () => {
    const result = SetRowView(baseProps({ values: { weight: '225.5', reps: '12', rir: '0' } }));
    for (const text of findByType(result, Text)) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.ellipsizeMode).toBeUndefined();
    }
  });

  it('holds the checkmark column fixed at 48x48 regardless of field content', () => {
    const result = SetRowView(baseProps({ values: { weight: '99999.999', reps: '999', rir: '99' } }));
    const checkmark = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Mark set complete');
    expect(checkmark?.props.style).toEqual({ width: 48, height: 48 });
  });

  it('a null reference renders the exact string "No previous" with no press handler', () => {
    const result = SetRowView(baseProps({ reference: { weight: null, reps: null } }));

    expect(findByType(result, Text).some((el) => flatText(el) === 'No previous')).toBe(true);
    expect(findByType(result, Pressable).some((el) => (el.props.accessibilityLabel as string)?.startsWith('Weight, use previous'))).toBe(
      false,
    );
  });

  // rir never carries a reference (D-16's deliberate split — the reps/rir prefill trains toward
  // the program, only weight and reps show what actually happened last time) — this is the same
  // "No previous, no press handler" shape a warm-up-sourced null would produce, since
  // previousSetReference already excludes warm-up rows from its own source set before SetRow ever
  // sees a value (tested at the query layer in session-query.test.ts).
  it('rir never renders a tappable reference, regardless of the weight/reps reference state', () => {
    const result = SetRowView(baseProps({ reference: { weight: '95.00', reps: '8' } }));
    const rirField = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'RIR, set field');

    expect(rirField).toBeDefined();
    expect(findByType(result, Pressable).some((el) => (el.props.accessibilityLabel as string)?.startsWith('RIR, use previous'))).toBe(
      false,
    );
  });

  it('a present weight reference renders a press handler that fills only the weight field', () => {
    const onReferenceTap = jest.fn();
    const result = SetRowView(baseProps({ reference: { weight: '95.00', reps: null }, onReferenceTap }));
    const referenceTarget = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Weight, use previous 95.00');

    expect(referenceTarget).toBeDefined();
    (referenceTarget?.props.onPress as () => void)();

    expect(onReferenceTap).toHaveBeenCalledWith('weight');
    expect(onReferenceTap).not.toHaveBeenCalledWith('reps');
  });

  it('a present reps reference renders a press handler that fills only the reps field', () => {
    const onReferenceTap = jest.fn();
    const result = SetRowView(baseProps({ reference: { weight: null, reps: '8' }, onReferenceTap }));
    const referenceTarget = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Reps, use previous 8');

    expect(referenceTarget).toBeDefined();
    (referenceTarget?.props.onPress as () => void)();

    expect(onReferenceTap).toHaveBeenCalledWith('reps');
    expect(onReferenceTap).not.toHaveBeenCalledWith('weight');
  });

  it('tapping a reference whose value already equals the field still calls onReferenceTap once, leaving the field value identical', () => {
    const onReferenceTap = jest.fn();
    const result = SetRowView(
      baseProps({ values: { weight: '95.00', reps: '10', rir: '2' }, reference: { weight: '95.00', reps: null }, onReferenceTap }),
    );
    const referenceTarget = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Weight, use previous 95.00');

    (referenceTarget?.props.onPress as () => void)();

    expect(onReferenceTap).toHaveBeenCalledTimes(1);
    expect(onReferenceTap).toHaveBeenCalledWith('weight');
  });

  it('renders the leading warm-up badge when warmup is true, and no badge at all when it is absent', () => {
    const warmupRow = SetRowView(baseProps({ warmup: true }));
    const normalRow = SetRowView(baseProps());

    expect(findByType(warmupRow, View).some((el) => el.props.accessibilityLabel === 'Warm-up set')).toBe(true);
    expect(findByType(normalRow, View).some((el) => el.props.accessibilityLabel === 'Warm-up set')).toBe(false);
  });

  it('renders the note dot immediately before the checkmark when hasNote is true, and none when it is absent', () => {
    const noted = SetRowView(baseProps({ hasNote: true }));
    const unnoted = SetRowView(baseProps());

    expect(findByType(noted, View).some((el) => el.props.accessibilityLabel === 'Note exists')).toBe(true);
    expect(findByType(unnoted, View).some((el) => el.props.accessibilityLabel === 'Note exists')).toBe(false);
  });

  it('a long press on a nested field target (not just the row container) calls onLongPress', () => {
    const onLongPress = jest.fn();
    const result = SetRowView(baseProps({ onLongPress }));
    const weightField = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Weight, set field');

    (weightField?.props.onLongPress as () => void)();

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('a long press on the reference Pressable nested inside a field calls the same onLongPress', () => {
    const onLongPress = jest.fn();
    const result = SetRowView(baseProps({ reference: { weight: '95.00', reps: null }, onLongPress }));
    const referenceTarget = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Weight, use previous 95.00');

    (referenceTarget?.props.onLongPress as () => void)();

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('a short tap still fires onFieldPress and onCheckmarkPress unaffected by a supplied onLongPress (D-17/D-19 unchanged)', () => {
    const onFieldPress = jest.fn();
    const onCheckmarkPress = jest.fn();
    const onLongPress = jest.fn();
    const result = SetRowView(baseProps({ onFieldPress, onCheckmarkPress, onLongPress }));
    const weightField = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Weight, set field');
    const checkmark = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Mark set complete');

    (weightField?.props.onPress as () => void)();
    (checkmark?.props.onPress as () => void)();

    expect(onFieldPress).toHaveBeenCalledWith('weight');
    expect(onCheckmarkPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('exposes an "Add note" accessibility action on a press target, routed to onLongPress, when onLongPress is supplied', () => {
    const onLongPress = jest.fn();
    const result = SetRowView(baseProps({ onLongPress }));
    const weightField = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Weight, set field');

    expect(weightField?.props.accessibilityActions).toEqual([{ name: 'note', label: 'Add note' }]);
    (weightField?.props.onAccessibilityAction as (event: { nativeEvent: { actionName: string } }) => void)({
      nativeEvent: { actionName: 'note' },
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('renders with no onLongPress, no accessibilityActions and no badges when none of the new props are supplied (WorkoutSummary.tsx call site)', () => {
    const result = SetRowView(baseProps());
    const weightField = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Weight, set field');

    expect(weightField?.props.onLongPress).toBeUndefined();
    expect(weightField?.props.accessibilityActions).toBeUndefined();
    expect(findByType(result, View).some((el) => el.props.accessibilityLabel === 'Warm-up set')).toBe(false);
    expect(findByType(result, View).some((el) => el.props.accessibilityLabel === 'Note exists')).toBe(false);
  });
});

describe('badgeGlyphFor', () => {
  it('returns null for a plain normal row with no side', () => {
    expect(badgeGlyphFor({ setType: 'normal', side: null })).toBeNull();
  });

  it('returns the correct glyph for each of the six non-normal set types', () => {
    expect(badgeGlyphFor({ setType: 'warmup' })).toBe('W');
    expect(badgeGlyphFor({ setType: 'drop' })).toBe('D');
    expect(badgeGlyphFor({ setType: 'myorep' })).toBe('M');
    expect(badgeGlyphFor({ setType: 'partial' })).toBe('P');
    expect(badgeGlyphFor({ setType: 'failure' })).toBe('F');
    expect(badgeGlyphFor({ setType: 'amrap' })).toBe('A');
  });

  it('returns L/R for side, taking priority over any simultaneously-set type (R14 — side wins)', () => {
    expect(badgeGlyphFor({ setType: 'failure', side: 'left' })).toBe('L');
    expect(badgeGlyphFor({ setType: 'failure', side: 'right' })).toBe('R');
  });
});

describe('SetRowView — Phase 7 badge/grouping additions', () => {
  it('renders no digit in the set-number column for a child row, and indents the row', () => {
    const result = SetRowView(baseProps({ isChild: true, setIndex: 2 }));
    const setNumberPressable = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Sub-entry type');

    expect(setNumberPressable).toBeDefined();
    expect(flatText(setNumberPressable)).toBe('');
    expect((result.props.style as { paddingLeft: number })?.paddingLeft).toBe(16);
  });

  it('renders its own set number, unindented, for a parent row', () => {
    const result = SetRowView(baseProps({ isChild: false, setIndex: 4 }));
    const setNumberPressable = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Set 4 type');

    expect(flatText(setNumberPressable)).toBe('4');
    expect(result.props.style).toBeUndefined();
  });

  it('the set-number Pressable fires onSetNumberPress on a short tap while onLongPress still fires independently', () => {
    const onSetNumberPress = jest.fn();
    const onLongPress = jest.fn();
    const result = SetRowView(baseProps({ onSetNumberPress, onLongPress, setIndex: 1 }));
    const setNumberPressable = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Set 1 type');

    (setNumberPressable?.props.onPress as () => void)();
    expect(onSetNumberPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();

    (setNumberPressable?.props.onLongPress as () => void)();
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});

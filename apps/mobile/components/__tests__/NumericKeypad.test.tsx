import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import {
  KEYPAD_KEYS,
  NumericKeypadView,
  applyKeypadPress,
  nextKeypadField,
  type NumericKeypadViewProps,
} from '../NumericKeypad';

// Same direct-invocation technique as CycleStrip.test.tsx/DayDeck.test.tsx — NumericKeypadView has
// no hooks, so calling it directly exercises its real body with no renderer.
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

function baseProps(overrides: Partial<NumericKeypadViewProps> = {}): NumericKeypadViewProps {
  return {
    field: 'weight',
    stepAmount: 2.5,
    colors: COLORS,
    onPress: jest.fn(),
    onSubmit: jest.fn(),
    ...overrides,
  };
}

describe('nextKeypadField', () => {
  it('walks weight -> reps -> rir -> null', () => {
    expect(nextKeypadField('weight')).toBe('reps');
    expect(nextKeypadField('reps')).toBe('rir');
    expect(nextKeypadField('rir')).toBeNull();
  });
});

describe('applyKeypadPress', () => {
  it('appends a digit to an empty value', () => {
    expect(applyKeypadPress(null, { kind: 'digit', digit: '5' })).toBe('5');
  });

  it('appends a digit to an existing value', () => {
    expect(applyKeypadPress('10', { kind: 'digit', digit: '2' })).toBe('102');
  });

  it('adds a decimal point once', () => {
    expect(applyKeypadPress('10', { kind: 'decimal' })).toBe('10.');
  });

  it('refuses a second decimal point', () => {
    expect(applyKeypadPress('10.5', { kind: 'decimal' })).toBe('10.5');
  });

  it('backspaces a character off the end', () => {
    expect(applyKeypadPress('102', { kind: 'backspace' })).toBe('10');
  });

  it('backspacing the last character returns null, not an empty string', () => {
    expect(applyKeypadPress('1', { kind: 'backspace' })).toBeNull();
  });

  it('backspacing a null value stays null', () => {
    expect(applyKeypadPress(null, { kind: 'backspace' })).toBeNull();
  });

  it('increments a null value from zero by the given amount', () => {
    expect(applyKeypadPress(null, { kind: 'increment', amount: 2.5 })).toBe('2.5');
  });

  it('decrements and clamps at zero rather than going negative', () => {
    expect(applyKeypadPress('1', { kind: 'decrement', amount: 2.5 })).toBe('0');
  });

  it('increments an integer value by an integer amount with no stray decimal', () => {
    expect(applyKeypadPress('8', { kind: 'increment', amount: 1 })).toBe('9');
  });
});

describe('KEYPAD_KEYS', () => {
  it('is fixed at 12 keys — the 3x4 digit grid plus decimal and backspace, in every session', () => {
    expect(KEYPAD_KEYS).toHaveLength(12);
    expect(KEYPAD_KEYS).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace']);
  });
});

describe('NumericKeypadView', () => {
  it('renders exactly 12 digit-grid keys plus the two steppers plus the submit arrow', () => {
    const result = NumericKeypadView(baseProps());
    const buttons = findByType(result, Pressable);

    expect(buttons).toHaveLength(15);
  });

  it('pressing a digit key calls onPress with a digit press carrying that digit', () => {
    const onPress = jest.fn();
    const result = NumericKeypadView(baseProps({ onPress }));
    const key = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === '7');

    (key?.props.onPress as () => void)();

    expect(onPress).toHaveBeenCalledWith({ kind: 'digit', digit: '7' });
  });

  it('pressing the stepper keys calls onPress with the caller-supplied stepAmount', () => {
    const onPress = jest.fn();
    const result = NumericKeypadView(baseProps({ onPress, stepAmount: 5 }));

    (findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Increase')?.props.onPress as () => void)();
    (findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Decrease')?.props.onPress as () => void)();

    expect(onPress).toHaveBeenCalledWith({ kind: 'increment', amount: 5 });
    expect(onPress).toHaveBeenCalledWith({ kind: 'decrement', amount: 5 });
  });

  it('the submit arrow reads a chevron affordance on weight/reps and calls onSubmit', () => {
    const onSubmit = jest.fn();
    const result = NumericKeypadView(baseProps({ field: 'weight', onSubmit }));
    const submit = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Next field');

    expect(submit).toBeDefined();
    (submit?.props.onPress as () => void)();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('the submit arrow reads Done on the rir field', () => {
    const result = NumericKeypadView(baseProps({ field: 'rir' }));

    expect(findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Done')).toBeDefined();
    expect(findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Next field')).toBeUndefined();
  });

  it('reserves a 40px empty band ahead of the digit grid (R8 — no content this phase)', () => {
    const result = NumericKeypadView(baseProps());
    const [reservedBand] = result.props.children as ReactNode[];
    expect((reservedBand as AnyElement).props.style).toEqual({ height: 40 });
  });

  it('never truncates a key glyph (R4) — no numberOfLines, no ellipsizeMode', () => {
    const result = NumericKeypadView(baseProps());
    for (const text of findByType(result, Text)) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.ellipsizeMode).toBeUndefined();
    }
  });

  it('contains no TextInput anywhere', () => {
    // Structural guard mirroring the acceptance criterion's comment-filtered grep — asserted here
    // too so a future refactor that reintroduces TextInput fails a fast unit test, not only CI's
    // grep step.
    const result = NumericKeypadView(baseProps());
    const serialized = JSON.stringify(result, (key, value) => (key === 'colors' ? undefined : value));
    expect(serialized).not.toContain('TextInput');
  });
});

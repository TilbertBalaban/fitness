import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { formatEditingHeader, SessionDateFieldView, type SessionDateFieldViewProps } from '../SessionDateField';

// Same direct-invocation technique as ExerciseStrip.test.tsx — SessionDateFieldView has no hooks,
// so calling it directly exercises its real body with no renderer.
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

function findAll(node: ReactNode, found: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, found);
    return found;
  }
  const element = node as AnyElement;
  found.push(element);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findAll(children, found);
  return found;
}

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

function baseProps(overrides: Partial<SessionDateFieldViewProps> = {}): SessionDateFieldViewProps {
  return {
    localDate: '2026-08-18',
    open: false,
    displayedYear: 2026,
    displayedMonth: 7,
    colors: COLORS,
    onToggle: jest.fn(),
    onNavigateMonth: jest.fn(),
    onSelectDay: jest.fn(),
    ...overrides,
  };
}

describe('formatEditingHeader', () => {
  it('returns "Editing {Weekday, Month D}" for a known date', () => {
    // 2026-08-18 is a Tuesday.
    expect(formatEditingHeader('2026-08-18')).toBe('Editing Tuesday, Aug 18');
  });

  it('never resolves the reading device’s own timezone — reads the stamped string only', () => {
    expect(formatEditingHeader('2026-01-01')).toBe('Editing Thursday, Jan 1');
    expect(formatEditingHeader('2026-12-31')).toBe('Editing Thursday, Dec 31');
  });
});

describe('SessionDateFieldView', () => {
  it('presents the session’s current date as its field value', () => {
    const result = SessionDateFieldView(baseProps({ localDate: '2026-08-18' }));
    const texts = findAll(result).filter((el) => el.type === Text);
    const flat = texts.map((el) => (el.props.children as unknown)).join(' ');
    expect(flat).toContain('Tuesday, Aug 18');
  });

  it('sets no numberOfLines anywhere — the date line wraps rather than truncates (R4)', () => {
    const result = SessionDateFieldView(baseProps());
    const texts = findAll(result).filter((el) => el.type === Text);
    for (const text of texts) {
      expect(text.props.numberOfLines).toBeUndefined();
    }
  });

  it('tapping the field calls onToggle', () => {
    const onToggle = jest.fn();
    const result = SessionDateFieldView(baseProps({ onToggle }));
    const [field] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Change session date');
    (field.props.onPress as () => void)();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders no calendar grid while closed', () => {
    const result = SessionDateFieldView(baseProps({ open: false }));
    const dayButtons = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'August 18, 2026');
    expect(dayButtons).toHaveLength(0);
  });

  it('renders the calendar grid for the displayed month while open, with the selected day marked', () => {
    const result = SessionDateFieldView(baseProps({ open: true, localDate: '2026-08-18', displayedYear: 2026, displayedMonth: 7 }));
    const [selectedDay] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'August 18, 2026');
    expect(selectedDay).toBeDefined();
    expect(selectedDay.props.accessibilityState).toEqual({ selected: true });
  });

  it('a day not matching the selected date is not marked selected', () => {
    const result = SessionDateFieldView(baseProps({ open: true, localDate: '2026-08-18', displayedYear: 2026, displayedMonth: 7 }));
    const [otherDay] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'August 5, 2026');
    expect(otherDay.props.accessibilityState).toEqual({ selected: false });
  });

  it('tapping a day calls onSelectDay with that day-of-month', () => {
    const onSelectDay = jest.fn();
    const result = SessionDateFieldView(baseProps({ open: true, onSelectDay }));
    const [day] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'August 5, 2026');
    (day.props.onPress as () => void)();
    expect(onSelectDay).toHaveBeenCalledWith(5);
  });

  it('the month navigation controls call onNavigateMonth with -1 and 1', () => {
    const onNavigateMonth = jest.fn();
    const result = SessionDateFieldView(baseProps({ open: true, onNavigateMonth }));
    const [prev] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Previous month');
    const [next] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Next month');
    (prev.props.onPress as () => void)();
    (next.props.onPress as () => void)();
    expect(onNavigateMonth).toHaveBeenNthCalledWith(1, -1);
    expect(onNavigateMonth).toHaveBeenNthCalledWith(2, 1);
  });

  it('calls no hook — direct-invocable with no renderer', () => {
    expect(() => SessionDateFieldView(baseProps())).not.toThrow();
    expect(() => SessionDateFieldView(baseProps({ open: true }))).not.toThrow();
  });
});

import { MetricEntryRowView, type MetricEntryRowViewProps } from '../MetricEntryRow';

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

function collect(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  const element = node as { props?: Record<string, unknown> };
  if (element.props) out.push(element.props);
  const children = element.props?.children;
  if (children !== undefined) collect(children, out);
  return out;
}

function renderRow(overrides: Partial<MetricEntryRowViewProps> = {}) {
  return MetricEntryRowView({
    valueLabel: '82.40 kg',
    dateLabel: '12 Aug',
    timeLabel: '7:45 AM',
    onPress: jest.fn(),
    ...overrides,
  });
}

describe('MetricEntryRowView (S6 anatomy)', () => {
  it('renders the value on line one and date · time on line two', () => {
    const text = findText(renderRow()).join(' ');

    expect(text).toContain('82.40 kg');
    expect(text).toContain('12 Aug');
    expect(text).toContain('7:45 AM');
  });

  it('announces the value, date and time together in one accessibility label', () => {
    const pressables = collect(renderRow()).filter((props) => typeof props.onPress === 'function');

    expect(pressables).toHaveLength(1);
    expect(pressables[0].accessibilityLabel).toBe('82.40 kg, logged 12 Aug at 7:45 AM');
  });

  it('calls onPress when the row is pressed, opening the entry action sheet', () => {
    const onPress = jest.fn();
    const [pressable] = collect(renderRow({ onPress })).filter((props) => typeof props.onPress === 'function');

    (pressable.onPress as () => void)();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // R4: a long value or date/time line wraps and grows, rather than truncating.
  it('sets no line clamp on either line', () => {
    const clamped = collect(renderRow()).filter((props) => props.numberOfLines !== undefined);

    expect(clamped).toHaveLength(0);
  });

  it('holds the 48-unit minimum height on the press target', () => {
    const [pressable] = collect(renderRow()).filter((props) => typeof props.onPress === 'function');
    const style = pressable.style as { minHeight?: number };

    expect(style.minHeight).toBe(48);
  });
});

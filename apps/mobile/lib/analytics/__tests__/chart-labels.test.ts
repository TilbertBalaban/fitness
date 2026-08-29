import { formatChartDateLabel, pluralizeCount } from '../chart-labels';

describe('formatChartDateLabel', () => {
  it('renders the stamped local date as a short day-and-month label', () => {
    expect(formatChartDateLabel('2026-08-12')).toBe('12 Aug');
    expect(formatChartDateLabel('2026-01-01')).toBe('1 Jan');
    expect(formatChartDateLabel('2026-12-31')).toBe('31 Dec');
  });

  it('renders identically regardless of the reading device timezone', () => {
    const original = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati';
    const ahead = formatChartDateLabel('2026-08-12');
    process.env.TZ = 'Pacific/Niue';
    const behind = formatChartDateLabel('2026-08-12');
    process.env.TZ = original;

    expect(ahead).toBe(behind);
    expect(ahead).toBe('12 Aug');
  });

  it('returns the raw string for an unparseable date rather than inventing a label', () => {
    expect(formatChartDateLabel('not-a-date')).toBe('not-a-date');
  });
});

describe('pluralizeCount', () => {
  it('uses the singular form for exactly one', () => {
    expect(pluralizeCount(1, 'session', 'sessions')).toBe('1 session');
  });

  it('uses the plural form for every other count', () => {
    expect(pluralizeCount(0, 'session', 'sessions')).toBe('0 sessions');
    expect(pluralizeCount(3, 'session', 'sessions')).toBe('3 sessions');
  });
});

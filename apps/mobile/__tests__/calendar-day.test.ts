import { captureCalendarDay, type CalendarDayStamp } from '../lib/calendar-day';

describe('captureCalendarDay', () => {
  it('returns the given IANA zone and a YYYY-MM-DD local date for the instant', () => {
    const stamp = captureCalendarDay(new Date('2026-06-15T12:00:00Z'), 'America/Los_Angeles');
    expect(stamp).toEqual<CalendarDayStamp>({ timezone: 'America/Los_Angeles', localDate: '2026-06-15' });
  });

  it('defaults the zone to the host process IANA timezone when none is given', () => {
    const stamp = captureCalendarDay(new Date());
    expect(typeof stamp.timezone).toBe('string');
    expect(stamp.timezone.length).toBeGreaterThan(0);
  });

  it('stamps a 23:45 local start with that day, not the next one', () => {
    // 23:45 America/New_York (EDT, UTC-4) on 2026-06-15 == 2026-06-16T03:45:00Z
    const stamp = captureCalendarDay(new Date('2026-06-16T03:45:00Z'), 'America/New_York');
    expect(stamp.localDate).toBe('2026-06-15');
  });

  it('stamps a 00:15 local start with that day, not the previous one', () => {
    // 00:15 America/New_York (EDT, UTC-4) on 2026-06-16 == 2026-06-16T04:15:00Z
    const stamp = captureCalendarDay(new Date('2026-06-16T04:15:00Z'), 'America/New_York');
    expect(stamp.localDate).toBe('2026-06-16');
  });

  it('keeps the day a session began on even when it crosses midnight before finishing', () => {
    const startedAt = new Date('2026-06-16T03:45:00Z'); // 23:45 local, June 15
    const endedAt = new Date('2026-06-16T04:20:00Z'); // 00:20 local, June 16

    const startStamp = captureCalendarDay(startedAt, 'America/New_York');
    const endInstantStamp = captureCalendarDay(endedAt, 'America/New_York');

    // The two instants genuinely land on different calendar days — proving that a session's
    // local_date must come from startedAt alone, captured once, never recomputed from endedAt.
    expect(startStamp.localDate).toBe('2026-06-15');
    expect(endInstantStamp.localDate).toBe('2026-06-16');
  });

  it('returns the stored day unchanged when read from a process running in a different timezone', () => {
    const stamp = captureCalendarDay(new Date('2026-06-16T03:45:00Z'), 'America/New_York');

    const originalTz = process.env.TZ;
    process.env.TZ = 'Asia/Tokyo';
    try {
      // Merely reading the already-captured stamp — no new captureCalendarDay call — must return
      // the original day regardless of the reading process's own zone (PITFALLS §12).
      expect(stamp.localDate).toBe('2026-06-15');
      expect(stamp.timezone).toBe('America/New_York');
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('yields the correct local day on a date with a DST transition', () => {
    // 2026-03-08 is the US spring-forward DST transition (2am -> 3am, EST -> EDT).
    // 01:30 America/New_York, still EST (UTC-5) before the jump: 2026-03-08T06:30:00Z.
    const stamp = captureCalendarDay(new Date('2026-03-08T06:30:00Z'), 'America/New_York');
    expect(stamp.localDate).toBe('2026-03-08');
  });
});

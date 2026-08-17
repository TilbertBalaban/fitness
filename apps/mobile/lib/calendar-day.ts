export interface CalendarDayStamp {
  timezone: string;
  localDate: string;
}

// The one place this codebase reads the device's IANA zone (grep-enforced, see calendar-day.test).
// Every other call site must be handed a stamp captured here — never re-derive its own, and never
// recompute local_date from started_at on a later read (PITFALLS §12).
export function captureCalendarDay(instant: Date, timezone?: string): CalendarDayStamp {
  const resolvedTimezone = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // en-CA's date format is the only locale/format combination that reliably yields YYYY-MM-DD
  // regardless of the host's own locale.
  const localDate = instant.toLocaleDateString('en-CA', { timeZone: resolvedTimezone });
  return { timezone: resolvedTimezone, localDate };
}

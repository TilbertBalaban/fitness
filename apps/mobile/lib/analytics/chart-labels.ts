const MONTH_ABBREVIATIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Splits and indexes the stamped "YYYY-MM-DD" string, exactly as history-query.ts's own
// formatHistoryDate does. A locale-aware API here would silently re-derive the day from the READING
// device's timezone, so the same session would carry different axis dates on a phone and a browser.
export function formatChartDateLabel(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return localDate;
  const monthName = MONTH_ABBREVIATIONS[month - 1];
  if (monthName === undefined) return localDate;
  return `${day} ${monthName}`;
}

// A shared export rather than a reuse of WorkoutSummary.tsx's private `pluralize`: that file
// belongs to 09-03 and R15 forbids incidental edits to it.
export function pluralizeCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

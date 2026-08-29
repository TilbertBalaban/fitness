// D-10: there is no clock in this file and none anywhere in this package. Every boundary below is
// derived backwards from a `todayLocalDate` argument, which is what makes each aggregation
// reproducible from its arguments alone and keeps Phase 10's server-side parity story intact when
// it aggregates the same rows.

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function formatUtcDate(instant: Date): string {
  return `${instant.getUTCFullYear()}-${pad2(instant.getUTCMonth() + 1)}-${pad2(instant.getUTCDate())}`;
}

// Splits and indexes the stamped "YYYY-MM-DD" string and re-formats by index off a UTC-anchored
// Date, exactly as history-query.ts's formatHistoryDate does. A locale-aware `Date` constructor, a
// `toLocale`-family formatter or any `Intl` call here would re-derive the day from the READING
// device's own zone — a phone in Kiritimati and one in Niue would then disagree about which week a
// session falls in, for identical stored rows. That recomputation is the hazard, not the formatting.
export function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return formatUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

// The window is INCLUSIVE on both ends: it contains `todayLocalDate` itself, so it starts
// `windowDays - 1` days earlier. Stated here because the off-by-one is invisible in the rendered
// card — the whole feature would quietly measure a day too many or a day too few and still look
// entirely plausible.
export function rollingWindowStart(todayLocalDate: string, windowDays: number): string {
  return addDaysToLocalDate(todayLocalDate, -(windowDays - 1));
}

// `key` is the bucket's own start date, so it serves as a stable React key and a stable sort key
// at once without a second identifier to keep in step.
export interface Bucket {
  key: string;
  startLocalDate: string;
  endLocalDate: string;
}

export interface TrailingBucketsInput {
  todayLocalDate: string;
  bucketCount: number;
  bucketDays: number;
}

// Boundaries walk backwards from `todayLocalDate`, so they carry the same rolling semantics as
// rollingWindowStart and never a locale calendar week (D-07). Calendar-week bucketing would need a
// first-day-of-week rule; that rule is locale-dependent, and Phase 8 already had to design around
// exactly that class of hazard rather than absorb it.
export function trailingBuckets({ todayLocalDate, bucketCount, bucketDays }: TrailingBucketsInput): Bucket[] {
  const buckets: Bucket[] = [];
  for (let index = 0; index < bucketCount; index += 1) {
    const bucketsFromEnd = bucketCount - 1 - index;
    const endLocalDate = addDaysToLocalDate(todayLocalDate, -(bucketDays * bucketsFromEnd));
    const startLocalDate = addDaysToLocalDate(endLocalDate, -(bucketDays - 1));
    buckets.push({ key: startLocalDate, startLocalDate, endLocalDate });
  }
  return buckets;
}

// Both ends are inclusive and the buckets do not overlap, so a date belongs to at most one. A
// "YYYY-MM-DD" string compares lexicographically in the same order it compares chronologically,
// so no parse is needed here.
export function bucketIndexForLocalDate(localDate: string, buckets: Bucket[]): number | null {
  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index];
    if (localDate >= bucket.startLocalDate && localDate <= bucket.endLocalDate) return index;
  }
  return null;
}

import { PROGRESS_WINDOW_DAYS, TREND_BUCKET_DAYS, TREND_WEEKS } from '../constants';
import { addDaysToLocalDate, bucketIndexForLocalDate, rollingWindowStart, trailingBuckets } from '../bucketing';

describe('addDaysToLocalDate', () => {
  it('crosses a month boundary backwards and forwards in a non-leap year', () => {
    expect(addDaysToLocalDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToLocalDate('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('crosses February in a leap year without skipping the 29th', () => {
    expect(addDaysToLocalDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysToLocalDate('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('crosses a year boundary', () => {
    expect(addDaysToLocalDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysToLocalDate('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('pads single-digit months and days back to the stamped YYYY-MM-DD shape', () => {
    expect(addDaysToLocalDate('2026-09-30', 2)).toBe('2026-10-02');
    expect(addDaysToLocalDate('2026-10-02', -2)).toBe('2026-09-30');
  });

  it('returns the same date for a zero offset', () => {
    expect(addDaysToLocalDate('2026-08-29', 0)).toBe('2026-08-29');
  });
});

describe('every boundary is anchored to UTC, never to the running process zone', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  // Kiritimati is UTC+14 and Niue is UTC-11: a locale-aware constructor or formatter anywhere in
  // bucketing.ts would land these two on different calendar days and one of these cases would fail.
  it.each(['UTC', 'Pacific/Kiritimati', 'Pacific/Niue'])('produces identical boundaries under %s', (zone) => {
    process.env.TZ = zone;

    expect(addDaysToLocalDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(rollingWindowStart('2026-01-01', PROGRESS_WINDOW_DAYS)).toBe('2025-12-26');
    expect(trailingBuckets({ todayLocalDate: '2026-01-01', bucketCount: 2, bucketDays: TREND_BUCKET_DAYS })).toEqual([
      { key: '2025-12-19', startLocalDate: '2025-12-19', endLocalDate: '2025-12-25' },
      { key: '2025-12-26', startLocalDate: '2025-12-26', endLocalDate: '2026-01-01' },
    ]);
  });
});

describe('rollingWindowStart', () => {
  it('includes the supplied day, so a seven-day window starts six days earlier', () => {
    expect(rollingWindowStart('2026-08-29', PROGRESS_WINDOW_DAYS)).toBe('2026-08-23');
  });

  it('returns the supplied day itself for a one-day window', () => {
    expect(rollingWindowStart('2026-08-29', 1)).toBe('2026-08-29');
  });

  it('spans exactly windowDays inclusive days', () => {
    const start = rollingWindowStart('2026-08-29', PROGRESS_WINDOW_DAYS);
    expect(addDaysToLocalDate(start, PROGRESS_WINDOW_DAYS - 1)).toBe('2026-08-29');
    expect(addDaysToLocalDate(start, -1)).toBe('2026-08-22');
  });
});

describe('trailingBuckets', () => {
  it('returns exactly the requested count, oldest first, with the last bucket ending on the supplied date', () => {
    const buckets = trailingBuckets({
      todayLocalDate: '2026-08-29',
      bucketCount: TREND_WEEKS,
      bucketDays: TREND_BUCKET_DAYS,
    });

    expect(buckets).toHaveLength(TREND_WEEKS);
    expect(buckets[buckets.length - 1].endLocalDate).toBe('2026-08-29');
    expect(buckets[buckets.length - 1].startLocalDate).toBe('2026-08-23');
    expect(buckets[0].startLocalDate).toBe('2026-06-07');
    expect(buckets[0].endLocalDate).toBe('2026-06-13');

    const startsAscending = buckets.map((bucket) => bucket.startLocalDate);
    expect([...startsAscending].sort()).toEqual(startsAscending);
  });

  it('gives every bucket a key equal to its own start date, so it is a stable React key and sort key at once', () => {
    const buckets = trailingBuckets({ todayLocalDate: '2026-08-29', bucketCount: 3, bucketDays: TREND_BUCKET_DAYS });

    expect(buckets.map((bucket) => bucket.key)).toEqual(buckets.map((bucket) => bucket.startLocalDate));
    expect(new Set(buckets.map((bucket) => bucket.key)).size).toBe(3);
  });

  it('lays buckets end to end with no gap and no overlap', () => {
    const buckets = trailingBuckets({ todayLocalDate: '2026-08-29', bucketCount: 4, bucketDays: TREND_BUCKET_DAYS });

    for (let index = 1; index < buckets.length; index += 1) {
      expect(buckets[index].startLocalDate).toBe(addDaysToLocalDate(buckets[index - 1].endLocalDate, 1));
    }
    for (const bucket of buckets) {
      expect(addDaysToLocalDate(bucket.startLocalDate, TREND_BUCKET_DAYS - 1)).toBe(bucket.endLocalDate);
    }
  });

  it('does not depend on which weekday the supplied date falls on', () => {
    // 2026-08-24 is a Monday and 2026-08-29 is a Saturday; a calendar-week bucketing would snap
    // both to the same Monday boundary. A rolling bucketing must not (D-07).
    const monday = trailingBuckets({ todayLocalDate: '2026-08-24', bucketCount: 2, bucketDays: TREND_BUCKET_DAYS });
    const saturday = trailingBuckets({ todayLocalDate: '2026-08-29', bucketCount: 2, bucketDays: TREND_BUCKET_DAYS });

    expect(monday[monday.length - 1].endLocalDate).toBe('2026-08-24');
    expect(saturday[saturday.length - 1].endLocalDate).toBe('2026-08-29');

    const shape = (start: string) => addDaysToLocalDate(start, TREND_BUCKET_DAYS - 1);
    expect(shape(monday[0].startLocalDate)).toBe(monday[0].endLocalDate);
    expect(shape(saturday[0].startLocalDate)).toBe(saturday[0].endLocalDate);
  });

  it('returns an empty list for a zero bucket count', () => {
    expect(trailingBuckets({ todayLocalDate: '2026-08-29', bucketCount: 0, bucketDays: TREND_BUCKET_DAYS })).toEqual([]);
  });
});

describe('bucketIndexForLocalDate', () => {
  const buckets = trailingBuckets({ todayLocalDate: '2026-08-29', bucketCount: 3, bucketDays: TREND_BUCKET_DAYS });

  it('resolves a date inside a bucket to that bucket', () => {
    expect(bucketIndexForLocalDate('2026-08-26', buckets)).toBe(2);
    expect(bucketIndexForLocalDate('2026-08-19', buckets)).toBe(1);
    expect(bucketIndexForLocalDate('2026-08-12', buckets)).toBe(0);
  });

  it('treats both ends of a bucket as inclusive', () => {
    for (let index = 0; index < buckets.length; index += 1) {
      expect(bucketIndexForLocalDate(buckets[index].startLocalDate, buckets)).toBe(index);
      expect(bucketIndexForLocalDate(buckets[index].endLocalDate, buckets)).toBe(index);
    }
  });

  it('never resolves one date to two buckets', () => {
    const start = buckets[0].startLocalDate;
    for (let offset = 0; offset < buckets.length * TREND_BUCKET_DAYS; offset += 1) {
      const date = addDaysToLocalDate(start, offset);
      const matches = buckets.filter(
        (bucket) => date >= bucket.startLocalDate && date <= bucket.endLocalDate,
      );
      expect(matches).toHaveLength(1);
      expect(bucketIndexForLocalDate(date, buckets)).toBe(buckets.indexOf(matches[0]));
    }
  });

  it('returns null for a date before the oldest bucket', () => {
    expect(bucketIndexForLocalDate(addDaysToLocalDate(buckets[0].startLocalDate, -1), buckets)).toBeNull();
  });

  it('returns null for a date in the future relative to the supplied day', () => {
    expect(bucketIndexForLocalDate('2026-08-30', buckets)).toBeNull();
    expect(bucketIndexForLocalDate('2027-01-01', buckets)).toBeNull();
  });

  it('returns null against an empty bucket list', () => {
    expect(bucketIndexForLocalDate('2026-08-29', [])).toBeNull();
  });
});

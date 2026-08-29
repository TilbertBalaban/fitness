import { MUSCLE_GROUPS } from '@fitness/api-contracts';
import { PROGRESS_WINDOW_DAYS } from '../constants';
import {
  MUSCLE_GROUP_FIGURE_SIDE,
  MUSCLE_MAP_ROLLUP_WINDOWS,
  MUSCLE_MAP_ROW_ORDER,
  MUSCLE_MAP_WINDOW_CHIP_LABELS,
  MUSCLE_MAP_WINDOW_DAYS,
  MUSCLE_MAP_WINDOW_LABELS,
  MUSCLE_MAP_WINDOWS,
  windowReadsRollup,
} from '../muscle-map';

describe('MUSCLE_GROUP_FIGURE_SIDE', () => {
  it('has exactly one entry for every member of MUSCLE_GROUPS and no entry for anything else', () => {
    const coveredIds = Object.keys(MUSCLE_GROUP_FIGURE_SIDE);
    expect(coveredIds).toHaveLength(MUSCLE_GROUPS.length);
    for (const muscleGroupId of MUSCLE_GROUPS) {
      expect(MUSCLE_GROUP_FIGURE_SIDE[muscleGroupId]).toBeDefined();
    }
    for (const id of coveredIds) {
      expect(MUSCLE_GROUPS as readonly string[]).toContain(id);
    }
  });

  it('assigns exactly ten muscle groups to the front figure and nine to the back', () => {
    const sides = Object.values(MUSCLE_GROUP_FIGURE_SIDE);
    expect(sides.filter((side) => side === 'front')).toHaveLength(10);
    expect(sides.filter((side) => side === 'back')).toHaveLength(9);
  });
});

describe('MUSCLE_MAP_ROW_ORDER', () => {
  it('together contains every muscle group exactly once, with no duplicate and no omission', () => {
    const combined = [...MUSCLE_MAP_ROW_ORDER.front, ...MUSCLE_MAP_ROW_ORDER.back];
    expect(combined).toHaveLength(MUSCLE_GROUPS.length);
    expect(new Set(combined).size).toBe(MUSCLE_GROUPS.length);
    for (const muscleGroupId of MUSCLE_GROUPS) {
      expect(combined).toContain(muscleGroupId);
    }
  });

  it('each list contains only groups whose MUSCLE_GROUP_FIGURE_SIDE matches its own side', () => {
    for (const muscleGroupId of MUSCLE_MAP_ROW_ORDER.front) {
      expect(MUSCLE_GROUP_FIGURE_SIDE[muscleGroupId]).toBe('front');
    }
    for (const muscleGroupId of MUSCLE_MAP_ROW_ORDER.back) {
      expect(MUSCLE_GROUP_FIGURE_SIDE[muscleGroupId]).toBe('back');
    }
  });
});

describe('MUSCLE_MAP_WINDOW_DAYS', () => {
  it("['1w'] equals PROGRESS_WINDOW_DAYS", () => {
    expect(MUSCLE_MAP_WINDOW_DAYS['1w']).toBe(PROGRESS_WINDOW_DAYS);
  });

  it('1m is 30 and 3m is 90', () => {
    expect(MUSCLE_MAP_WINDOW_DAYS['1m']).toBe(30);
    expect(MUSCLE_MAP_WINDOW_DAYS['3m']).toBe(90);
  });
});

describe('MUSCLE_MAP_WINDOW_LABELS', () => {
  it('interpolates MUSCLE_MAP_WINDOW_DAYS, so changing a window length changes the label', () => {
    for (const id of MUSCLE_MAP_WINDOWS) {
      expect(MUSCLE_MAP_WINDOW_LABELS[id]).toBe(`the last ${MUSCLE_MAP_WINDOW_DAYS[id]} days`);
    }
  });

  it('contains no week, month, weekday name or date-of-month reference in any of the three values', () => {
    const forbidden = /\b(week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
    for (const id of MUSCLE_MAP_WINDOWS) {
      expect(MUSCLE_MAP_WINDOW_LABELS[id]).not.toMatch(forbidden);
    }
  });
});

describe('MUSCLE_MAP_WINDOW_CHIP_LABELS', () => {
  it('matches the copywriting contract verbatim', () => {
    expect(MUSCLE_MAP_WINDOW_CHIP_LABELS).toEqual({ '1w': '1 Week', '1m': '1 Month', '3m': '3 Months' });
  });
});

describe('windowReadsRollup', () => {
  it('is false for 1w and true for 1m and 3m', () => {
    expect(windowReadsRollup('1w')).toBe(false);
    expect(windowReadsRollup('1m')).toBe(true);
    expect(windowReadsRollup('3m')).toBe(true);
  });

  it('agrees with MUSCLE_MAP_ROLLUP_WINDOWS membership', () => {
    for (const id of MUSCLE_MAP_WINDOWS) {
      expect(windowReadsRollup(id)).toBe((MUSCLE_MAP_ROLLUP_WINDOWS as readonly string[]).includes(id));
    }
  });
});

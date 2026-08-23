import {
  countableHistory,
  cycleSpan,
  lastLoggedDayIndex,
  resolveNextUp,
  type PositionCycle,
  type PositionDay,
  type SessionRecord,
} from '../next-up';

interface TestDay extends PositionDay {
  name: string;
}

interface TestCycle extends PositionCycle {
  name: string;
}

const ROUTINE = { id: 'r1' };

function day(id: string, orderIndex: number, name = id.toUpperCase()): TestDay {
  return { id, orderIndex, name };
}

function cycle(
  id: string,
  orderIndex: number,
  kind: TestCycle['kind'],
  durationDays: number | null = null,
): TestCycle {
  return { id, orderIndex, kind, durationDays, name: id.toUpperCase() };
}

function session(
  id: string,
  routineDayId: string | null,
  localDate: string,
  status = 'completed',
  startedAt = `${localDate}T10:00:00.000Z`,
): SessionRecord {
  return { id, routineDayId, status, localDate, startedAt };
}

const DAYS = [day('a', 1024), day('b', 2048), day('c', 3072)];

// n sessions logged in rotation order starting at day A, one per calendar day from 2026-01-01.
function rotationHistory(n: number, days: TestDay[] = DAYS): SessionRecord[] {
  return Array.from({ length: n }, (_, i) =>
    session(`s${i}`, days[i % days.length].id, `2026-01-${String(i + 1).padStart(2, '0')}`),
  );
}

describe('countableHistory', () => {
  it('returns an empty list for an empty history', () => {
    expect(countableHistory([], DAYS)).toEqual([]);
  });

  it('excludes a session whose status is not completed', () => {
    const history = [
      session('s1', 'a', '2026-01-01'),
      session('s2', 'b', '2026-01-02', 'in_progress'),
      session('s3', 'c', '2026-01-03', 'abandoned'),
    ];
    expect(countableHistory(history, DAYS).map((row) => row.id)).toEqual(['s1']);
  });

  it('excludes a session with a null routineDayId — a one-off workout is not part of the rotation', () => {
    const history = [session('s1', 'a', '2026-01-01'), session('s2', null, '2026-01-02')];
    expect(countableHistory(history, DAYS).map((row) => row.id)).toEqual(['s1']);
  });

  it('excludes a session logged against a day that no longer exists in the routine', () => {
    const history = [session('s1', 'a', '2026-01-01'), session('s2', 'deleted-day', '2026-01-02')];
    expect(countableHistory(history, DAYS).map((row) => row.id)).toEqual(['s1']);
  });

  it('orders by localDate, then startedAt, then id', () => {
    const history = [
      session('s3', 'c', '2026-01-02', 'completed', '2026-01-02T09:00:00.000Z'),
      session('s1', 'a', '2026-01-01'),
      session('s4', 'a', '2026-01-02', 'completed', '2026-01-02T08:00:00.000Z'),
      session('s2', 'b', '2026-01-02', 'completed', '2026-01-02T09:00:00.000Z'),
    ];
    expect(countableHistory(history, DAYS).map((row) => row.id)).toEqual(['s1', 's4', 's2', 's3']);
  });
});

describe('lastLoggedDayIndex', () => {
  it('is null with no completed history', () => {
    expect(lastLoggedDayIndex([], DAYS)).toBeNull();
  });

  it('is the index of the most recently logged day', () => {
    expect(lastLoggedDayIndex(rotationHistory(2), DAYS)).toBe(1);
  });

  it('is null when the most recently logged day has since been deleted from the routine', () => {
    const history = [...rotationHistory(2), session('s9', 'deleted-day', '2026-01-09')];
    expect(lastLoggedDayIndex(history, DAYS)).toBeNull();
  });
});

describe('cycleSpan', () => {
  it('gives a training cycle a full rotation of days', () => {
    expect(cycleSpan(cycle('c1', 1024, 'training'), 3)).toBe(3);
  });

  it('gives a deload cycle a full rotation of days — a deload is trained', () => {
    expect(cycleSpan(cycle('c1', 1024, 'deload'), 3)).toBe(3);
  });

  it('gives a time_off cycle no rotation positions — its length is measured in calendar days', () => {
    expect(cycleSpan(cycle('c1', 1024, 'time_off', 7), 3)).toBe(0);
  });
});

describe('resolveNextUp — empty and degenerate inputs', () => {
  it('reports no active program when there is no routine', () => {
    expect(
      resolveNextUp<TestDay, TestCycle>({
        routine: null,
        days: [],
        cycles: [],
        history: [],
        today: '2026-01-01',
      }).kind,
    ).toBe('no-active-program');
  });

  it('reports no days for a routine with zero days', () => {
    expect(
      resolveNextUp<TestDay, TestCycle>({
        routine: ROUTINE,
        days: [],
        cycles: [cycle('c1', 1024, 'training')],
        history: [],
        today: '2026-01-01',
      }).kind,
    ).toBe('no-days');
  });

  it('resolves a cycle-less routine to its first day with a null cycle', () => {
    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [],
      history: [],
      today: '2026-01-01',
    });
    expect(result).toMatchObject({ kind: 'workout', cycle: null, day: DAYS[0] });
  });

  it('loops a cycle-less routine back to its first day after a full rotation', () => {
    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [],
      history: rotationHistory(3),
      today: '2026-01-10',
    });
    expect(result).toMatchObject({ kind: 'workout', cycle: null, day: DAYS[0] });
  });

  it('advances a cycle-less routine to days[n % dayCount] after n sessions', () => {
    for (let n = 0; n < 7; n++) {
      const result = resolveNextUp<TestDay, TestCycle>({
        routine: ROUTINE,
        days: DAYS,
        cycles: [],
        history: rotationHistory(n),
        today: '2026-01-20',
      });
      expect(result).toMatchObject({ kind: 'workout', day: DAYS[n % DAYS.length] });
    }
  });

  it('resolves a single-cycle routine with no history to that cycle and its first day', () => {
    const only = cycle('c1', 1024, 'training');
    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [only],
      history: [],
      today: '2026-01-01',
    });
    expect(result).toMatchObject({ kind: 'workout', cycle: only, day: DAYS[0] });
  });
});

describe('resolveNextUp — walking the cycle list', () => {
  const w1 = cycle('w1', 1024, 'training');
  const w2 = cycle('w2', 2048, 'training');
  const cycles = [w1, w2];

  function at(sessions: number) {
    return resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles,
      history: rotationHistory(sessions),
      today: '2026-02-01',
    });
  }

  it('starts at the first cycle and the first day', () => {
    expect(at(0)).toMatchObject({ kind: 'workout', cycle: w1, day: DAYS[0] });
  });

  it('is still in the first cycle one session before the boundary', () => {
    expect(at(2)).toMatchObject({ kind: 'workout', cycle: w1, day: DAYS[2] });
  });

  it('rolls into the next cycle exactly at the boundary', () => {
    expect(at(3)).toMatchObject({ kind: 'workout', cycle: w2, day: DAYS[0] });
  });

  it('reaches the last day of the last cycle', () => {
    expect(at(5)).toMatchObject({ kind: 'workout', cycle: w2, day: DAYS[2] });
  });

  it('reports the block complete rather than looping back to cycle one', () => {
    expect(at(6)).toMatchObject({ kind: 'program-complete', lastCycle: w2 });
  });
});

describe('resolveNextUp — a deload is a workout', () => {
  const w1 = cycle('w1', 1024, 'training');
  const deload = cycle('dl', 2048, 'deload');
  const w2 = cycle('w2', 3072, 'training');

  it('lands on the deload cycle with kind workout when the rotation reaches it', () => {
    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [w1, deload, w2],
      history: rotationHistory(3),
      today: '2026-02-01',
    });
    expect(result).toMatchObject({ kind: 'workout', cycle: deload, day: DAYS[0] });
  });

  it('consumes a full rotation of days, exactly like a training cycle', () => {
    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [w1, deload, w2],
      history: rotationHistory(6),
      today: '2026-02-01',
    });
    expect(result).toMatchObject({ kind: 'workout', cycle: w2, day: DAYS[0] });
  });

  it('resolves a deload placed first with no history', () => {
    const first = cycle('dl', 512, 'deload');
    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [first, w1, w2],
      history: [],
      today: '2026-02-01',
    });
    expect(result).toMatchObject({ kind: 'workout', cycle: first, day: DAYS[0] });
  });

  it('resolves a deload placed last after both training cycles are done', () => {
    const last = cycle('dl', 4096, 'deload');
    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [w1, cycle('w2', 2048, 'training'), last],
      history: rotationHistory(6),
      today: '2026-02-01',
    });
    expect(result).toMatchObject({ kind: 'workout', cycle: last, day: DAYS[0] });
  });
});

describe('resolveNextUp — time off', () => {
  const w1 = cycle('w1', 1024, 'training');
  const off = cycle('off', 2048, 'time_off', 7);
  const w2 = cycle('w2', 3072, 'training');

  // Three sessions on 2026-01-01..03, so the last one is 2026-01-03.
  function afterRotation(today: string, cycles = [w1, off, w2]) {
    return resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles,
      history: rotationHistory(3),
      today,
    });
  }

  it('reports scheduled time off with the days remaining three days in', () => {
    expect(afterRotation('2026-01-06')).toMatchObject({
      kind: 'time-off',
      cycle: off,
      daysRemaining: 4,
    });
  });

  it('still reports time off one day before it ends', () => {
    expect(afterRotation('2026-01-09')).toMatchObject({ kind: 'time-off', daysRemaining: 1 });
  });

  it('continues past the time-off cycle on the day it ends', () => {
    expect(afterRotation('2026-01-10')).toMatchObject({
      kind: 'workout',
      cycle: w2,
      day: DAYS[0],
    });
  });

  it('continues past the time-off cycle when it ended a day ago — being over is over', () => {
    expect(afterRotation('2026-01-11')).toMatchObject({
      kind: 'workout',
      cycle: w2,
      day: DAYS[0],
    });
  });

  it('measures from today when no completed session exists, yielding the full duration', () => {
    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [cycle('off', 512, 'time_off', 7), w1],
      history: [],
      today: '2026-01-01',
    });
    expect(result).toMatchObject({ kind: 'time-off', daysRemaining: 7 });
  });

  // updateCycle makes this unwritable from the builder, but two devices reconciling routine_cycle
  // by row-level LWW can still converge to it, so the walk must stay finite.
  it('steps over a time-off cycle with a null durationDays rather than stalling on it', () => {
    const broken = cycle('off', 2048, 'time_off', null);
    const result = afterRotation('2026-01-04', [w1, broken, w2]);
    expect(result).toMatchObject({ kind: 'workout', cycle: w2, day: DAYS[0] });
  });

  it('never resolves to a durationless time-off cycle, even when it is the only one left', () => {
    const broken = cycle('off', 2048, 'time_off', null);
    expect(afterRotation('2026-01-04', [w1, broken])).toMatchObject({ kind: 'program-complete' });
  });

  it('still honours a well-formed time-off cycle sitting after a durationless one', () => {
    const broken = cycle('off', 2048, 'time_off', null);
    const real = cycle('off2', 2560, 'time_off', 7);
    expect(afterRotation('2026-01-04', [w1, broken, real, w2])).toMatchObject({
      kind: 'time-off',
      cycle: real,
    });
  });

  it('resolves two consecutive time-off cycles to the first while it is active', () => {
    const off1 = cycle('off1', 2048, 'time_off', 3);
    const off2 = cycle('off2', 2560, 'time_off', 5);
    expect(afterRotation('2026-01-04', [w1, off1, off2, w2])).toMatchObject({
      kind: 'time-off',
      cycle: off1,
      daysRemaining: 2,
    });
  });

  it('chains to the second time-off cycle once the first has elapsed', () => {
    const off1 = cycle('off1', 2048, 'time_off', 3);
    const off2 = cycle('off2', 2560, 'time_off', 5);
    expect(afterRotation('2026-01-06', [w1, off1, off2, w2])).toMatchObject({
      kind: 'time-off',
      cycle: off2,
      daysRemaining: 5,
    });
    expect(afterRotation('2026-01-10', [w1, off1, off2, w2])).toMatchObject({
      kind: 'time-off',
      cycle: off2,
      daysRemaining: 1,
    });
    expect(afterRotation('2026-01-11', [w1, off1, off2, w2])).toMatchObject({
      kind: 'workout',
      cycle: w2,
    });
  });

  it('never reports a negative daysRemaining, even with a device clock behind the last session', () => {
    const result = afterRotation('2025-12-01');
    expect(result).toMatchObject({ kind: 'time-off', daysRemaining: 7 });
  });
});

describe('resolveNextUp — a day deleted after being logged against', () => {
  const w1 = cycle('w1', 1024, 'training');
  const w2 = cycle('w2', 2048, 'training');

  it('falls back silently to the first day of the current cycle', () => {
    const remaining = [day('a', 1024), day('c', 3072)];
    const history = [
      session('s0', 'a', '2026-01-01'),
      session('s1', 'b', '2026-01-02'),
    ];

    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: remaining,
      cycles: [w1, w2],
      history,
      today: '2026-01-03',
    });

    expect(result).toMatchObject({ kind: 'workout', day: remaining[0] });
  });

  it('stops counting the orphaned session toward rotation position', () => {
    const remaining = [day('a', 1024), day('c', 3072)];
    const history = [
      session('s0', 'a', '2026-01-01'),
      session('s1', 'b', '2026-01-02'),
    ];

    expect(countableHistory(history, remaining)).toHaveLength(1);
    expect(
      resolveNextUp<TestDay, TestCycle>({
        routine: ROUTINE,
        days: remaining,
        cycles: [w1, w2],
        history,
        today: '2026-01-03',
      }),
    ).toMatchObject({ cycle: w1 });
  });

  it('never surfaces the deletion as an error state', () => {
    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [w1],
      history: [session('s0', 'gone', '2026-01-01')],
      today: '2026-01-03',
    });
    expect(result.kind).toBe('workout');
  });
});

describe('resolveNextUp — determinism and bounds', () => {
  it('walks cycles sharing an orderIndex in ascending id order', () => {
    const tiedA = cycle('aaa', 1024, 'training');
    const tiedB = cycle('bbb', 1024, 'training');

    const forward = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [tiedB, tiedA],
      history: [],
      today: '2026-01-01',
    });
    const reversed = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [tiedA, tiedB],
      history: [],
      today: '2026-01-01',
    });

    expect(forward).toMatchObject({ cycle: tiedA });
    expect(reversed).toMatchObject({ cycle: tiedA });
  });

  it('visits days sharing an orderIndex in ascending id order', () => {
    const tied = [day('zz', 1024), day('aa', 1024)];
    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: tied,
      cycles: [],
      history: [],
      today: '2026-01-01',
    });
    expect(result).toMatchObject({ day: tied[1] });
  });

  it('never indexes days out of range for any session count against any cycle count', () => {
    for (let dayCount = 1; dayCount <= 4; dayCount++) {
      const days = Array.from({ length: dayCount }, (_, i) => day(`d${i}`, (i + 1) * 1024));
      for (let cycleCount = 0; cycleCount <= 3; cycleCount++) {
        const cycles = Array.from({ length: cycleCount }, (_, i) =>
          cycle(`c${i}`, (i + 1) * 1024, 'training'),
        );
        for (let sessions = 0; sessions <= 12; sessions++) {
          const result = resolveNextUp<TestDay, TestCycle>({
            routine: ROUTINE,
            days,
            cycles,
            history: rotationHistory(sessions, days),
            today: '2026-03-01',
          });
          if (result.kind === 'workout') {
            expect(days).toContain(result.day);
          } else {
            expect(result.kind).toBe('program-complete');
          }
        }
      }
    }
  });
});

// WR-05: loadNextUp's history query is not scoped to the active routine, so it returns completed
// sessions from every program the user has ever run. The countdown was seeded from that unfiltered
// list while the rotation position was seeded from countableHistory — so opening an old program and
// logging one session restarted the current program's time-off clock.
describe('resolveNextUp — time off is not reset by another program (WR-05)', () => {
  const w1 = cycle('w1', 1024, 'training');
  const off = cycle('off', 2048, 'time_off', 7);
  const w2 = cycle('w2', 3072, 'training');

  // Three sessions in this routine on 2026-01-01..03, then one logged against a day that belongs to
  // a different program entirely.
  const OTHER_PROGRAM_DAY = 'other-program-day';

  function withForeignSession(today: string, foreignDate: string) {
    return resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [w1, off, w2],
      history: [...rotationHistory(3), session('foreign', OTHER_PROGRAM_DAY, foreignDate)],
      today,
    });
  }

  it('measures elapsed time off from this program’s last session, not the most recent session overall', () => {
    expect(withForeignSession('2026-01-06', '2026-01-05')).toMatchObject({
      kind: 'time-off',
      cycle: off,
      daysRemaining: 4,
    });
  });

  it('does not rewind a time-off cycle that has already elapsed', () => {
    expect(withForeignSession('2026-01-11', '2026-01-10')).toMatchObject({
      kind: 'workout',
      cycle: w2,
    });
  });

  it('agrees with the same history minus the foreign session', () => {
    const withForeign = withForeignSession('2026-01-08', '2026-01-07');
    const withoutForeign = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [w1, off, w2],
      history: rotationHistory(3),
      today: '2026-01-08',
    });

    expect(withForeign).toMatchObject({ kind: 'time-off', daysRemaining: 2 });
    expect(withoutForeign).toMatchObject({ kind: 'time-off', daysRemaining: 2 });
  });

  it('still measures from today when this program has no countable history at all', () => {
    const result = resolveNextUp<TestDay, TestCycle>({
      routine: ROUTINE,
      days: DAYS,
      cycles: [cycle('off', 512, 'time_off', 7), w1],
      history: [session('foreign', OTHER_PROGRAM_DAY, '2025-12-01')],
      today: '2026-01-01',
    });

    expect(result).toMatchObject({ kind: 'time-off', daysRemaining: 7 });
  });
});

import {
  elapsedWorkoutSeconds,
  formatClock,
  REST_EXTEND_SECONDS,
  remainingSeconds,
  restTargetFrom,
} from '../rest-timer';

describe('remainingSeconds', () => {
  it('is 0 exactly at the target', () => {
    expect(remainingSeconds(1000, 1000)).toBe(0);
  });

  it('counts down before the target', () => {
    expect(remainingSeconds(60_000, 0)).toBe(60);
  });

  it('never goes negative once now is past the target', () => {
    expect(remainingSeconds(1000, 61_000)).toBe(0);
  });

  it('is 0 for a null target', () => {
    expect(remainingSeconds(null, 0)).toBe(0);
  });

  it('is correct across a multi-hour elapsed span', () => {
    const target = 3 * 60 * 60 * 1000;
    expect(remainingSeconds(target, 0)).toBe(3 * 60 * 60);
  });
});

describe('restTargetFrom', () => {
  it('is completedAt plus targetRestSeconds converted to ms', () => {
    expect(restTargetFrom(1000, 90)).toBe(1000 + 90_000);
  });

  it('is null when targetRestSeconds is null — no prescribed rest starts no timer', () => {
    expect(restTargetFrom(1000, null)).toBeNull();
  });

  it('is null when targetRestSeconds is zero', () => {
    expect(restTargetFrom(1000, 0)).toBeNull();
  });

  it('is null when targetRestSeconds is negative', () => {
    expect(restTargetFrom(1000, -30)).toBeNull();
  });
});

describe('elapsedWorkoutSeconds', () => {
  const startedAtMs = 0;

  it('is the raw elapsed time with no pause', () => {
    expect(
      elapsedWorkoutSeconds({ startedAtMs, accumulatedPausedSeconds: 0, pausedAtMs: null, nowMs: 100_000 }),
    ).toBe(100);
  });

  it('subtracts accumulated paused seconds from a completed pause', () => {
    expect(
      elapsedWorkoutSeconds({ startedAtMs, accumulatedPausedSeconds: 30, pausedAtMs: null, nowMs: 100_000 }),
    ).toBe(70);
  });

  it('is frozen at the value it held when an open pause began', () => {
    const pausedAtMs = 60_000;
    const atPauseStart = elapsedWorkoutSeconds({ startedAtMs, accumulatedPausedSeconds: 0, pausedAtMs, nowMs: pausedAtMs });
    const wellIntoThePause = elapsedWorkoutSeconds({
      startedAtMs,
      accumulatedPausedSeconds: 0,
      pausedAtMs,
      nowMs: pausedAtMs + 45_000,
    });
    expect(atPauseStart).toBe(60);
    expect(wellIntoThePause).toBe(60);
  });

  it('accounts for both an accumulated pause and a currently-open pause together', () => {
    const pausedAtMs = 80_000;
    expect(
      elapsedWorkoutSeconds({
        startedAtMs,
        accumulatedPausedSeconds: 20,
        pausedAtMs,
        nowMs: pausedAtMs + 30_000,
      }),
    ).toBe(60);
  });

  it('floors at 0 rather than going negative', () => {
    expect(
      elapsedWorkoutSeconds({ startedAtMs: 100_000, accumulatedPausedSeconds: 0, pausedAtMs: null, nowMs: 0 }),
    ).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats 0 seconds', () => {
    expect(formatClock(0)).toBe('0:00');
  });

  it('formats 59 seconds', () => {
    expect(formatClock(59)).toBe('0:59');
  });

  it('formats 60 seconds as one minute', () => {
    expect(formatClock(60)).toBe('1:00');
  });

  it('formats 3599 seconds as M:SS, just under the hour boundary', () => {
    expect(formatClock(3599)).toBe('59:59');
  });

  it('formats 3600 seconds as H:MM:SS, at the hour boundary', () => {
    expect(formatClock(3600)).toBe('1:00:00');
  });
});

describe('REST_EXTEND_SECONDS', () => {
  it('is the fixed 30-second increment D-27 extend adds', () => {
    expect(REST_EXTEND_SECONDS).toBe(30);
  });
});

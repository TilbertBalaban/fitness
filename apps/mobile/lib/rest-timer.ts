// Pure timing arithmetic for the header duration clock and rest countdown (D-21, D-29). No
// database, no React, no notification library, and no ambient clock read inside any function
// body — `now`/`nowMs` always arrives as a defaulted-but-overridable argument, matching
// `lib/programs/next-up.ts`'s contract. The rest timer's correctness across backgrounding comes
// entirely from this module never holding time in a variable: every caller recomputes from the
// stored wall-clock target on every render/foreground instead.

export const REST_EXTEND_SECONDS = 30;

// 0 when the target is null or already passed — never negative, so a caller can render this
// straight into a countdown without a second clamp.
export function remainingSeconds(targetTimestampMs: number | null, nowMs: number = Date.now()): number {
  if (targetTimestampMs === null) return 0;
  return Math.max(0, Math.round((targetTimestampMs - nowMs) / 1000));
}

// null when there is no prescribed rest (a one-off exercise, or a target of 0/negative) — an
// exercise with no rest target starts no timer at all (D-26).
export function restTargetFrom(completedAtMs: number, targetRestSeconds: number | null): number | null {
  if (targetRestSeconds === null || targetRestSeconds <= 0) return null;
  return completedAtMs + targetRestSeconds * 1000;
}

export interface ElapsedWorkoutSecondsInput {
  startedAtMs: number;
  accumulatedPausedSeconds: number;
  pausedAtMs: number | null;
  nowMs?: number;
}

// D-29's accounting: elapsed since start, minus every completed pause already folded into
// `accumulated_paused_seconds`, minus the currently-open pause if one exists. A currently-open
// pause freezes the result at whatever it held the instant `pausedAtMs` was recorded, since the
// open pause's own duration (`nowMs - pausedAtMs`) is subtracted right back out.
export function elapsedWorkoutSeconds({
  startedAtMs,
  accumulatedPausedSeconds,
  pausedAtMs,
  nowMs = Date.now(),
}: ElapsedWorkoutSecondsInput): number {
  const openPauseSeconds = pausedAtMs === null ? 0 : Math.max(0, (nowMs - pausedAtMs) / 1000);
  const raw = (nowMs - startedAtMs) / 1000 - accumulatedPausedSeconds - openPauseSeconds;
  return Math.max(0, Math.floor(raw));
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

// `M:SS` under an hour, `H:MM:SS` at or above one — the sizing case the header bar's fixed
// columns are laid out for (05-UI-SPEC's Header Timer Bar).
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(secs)}`;
  }
  return `${minutes}:${pad2(secs)}`;
}

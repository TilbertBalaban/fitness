// Web half of the rest-alert seam (D-08/D-25) — Metro resolves this file for the web target in
// place of rest-alert.ts. Same six exported names, no expo-notifications import, no runtime
// branch on which platform is running.

export type AlertPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const NOTIFICATION_TITLE = 'Rest complete';
const NOTIFICATION_BODY = 'Time for your next set.';

function hasNotificationApi(): boolean {
  return typeof Notification !== 'undefined';
}

function toAlertPermission(permission: NotificationPermission): AlertPermission {
  return permission === 'default' ? 'undetermined' : permission;
}

let scheduledTargetMs: number | null = null;
let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
let visibilityListenerAttached = false;
let lastKnownPermission: AlertPermission | null = null;

function clearScheduledTimeout(): void {
  if (timeoutHandle !== null) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
}

function fireNotification(): void {
  if (!hasNotificationApi() || Notification.permission !== 'granted') return;
  // eslint-disable-next-line no-new -- fire-and-forget, matches expo-notifications' own contract
  new Notification(NOTIFICATION_TITLE, { body: NOTIFICATION_BODY });
}

// Recomputes the delay against the stored wall-clock target every time it is called, rather than
// trusting a previously-armed setTimeout's countdown — a throttled or hidden tab's timers are not
// guaranteed to fire on schedule, so this is what makes the visibilitychange re-arm below correct.
function armTimeout(): void {
  clearScheduledTimeout();
  if (scheduledTargetMs === null) return;
  const delay = Math.max(0, scheduledTargetMs - Date.now());
  timeoutHandle = setTimeout(() => {
    fireNotification();
    scheduledTargetMs = null;
    timeoutHandle = null;
  }, delay);
}

function handleVisibilityChange(): void {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
  armTimeout();
}

function ensureVisibilityListener(): void {
  if (visibilityListenerAttached || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', handleVisibilityChange);
  visibilityListenerAttached = true;
}

export async function scheduleRestAlert(targetTimestampMs: number): Promise<void> {
  await cancelRestAlert();
  scheduledTargetMs = targetTimestampMs;
  ensureVisibilityListener();
  armTimeout();
}

export async function cancelRestAlert(): Promise<void> {
  scheduledTargetMs = null;
  clearScheduledTimeout();
}

// A read, never a prompt — safe to call every time the workout screen mounts.
export async function getAlertPermission(): Promise<AlertPermission> {
  if (!hasNotificationApi()) return 'unsupported';
  lastKnownPermission = toAlertPermission(Notification.permission);
  return lastKnownPermission;
}

// Browsers apply the same no-second-prompt-after-denial rule as iOS; memoizing the last known
// denial keeps this call a true no-op instead of relying on the caller to remember the rule.
export async function requestAlertPermission(): Promise<AlertPermission> {
  if (!hasNotificationApi()) return 'unsupported';
  if (lastKnownPermission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  lastKnownPermission = toAlertPermission(result);
  return lastKnownPermission;
}

// No programmatic deep link into a browser's own site-notification settings exists — the
// degraded-state banner's copy already tells the user what to do manually (D-23), so this is
// deliberately a no-op rather than a guess at a browser-specific settings URL.
export async function openAlertSettings(): Promise<void> {
  return Promise.resolve();
}

export async function playInAppRestAlert(): Promise<void> {
  fireNotification();
}

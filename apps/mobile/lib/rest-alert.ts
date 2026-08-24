// Native half of the rest-alert seam (D-08/D-25) — Metro resolves this file for iOS/Android; the
// web build resolves rest-alert.web.ts in its place. Both siblings export the identical six names
// below with no runtime branch on which platform is running; that is the whole point of the split.
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

export type AlertPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const REST_TIMER_CHANNEL_ID = 'rest-timer';
const NOTIFICATION_TITLE = 'Rest complete';
const NOTIFICATION_BODY = 'Time for your next set.';

// Registered once at module load — expo-notifications' default handler suppresses a foregrounded
// notification entirely, so a rest alert that fires while the app is open and visible would
// otherwise never display (RESEARCH.md §8).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let scheduledNotificationId: string | null = null;
let channelReady: Promise<void> | null = null;

// Android 8+ requires a channel before a scheduled notification's importance/sound is
// controllable; iOS ignores this call. Created lazily, once, and reused for every schedule.
function ensureChannel(): Promise<void> {
  if (!channelReady) {
    channelReady = Notifications.setNotificationChannelAsync(REST_TIMER_CHANNEL_ID, {
      name: 'Rest timer',
      importance: Notifications.AndroidImportance.HIGH,
    }).then(() => undefined);
  }
  return channelReady;
}

// Cancels any outstanding alert before scheduling — exactly one alert is ever pending per D-27's
// extend/skip/undo model, which all reschedule or cancel this same single slot.
export async function scheduleRestAlert(targetTimestampMs: number): Promise<void> {
  await cancelRestAlert();
  await ensureChannel();
  scheduledNotificationId = await Notifications.scheduleNotificationAsync({
    content: { title: NOTIFICATION_TITLE, body: NOTIFICATION_BODY },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(targetTimestampMs) },
  });
}

export async function cancelRestAlert(): Promise<void> {
  if (scheduledNotificationId === null) return;
  const id = scheduledNotificationId;
  scheduledNotificationId = null;
  await Notifications.cancelScheduledNotificationAsync(id);
}

function toAlertPermission(status: Notifications.PermissionStatus): AlertPermission {
  switch (status) {
    case Notifications.PermissionStatus.GRANTED:
      return 'granted';
    case Notifications.PermissionStatus.DENIED:
      return 'denied';
    default:
      return 'undetermined';
  }
}

// A read, never a prompt — safe to call every time the workout screen mounts, including after
// the user has gone to Settings and changed the OS-level answer out from under the app.
let lastKnownPermission: AlertPermission | null = null;

export async function getAlertPermission(): Promise<AlertPermission> {
  const result = await Notifications.getPermissionsAsync();
  lastKnownPermission = toAlertPermission(result.status);
  return lastKnownPermission;
}

// iOS will not show a second native prompt once the user has denied the first — the only path
// back from a denial is openAlertSettings's deep link (D-22). Memoizing the last known denial
// keeps this call a true no-op rather than relying on every caller to remember the platform rule.
export async function requestAlertPermission(): Promise<AlertPermission> {
  if (lastKnownPermission === 'denied') return 'denied';
  const result = await Notifications.requestPermissionsAsync();
  lastKnownPermission = toAlertPermission(result.status);
  return lastKnownPermission;
}

export async function openAlertSettings(): Promise<void> {
  await Linking.openSettings();
}

// D-23's degraded path: sound plus haptic-equivalent feedback for a foregrounded countdown
// reaching zero, regardless of permission state — presenting a notification with `trigger: null`
// fires immediately and does not require prior OS authorization the way a scheduled one does.
export async function playInAppRestAlert(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: NOTIFICATION_TITLE, body: NOTIFICATION_BODY, sound: true },
    trigger: null,
  });
}

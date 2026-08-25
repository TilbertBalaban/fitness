# API Coverage — Phase 5: In-Gym Session Logging

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

**Detector result at gap-closure time:** `api-coverage.verify-pre` returned `{"detected": true,
"coverage_present": false}` — the phase does integrate a real capability surface: the rest-timer
background alert. Two integrations serve that one need — `expo-notifications` on native
(`apps/mobile/lib/rest-alert.ts`) and the browser `Notification` API on web
(`apps/mobile/lib/rest-alert.web.ts`), resolved through the `.web.ts` platform-module convention
(D-08/D-25). Per the "second integration against the same need" rule, Matrix 2 is re-decided from
the same full-coverage baseline as Matrix 1 rather than inheriting its opt-outs.

---

## Matrix 1 — `expo-notifications` (native)

Capability surface = the SDK exports the module actually has available; every capability starts
at INTEGRATE.

| capability | decision | reason |
|---|---|---|
| Scheduling a local notification on a DATE trigger | INTEGRATE | `scheduleRestAlert()` calls `Notifications.scheduleNotificationAsync` with `trigger: { type: DATE, date: ... }` — the rest-timer alert itself (rest-alert.ts) |
| Cancelling a scheduled notification | INTEGRATE | `cancelRestAlert()` calls `Notifications.cancelScheduledNotificationAsync(id)` — D-27's extend/skip/undo model reschedules or cancels the single pending slot (rest-alert.ts) |
| Reading permission status | INTEGRATE | `getAlertPermission()` calls `Notifications.getPermissionsAsync()` — a safe re-read on every workout-screen mount, including after an out-of-app OS Settings change (rest-alert.ts) |
| Requesting permission | INTEGRATE | `requestAlertPermission()` calls `Notifications.requestPermissionsAsync()`, memoizing a prior denial since iOS shows no second native prompt (D-22, rest-alert.ts) |
| Foreground presentation handler | INTEGRATE | `Notifications.setNotificationHandler(...)` registered at module load so a foregrounded alert still displays — the default handler would otherwise suppress it (rest-alert.ts) |
| Android notification channels | INTEGRATE | `ensureChannel()` calls `Notifications.setNotificationChannelAsync('rest-timer', ...)` lazily before the first schedule — required on Android 8+ for importance/sound to be honoured (rest-alert.ts) |
| Deep-linking to OS settings when the OS will no longer prompt | INTEGRATE | `openAlertSettings()` calls `Linking.openSettings()` — the only path back from a denial (D-22, rest-alert.ts) |
| In-app immediate notification (trigger: null) | INTEGRATE | `playInAppRestAlert()` calls `scheduleNotificationAsync` with `trigger: null` and `sound: true` — R9's degraded-path sound/haptic-equivalent feedback regardless of permission state (rest-alert.ts) |
| Interval / daily / weekly / calendar triggers | OPT-OUT | D-21's rest timer has exactly one wall-clock target per rest period, computed fresh on every schedule call — a recurring trigger type has no caller in this phase's single-alert model |
| Notification response listeners (tap-to-open routing) | OPT-OUT | D-27's alert is informational only; no requirement asks for custom tap-to-open routing beyond the OS default |
| Notification categories and interactive actions | OPT-OUT | Extend/skip already live in Rest Timer Full-Screen/header bar (D-27); in-notification actions would duplicate that control surface |
| Badge count | OPT-OUT | R9's baseline is sound/haptic plus the in-app note; D-25/D-30's no-remote-push posture leaves no server-driven badge state to show |
| Dismissing or reading presented notifications | OPT-OUT | `scheduledNotificationId` already tracks the single pending alert client-side (rest-alert.ts); reading back the OS notification tray adds no information this module doesn't already have |
| Custom notification sounds | OPT-OUT | R9's in-app sound/haptic baseline uses the OS default alert sound (`sound: true`); no requirement asks for a branded or custom sound asset |
| Remote push tokens | OPT-OUT | D-25/D-30's no-remote-push posture — every alert this phase schedules is a local, on-device notification; there is no push-token registration or server-side push send path in this phase's scope |

---

## Matrix 2 — browser `Notification` API (web sibling)

Re-decided from the same full-coverage baseline as Matrix 1 — not inherited.

| capability | decision | reason |
|---|---|---|
| Permission query | INTEGRATE | `getAlertPermission()` reads `Notification.permission` (rest-alert.web.ts) |
| Permission request | INTEGRATE | `requestAlertPermission()` calls `Notification.requestPermission()`, memoizing a prior denial to match the native no-second-prompt rule (D-22, rest-alert.web.ts) |
| Showing a notification | INTEGRATE | `fireNotification()` calls `new Notification(NOTIFICATION_TITLE, { body: NOTIFICATION_BODY })` — the web half of the rest-timer alert (rest-alert.web.ts) |
| Visibility-change re-arm | INTEGRATE | `armTimeout()` re-derives the delay from the stored target on `visibilitychange`, since a hidden tab's `setTimeout` is not guaranteed to fire on schedule (rest-alert.web.ts) |
| `tag`/`renotify` coalescing | OPT-OUT | D-27's single-pending-alert model already guarantees at most one rest notification is ever live (`scheduleRestAlert` cancels any prior one first) — there is nothing to coalesce |
| ServiceWorker `showNotification` (persists past a closed tab) | OPT-OUT | No ServiceWorker exists in this codebase; adding one for a closed-tab alert is an architecture change out of scope this run, and R9's baseline already works with zero permission |
| Notification actions | OPT-OUT | Same reasoning as native's interactive actions — extend/skip already live in the app's own Rest Timer Full-Screen/header bar (D-27); no requirement asks for in-notification buttons |
| `onclick` focus routing | OPT-OUT | The web notification is informational only, matching native's tap-to-open opt-out above — no requirement asks for a custom focus/navigate action on click |

---

## Re-open triggers

Re-run this matrix if a future phase adds a ServiceWorker (unlocking persistent web notifications
or a real closed-tab alert story), adds remote push (unlocking badge count and push-token
registration on native), or adds an in-notification action surface (unlocking notification
categories/actions on native and Notification actions on web).

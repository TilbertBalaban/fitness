# Native Verification Recipe

Phase 1's automated checks (typecheck, unit tests, `apps/mobile`'s `build` script, which runs
`expo export --platform web`) all pass, but none
of them render UI. Four claims in
`.planning/phases/01-cross-platform-foundation/01-VERIFICATION.md`'s `human_verification` list —
the iOS render, the Android render, the real-device offline/multi-week-gap behavior, and the
maximum accessibility font scale — were never observed by a human, because no simulator, emulator,
or device was reachable from the execution worktree. This document is the missing half: the exact
commands to get the app running on a device, and a precise, unchecked checklist for each of the four
items. It **records observations**; it never asserts one has happened. If you are reading this
before doing the checks below, every box in Part 2 should still be empty.

No claim in this document has been verified. Every checklist item below is an unchecked box.

## Part 1 — Run recipe

### Prerequisites

- Node.js >= 20, pnpm 11.9.0, PostgreSQL 15+ (see the root `README.md` for the full prerequisite list)
- The **Expo Go** app installed from the App Store / Play Store, on a physical iOS or Android device
  — or Xcode's iOS Simulator / Android Studio's emulator, already set up on this machine
- No Apple developer account, no EAS Build, and no development-client build are required for any of
  the four checks below. Phase 1 ships entirely inside Expo Go's managed runtime — the first thing
  in this project that structurally needs a dev client is the native SQLite module planned for
  Phase 2 (see `README.md`'s closing note under "Continuous integration").

### Steps

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Create your local environment file and fill in one secret. `.env.example` is the committed
   template — copy it, then open `.env` and replace only the `BETTER_AUTH_SECRET` placeholder with
   a long random string (e.g. `openssl rand -hex 32`). Do not commit `.env`.
   ```bash
   cp .env.example .env
   ```
3. Bring up Postgres (and Mailpit, unused by these four checks but started by the same command):
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```
   No Docker available? `createdb fitness` and point `DATABASE_URL` in `.env` at your local server —
   see `README.md`'s "Running Postgres" section for both paths.
4. Apply the database schema:
   ```bash
   pnpm --filter api db:push
   ```
5. Start the API and the Expo dev server together:
   ```bash
   pnpm dev
   ```
   This runs both apps' `dev` scripts through Turborepo. To run them in two separate terminals
   instead (useful for reading each log stream on its own), use `pnpm --filter api dev` and
   `pnpm --filter mobile dev`.
6. In the Expo CLI's interactive output: press `i` for the iOS Simulator, `a` for the Android
   emulator, or scan the printed QR code with the Expo Go app on a physical device.
7. **Physical device only:** the phone is a separate machine on your network — it cannot reach
   `localhost` on the machine running the API. Before scanning the QR code, set
   `EXPO_PUBLIC_API_URL` in `.env` to `http://<YOUR_MACHINE_LAN_IP>:3000` (find the LAN IP with
   `ipconfig getifaddr en0` on macOS, or your OS equivalent), then restart `pnpm --filter mobile dev`
   so it picks up the change. The iOS Simulator and, in most Expo Go setups, the Android emulator can
   both keep the default `http://localhost:3000` unchanged.

At this point the app is running. Each section in Part 2 assumes you are starting from the sign-up
or sign-in screen with a fresh app state (uninstall-and-reinstall Expo Go's cached app, or use a
new email address, if you need a clean slate).

## Part 2 — Checklist

Every item below cites the `.planning/WINDOWS.md` ledger entry it would let a human close. Fill in
the date and result only after you have actually performed the check — do not pre-fill any box.

### 1. iOS render

**Closes WINDOWS.md ledger entries:** #4, #5, #8, #10

**Steps:**
1. Run the recipe above targeting the iOS Simulator or a physical iPhone.
2. From the landing screen, tap through to sign-up, create an account with a fresh email address
   and an 8+ character password, and submit.
3. Once redirected to the authenticated shell, force-quit and relaunch the app, then sign in again
   with the same credentials from the sign-in screen.

**Expected observation:** After sign-up, the app lands directly on a five-tab native tab bar with
exactly these labels, in this order: **Home, Programs, Workout, History, Profile**. Each tab is
tappable and shows distinct screen content. Signing back in after a relaunch reaches the identical
five-tab shell.

- [ ] Observed on iOS — Date: ______ — Result: ______

### 2. Android render

**Closes WINDOWS.md ledger entries:** #4, #5, #8, #10

**Steps:** Identical to the iOS section above, run against the Android emulator or a physical
Android device.

**Expected observation:** Same five-tab bar (Home, Programs, Workout, History, Profile), same
sign-up-then-relaunch-then-sign-in flow, same authenticated shell — observed independently on
Android, not inferred from the iOS result.

- [ ] Observed on Android — Date: ______ — Result: ______

### 3. Offline cold start after a real elapsed gap

**Closes WINDOWS.md ledger entry:** #2

**Steps:**
1. On a physical device (airplane mode cannot be genuinely exercised on a simulator/emulator with a
   host-shared network), sign in successfully at least once.
2. Force-quit the app. Enable Airplane Mode on the device.
3. Wait — a multi-week gap cannot be reproduced here, so wait as long as is practical (at minimum
   several minutes with the app fully closed) to approximate an extended offline period.
4. Relaunch the app while still in Airplane Mode.

**Expected observation (D-01/D-02, verbatim):** The authenticated interface appears on the **first
frame** — no spinner, no network wait, and no sign-out. No warning banner and no re-authentication
prompt appears at any point while offline. The previously-cached session governs the UI entirely;
the app never blocks on reaching the server to decide whether to show the authenticated shell.

- [ ] Observed — Date: ______ — Result: ______

### 4. Maximum accessibility font scale

**Closes WINDOWS.md ledger entries:** #7, #9

**Steps:**
1. On a physical or simulated device, set the OS accessibility text size to its maximum: iOS
   Settings → Accessibility → Display & Text Size → Larger Text → drag to the largest setting (and
   enable "Larger Accessibility Sizes" if offered); Android Settings → Accessibility → Text and
   display size → Font size → largest.
2. Relaunch the app. Visit the sign-up screen, the sign-in screen, and the five-tab authenticated
   shell.

**Expected observation (UI-SPEC rule R1, "wrap-and-grow"):** On the auth screens, the email/password
field labels, input text, and error messages (including the sign-up duplicate-email banner) wrap
onto additional lines and their containers grow taller — nothing is clipped, truncated with an
ellipsis, or overlaps a neighboring element. On the tab bar, all five labels (Home, Programs,
Workout, History, Profile) remain fully legible; the bar itself grows taller to accommodate the
larger text rather than clipping any label. This was previously observed only on **web**, by
shrinking the browser viewport to 380px (the tab bar grew from 56px to 128px with no label
clipped) — never at a real OS-level accessibility font scale on a native device.

- [ ] Observed — Date: ______ — Result: ______

## Closing note — what could be automated later, and what it would cost

Phase 1 judged all four checks above not worth automating yet. Recording that judgement here so a
later phase re-decides deliberately, rather than re-discovering the question from scratch:

- **iOS/Android render and the font-scale check** could, in principle, be closed by a
  device-driving E2E tool (Maestro is already this project's chosen stack pick for exactly this —
  see the "Technology Stack" section of `CLAUDE.md`). The cost is real: standing up a Maestro flow
  per platform, running it against a real simulator/emulator in CI (GitHub Actions' hosted macOS
  runners support the iOS Simulator; Android emulators run on any runner via a headless AVD), and
  maintaining flows as screens change. Font-scale specifically would also need the flow to set OS
  accessibility settings before asserting, which Maestro supports but which adds flow complexity.
- **The offline/multi-week-gap check** is the least automatable of the four: genuinely elapsed wall
  time cannot be compressed into a CI run, and simulating "N weeks later" would mean mocking the
  device clock at the OS level, which most CI-hosted simulators do not expose cleanly. The
  classification logic this check protects (`session-guard.ts`) is already fully unit-tested in
  isolation (`session-refresh.test.ts`); only the true device-level, real-time behavior is unverified,
  and that gap is the hardest of the four to close with automation at any reasonable cost.

None of the four items is closed by this document. It only makes the next attempt at closing them
take twenty minutes with a phone in hand, instead of an afternoon of reconstructing how to build and
run this app.

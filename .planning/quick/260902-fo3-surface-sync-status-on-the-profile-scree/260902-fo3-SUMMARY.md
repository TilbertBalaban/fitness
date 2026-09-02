---
quick_id: 260902-fo3
slug: surface-sync-status-on-the-profile-scree
status: complete
date: 2026-09-02
commits:
  - b6f4989 (feat - Task 1: Sync section on Profile screen)
  - ad76504 (test - Task 2: playwright.config.ts env forwarding)
closes: two blind spots from the 260902-fei post-mortem — getSyncStatus had no UI consumer, and
  EXPO_PUBLIC_API_URL never reached the Playwright webServer bundle
---

# Quick 260902-fo3 — Summary

## What changed

**Task 1 — `apps/mobile/app/(tabs)/profile.tsx`.** Exported `formatLastSync(isoTimestamp, now)`,
a pure relative-time ladder (`Never` / `Just now` / `${m}m ago` / `${h}h ago` / `${d}d ago`, each
division floored) and `SyncStatusSection({ status })`, a presentational component rendering a new
`Sync` section — header, one card with the pending-write line, the last-synced line, and (only
when `rejectedOps` is non-empty) a destructive-colored line naming the distinct `table: reason`
pairs, deduped via a `Set` over the formatted pair string.

The screen wires it in: `getSyncStatus()` joins the existing five-read `Promise.allSettled` pass
in `useFocusEffect` as a sixth entry (state seeded with a module-local `EMPTY_SYNC_STATUS`, same
`DEFAULT_PREFERENCES` pattern already on this screen), and `<SyncStatusSection status={syncStatus} />`
renders between the Gyms section and the Sign Out button. The stale "five reads" comment above
`useFocusEffect` was corrected to six.

Each line is built as a single template-string assigned to one `<Text>` child, not interleaved
JSX text/expression nodes — keeps the tree-walker test convention's output whitespace-predictable
and matches every other row component on this screen.

**Task 2 — `apps/mobile/playwright.config.ts`.** `webServer.env` now conditionally spreads
`EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_APP_ORIGIN` from `process.env`, each contributing its
key only when set (`{}` otherwise), so an unset variable still falls through to
`auth-storage.ts`'s and `web-app-origin.ts`'s own `?? 'http://localhost:...'` defaults instead of
being pinned to the literal string `"undefined"`. One comment added above `env`, exactly as the
plan specified, on the `reuseExistingServer: !process.env.CI` trap — an already-running dev server
keeps its original environment until restarted.

## Deviations from plan

None — plan executed exactly as written. Two tasks, two commits, matching the plan's task
boundaries and commit messages verbatim.

## Verification

| Check | Result |
|---|---|
| `pnpm --filter mobile test -- profile` | 7 suites / 127 tests pass, including the 4 new `SyncStatusSection` cases and the `formatLastSync` `it.each` |
| `pnpm --filter mobile typecheck` | exit 0, after both tasks |
| `webServer.env` key count | 2 keys with neither var set (verified by reading the conditional-spread logic — `{}` contributes no keys), 4 with both set |

Per the dispatch environment notes, no Playwright project was run (a concurrent run and dev
server were already active) and no `apps/api`/`.env` files were touched.

## Not done

Nothing deferred — both tasks' `<verify>`/`Done` criteria were met without deviation.

## Self-Check: PASSED

- FOUND: `apps/mobile/app/(tabs)/profile.tsx`
- FOUND: `apps/mobile/app/(tabs)/__tests__/profile.test.tsx`
- FOUND: `apps/mobile/playwright.config.ts`
- FOUND commit b6f4989
- FOUND commit ad76504

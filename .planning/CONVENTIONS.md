# Conventions

### Browser / E2E testing is authorized in this repo

The global "never launch a browser or run an E2E suite unless the user explicitly
asks" rule is **satisfied standing** for this repository. The user granted it
explicitly on 2026-08-25 while planning Phase 5 gap closure.

Run Playwright freely from `apps/mobile`:

- `pnpm --filter mobile test:e2e` — all projects
- `pnpm --filter mobile test:e2e:durability` — the `durability` project only

Chromium is already in `~/Library/Caches/ms-playwright`; no `playwright install`
is needed. Specs run against a real `@powersync/web` database, so a green run is
real evidence — prefer executing a spec over asserting it would pass.

This does **not** extend to launching a dev server just to click through the UI by
hand, and it does not apply to other repositories.

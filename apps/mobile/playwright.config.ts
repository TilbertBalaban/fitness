import { defineConfig, devices } from '@playwright/test';

// The Jest/Node route is empirically closed (WINDOWS.md #22) — no real Worker, no real WASM
// loader, no real IndexedDB. A real browser page has all three, which is what this durability
// suite needs to construct a real @powersync/web database.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8081',
  },
  projects: [
    {
      // Needs only a browser — no PowerSync Service, no API, no Postgres. Safe to run in CI.
      // workers: 1 — every case in this project drives the SAME webServer's single Metro/Node
      // process and a real @powersync/web (WASM SQLite + SharedWorker) instance per page; without
      // this, Playwright's default multi-worker scheduling runs several of these real-browser
      // cases concurrently against that one dev server, and the resulting CPU/server contention
      // surfaces as random page.goto/page.reload timeouts in whichever case the scheduler starves
      // that run — a different one each time, never reproducing in an isolated single-file run.
      // fullyParallel: false above only serializes cases WITHIN one file; it does not stop
      // Playwright from running multiple FILES in parallel workers, which is what this project
      // actually needs to avoid.
      name: 'durability',
      workers: 1,
      testMatch: [
        'durability.spec.ts',
        'schema-redefinition.spec.ts',
        'catalog-load.spec.ts',
        'workout-screen.spec.ts',
        'rest-timer.spec.ts',
        'session-lifecycle.spec.ts',
        'session-edit.spec.ts',
        'history.spec.ts',
        'workout-summary.spec.ts',
        'target-write-back.spec.ts',
        'session-notes.spec.ts',
        'reorder-exercises.spec.ts',
        'plate-strip.spec.ts',
        'gym-profiles.spec.ts',
        'equipment-availability.spec.ts',
        'switch-gym.spec.ts',
        'program-day-lifecycle.spec.ts',
        'advanced-sets.spec.ts',
        'progression-recommendation.spec.ts',
        'exercise-performance.spec.ts',
        'records.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Needs the live service stack (PowerSync Service, the API, Postgres with wal_level=logical)
      // — local-only for now (02-VERIFICATION.md), never silently skipped: a case that cannot
      // reach its services must fail loudly. Longer per-test timeout: each case chains several
      // bounded polls (crud-queue drain, Postgres row appearance, cross-client pull) against a
      // real network stack, comfortably exceeding the 30s default on a cold sync.
      name: 'sync',
      testMatch: ['sync.spec.ts'],
      timeout: 90_000,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx expo start --web',
    url: 'http://localhost:8081/__durability',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      EXPO_PUBLIC_DURABILITY_HARNESS: '1',
      CI: '1',
    },
  },
});

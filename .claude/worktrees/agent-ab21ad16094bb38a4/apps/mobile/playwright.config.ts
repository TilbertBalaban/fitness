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
      name: 'durability',
      testMatch: ['durability.spec.ts', 'schema-redefinition.spec.ts', 'catalog-load.spec.ts'],
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

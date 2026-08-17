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
      name: 'chromium',
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

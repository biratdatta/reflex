import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests load the real built extension into Chromium and drive it
 * against the demo app. `npm run build:extension` must have run first; the
 * globalSetup below takes care of it.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/globalSetup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:demo',
    url: 'http://localhost:3000/employees',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

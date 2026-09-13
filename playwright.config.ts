import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the built app, not a browser.
 *
 * **Not part of CI.** These are the gate before a release is built on a real
 * machine — they need a GPU, ffmpeg and a desktop session, and running them on
 * every push would burn Actions minutes on something that cannot be trusted in
 * a headless container anyway. `build:win` depends on them instead, so an
 * installer cannot be cut from a tree whose tests fail.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Electron launches are heavy and the app is a single-instance service.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  forbidOnly: !!process.env.CI,

  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});

import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the built app, not a browser.
 *
 * **Not part of CI.** These are the gate before a release is built on a real
 * machine: they need a GPU, ffmpeg and a desktop session, and running them on
 * every push would burn Actions minutes on something that cannot be trusted in
 * a headless container anyway. `build:win` depends on them instead, so an
 * installer cannot be cut from a tree whose tests fail.
 *
 * **Several at once.** Every launch has its own data directory, videos root
 * and single-instance lock (`GOODBIT_USER_DATA`), so two apps under test never
 * share anything, and the windows are invisible and muted (`tests/e2e/app.ts`)
 * so running four of them costs the person at the machine nothing. A file is
 * one worker, because the tests inside one share an app launched in
 * `beforeAll`; `screens.spec.ts` opts its own tests into parallel since each
 * launches its own. `GOODBIT_E2E_WORKERS` overrides the count.
 */
export default defineConfig({
  testDir: './tests/e2e',
  workers: Number(process.env.GOODBIT_E2E_WORKERS) || 4,
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

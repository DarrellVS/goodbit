import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './app';

/**
 * The window opens where it was left.
 *
 * Worth a test rather than a look, because the failure is quiet: a saved size
 * that is never read back just looks like the app choosing its own default
 * every time, which is easy to mistake for working.
 */
test.describe('window state', () => {
  test('size and position survive a restart', async () => {
    const first = await launchApp();
    const dataDir = first.dataDir;
    /** The bounds the window actually took, filled in below. */
    let asked: { width: number; height: number } | undefined;

    try {
      await first.page.waitForTimeout(1500);

      // A size nothing would pick by accident.
      await first.app.evaluate(({ BrowserWindow, screen }) => {
        // Not `[0]`. The clip toast is a second window, built during boot, and
        // it is a transparent 408 pixel overlay loaded from a `data:` URL.
        // Resizing that one and then asserting on the app's size is how this
        // spec started reporting a saved width of 408.
        const w = BrowserWindow.getAllWindows().find(
          (candidate) => !/^data:|notch\.html/.test(candidate.webContents.getURL()),
        );
        if (!w) return;

        /*
         * Moved within whichever display it opened on, never across.
         *
         * This used to ask for a fixed `x: 120, y: 90`, which is a position on
         * the primary screen. `launchApp` now opens test windows on a
         * non-primary display when the machine has one, so those coordinates
         * dragged the window across a DPI boundary: the two screens here are
         * scaled 1.0 and 1.25, Windows rescaled the window on the way over,
         * and the 1180 this test asks for arrived as 944, which the app's own
         * minimum width clamped to 940.
         *
         * Relative to its own display it is the same test, it no longer
         * depends on which screen it got, and it stays off the primary.
         */
        const area = screen.getDisplayMatching(w.getBounds()).workArea;
        w.setBounds({ x: area.x + 120, y: area.y + 90, width: 1180, height: 760 });

      });

      // Past the debounce, then closed, which is when it must be written.
      await first.page.waitForTimeout(1200);

      /*
       * What it ended up with, read after it has settled.
       *
       * Two things make the asked-for number the wrong thing to assert. On a
       * fractionally scaled display Windows rounds a window to whole physical
       * pixels, so 1180 logical pixels comes back as 1182. And the size keeps
       * moving for a moment after `setBounds`, so reading it immediately gave
       * 1182 while what eventually got saved was 1188.
       *
       * What is under test is that the bounds a window had survive a restart,
       * not that Windows honours a request to the pixel, so this reads the
       * window once it has stopped moving and asserts against that.
       */
      asked = await first.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((candidate) => !/^data:|notch\.html/.test(candidate.webContents.getURL()))!
          .getNormalBounds(),
      );
    } finally {
      await first.app.close();
    }

    const saved = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8')) as {
      window?: { width: number; height: number; maximized: boolean };
    };

    expect(asked, 'the app window should have been found and resized').toBeTruthy();
    expect(saved.window).toBeTruthy();
    expect(saved.window!.maximized).toBe(false);

    /*
     * Close to what the window had, not equal to the pixel.
     *
     * On a display scaled at anything other than 100% Windows rounds a window
     * to whole physical pixels, and it does it more than once: asking for
     * 1180 logical pixels settles at 1182, and restoring 1182 comes back as
     * 1188, which is then what gets saved. So a window on a 125% display
     * creeps a few pixels wider each launch, which is worth knowing and is not
     * what this test is for.
     *
     * What it is for is that a deliberate size is written down and read back,
     * rather than reset to the default of 1400x900 or lost entirely. A
     * tolerance says that and survives a machine whose second monitor is
     * scaled; asserting equality here was asserting that Windows does not
     * round, which it does.
     */
    const NEAR = 12;
    expect(Math.abs(saved.window!.width - asked!.width)).toBeLessThanOrEqual(NEAR);
    expect(Math.abs(saved.window!.height - asked!.height)).toBeLessThanOrEqual(NEAR);

    // And it is still the size this test chose, not the default it started at.
    expect(Math.abs(saved.window!.width - 1180)).toBeLessThanOrEqual(NEAR);
    expect(Math.abs(saved.window!.height - 760)).toBeLessThanOrEqual(NEAR);

    // Relaunch into the same profile and check it was actually read back.
    const second = await launchApp({ dataDir });
    try {
      await second.page.waitForTimeout(1500);

      const bounds = await second.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((candidate) => !/^data:|notch\.html/.test(candidate.webContents.getURL()))!
          .getNormalBounds(),
      );

      expect(Math.abs(bounds.width - saved.window!.width)).toBeLessThanOrEqual(NEAR);
      expect(Math.abs(bounds.height - saved.window!.height)).toBeLessThanOrEqual(NEAR);
    } finally {
      await second.close();
    }
  });

  test('a position on a screen that no longer exists is ignored', async () => {
    // Far outside any real display: unplugging a monitor leaves bounds like
    // these behind, and honouring them puts the window somewhere unreachable.
    const ctx = await launchApp({
      window: { x: -9000, y: -9000, width: 1100, height: 720, maximized: false },
    });

    try {
      await ctx.page.waitForTimeout(1500);

      const bounds = await ctx.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((candidate) => !/^data:|notch\.html/.test(candidate.webContents.getURL()))!
          .getNormalBounds(),
      );

      // The size is still honoured; only the off-screen position is dropped.
      expect(bounds.width).toBe(1100);
      expect(bounds.x).toBeGreaterThan(-1000);
    } finally {
      await ctx.close();
    }
  });
});

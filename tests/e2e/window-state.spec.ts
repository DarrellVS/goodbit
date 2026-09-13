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

    try {
      await first.page.waitForTimeout(1500);

      // A size nothing would pick by accident.
      await first.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w.setBounds({ x: 120, y: 90, width: 1180, height: 760 });
      });

      // Past the debounce, then closed — which is when it must be written.
      await first.page.waitForTimeout(1200);
    } finally {
      await first.app.close();
    }

    const saved = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8')) as {
      window?: { width: number; height: number; maximized: boolean };
    };

    expect(saved.window).toBeTruthy();
    expect(saved.window!.width).toBe(1180);
    expect(saved.window!.height).toBe(760);
    expect(saved.window!.maximized).toBe(false);

    // Relaunch into the same profile and check it was actually read back.
    const second = await launchApp({ dataDir });
    try {
      await second.page.waitForTimeout(1500);

      const bounds = await second.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getNormalBounds(),
      );

      expect(bounds.width).toBe(1180);
      expect(bounds.height).toBe(760);
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
        BrowserWindow.getAllWindows()[0].getNormalBounds(),
      );

      // The size is still honoured; only the off-screen position is dropped.
      expect(bounds.width).toBe(1100);
      expect(bounds.x).toBeGreaterThan(-1000);
    } finally {
      await ctx.close();
    }
  });
});

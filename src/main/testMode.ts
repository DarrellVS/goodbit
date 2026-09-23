import type { BrowserWindow } from 'electron';

/**
 * The e2e suite's invisible mode.
 *
 * Playwright drives the real app, which on Windows means real windows: there
 * is no headless Electron. Before this, every one of the suite's launches put
 * a window in front of whatever the person at the machine was doing, stole
 * focus, and could make noise. With `GOODBIT_TEST_INVISIBLE=1` a window is
 * still created, laid out and painted, so every measurement the suite makes is
 * of the real thing, but it is fully transparent, never in the taskbar, and
 * shown without taking focus.
 *
 * Never set outside `tests/e2e/app.ts`. Nothing about it is a feature.
 */
export const invisibleForTests = process.env.GOODBIT_TEST_INVISIBLE === '1';

/** Show a window, the invisible way when the suite asked for it. */
export function showForTests(window: BrowserWindow): boolean {
  if (!invisibleForTests) return false;
  window.setOpacity(0);
  window.setSkipTaskbar(true);
  window.showInactive();
  return true;
}

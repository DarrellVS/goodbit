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

/**
 * No motion under the suite.
 *
 * Every transition here is 120 to 180 ms, so a test that hovers something and
 * then measures it had to sleep through the transition first, and the suite
 * slept through thousands of them. Sizes do not change between a transition's
 * first and last frame (that is a rule of this app), so switching motion off
 * changes nothing a test measures, only how long it has to wait for it.
 */
const NO_MOTION =
  '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: auto; }';

/** Show a window, the invisible way when the suite asked for it. */
export function showForTests(window: BrowserWindow): boolean {
  if (!invisibleForTests) return false;
  const still = (): void => void window.webContents.insertCSS(NO_MOTION);
  window.webContents.on('did-finish-load', still);
  still();
  window.setOpacity(0);
  window.setSkipTaskbar(true);
  window.showInactive();
  return true;
}

import { screen, type BrowserWindow } from 'electron';
import { loadSettings, saveSettings, type WindowBounds } from './settings.js';

/**
 * Open the window where it was left.
 *
 * The part that needs care is restoring a position onto a screen that no longer
 * exists, unplug the second monitor and a remembered position puts the window
 * somewhere unreachable, with no obvious way to get it back. Saved bounds are
 * checked against the displays actually attached, and ignored if they no longer
 * land on one.
 */

const DEFAULT_SIZE = { width: 1400, height: 900 };
const MINIMUM = { width: 940, height: 600 };

/** Writing on every pixel of a drag would hammer the settings file. */
const SAVE_DEBOUNCE_MS = 500;

/** Is this rectangle still meaningfully on a screen someone can see? */
function isOnScreen(bounds: WindowBounds): boolean {
  if (bounds.x === undefined || bounds.y === undefined) return false;

  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    // Enough of the title bar has to be reachable to drag the window back.
    const visibleX = bounds.x! + bounds.width > area.x + 80 && bounds.x! < area.x + area.width - 80;
    const visibleY = bounds.y! >= area.y - 8 && bounds.y! < area.y + area.height - 40;
    return visibleX && visibleY;
  });
}

/** What to open with: the remembered bounds when they still make sense. */
export function initialBounds(): {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
} {
  const saved = loadSettings().window;
  if (!saved) return { ...DEFAULT_SIZE, maximized: false };

  const width = Math.max(MINIMUM.width, Math.round(saved.width) || DEFAULT_SIZE.width);
  const height = Math.max(MINIMUM.height, Math.round(saved.height) || DEFAULT_SIZE.height);

  const placed = isOnScreen({ ...saved, width, height });

  return {
    width,
    height,
    // Undefined lets Electron centre it on the primary display.
    x: placed ? saved.x : undefined,
    y: placed ? saved.y : undefined,
    maximized: !!saved.maximized,
  };
}

/**
 * Remember size, position and whether it was maximised.
 *
 * `getNormalBounds` rather than `getBounds`: a maximised window reports the
 * screen's size, so saving that would lose the size to go back to when it is
 * restored.
 */
export function rememberWindowState(window: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const persist = (): void => {
    if (window.isDestroyed() || window.isMinimized()) return;

    const normal = window.getNormalBounds();
    saveSettings({
      window: {
        x: normal.x,
        y: normal.y,
        width: normal.width,
        height: normal.height,
        maximized: window.isMaximized(),
      },
    });
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(persist, SAVE_DEBOUNCE_MS);
  };

  window.on('resize', schedule);
  window.on('move', schedule);
  window.on('maximize', schedule);
  window.on('unmaximize', schedule);

  // Closing hides the window rather than destroying it, so the debounce may
  // never fire; write immediately instead of losing the last change.
  window.on('close', () => {
    if (timer) clearTimeout(timer);
    persist();
  });
}

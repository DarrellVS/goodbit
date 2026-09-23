/**
 * Where the notch sits, and how its shapes land on the screen from there.
 *
 * Always the middle of the top edge. The page is laid out as a stage
 * `along` wide and `across` tall with y = 0 at the edge, and main asks where the
 * pointer is in screen pixels, so every rectangle the hover logic tests is
 * moved from the stage onto the screen here. Pure, so `tests/unit` owns it.
 */
import type { Rect } from './hover.js';

export interface StageSize {
  /** Along the edge. */
  along: number;
  /** Away from the edge. */
  across: number;
}

/**
 * The window, centred on the top of the work area.
 *
 * The work area rather than the display, so with the taskbar docked at the top
 * the notch hangs below it instead of underneath it.
 */
export function windowBounds(area: Rect, stage: StageSize): Rect {
  return {
    x: Math.round(area.x + (area.width - stage.along) / 2),
    y: area.y,
    width: stage.along,
    height: stage.across,
  };
}

/** A rectangle on the stage, in screen pixels, once the window is at `win`. */
export function stageToScreen(win: Rect, rect: Rect): Rect {
  return { x: win.x + rect.x, y: win.y + rect.y, width: rect.width, height: rect.height };
}

/** A rectangle hanging from the middle of the stage's edge. */
export function hanging(stage: StageSize, width: number, height: number): Rect {
  return { x: (stage.along - width) / 2, y: 0, width, height };
}

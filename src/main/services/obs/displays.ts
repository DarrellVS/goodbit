import { screen } from 'electron';
import { windowsDisplays, type WindowsDisplay } from './displayQuery.js';

/* The shape is agreed in `src/shared`; re-exported so callers here are unchanged. */
import type { CaptureDisplay } from '@shared/index.js';
export type { CaptureDisplay };

/**
 * The screens, in the two vocabularies that have to agree.
 *
 * Electron knows resolutions, refresh rates and which screen is primary, and
 * calls a monitor `MEG 342C OLED`. OBS knows none of that: it identifies a
 * display by a Windows device interface path, and needs to be told whether
 * that display is in HDR mode. `displayQuery.ts` asks Windows both questions;
 * this joins the answer to Electron's list on the monitor's EDID name, which
 * both sides report identically, and falls back to order for two identical
 * screens.
 */

export async function captureDisplays(): Promise<CaptureDisplay[]> {
  const primary = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays();
  const fromWindows = await windowsDisplays();

  const taken = new Set<number>();

  return displays.map((display, index) => {
    let matched = fromWindows.findIndex(
      (candidate, at) =>
        !taken.has(at) && candidate.friendlyName && candidate.friendlyName === display.label,
    );
    if (matched === -1 && fromWindows[index] && !taken.has(index)) matched = index;
    if (matched !== -1) taken.add(matched);

    const windows: WindowsDisplay | null = matched === -1 ? null : fromWindows[matched];

    return {
      id: display.id,
      label: display.label || `Screen ${index + 1}`,
      primary: display.id === primary.id,
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
      frequency: Math.round(display.displayFrequency) || 60,
      monitorId: windows?.devicePath || null,
      hdrSupported: windows?.hdrSupported ?? false,
      hdrEnabled: windows?.hdrEnabled ?? false,
    };
  });
}

/** The one to set up for, unless the user says otherwise. */
export async function defaultCaptureDisplay(): Promise<CaptureDisplay | null> {
  const displays = await captureDisplays();
  return displays.find((display) => display.primary) ?? displays[0] ?? null;
}

export interface VideoSettings {
  baseWidth: number;
  baseHeight: number;
  fps: number;
  /** PQ and 10-bit, or Rec. 709 and 8-bit. */
  hdr: boolean;
}

/**
 * What to record at.
 *
 * The canvas is the screen's own resolution, because anything else means OBS
 * scaling every frame for no reason, and because a 21:9 screen recorded on a
 * 16:9 canvas is a letterboxed clip of a game nobody plays letterboxed.
 *
 * The frame rate is not the screen's. A 175 Hz panel would have OBS encoding
 * 175 frames a second into a replay buffer, which is a lot of work for a file
 * nobody watches at 175. Sixty is the number people expect, and a slower
 * screen keeps its own.
 *
 * The colour follows the screen, and has to. Recording an HDR display as
 * Rec. 709 makes OBS tone map and quantise to 8 bits *at capture*, so the
 * highlights are clipped in the file and nothing downstream can bring them
 * back: the clip is flat and washed out for ever. The reverse is just as
 * wrong, since tagging an SDR capture as PQ leaves everything dark. So this
 * is the one colour decision GoodBit does make, and it makes it from what
 * Windows says the display is doing right now.
 */
export function recordingVideoSettings(display: CaptureDisplay): VideoSettings {
  return {
    baseWidth: display.width,
    baseHeight: display.height,
    fps: display.frequency >= 60 ? 60 : display.frequency,
    hdr: display.hdrEnabled,
  };
}

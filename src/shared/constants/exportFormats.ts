/**
 * The shapes an export can take, and the crop maths behind them.
 *
 * Kept here rather than on either side alone because the client draws the crop
 * frame over the player and the server builds the ffmpeg filter from it, if
 * the two disagree by a pixel, what you framed is not what you get.
 *
 * Nothing is ever scaled up. A format crops the source at its own resolution,
 * so a 3440x1440 ultrawide becomes a real 1440x1440 square, not a stretched one.
 */

export type ExportFormat = 'original' | '16x9' | '9x16' | '1x1' | '4x3';

export interface FormatSpec {
  id: ExportFormat;
  /** What to call it in the UI. */
  label: string;
  /** Width:height, or null to keep the source shape untouched. */
  ratio: number | null;
  /** One line for the tooltip. */
  hint: string;
}

export const EXPORT_FORMATS: FormatSpec[] = [
  { id: 'original', label: 'As recorded', ratio: null, hint: 'Keeps the shape the clip was recorded in' },
  { id: '16x9', label: 'Widescreen', ratio: 16 / 9, hint: 'YouTube, Discord, most screens' },
  { id: '9x16', label: 'Vertical', ratio: 9 / 16, hint: 'Shorts, Reels, TikTok' },
  { id: '1x1', label: 'Square', ratio: 1, hint: 'Feed posts' },
  { id: '4x3', label: 'Classic', ratio: 4 / 3, hint: 'Old-school 4:3' },
];

export const FORMAT_BY_ID: Record<ExportFormat, FormatSpec> = EXPORT_FORMATS.reduce(
  (acc, f) => ({ ...acc, [f.id]: f }),
  {} as Record<ExportFormat, FormatSpec>,
);

export interface CropBox {
  width: number;
  height: number;
  x: number;
  y: number;
  /** Pixels the window can still travel horizontally; 0 when the full width is kept. */
  slackX: number;
  /** Pixels the window can still travel vertically. */
  slackY: number;
}

/**
 * The crop window for a format over a `width` x `height` source.
 *
 * `pos` is 0..1: where the window sits in whichever direction it has room to
 * move. 0.5 is centred, which is what every format starts at. Returns null when
 * the whole frame is kept, so callers can skip the filter entirely and let the
 * stream be copied.
 */
export function cropBoxFor(
  format: ExportFormat,
  width: number,
  height: number,
  pos = 0.5,
): CropBox | null {
  const spec = FORMAT_BY_ID[format];
  if (!spec || spec.ratio === null || width <= 0 || height <= 0) return null;

  const sourceRatio = width / height;
  // Within rounding, the source is already this shape, cropping would only
  // shave a pixel row off for nothing.
  if (Math.abs(sourceRatio - spec.ratio) < 0.01) return null;

  let cw: number;
  let ch: number;
  if (sourceRatio > spec.ratio) {
    // Source is wider than the target: full height, crop the sides.
    ch = height;
    cw = Math.floor((height * spec.ratio) / 2) * 2;
  } else {
    // Source is taller: full width, crop top and bottom.
    cw = width;
    ch = Math.floor(width / spec.ratio / 2) * 2;
  }

  const slackX = Math.max(0, width - cw);
  const slackY = Math.max(0, height - ch);
  const clamped = Math.min(1, Math.max(0, pos));

  // Even offsets keep chroma-subsampled encoders happy.
  return {
    width: cw,
    height: ch,
    x: Math.floor((slackX * clamped) / 2) * 2,
    y: Math.floor((slackY * clamped) / 2) * 2,
    slackX,
    slackY,
  };
}

/** `crop=w:h:x:y`, or null when the whole frame is kept. */
export function cropFilterFor(
  format: ExportFormat,
  width: number,
  height: number,
  pos = 0.5,
): string | null {
  const box = cropBoxFor(format, width, height, pos);
  return box ? `crop=${box.width}:${box.height}:${box.x}:${box.y}` : null;
}

/** The output size of a format for a given source; never larger than the source. */
export function outputSizeFor(
  format: ExportFormat,
  width: number,
  height: number,
): { width: number; height: number } {
  const box = cropBoxFor(format, width, height);
  return box ? { width: box.width, height: box.height } : { width, height };
}

/**
 * One click for "make this fit where I am about to post it".
 *
 * Nothing a preset does is hidden: it sets the same format and loudness controls
 * the panel already shows, so the sections above keep telling the truth.
 */
export interface PlatformPreset {
  id: string;
  label: string;
  hint: string;
  format: ExportFormat;
  /** Even the sound out to the level the platform normalises to anyway. */
  normalizeLoudness: boolean;
}

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    hint: 'Widescreen, evened-out sound',
    format: '16x9',
    normalizeLoudness: true,
  },
  {
    id: 'shorts',
    label: 'Shorts · Reels · TikTok',
    hint: 'Vertical, evened-out sound',
    format: '9x16',
    normalizeLoudness: true,
  },
  {
    id: 'discord',
    label: 'Discord',
    hint: 'Keeps the shape it was recorded in',
    format: 'original',
    normalizeLoudness: false,
  },
];

/**
 * Bitrate ceiling for an export: the source's own rate, scaled by the share of
 * pixels that survive the crop. A vertical slice of an ultrawide keeps about a
 * fifth of the picture and has no business carrying the full bitrate.
 */
export function targetKbpsFor(
  format: ExportFormat,
  width: number,
  height: number,
  sourceKbps: number | null,
): number | null {
  if (!sourceKbps || width <= 0 || height <= 0) return null;
  const out = outputSizeFor(format, width, height);
  const scaled = Math.round((sourceKbps * out.width * out.height) / (width * height));
  // Nothing below a floor that would visibly fall apart on 60 fps game footage.
  return Math.max(2000, scaled);
}

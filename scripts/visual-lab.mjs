/**
 * A bench for finding what a game's HUD gives away.
 *
 * Decodes one clip once on the GPU, crops a few regions, and prints a time
 * series of cheap per-frame statistics for each — so a candidate signal ("the
 * kill banner appeared") can be checked against a clip whose content is known,
 * before any of it is wired into the analysis.
 *
 *   node scripts/visual-lab.mjs "<clip path>" --fps 4
 *
 * Read-only as far as the recordings are concerned.
 *
 * Geometry is in **units of frame height, measured from an anchor**, never in
 * fractions of width. A game's HUD scales with height and sticks to an edge or
 * to the middle, so the same numbers land on the same pixels at 16:9 and at
 * 21:9 — which fractions of width do not.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const FFMPEG = ffmpegPath;
const FFPROBE = ffprobeStatic.path;

const TONEMAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,' +
  'tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';

/**
 * Where a region sits. `dx`/`dy` are offsets from the anchor and `w`/`h` its
 * size, all in units of frame height; x grows right, y grows down.
 */
export function resolveRegion(region, width, height) {
  const u = (v) => v * height;
  const anchors = {
    centre: [width / 2, height / 2],
    'top-left': [0, 0],
    'top-right': [width, 0],
    'bottom-left': [0, height],
    'bottom-right': [width, height],
    'top-centre': [width / 2, 0],
    'bottom-centre': [width / 2, height],
  };
  const [ax, ay] = anchors[region.anchor];
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  let w = even(u(region.w));
  let h = even(u(region.h));
  let x = Math.round(ax + u(region.dx));
  let y = Math.round(ay + u(region.dy));
  // Clamp inside the frame rather than letting ffmpeg refuse the crop.
  w = Math.min(w, width);
  h = Math.min(h, height);
  x = Math.min(Math.max(0, x), width - w);
  y = Math.min(Math.max(0, y), height - h);
  return { x, y, w, h };
}

export function probeInfo(filePath) {
  const info = JSON.parse(
    execFileSync(
      FFPROBE,
      ['-v', 'error', '-select_streams', 'v:0',
       '-show_entries', 'stream=width,height,color_transfer,pix_fmt:format=duration',
       '-of', 'json', filePath],
      { encoding: 'utf-8', maxBuffer: 8 << 20 },
    ),
  );
  const stream = info.streams[0] ?? {};
  const pixFmt = String(stream.pix_fmt ?? '');
  return {
    width: Number(stream.width) || 0,
    height: Number(stream.height) || 0,
    isHdr: stream.color_transfer === 'smpte2084' || stream.color_transfer === 'arib-std-b67',
    // What `hwdownload` will hand back. Naming the wrong one is a hard error,
    // and half this library is 8-bit SDR while the rest is 10-bit HDR.
    swFormat: /10|12/.test(pixFmt) ? 'p010le' : 'nv12',
    durationSec: Number(info.format?.duration) || 0,
  };
}

/**
 * Sample a clip's HUD.
 *
 * One decode for every region. Frames stay on the GPU until `fps` has thrown
 * most of them away, so only the sampled ones cross to system memory — which
 * is the whole cost: downloading all of them first and dropping them after
 * took twice as long. The crop happens at full resolution, because scaling
 * the frame down first blurs the HUD into the scenery it is meant to stand
 * out from.
 */
export function probeClip(filePath, { fps = 4, regions, startSec, durationSec: window } = {}) {
  const info = probeInfo(filePath);
  const keys = Object.keys(regions);
  const geometry = {};

  keys.forEach((key, i) => {
    const r = regions[key];
    const rect = resolveRegion(r, info.width, info.height);
    const [ow, oh] = r.out;
    geometry[key] = { ...rect, out: r.out };
  });

  // Several raw outputs cannot share one pipe, so each region is its own run
  // when there is more than one. One region — the common case — streams.
  const frames = {};
  keys.forEach((key, i) => {
    const r = regions[key];
    const rect = geometry[key];
    const [ow, oh] = r.out;
    const seek = startSec !== undefined ? ['-ss', String(startSec)] : [];
    const take = window !== undefined ? ['-t', String(window)] : [];
    const result = spawnSync(
      FFMPEG,
      ['-hide_banner', '-v', 'error', '-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda',
       ...seek, '-i', filePath, ...take,
       '-vf', `fps=${fps},hwdownload,format=${info.swFormat}${info.isHdr ? `,${TONEMAP}` : ''},` +
         `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},scale=${ow}:${oh},format=rgb24`,
       '-f', 'rawvideo', 'pipe:1'],
      { maxBuffer: 1 << 30 },
    );
    if (result.status !== 0) throw new Error(result.stderr?.toString().slice(0, 300) || 'ffmpeg failed');
    const bytes = result.stdout;
    const stride = ow * oh * 3;
    const count = Math.floor(bytes.length / stride);
    const list = [];
    for (let f = 0; f < count; f++) list.push(bytes.subarray(f * stride, (f + 1) * stride));
    frames[key] = { width: ow, height: oh, count, frames: list, rect };
  });

  return { ...info, fps, startSec: startSec ?? 0, regions: frames };
}

/**
 * The share of a region that is bright and close to grey — which is what HUD
 * text and icons are, on top of whatever the game is showing.
 */
export function whiteShare(frame, { min = 170, spread = 34 } = {}) {
  let n = 0;
  const pixels = frame.length / 3;
  for (let i = 0; i < frame.length; i += 3) {
    const r = frame[i], g = frame[i + 1], b = frame[i + 2];
    const hi = Math.max(r, g, b);
    if (hi < min) continue;
    if (hi - Math.min(r, g, b) > spread) continue;
    n++;
  }
  return n / pixels;
}

/** The share of a region matching a colour, within a tolerance per channel. */
export function colourShare(frame, test) {
  let n = 0;
  for (let i = 0; i < frame.length; i += 3) {
    if (test(frame[i], frame[i + 1], frame[i + 2])) n++;
  }
  return n / (frame.length / 3);
}

/**
 * A mask of the bright, near-grey pixels — HUD ink, whatever is behind it.
 */
export function whiteMask(frame, width, height, { min = 170, spread = 34 } = {}) {
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < frame.length; i += 3, p++) {
    const r = frame[i], g = frame[i + 1], b = frame[i + 2];
    const hi = Math.max(r, g, b);
    if (hi >= min && hi - Math.min(r, g, b) <= spread) mask[p] = 1;
  }
  return mask;
}

/**
 * The share of the bright pixels that sit within a couple of pixels of a dark
 * one — which is what a letter or an icon is, and what a sunlit wall is not.
 *
 * Brightness alone cannot tell a kill banner from scenery: both hold a steady
 * level for seconds. Stroke width can, and costs one pass.
 */
export function strokeRatio(mask, width, height, reach = 3) {
  let white = 0;
  let thin = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      white++;
      const left = Math.max(0, x - reach);
      const right = Math.min(width - 1, x + reach);
      const up = Math.max(0, y - reach);
      const down = Math.min(height - 1, y + reach);
      if (!mask[y * width + left] || !mask[y * width + right] ||
          !mask[up * width + x] || !mask[down * width + x]) thin++;
    }
  }
  return white ? thin / white : 0;
}

/**
 * How much of the ink stayed exactly where it was since the last sample.
 *
 * An overlay is pinned to the screen while the world slides behind it, so its
 * pixels land on themselves frame after frame. Scenery only does that when the
 * camera is still, which is why this is read next to the stroke ratio rather
 * than on its own.
 */
export function stickiness(previous, current) {
  if (!previous) return 0;
  let both = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < current.length; i++) {
    if (previous[i]) a++;
    if (current[i]) b++;
    if (previous[i] && current[i]) both++;
  }
  const most = Math.max(a, b);
  return most ? both / most : 0;
}

export function meanLuma(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i += 3) {
    sum += 0.2126 * frame[i] + 0.7152 * frame[i + 1] + 0.0722 * frame[i + 2];
  }
  return sum / (frame.length / 3);
}

/**
 * The lowest value over a window ending at each sample.
 *
 * A HUD element that appears holds its level for as long as it is shown;
 * scenery that happens to be bright flickers. Taking the floor over a couple
 * of seconds keeps the first and drops the second.
 */
export function rollingFloor(series, windowSamples) {
  return series.map((_, i) => {
    let lo = Infinity;
    for (let j = Math.max(0, i - windowSamples + 1); j <= i; j++) lo = Math.min(lo, series[j]);
    return lo;
  });
}

export const BF6_REGIONS = {
  // Skull and score, which appear together just below the middle.
  kill: { anchor: 'centre', dx: -0.35, dy: 0.08, w: 0.45, h: 0.10, out: [504, 112] },
  // The row of labels under it: ENEMY SUPPRESSION, KILL.
  tags: { anchor: 'centre', dx: -0.50, dy: 0.17, w: 0.55, h: 0.08, out: [560, 80] },
  // The kill feed, top right.
  feed: { anchor: 'top-right', dx: -0.70, dy: 0.0, w: 0.70, h: 0.16, out: [700, 160] },
};

if (import.meta.url === `file:///${(process.argv[1] ?? '').replace(/\\/g, '/')}`) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('usage: node scripts/visual-lab.mjs "<clip>" [--fps 4]');
    process.exit(2);
  }
  const i = process.argv.indexOf('--fps');
  const fps = i > 0 ? Number(process.argv[i + 1]) : 4;

  const probed = probeClip(filePath, { fps, regions: BF6_REGIONS });
  console.log(`${probed.width}x${probed.height}  ${probed.durationSec.toFixed(1)}s  @${fps}fps`);
  const keys = Object.keys(probed.regions);
  for (const k of keys) {
    const r = probed.regions[k].rect;
    console.log(`  ${k}: ${r.w}x${r.h} at ${r.x},${r.y}`);
  }

  const metrics = {};
  for (const k of keys) {
    const { frames, width, height } = probed.regions[k];
    const masks = frames.map((f) => whiteMask(f, width, height));
    metrics[k] = {
      white: masks.map((m) => m.reduce((a, v) => a + v, 0) / m.length),
      stroke: masks.map((m) => strokeRatio(m, width, height)),
      stuck: masks.map((m, i) => stickiness(masks[i - 1], m)),
    };
  }

  console.log(['t', ...keys.flatMap((k) => [`${k}.ink`, `${k}.thin`, `${k}.stuck`])].join('\t'));
  const n = Math.min(...keys.map((k) => probed.regions[k].count));
  for (let f = 0; f < n; f++) {
    console.log([
      (probed.startSec + f / fps).toFixed(2),
      ...keys.flatMap((k) => [
        (metrics[k].white[f] * 100).toFixed(2),
        metrics[k].stroke[f].toFixed(2),
        metrics[k].stuck[f].toFixed(2),
      ]),
    ].join('\t'));
  }
}

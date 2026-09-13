/**
 * The hero drawing on the website, made from a real measurement.
 *
 * It renders one clip's loudness over time and marks the window GoodBit would
 * suggest for it. Nothing here is drawn by hand or by eye: the curve is
 * ffmpeg's `ebur128` output and the window is picked with the same rule the app
 * uses, so the picture on the website is the thing the app actually does.
 *
 *   node scripts/waveform.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site', 'assets', 'img', 'waveform.svg');
const FFMPEG = ffmpegPath;

// The same constants as src/main/actions/AnalyzeClipAction.ts.
const HOP = 0.1;
const LEAD_IN = 2.5;
const ONSET_FRACTION = 0.5;
const SILENCE_LUFS = -70;
const WINDOW_SEC = 10;

const DURATION = 30;
const LOUD_FROM = 17;
const LOUD_TO = 21;

/** A stand-in for a replay buffer: quiet, then something happens. */
function makeClip(file) {
  execFileSync(FFMPEG, [
    '-hide_banner', '-v', 'error',
    '-f', 'lavfi', '-t', String(DURATION), '-i', 'color=black:size=320x180:rate=10',
    '-f', 'lavfi', '-t', String(DURATION), '-i', 'sine=frequency=220',
    // A rumble under everything, a burst in the middle, and a couple of smaller
    // knocks so the curve is not a single square wave.
    '-af',
    `volume=0.03,` +
      `volume=enable='between(t,6,7)':volume=6,` +
      `volume=enable='between(t,11,12.5)':volume=9,` +
      `volume=enable='between(t,${LOUD_FROM},${LOUD_TO})':volume=42,` +
      `volume=enable='between(t,24,25)':volume=7`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', '-y', file,
  ]);
}

function measure(file) {
  const out = execFileSync(
    FFMPEG,
    [
      '-hide_banner', '-v', 'error', '-nostats',
      '-i', file,
      '-map', '0:a:0',
      '-af', 'ebur128=metadata=1,ametadata=mode=print:key=lavfi.r128.M:file=-',
      '-f', 'null', '-',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  ).toString();

  const times = [];
  const loudness = [];
  let pending = null;

  for (const line of out.split(/\r?\n/)) {
    const frame = /^frame:\d+\s+pts:\S+\s+pts_time:([\d.]+)/.exec(line);
    if (frame) {
      pending = Number(frame[1]);
      continue;
    }
    const value = /^lavfi\.r128\.M=(-?[\d.]+)/.exec(line);
    if (value && pending !== null) {
      times.push(pending);
      loudness.push(Number(value[1]));
      pending = null;
    }
  }

  return { times, loudness };
}

/** The app's window pick, in miniature. */
function pickWindow(times, loudness) {
  const durationSec = times[times.length - 1] + HOP;
  const voiced = loudness.filter((x) => x > SILENCE_LUFS).sort((a, b) => a - b);
  const median = voiced[Math.floor(voiced.length / 2)];
  const deviations = voiced.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] || 0;
  const scale = 3 * Math.max(mad, 0.5);
  const raw = loudness.map((x) => (x - median) / scale);
  const score = raw.map((x) => Math.max(0, Math.min(1, x)));

  const win = Math.max(1, Math.round(Math.min(WINDOW_SEC, durationSec * 0.8) / HOP));
  const prefix = [0];
  for (let i = 0; i < score.length; i++) prefix.push(prefix[i] + score[i]);

  let bestIndex = 0;
  let bestSum = -1;
  for (let i = 0; i + win <= score.length; i++) {
    const sum = prefix[i + win] - prefix[i];
    if (sum > bestSum) {
      bestSum = sum;
      bestIndex = i;
    }
  }

  // The lead-in only ever moves the window back as far as the onset asks for.
  // Walking back from the loudest moment, not forward from the window edge.
  const limit = Math.min(raw.length, bestIndex + win);
  let peak = 0;
  let peakIndex = bestIndex;
  for (let i = bestIndex; i < limit; i++) {
    if (raw[i] > peak) {
      peak = raw[i];
      peakIndex = i;
    }
  }
  let onset = peakIndex;
  while (onset > bestIndex && raw[onset - 1] >= peak * ONSET_FRACTION) onset--;

  const length = win * HOP;
  const shifted = Math.max(0, Math.min(bestIndex * HOP, onset * HOP - LEAD_IN));
  const end = Math.min(durationSec, shifted + length);

  return { start: Math.max(0, end - length), end, durationSec };
}

const W = 720;
const H = 260;
const PAD = { top: 26, right: 16, bottom: 30, left: 16 };

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function render({ times, loudness }, window) {
  const floor = -48;
  const ceiling = -6;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const x = (t) => PAD.left + (t / window.durationSec) * plotW;

  // A mirrored area, the way a waveform is normally drawn: quiet reads as a
  // thin line down the middle rather than as a cliff at the bottom of the box.
  const mid = PAD.top + plotH / 2;
  const half = (lufs) => {
    const clamped = Math.max(floor, Math.min(ceiling, lufs));
    const amplitude = (clamped - floor) / (ceiling - floor);
    // A floor of a pixel, so silence is still a line and not a gap.
    return Math.max(0.6, amplitude * (plotH / 2));
  };

  const top = times.map((t, i) => `${x(t).toFixed(1)},${(mid - half(loudness[i])).toFixed(1)}`);
  const bottom = times
    .map((t, i) => `${x(t).toFixed(1)},${(mid + half(loudness[i])).toFixed(1)}`)
    .reverse();

  const ticks = [];
  for (let t = 0; t <= window.durationSec; t += 5) {
    ticks.push(`
    <line x1="${x(t).toFixed(1)}" y1="${H - PAD.bottom}" x2="${x(t).toFixed(1)}" y2="${H - PAD.bottom + 6}" class="tick" />
    <text x="${x(t).toFixed(1)}" y="${H - PAD.bottom + 20}" class="label" text-anchor="middle">${clock(t)}</text>`);
  }

  const wx = x(window.start);
  const ww = x(window.end) - x(window.start);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img"
     aria-label="A loudness measurement of a thirty second clip. It is quiet for most of its length, with one loud burst around seventeen seconds, and GoodBit's suggested ten second window sits over that burst, opening a couple of seconds before it.">
  <style>
    .plot { fill: #6b7280; }
    .window-fill { fill: #f97316; fill-opacity: .12; }
    .window-edge { stroke: #f97316; stroke-width: 2; }
    .window-plot { fill: #f97316; }
    .tick { stroke: #3a3f46; stroke-width: 1; }
    .label { fill: #767c86; font: 500 11px ui-monospace, "IBM Plex Mono", SFMono-Regular, Menlo, monospace; letter-spacing: .06em; }
    .caption { fill: #f97316; font: 600 11px ui-monospace, "IBM Plex Mono", SFMono-Regular, Menlo, monospace; letter-spacing: .1em; }
    .baseline { stroke: #23262b; stroke-width: 1; }
  </style>

  <rect x="${wx.toFixed(1)}" y="${PAD.top - 10}" width="${ww.toFixed(1)}" height="${(plotH + 20).toFixed(1)}" class="window-fill" />
  <line x1="${wx.toFixed(1)}" y1="${PAD.top - 10}" x2="${wx.toFixed(1)}" y2="${(PAD.top + plotH + 10).toFixed(1)}" class="window-edge" />
  <line x1="${(wx + ww).toFixed(1)}" y1="${PAD.top - 10}" x2="${(wx + ww).toFixed(1)}" y2="${(PAD.top + plotH + 10).toFixed(1)}" class="window-edge" />

  <text x="${wx.toFixed(1)}" y="${PAD.top - 16}" class="caption">KEEP ${clock(window.start)}–${clock(window.end)}</text>

  <line x1="${PAD.left}" y1="${H - PAD.bottom}" x2="${W - PAD.right}" y2="${H - PAD.bottom}" class="baseline" />

  <polygon class="plot" points="${top.join(' ')} ${bottom.join(' ')}" />
  <clipPath id="inside"><rect x="${wx.toFixed(1)}" y="0" width="${ww.toFixed(1)}" height="${H}" /></clipPath>
  <polygon class="window-plot" clip-path="url(#inside)" points="${top.join(' ')} ${bottom.join(' ')}" />
  ${ticks.join('')}
</svg>
`;
}

const base = mkdtempSync(join(tmpdir(), 'goodbit-wave-'));
const clip = join(base, 'sample.mp4');

try {
  makeClip(clip);
  const measured = measure(clip);
  const window = pickWindow(measured.times, measured.loudness);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, render(measured, window), 'utf-8');

  console.log(
    `${OUT}\n  measured ${measured.times.length} points, suggested ${window.start.toFixed(1)}s–${window.end.toFixed(1)}s ` +
      `(the burst is at ${LOUD_FROM}s)`,
  );
} finally {
  rmSync(base, { recursive: true, force: true });
}

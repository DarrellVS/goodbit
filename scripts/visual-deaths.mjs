/**
 * Where Battlefield says you went down, and how well it can be read.
 *
 * The kill banner is one shape under the crosshair; a death is two pieces of
 * text in two different places, and they do not move together: MAN DOWN sits
 * under the revive ring in the middle of the screen, and the PLAYER CARD
 * prompt is pinned to the bottom right corner. A HUD scales with height and
 * holds its anchor, so those are two different anchors and a box that catches
 * one at 21:9 catches neither at 16:9.
 *
 * This bench samples both boxes over real recordings and reports how each cue
 * scores, so the module can carry whichever of the two earns it rather than
 * whichever was tried first.
 *
 *   node scripts/visual-deaths.mjs "Battlefield 6" --limit 40
 *   node scripts/visual-deaths.mjs "Battlefield 6" --shots tmp/death-shots
 *
 * `--shots` writes the best-scoring frame of every clip that cleared the floor,
 * because a number in a table cannot tell you whether the thing it found is
 * the thing you were looking for.
 *
 * ## Where the templates came from
 *
 * Both were cut from confirmed deaths at the reference height of 1440, off the
 * lit pixels rather than by eye, and averaged over three clips each so no one
 * recording's background becomes part of the shape:
 *
 *   MAN DOWN     x 1644 y 1210 w 152 h 26, from 06.09 20-53-57 @ 7.0,
 *                15.08 21-05-17 @ 26.2 and 12.08 22-30-05 @ 3.0
 *   PLAYER CARD  x 3041 y 1356 w 230 h 30, from 06.09 20-53-57 @ 7.0,
 *                30.08 13-17-24 @ 6.8 and 15.08 20-54-11 @ 4.5
 *
 * `--cut <name> <file> <atSec>` writes one of those boxes out as raw grey
 * bytes, which is what this bench matches against and what
 * `vision/templates.ts` holds as base64. Averaging is three of those and a
 * mean; the numbers above are the record of which frames were used.
 *
 * Read-only as far as the recordings are concerned.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';
import { announceRoot, libraryRoot } from './lib/libraryRoot.mjs';

const ROOT = libraryRoot();
const VIDEO = /\.(mp4|mov|mkv)$/i;
const WORKING_FILE = /(^\.goodbit-(trim|bak)-|\.tmp-\d+\.[a-z0-9]+$)/i;
const OUT = join(process.cwd(), 'tmp', 'death-bundle.mjs');
const REFERENCE_HEIGHT = 1440;

const game = process.argv[2] ?? 'Battlefield 6';
const num = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const str = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const limit = num('--limit', 40);
const fps = num('--fps', 4);
const floor = num('--floor', 0.6);
const jsonOut = str('--json');
const shotsDir = str('--shots');
const only = str('--only');

/*
 * The two candidate boxes, each sampled at the source's own scale so a
 * template cut at 1440 matches at the size it was cut.
 *
 * MAN DOWN was measured at x 1646..1793, y 1212..1233 on a 3440x1440 frame,
 * which is centred on the frame's own centre line. The PLAYER CARD prompt sits
 * at x 3043..3268, y 1358..1383, which is 172 px in from the right edge and 57
 * up from the bottom.
 */
const REGIONS = {
  mandown: { anchor: 'centre', dx: -0.15, dy: 0.31, w: 0.3, h: 0.08, out: [432, 115] },
  playercard: { anchor: 'bottom-right', dx: -0.32, dy: -0.13, w: 0.32, h: 0.1, out: [461, 144] },
};

/** Where each cue sits inside its box, in units of frame height from the anchor. */
const CUES = {
  mandown: {
    anchor: 'centre',
    dx: (1719.5 - 1720) / REFERENCE_HEIGHT,
    dy: (1222.5 - 720) / REFERENCE_HEIGHT,
    template: { file: join('tmp', 'mandown.raw'), width: 152, height: 26 },
  },
  playercard: {
    anchor: 'bottom-right',
    dx: (3155.5 - 3440) / REFERENCE_HEIGHT,
    dy: (1370.5 - 1440) / REFERENCE_HEIGHT,
    template: { file: join('tmp', 'playercard.raw'), width: 230, height: 30 },
  },
};

/** How far from the expected spot to look, in units of frame height. */
const SLACK = 0.03;

/** The boxes the templates were cut from, at the reference height. */
const CUT_BOXES = {
  mandown: { x: 1644, y: 1210, w: 152, h: 26 },
  playercard: { x: 3041, y: 1356, w: 230, h: 30 },
};

if (process.argv.includes('--cut')) {
  const at = process.argv.indexOf('--cut');
  const [which, file, seconds] = process.argv.slice(at + 1);
  const box = CUT_BOXES[which];
  if (!box || !file || seconds === undefined) {
    console.error(`usage: --cut <${Object.keys(CUT_BOXES).join('|')}> <file> <atSec>`);
    process.exit(2);
  }

  const TONE =
    'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,' +
    'tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';
  const pixels = execFileSync(
    ffmpegStatic,
    [
      '-hide_banner', '-v', 'error', '-ss', String(seconds), '-i', file, '-frames:v', '1',
      '-vf', `${TONE},crop=${box.w}:${box.h}:${box.x}:${box.y}`,
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
    ],
    { maxBuffer: 1 << 28 },
  );
  const grey = Buffer.alloc(box.w * box.h);
  for (let i = 0, p = 0; p < grey.length; i += 3, p++) {
    grey[p] = Math.round(0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]);
  }
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
  const out = join('tmp', `${which}.raw`);
  writeFileSync(out, grey);
  console.log(`wrote ${out} (${box.w}x${box.h}, grey bytes)`);
  process.exit(0);
}

const entry = join(process.cwd(), 'tmp', 'death-entry.ts');
mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
writeFileSync(
  entry,
  [
    "export { readShape, sampleRegions } from '../src/main/services/highlights/vision/sample.js';",
    "export { findTemplate } from '../src/main/services/highlights/vision/match.js';",
    "export { greyscale, crop } from '../src/main/services/highlights/vision/pixels.js';",
    '',
  ].join('\n'),
  'utf-8',
);

const esbuild = await import('esbuild');
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: OUT,
  logLevel: 'warning',
});

const { readShape, sampleRegions, findTemplate, greyscale, crop } = await import(
  pathToFileURL(OUT).href,
);

function loadTemplate({ file, width, height }) {
  const bytes = readFileSync(file);
  if (bytes.length !== width * height) {
    throw new Error(`${file} is ${bytes.length} bytes, expected ${width * height}`);
  }
  return { width, height, data: new Uint8Array(bytes) };
}

const templates = Object.fromEntries(
  Object.entries(CUES).map(([name, cue]) => [name, loadTemplate(cue.template)]),
);

function anchorPoint(anchor, width, height) {
  switch (anchor) {
    case 'centre':
      return [width / 2, height / 2];
    case 'bottom-right':
      return [width, height];
    case 'bottom-centre':
      return [width / 2, height];
    default:
      throw new Error(`unhandled anchor ${anchor}`);
  }
}

/**
 * The best score for one cue in one sampled box, frame by frame.
 *
 * The window is the cue's own spot plus slack rather than the whole box: the
 * text is pinned, so searching the rest of the box would only give a wrong
 * answer somewhere to hide.
 */
function scoreCue(name, region, shape) {
  const cue = CUES[name];
  const template = templates[name];
  const perX = region.width / region.rect.w;
  const perY = region.height / region.rect.h;
  const [ax, ay] = anchorPoint(cue.anchor, shape.width, shape.height);

  const centreX = (ax + cue.dx * shape.height - region.rect.x) * perX;
  const centreY = (ay + cue.dy * shape.height - region.rect.y) * perY;
  const appearW = (template.width * shape.height * perX) / REFERENCE_HEIGHT;
  const appearH = (template.height * shape.height * perY) / REFERENCE_HEIGHT;
  const slackX = SLACK * shape.height * perX;
  const slackY = SLACK * shape.height * perY;

  const x = Math.max(0, Math.round(centreX - appearW / 2 - slackX));
  const y = Math.max(0, Math.round(centreY - appearH / 2 - slackY));
  const right = Math.min(region.width, Math.round(centreX + appearW / 2 + slackX));
  const bottom = Math.min(region.height, Math.round(centreY + appearH / 2 + slackY));
  const w = right - x;
  const h = bottom - y;
  if (w < appearW + 4 || h < appearH + 2) {
    return { window: null, scores: [] };
  }

  const scores = region.frames.map((frame, index) => {
    const grey = greyscale(frame);
    const window = crop(grey, frame.width, { x, y, w, h });
    const match = findTemplate(window, w, h, template, { expectedWidth: appearW });
    return { index, atSec: index / fps, score: match.score, x: x + match.x, y: y + match.y };
  });
  return { window: { x, y, w, h }, scores };
}

announceRoot(ROOT);

const dir = join(ROOT, game);
if (!existsSync(dir)) {
  console.error(`no such folder: ${dir}`);
  process.exit(2);
}

const files = readdirSync(dir)
  .filter((f) => VIDEO.test(f) && !WORKING_FILE.test(f))
  .filter((f) => !only || f.includes(only))
  .map((f) => join(dir, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  .slice(0, limit);

if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const TONEMAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,' +
  'tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';

/** One frame of a clip, tonemapped and shrunk, for looking at. */
function writeShot(file, atSec, out, shape) {
  const vf = [shape.isHdr ? TONEMAP : '', 'scale=1200:-2'].filter(Boolean).join(',');
  execFileSync(
    ffmpegStatic,
    ['-hide_banner', '-v', 'error', '-y', '-ss', String(atSec), '-i', file, '-frames:v', '1', '-vf', vf, out],
    { stdio: 'ignore' },
  );
}

const rows = [];
console.log(['clip', 'dur', 'manDown', 'at', 'n', 'playerCard', 'at', 'n', 'ms'].join('\t'));

for (const file of files) {
  const name = file.split(/[\\/]/).pop().replace(/\.(mp4|mov|mkv)$/i, '');
  const shape = await readShape(file);
  if (!shape) {
    console.log([name.slice(0, 30), 'ERR'].join('\t'));
    continue;
  }

  const started = Date.now();
  const sampled = await sampleRegions({ filePath: file, regions: REGIONS, fps, shape });
  const result = {};
  for (const key of Object.keys(REGIONS)) {
    result[key] = sampled[key] ? scoreCue(key, sampled[key], shape) : { window: null, scores: [] };
  }
  const ms = Date.now() - started;

  const best = (key) =>
    result[key].scores.reduce((a, b) => (b.score > (a?.score ?? -1) ? b : a), null);
  const over = (key) => result[key].scores.filter((s) => s.score >= floor).length;

  const bestDown = best('mandown');
  const bestCard = best('playercard');

  rows.push({
    name,
    file,
    durationSec: shape.durationSec,
    fps,
    ms,
    mandown: result.mandown.scores.map((s) => ({ atSec: s.atSec, score: s.score })),
    playercard: result.playercard.scores.map((s) => ({ atSec: s.atSec, score: s.score })),
  });

  console.log(
    [
      name.slice(0, 30),
      shape.durationSec.toFixed(1),
      bestDown ? bestDown.score.toFixed(3) : '-',
      bestDown ? bestDown.atSec.toFixed(1) : '-',
      over('mandown'),
      bestCard ? bestCard.score.toFixed(3) : '-',
      bestCard ? bestCard.atSec.toFixed(1) : '-',
      over('playercard'),
      ms,
    ].join('\t'),
  );

  if (shotsDir) {
    for (const [key, hit] of [
      ['mandown', bestDown],
      ['playercard', bestCard],
    ]) {
      if (!hit || hit.score < floor) continue;
      const out = join(shotsDir, `${key}-${hit.score.toFixed(3)}-${name.replace(/[^\w.-]/g, '_')}.png`);
      writeShot(file, hit.atSec, out, shape);
    }
  }
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(rows, null, 2), 'utf-8');
  console.error(`wrote ${jsonOut}`);
}

const summary = (key) => {
  const bests = rows.map((r) => r[key].reduce((m, s) => Math.max(m, s.score), -1));
  const over = bests.filter((b) => b >= floor).length;
  return `${key}: ${over}/${rows.length} clips reach ${floor}`;
};
console.error(`\n${summary('mandown')}\n${summary('playercard')}`);

/**
 * Render the plugin's images from Phosphor icons (MIT, @phosphor-icons/core).
 *
 *   node scripts/render-icons.mjs
 *
 * Two kinds, because Elgato wants two kinds:
 *
 * - **Key images**, 72 and 144 square: what the LCD key shows. GoodBit's own
 *   dark ground, the glyph large and centred. The save key is the one in the
 *   accent, because the accent means the good bit and that key is how one
 *   starts; discard is the danger colour; the rest are a warm white.
 * - **List icons**, 20 and 40 (the action list) and 28 and 56 (the category):
 *   a single light glyph on transparent, which is what Elgato's guidelines ask
 *   for so they sit in the Stream Deck app's own list.
 *
 * The plugin icon is GoodBit's own app icon, so the Stream Deck app shows the
 * same mark as the taskbar.
 *
 * resvg rather than a browser: it is a renderer and nothing else, it needs no
 * Chromium download, and the output is the same on every machine.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const imgs = join(root, 'io.github.darrellvs.goodbit.sdPlugin', 'imgs');

/** The glyph's own paths, without its `<svg>` wrapper. Phosphor draws on a 256 grid. */
function glyph(name) {
  const svg = readFileSync(
    join(root, 'node_modules', '@phosphor-icons', 'core', 'assets', 'bold', `${name}-bold.svg`),
    'utf-8',
  );
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

const GROUND = '#121110';
const ACCENT = '#c1633e';
const DANGER = '#d45757';
const LIGHT = '#f2efea';

const KEYS = [
  { file: 'save', icon: 'clock-counter-clockwise', colour: ACCENT },
  { file: 'tag', icon: 'tag', colour: LIGHT },
  { file: 'publish', icon: 'cloud-arrow-up', colour: LIGHT },
  { file: 'discard', icon: 'trash', colour: DANGER },
  // The count is written over this key, so its glyph sits small at the top.
  { file: 'stats', icon: 'film-strip', colour: LIGHT, small: true },
];

function png(svg, size, out) {
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(imgs, out), rendered);
}

function keySvg({ icon, colour, small }) {
  // On a 256 canvas: a 144 glyph centred, or an 88 one near the top for stats.
  const box = small ? 88 : 144;
  const x = (256 - box) / 2;
  const y = small ? 26 : x;
  const scale = box / 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
    <rect width="256" height="256" fill="${GROUND}"/>
    <g transform="translate(${x} ${y}) scale(${scale})" fill="${colour}">${glyph(icon)}</g>
  </svg>`;
}

const listSvg = (icon) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g fill="${LIGHT}">${glyph(icon)}</g></svg>`;

for (const old of ['tag', 'publish', 'discard', 'stats']) {
  for (const suffix of ['', '@2x']) rmSync(join(imgs, `${old}${suffix}.png`), { force: true });
}
mkdirSync(join(imgs, 'keys'), { recursive: true });
mkdirSync(join(imgs, 'actions'), { recursive: true });

for (const key of KEYS) {
  png(keySvg(key), 72, `keys/${key.file}.png`);
  png(keySvg(key), 144, `keys/${key.file}@2x.png`);
  png(listSvg(key.icon), 20, `actions/${key.file}.png`);
  png(listSvg(key.icon), 40, `actions/${key.file}@2x.png`);
}
png(listSvg('film-strip'), 28, 'category.png');
png(listSvg('film-strip'), 56, 'category@2x.png');

// The app's own mark, embedded as an image so resvg scales it like the rest.
const appIcon = readFileSync(join(root, '..', 'build', 'icon.png')).toString('base64');
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"><image width="512" height="512" xlink:href="data:image/png;base64,${appIcon}"/></svg>`;
png(markSvg, 256, 'plugin.png');
png(markSvg, 512, 'plugin@2x.png');

console.log('rendered into', imgs);

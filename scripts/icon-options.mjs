/**
 * Draw a few candidate app icons and render them for comparison.
 *
 * Each candidate is an SVG written here, rasterised by Electron — which is
 * already a dependency, so this needs no image library — at the sizes Windows
 * actually shows an icon at. The contact sheet puts every candidate next to
 * every size, because an icon that reads beautifully at 512 can be a smudge in
 * the tray at 16.
 *
 *   npx electron scripts/icon-options.mjs
 *
 * Writes into tmp/icons/, which is not committed: these are for choosing from,
 * not for shipping. The chosen one gets copied to build/icon.png.
 */
import { app, BrowserWindow, nativeImage } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'tmp', 'icons');

/** The app's orange, and the two greys the UI already uses. */
const ORANGE = '#f97316';
const DEEP = '#c2410c';
const INK = '#17181c';
const PAPER = '#ffffff';

/**
 * Six candidates. Each says something different about what the app is for, and
 * none of them is a play triangle — every video tool on the machine is already
 * a play triangle.
 */
const ICONS = [
  {
    name: '1-peak',
    about: 'One bar standing clear of the rest: literally what the analysis looks for.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${ORANGE}"/>
      <g fill="${PAPER}">
        <rect x="96"  y="268" width="40" height="72"  rx="20"/>
        <rect x="156" y="244" width="40" height="120" rx="20"/>
        <rect x="216" y="132" width="40" height="344" rx="20" />
        <rect x="276" y="236" width="40" height="136" rx="20"/>
        <rect x="336" y="264" width="40" height="80"  rx="20"/>
      </g>
      <circle cx="236" cy="96" r="26" fill="${PAPER}"/>
    `,
  },
  {
    name: '2-brackets',
    about: 'Trim handles closing on a moment. The gesture the whole app is about.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${ORANGE}"/>
      <g fill="none" stroke="${PAPER}" stroke-width="44" stroke-linecap="round" stroke-linejoin="round">
        <path d="M176 128 H120 V384 H176"/>
        <path d="M336 128 H392 V384 H336"/>
      </g>
      <rect x="232" y="196" width="48" height="120" rx="24" fill="${PAPER}"/>
    `,
  },
  {
    name: '3-strip',
    about: 'A filmstrip where one frame is lit: the good bit, found inside the rest.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${INK}"/>
      <g fill="#ffffff" opacity="0.22">
        <rect x="64"  y="176" width="88" height="160" rx="16"/>
        <rect x="160" y="176" width="88" height="160" rx="16"/>
        <rect x="360" y="176" width="88" height="160" rx="16"/>
      </g>
      <rect x="256" y="152" width="96" height="208" rx="20" fill="${ORANGE}"/>
      <rect x="256" y="152" width="96" height="208" rx="20" fill="none" stroke="${PAPER}" stroke-width="12"/>
    `,
  },
  {
    name: '4-keycap',
    about: 'The replay key. You pressed it for a reason — that is the whole pitch.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${INK}"/>
      <rect x="88" y="88" width="336" height="336" rx="72" fill="${ORANGE}"/>
      <rect x="88" y="88" width="336" height="300" rx="72" fill="${DEEP}" opacity="0.0"/>
      <g fill="${PAPER}">
        <rect x="184" y="180" width="36" height="152" rx="18"/>
        <path d="M300 180 L300 332 L240 256 Z"/>
      </g>
    `,
  },
  {
    name: '5-cut',
    about: 'A clip with its ends taken off — what you keep, and what you do not.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${ORANGE}"/>
      <rect x="72" y="208" width="368" height="96" rx="28" fill="${PAPER}" opacity="0.28"/>
      <rect x="168" y="180" width="176" height="152" rx="32" fill="${PAPER}"/>
      <g fill="${ORANGE}">
        <circle cx="216" cy="256" r="16"/>
        <circle cx="296" cy="256" r="16"/>
      </g>
    `,
  },
  {
    name: '6-mark',
    about: 'A G cut open like a timeline, with the kept stretch marked in white.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${INK}"/>
      <path d="M352 176 A112 112 0 1 0 352 336 V264 H272"
            fill="none" stroke="${ORANGE}" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M352 176 A112 112 0 0 0 208 160"
            fill="none" stroke="${PAPER}" stroke-width="56" stroke-linecap="round"/>
    `,
  },
];

const SIZES = [512, 128, 48, 32, 16];

async function render(svg, size) {
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">${svg}</svg>`;
  const html =
    `<!doctype html><meta charset="utf-8">` +
    `<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>` +
    markup;

  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  // One frame is not always painted yet when load resolves.
  await new Promise((r) => setTimeout(r, 120));
  const image = await win.webContents.capturePage();
  win.destroy();
  return image;
}

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });

  const rows = [];
  for (const icon of ICONS) {
    const dir = join(OUT, icon.name);
    mkdirSync(dir, { recursive: true });
    const tiles = [];
    for (const size of SIZES) {
      const image = await render(icon.svg, size);
      writeFileSync(join(dir, `${size}.png`), image.toPNG());
      tiles.push({ size, image });
    }
    // The full-size one at the top level, so choosing means copying one file.
    writeFileSync(join(OUT, `${icon.name}.png`), tiles[0].image.toPNG());
    rows.push({ icon, tiles });
    console.log(`${icon.name}  —  ${icon.about}`);
  }

  // One sheet: every candidate as a row, every size as a column, on both a
  // light and a dark ground because a taskbar can be either.
  const sheet = rows
    .map(({ icon, tiles }) => {
      const cells = tiles
        .map(({ size, image }) => {
          const data = image.toPNG().toString('base64');
          return `<td><img src="data:image/png;base64,${data}" width="${size}" height="${size}"></td>`;
        })
        .join('');
      return `<tr><th>${icon.name}<br><small>${icon.about}</small></th>${cells}</tr>`;
    })
    .join('');

  const page =
    `<!doctype html><meta charset="utf-8"><style>
      body{font:14px/1.5 system-ui;margin:0;padding:24px}
      table{border-collapse:collapse}
      td,th{padding:14px 18px;vertical-align:middle;text-align:center}
      th{text-align:left;max-width:260px;font-weight:600}
      small{font-weight:400;color:#666}
      tbody.light{background:#f4f4f5}
      tbody.dark{background:#17181c;color:#eee}
      tbody.dark small{color:#aaa}
      h2{margin:24px 0 8px}
     </style>
     <h2>On a light ground</h2><table><tbody class="light">${sheet}</tbody></table>
     <h2>On a dark ground</h2><table><tbody class="dark">${sheet}</tbody></table>`;
  writeFileSync(join(OUT, 'contact-sheet.html'), page, 'utf-8');

  // And a flat PNG of the sheet, so it can be looked at without a browser.
  const sheetWin = new BrowserWindow({
    width: 1100,
    height: 1500,
    show: false,
    frame: false,
    webPreferences: { offscreen: true },
  });
  await sheetWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
  await new Promise((r) => setTimeout(r, 400));
  const shot = await sheetWin.webContents.capturePage();
  writeFileSync(join(OUT, 'contact-sheet.png'), shot.toPNG());
  sheetWin.destroy();

  console.log(`\nwrote ${OUT}`);
  app.quit();
});

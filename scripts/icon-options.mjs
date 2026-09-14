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
import { app, BrowserWindow } from 'electron';
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
    about: 'One bar standing clear of the rest: what the analysis actually looks for.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${ORANGE}"/>
      <g fill="${PAPER}">
        <rect x="96"  y="220" width="44" height="72"  rx="22"/>
        <rect x="158" y="188" width="44" height="136" rx="22"/>
        <rect x="220" y="104" width="44" height="304" rx="22"/>
        <rect x="282" y="180" width="44" height="152" rx="22"/>
        <rect x="344" y="216" width="44" height="80"  rx="22"/>
      </g>
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
      <g fill="${PAPER}" opacity="0.30">
        <rect x="56"  y="184" width="80" height="144" rx="18"/>
        <rect x="148" y="184" width="80" height="144" rx="18"/>
        <rect x="376" y="184" width="80" height="144" rx="18"/>
      </g>
      <rect x="244" y="144" width="120" height="224" rx="26" fill="${ORANGE}"/>
    `,
  },
  {
    name: '4-window',
    about: 'Thirty seconds of recording, with the stretch worth keeping lit inside it.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${INK}"/>
      <rect x="56" y="200" width="400" height="112" rx="34" fill="${PAPER}" opacity="0.22"/>
      <rect x="236" y="216" width="152" height="80" rx="22" fill="${ORANGE}"/>
    `,
  },
  {
    name: '5-peak-in-brackets',
    about: 'Both ideas at once: the moment that stands out, and the cut closing on it.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${ORANGE}"/>
      <g fill="none" stroke="${PAPER}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" opacity="0.55">
        <path d="M148 136 H104 V376 H148"/>
        <path d="M364 136 H408 V376 H364"/>
      </g>
      <g fill="${PAPER}">
        <rect x="196" y="224" width="40" height="64"  rx="20"/>
        <rect x="256" y="152" width="40" height="208" rx="20"/>
        <rect x="316" y="216" width="40" height="80"  rx="20"/>
      </g>
    `,
  },
  {
    name: '6-buffer',
    about: 'The replay buffer as a ring, with the slice worth keeping lit up on it.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${ORANGE}"/>
      <circle cx="256" cy="256" r="130" fill="none" stroke="${PAPER}" stroke-width="52" opacity="0.34"/>
      <path d="M348 164 A130 130 0 0 1 348 348"
            fill="none" stroke="${PAPER}" stroke-width="52" stroke-linecap="round"/>
      <circle cx="256" cy="256" r="34" fill="${PAPER}"/>
    `,
  },
  {
    name: '3b-strip-orange',
    about: 'The filmstrip, the other way round: orange ground, the kept frame in white.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${ORANGE}"/>
      <g fill="${PAPER}" opacity="0.34">
        <rect x="56"  y="184" width="80" height="144" rx="18"/>
        <rect x="148" y="184" width="80" height="144" rx="18"/>
        <rect x="376" y="184" width="80" height="144" rx="18"/>
      </g>
      <rect x="244" y="144" width="120" height="224" rx="26" fill="${PAPER}"/>
    `,
  },
  {
    name: '7-reel',
    about: 'Both at once: the buffer as a reel of frames going round, one of them kept.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${INK}"/>
      <g>
        <g transform="rotate(0 256 256)"><rect x="210" y="44" width="92" height="124" rx="24" fill="${ORANGE}"/></g>
        <g transform="rotate(45 256 256)"><rect x="210" y="44" width="92" height="124" rx="24" fill="${PAPER}" opacity="0.32"/></g>
        <g transform="rotate(90 256 256)"><rect x="210" y="44" width="92" height="124" rx="24" fill="${PAPER}" opacity="0.32"/></g>
        <g transform="rotate(135 256 256)"><rect x="210" y="44" width="92" height="124" rx="24" fill="${PAPER}" opacity="0.32"/></g>
        <g transform="rotate(180 256 256)"><rect x="210" y="44" width="92" height="124" rx="24" fill="${PAPER}" opacity="0.32"/></g>
        <g transform="rotate(225 256 256)"><rect x="210" y="44" width="92" height="124" rx="24" fill="${PAPER}" opacity="0.32"/></g>
        <g transform="rotate(270 256 256)"><rect x="210" y="44" width="92" height="124" rx="24" fill="${PAPER}" opacity="0.32"/></g>
        <g transform="rotate(315 256 256)"><rect x="210" y="44" width="92" height="124" rx="24" fill="${PAPER}" opacity="0.32"/></g>
      </g>
    `,
  },
  {
    name: '8-ring-strip',
    about: 'Both at once: a strip of frames threaded through the ring the buffer goes round.',
    svg: `
      <rect width="512" height="512" rx="96" fill="${INK}"/>
      <circle cx="256" cy="256" r="158" fill="none" stroke="${PAPER}" stroke-width="28" opacity="0.30"/>
      <g fill="${PAPER}" opacity="0.42">
        <rect x="88"  y="204" width="84" height="104" rx="20"/>
        <rect x="340" y="204" width="84" height="104" rx="20"/>
      </g>
      <rect x="196" y="170" width="120" height="172" rx="28" fill="${ORANGE}"/>
    `,
  },
];

const SIZES = [512, 128, 48, 32, 16];

/**
 * Rasterise one SVG at full size.
 *
 * Through a file rather than a `data:` URL, and through one window reused for
 * every icon: a fresh transparent offscreen window per render failed to load
 * every second time with ERR_FAILED. The smaller sizes come from resizing this
 * one image, which is also closer to what Windows does with an icon anyway.
 */
async function render(win, svg) {
  const html =
    `<!doctype html><meta charset="utf-8">` +
    `<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${svg}</svg>`;

  const file = join(OUT, '.render.html');
  writeFileSync(file, html, 'utf-8');
  await win.loadFile(file);
  // One frame is not always painted yet when the load resolves.
  await new Promise((r) => setTimeout(r, 150));
  return win.webContents.capturePage();
}

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });

  const canvas = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });

  const rows = [];
  for (const icon of ICONS) {
    const dir = join(OUT, icon.name);
    mkdirSync(dir, { recursive: true });
    const full = await render(canvas, icon.svg);
    const tiles = [];
    for (const size of SIZES) {
      const image = size === 512 ? full : full.resize({ width: size, height: size, quality: 'best' });
      writeFileSync(join(dir, `${size}.png`), image.toPNG());
      tiles.push({ size, image });
    }
    // The full-size one at the top level, so choosing means copying one file.
    writeFileSync(join(OUT, `${icon.name}.png`), tiles[0].image.toPNG());
    rows.push({ icon, tiles });
    console.log(`${icon.name}  —  ${icon.about}`);
  }
  canvas.destroy();

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

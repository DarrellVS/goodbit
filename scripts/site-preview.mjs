/**
 * Photograph the website without needing a browser to be picked.
 *
 * Electron is already a dependency and is a browser, so the pages are loaded
 * from disk and captured at a desktop width and a phone width. Enough to see
 * that a layout change did what it was meant to.
 *
 *   npx electron scripts/site-preview.mjs [index|docs] [--width 1320]
 *
 * Writes into tmp/site/. Nothing here ships.
 */
import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'tmp', 'site');
const page = process.argv.find((a) => a === 'index' || a === 'docs') ?? 'index';
const widthArg = process.argv.indexOf('--width');
const widths = widthArg > 0 ? [Number(process.argv[widthArg + 1])] : [1320, 420];

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });

  for (const width of widths) {
    const win = new BrowserWindow({
      width,
      height: 1000,
      show: false,
      webPreferences: { offscreen: true },
    });
    await win.loadFile(join(process.cwd(), 'site', `${page}.html`));
    await new Promise((r) => setTimeout(r, 900));

    // The whole page, not just the first screenful.
    const height = await win.webContents.executeJavaScript(
      'Math.min(document.documentElement.scrollHeight, 12000)',
    );
    win.setContentSize(width, height);
    await new Promise((r) => setTimeout(r, 900));

    const shot = await win.webContents.capturePage();
    const file = join(OUT, `${page}-${width}.png`);
    writeFileSync(file, shot.toPNG());
    console.log(`${file}  ${width}x${height}`);
    win.destroy();
  }

  app.quit();
});

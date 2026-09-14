/**
 * How much of the library screen is clips, and how many can you see at once.
 *
 * A library's job is to let someone find one clip among hundreds, so the
 * numbers that matter are how many it shows per screen and how much of the
 * screen it spends on anything else. Counted rather than eyeballed, at a few
 * window sizes, so a redesign can be held to the figures.
 *
 *   node scripts/ux-density.mjs --profile audit
 *
 * Sandbox only, through `GOODBIT_USER_DATA`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron } from 'playwright';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};

const profile = arg('--profile', 'audit');
const base = join(tmpdir(), `goodbit-ux-${profile}`);
const dataDir = join(base, 'data');
if (!existsSync(dataDir)) {
  console.error(`no such profile: ${dataDir}`);
  process.exit(2);
}

const outDir = join(base, 'density');
mkdirSync(outDir, { recursive: true });

/** The sizes people actually run a desktop app at, plus this machine's ultrawide. */
const SIZES = [
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'common-1920', width: 1920, height: 1080 },
  { name: 'ultrawide-3440', width: 3440, height: 1440 },
];

function measureLibrary() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const cards = [...document.querySelectorAll('article')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 80 && r.height > 60;
  });

  const onScreen = cards.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top < vh && r.bottom > 0;
  });

  const first = cards[0]?.getBoundingClientRect() ?? null;

  // Chrome is everything that is not the scrolling list of clips: the window
  // bar, the sidebar, the page header, the filter row, the floating toolbar.
  const sidebar = document.querySelector('aside, nav')?.getBoundingClientRect() ?? null;

  // Where the first clip starts is how much vertical space was spent before
  // showing any content at all.
  const contentStartsAt = first ? Math.round(first.top) : null;

  const thumbs = [...document.querySelectorAll('video')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 60;
  });

  return {
    viewport: [vw, vh],
    clipsRendered: cards.length,
    clipsVisible: onScreen.length,
    cardSize: first ? [Math.round(first.width), Math.round(first.height)] : null,
    contentStartsAtY: contentStartsAt,
    verticalSpentBeforeFirstClip: contentStartsAt !== null ? `${Math.round((contentStartsAt / vh) * 100)}%` : null,
    sidebarWidth: sidebar ? Math.round(sidebar.width) : null,
    sidebarShareOfWidth: sidebar ? `${Math.round((sidebar.width / vw) * 100)}%` : null,
    nativeVideoPlayers: thumbs.length,
    pageScrollHeight: Math.round(document.body.scrollHeight),
  };
}

const app = await electron.launch({
  args: ['out/main/index.js'],
  cwd: process.cwd(),
  env: { ...process.env, GOODBIT_USER_DATA: dataDir },
});

const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(7000);

const report = {};

for (const size of SIZES) {
  await page.setViewportSize({ width: size.width, height: size.height }).catch(() => {});
  await page.evaluate(() => {
    location.hash = '#/';
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2500);

  report[size.name] = await page.evaluate(measureLibrary);
  await page.screenshot({ path: join(outDir, `${size.name}.png`) }).catch(() => {});
}

writeFileSync(join(outDir, 'density.json'), JSON.stringify(report, null, 2), 'utf-8');
await app.close();

console.log('size            visible  rendered  card w x h   before 1st clip  sidebar  players');
for (const [name, r] of Object.entries(report)) {
  console.log(
    `${name.padEnd(15)} ${String(r.clipsVisible).padStart(7)} ${String(r.clipsRendered).padStart(9)}  ` +
      `${String(r.cardSize ? r.cardSize.join(' x ') : '-').padStart(10)}  ` +
      `${String(r.verticalSpentBeforeFirstClip ?? '-').padStart(15)}  ` +
      `${String(r.sidebarShareOfWidth ?? '-').padStart(7)}  ${String(r.nativeVideoPlayers).padStart(7)}`,
  );
}
console.log(`\n${join(outDir, 'density.json')}`);

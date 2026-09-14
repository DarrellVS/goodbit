/**
 * Measure the interface instead of arguing about it.
 *
 * "It looks AI generated" is a real complaint but not a fixable one until it
 * is a number. This walks every screen in a sandbox library and counts the
 * things that actually cause that impression: how many type sizes are in play,
 * how many weights, how many corner radii, how many distinct shadows, how many
 * accent colours, and how much of the screen is decoration rather than content.
 *
 * Counts, not opinions, so the redesign can be checked against them afterwards.
 *
 *   node scripts/ux-audit.mjs --profile audit
 *
 * Writes a screenshot and a measurement per screen. The sandbox only: it opens
 * `GOODBIT_USER_DATA` and never the real library.
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

const outDir = join(base, 'audit');
mkdirSync(outDir, { recursive: true });

/** Every screen reachable from the shell, by the sidebar text that opens it. */
const SCREENS = [
  { name: 'library', click: 'Library' },
  { name: 'today', click: 'Today' },
  { name: 'editor', click: 'Editor' },
  { name: 'smart-tags', click: 'Smart Tags' },
  { name: 'stats', click: 'Stats' },
  { name: 'settings', click: 'Settings' },
];

/**
 * What the painted screen is actually made of.
 *
 * Only elements that are visible and carry text or a surface, since a count
 * that includes every wrapper div says nothing about what a person sees.
 */
function measureScreen() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.top > window.innerHeight * 3) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };

  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

  const sizes = new Map();
  const weights = new Map();
  const families = new Map();
  const radii = new Map();
  const shadows = new Map();
  const textColours = new Map();
  const surfaces = new Map();
  const transitions = new Map();

  let textNodes = 0;
  let decorated = 0;

  for (const el of document.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);

    // Type is only type where there is text of its own.
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (own) {
      textNodes += 1;
      bump(sizes, s.fontSize);
      bump(weights, s.fontWeight);
      bump(families, s.fontFamily.split(',')[0].replace(/["']/g, '').trim());
      bump(textColours, s.color);
    }

    if (s.borderRadius && s.borderRadius !== '0px') bump(radii, s.borderRadius);
    if (s.boxShadow && s.boxShadow !== 'none') {
      bump(shadows, s.boxShadow.slice(0, 60));
      decorated += 1;
    }
    if (s.backgroundImage && s.backgroundImage.includes('gradient')) {
      bump(surfaces, 'gradient');
      decorated += 1;
    }
    const bg = s.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') bump(surfaces, bg);
    if (s.transitionDuration && s.transitionDuration !== '0s') bump(transitions, s.transitionProperty.slice(0, 40));
  }

  const top = (map, n = 12) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} x${v}`);

  return {
    counts: {
      typeSizes: sizes.size,
      typeWeights: weights.size,
      fontFamilies: families.size,
      cornerRadii: radii.size,
      shadows: shadows.size,
      textColours: textColours.size,
      surfaceColours: surfaces.size,
      animatedElements: [...transitions.values()].reduce((a, b) => a + b, 0),
      elementsWithShadowOrGradient: decorated,
      textElements: textNodes,
    },
    typeSizes: top(sizes),
    typeWeights: top(weights),
    fontFamilies: top(families),
    cornerRadii: top(radii),
    shadows: top(shadows, 8),
    textColours: top(textColours),
    surfaceColours: top(surfaces),
  };
}

const app = await electron.launch({
  args: ['out/main/index.js'],
  cwd: process.cwd(),
  env: { ...process.env, GOODBIT_USER_DATA: dataDir },
});

const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
await page.waitForTimeout(7000);

const report = {};

for (const screen of SCREENS) {
  try {
    // Back to the library between screens. Some of them take the whole window
    // and put the sidebar away, so the next one is not reachable from there.
    await page.evaluate(() => {
      location.hash = '#/';
    });
    await page.waitForTimeout(1200);

    await page.getByText(screen.click, { exact: false }).first().click({ timeout: 6000 });
    await page.waitForTimeout(1800);
  } catch (e) {
    report[screen.name] = { error: `could not open: ${String(e.message).split('\n')[0]}` };
    continue;
  }

  await page.screenshot({ path: join(outDir, `${screen.name}.png`) }).catch(() => {});
  await page.screenshot({ path: join(outDir, `${screen.name}-full.png`), fullPage: true }).catch(() => {});
  report[screen.name] = await page.evaluate(measureScreen);
}

writeFileSync(join(outDir, 'audit.json'), JSON.stringify(report, null, 2), 'utf-8');
await app.close();

// A short table is the useful part; the file has the detail.
console.log('screen        sizes weights radii shadows textCol surfCol decorated');
for (const [name, r] of Object.entries(report)) {
  if (r.error) {
    console.log(`${name.padEnd(13)} ${r.error}`);
    continue;
  }
  const c = r.counts;
  console.log(
    `${name.padEnd(13)} ${String(c.typeSizes).padStart(5)} ${String(c.typeWeights).padStart(7)} ` +
      `${String(c.cornerRadii).padStart(5)} ${String(c.shadows).padStart(7)} ` +
      `${String(c.textColours).padStart(7)} ${String(c.surfaceColours).padStart(7)} ` +
      `${String(c.elementsWithShadowOrGradient).padStart(9)}`,
  );
}
console.log(`\n${join(outDir, 'audit.json')}`);

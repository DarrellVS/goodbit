/**
 * Drive GoodBit through a list of actions and record what happened.
 *
 * Built for the UX walkthrough: someone with no knowledge of the code needs to
 * use the app end to end and say where it got in their way. They cannot hold a
 * browser open between commands, so each run replays a list of steps from the
 * start and writes down, for every step, a picture and a description of what
 * is on screen and what can be done next. Add a step, run again, and the
 * session picks up where the reading left off.
 *
 * It only ever opens the sandbox profile that `ux-seed.mjs` made, through
 * `GOODBIT_USER_DATA`, which carries the single instance lock with it. The
 * real library is never opened.
 *
 *   node scripts/ux-session.mjs --profile casual --actions steps.json --out walk1
 *
 * Steps are a JSON array. Supported shapes:
 *   { "do": "look",   "note": "the library, first impression" }
 *   { "do": "click",  "text": "Collections" }
 *   { "do": "click",  "selector": "[data-testid=x]" }
 *   { "do": "nth",    "text": "Trim", "index": 2 }
 *   { "do": "hover",  "text": "Battlefield 6" }
 *   { "do": "fill",   "selector": "input[type=search]", "text": "ready" }
 *   { "do": "press",  "key": "Escape" }
 *   { "do": "scroll", "y": 800 }
 *   { "do": "wait",   "ms": 1500 }
 *   { "do": "goto",   "hash": "#/clips/12" }
 *   { "do": "back" }
 *
 * Every step may carry "note", which is written into the log beside it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron } from 'playwright';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};

const profile = arg('--profile', 'default');
const actionsFile = arg('--actions', null);
const outName = arg('--out', 'walk');

const base = join(tmpdir(), `goodbit-ux-${profile}`);
const dataDir = join(base, 'data');
if (!existsSync(dataDir)) {
  console.error(`no such profile: ${dataDir}\nrun: node scripts/ux-seed.mjs --profile ${profile}`);
  process.exit(2);
}

const outDir = join(base, 'walks', outName);
mkdirSync(outDir, { recursive: true });

const steps = actionsFile ? JSON.parse(readFileSync(actionsFile, 'utf-8')) : [];

/**
 * What a person can see and reach right now.
 *
 * Text alone is not enough to decide what to do next, and a full DOM dump is
 * too much to read, so this is the middle: the headings that say where you
 * are, and everything clickable, with the text on it.
 */
async function readScreen(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
    };
    const label = (el) =>
      (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);

    const headings = [...document.querySelectorAll('h1,h2,h3')]
      .filter(visible)
      .map((el) => `${el.tagName.toLowerCase()}: ${label(el)}`)
      .filter((t) => t.length > 4);

    const controls = [...document.querySelectorAll('button,a[href],[role=button],[role=switch],[role=tab]')]
      .filter(visible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          text: label(el) || '(no label)',
          tag: el.tagName.toLowerCase(),
          at: [Math.round(r.x), Math.round(r.y)],
          size: [Math.round(r.width), Math.round(r.height)],
        };
      })
      .filter((c) => c.text !== '(no label)' || c.size[0] > 24);

    const inputs = [...document.querySelectorAll('input,textarea,select')]
      .filter(visible)
      .map((el) => ({
        type: el.type || el.tagName.toLowerCase(),
        placeholder: el.placeholder || '',
        value: String(el.value || '').slice(0, 60),
        name: el.name || el.id || '',
      }));

    // The body text, trimmed hard. Enough to judge wording and emptiness.
    const words = (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1800);

    return {
      route: location.hash || location.pathname,
      headings,
      controls,
      inputs,
      text: words,
      scroll: { y: Math.round(window.scrollY), height: document.body.scrollHeight },
    };
  });
}

const log = [];
let shot = 0;

async function capture(page, label, extra = {}) {
  shot += 1;
  const name = `${String(shot).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`;
  await page.screenshot({ path: join(outDir, name) }).catch(() => {});
  const screen = await readScreen(page).catch(() => null);
  log.push({ shot, label, file: name, ...extra, screen });
  return name;
}

const app = await electron.launch({
  args: ['out/main/index.js'],
  cwd: process.cwd(),
  env: { ...process.env, GOODBIT_USER_DATA: dataDir },
});

/**
 * The window with the app in it, which is not reliably the first one.
 *
 * The clip toast is a second `BrowserWindow`, built during boot so the first
 * replay of a session does not wait for one to be constructed, and `clipToast`
 * defaults to on. So it is quite capable of winning this race, and
 * `firstWindow()` then hands back a transparent 344 pixel overlay with no app
 * in it: every screenshot in the walkthrough would be of that, and a
 * walkthrough is nothing but screenshots. The same fix as `tests/e2e/app.ts`
 * and `scripts/screenshots.mjs`, told apart the same way, because the overlay
 * is a self contained `data:` page and the app is a file.
 */
async function mainWindow(instance) {
  const isApp = (candidate) => !candidate.url().startsWith('data:');

  const existing = instance.windows().find(isApp);
  if (existing) return existing;

  for (;;) {
    const opened = await instance.waitForEvent('window', { timeout: 30_000 });
    if (isApp(opened)) return opened;
  }
}

const page = await mainWindow(app);
await page.waitForLoadState('domcontentloaded');
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
// The library has to index forty clips and make thumbnails before the first
// screen means anything.
await page.waitForTimeout(6000);

await capture(page, 'start');

for (const [i, step] of steps.entries()) {
  const what = step.do;
  let error = null;

  try {
    if (what === 'look') {
      await page.waitForTimeout(step.ms ?? 400);
    } else if (what === 'click' || what === 'nth' || what === 'hover') {
      const target = step.selector
        ? page.locator(step.selector)
        : page.getByText(step.text, { exact: step.exact ?? false });
      const one = what === 'nth' ? target.nth(step.index ?? 0) : target.first();
      await one.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
      if (what === 'hover') await one.hover({ timeout: 6000 });
      else await one.click({ timeout: 6000 });
      await page.waitForTimeout(step.ms ?? 1200);
    } else if (what === 'fill') {
      await page.locator(step.selector).first().fill(step.text, { timeout: 6000 });
      await page.waitForTimeout(step.ms ?? 900);
    } else if (what === 'press') {
      await page.keyboard.press(step.key);
      await page.waitForTimeout(step.ms ?? 800);
    } else if (what === 'scroll') {
      await page.mouse.wheel(0, step.y ?? 600);
      await page.waitForTimeout(step.ms ?? 600);
    } else if (what === 'goto') {
      /*
       * Go straight to a screen, for when clicking cannot get there.
       *
       * A clip opens as a layer over the library and its card is a hover
       * target, so a driver that can only click sometimes cannot open one at
       * all. `#/clips/:id` and `#/trim/:id` are real routes and both open the
       * same thing a click would.
       */
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, step.hash);
      await page.waitForTimeout(step.ms ?? 2500);
    } else if (what === 'back') {
      await page.goBack().catch(() => {});
      await page.waitForTimeout(step.ms ?? 1000);
    } else if (what === 'wait') {
      await page.waitForTimeout(step.ms ?? 1000);
    } else {
      error = `unknown action: ${what}`;
    }
  } catch (e) {
    error = String(e.message || e).split('\n')[0].slice(0, 200);
  }

  await capture(page, `${i + 1}-${what}-${step.text || step.selector || step.note || ''}`, {
    step,
    error,
  });
  if (error) console.error(`step ${i + 1} (${what}): ${error}`);
}

writeFileSync(join(outDir, 'log.json'), JSON.stringify(log, null, 2), 'utf-8');
await app.close();

console.log(JSON.stringify({ outDir, shots: shot, steps: steps.length }, null, 2));

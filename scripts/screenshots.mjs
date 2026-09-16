/**
 * The screenshots on the website, taken from the real app.
 *
 * The library it photographs is built from real recordings, the games listed
 * in `LIBRARY` below, copied out of `SOURCE_ROOT`, because a website full of
 * test patterns tells you nothing about what the app looks like in use. Only
 * the first `EXCERPT_SEC` of each clip is taken, by stream copy, so this is
 * fast and the picture is the recorded picture.
 *
 * Everything it makes lands in `site/assets/shots/`. Nothing is written back to
 * the source folder, and the throw-away library is deleted afterwards.
 *
 * Run after `npm run build`:
 *
 *   node scripts/screenshots.mjs [--keep-png]
 */
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  unlinkSync,
  utimesSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { _electron as electron } from 'playwright';
import { announceRoot, libraryRoot } from './lib/libraryRoot.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'site', 'assets', 'shots');
const FFMPEG = ffmpegPath;

const KEEP_PNG = process.argv.includes('--keep-png');

/** Where the real recordings are. Override with `--source <folder>`. */
const SOURCE_ROOT = libraryRoot();

/** How much of each recording to copy. Enough for a thumbnail, a strip and a trim. */
const EXCERPT_SEC = 30;

/**
 * The games that appear on the website, and how many clips of each.
 *
 * A deliberate short list rather than whatever is on the disk: these are the
 * ones cleared for publication.
 */
const LIBRARY = [
  { game: 'Battlefield 6', take: 4 },
  { game: 'Ready Or Not', take: 3 },
  { game: 'forzahorizon6', take: 3 },
  { game: 'Phasmophobia', take: 1 },
];

/**
 * The recording the clip and trim shots are taken of.
 *
 * Picked rather than left to whichever clip happens to be newest, because this
 * one has a kill in it that the Battlefield module finds, so the trim page in
 * the screenshot shows the suggestion banner saying *why*, which is the part
 * worth photographing. Always copied in, whether or not it is recent enough to
 * make the `take` above.
 */
const FEATURED = { game: 'Battlefield 6', file: 'Battlefield 6_27.08.2026_20-56-01.mp4' };

const VIDEO = /\.(mp4|mov|mkv)$/i;

function seed(videosRoot) {
  let copied = 0;
  const stamps = [];

  for (const { game, take } of LIBRARY) {
    const from = join(SOURCE_ROOT, game);
    if (!existsSync(from)) {
      console.warn(`  skipping ${game}: ${from} is not there`);
      continue;
    }

    const wanted = FEATURED.game === game ? FEATURED.file : null;
    const files = readdirSync(from)
      .filter((name) => VIDEO.test(name))
      .map((name) => ({ name, at: statSync(join(from, name)).mtimeMs }))
      // Newest first, so the site shows what is actually being played.
      .sort((a, b) => b.at - a.at)
      .slice(0, take);

    // The featured one goes in whether or not it made the cut above.
    if (wanted && existsSync(join(from, wanted)) && !files.some((f) => f.name === wanted)) {
      files.push({ name: wanted, at: statSync(join(from, wanted)).mtimeMs });
    }

    if (files.length === 0) continue;

    const dir = join(videosRoot, game);
    mkdirSync(dir, { recursive: true });

    for (const file of files) {
      const target = join(dir, file.name);

      // Stream copy, so this costs a second per clip and the picture is the
      // recorded picture rather than a re-encode of it.
      execFileSync(FFMPEG, [
        '-hide_banner', '-v', 'error',
        '-t', String(EXCERPT_SEC),
        '-i', join(from, file.name),
        '-c', 'copy', '-y', target,
      ]);

      // The app groups by when a clip was recorded and takes that from the
      // file's creation time, so the excerpt has to carry the original's date
      // or every heading collapses into "Today". `utimes` cannot set creation
      // time on Windows, which is why PowerShell is doing it below.
      const when = dateFromName(file.name.replace(VIDEO, '')) ?? new Date(file.at);
      utimesSync(target, when, when);
      stamps.push({ target, when });
      copied++;
    }
  }

  if (copied === 0) throw new Error(`no recordings found under ${SOURCE_ROOT}`);

  setCreationTimes(stamps);
  console.log(`  ${copied} excerpts`);
}

/**
 * Windows keeps a creation time separate from the modified time, and it is the
 * one the app reads. Node cannot set it; PowerShell can, in one go.
 */
function setCreationTimes(stamps) {
  if (stamps.length === 0) return;

  const script = stamps
    .map(
      ({ target, when }) =>
        `(Get-Item -LiteralPath ${JSON.stringify(target)}).CreationTime = ` +
        `[datetime]::Parse(${JSON.stringify(when.toISOString())}).ToLocalTime()`,
    )
    .join('; ');

  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: 'ignore',
  });
}

/** Tags per game, so the pictures show a library someone has actually used. */
const TAGS = {
  'Battlefield 6': [
    ['squad wipe', 'tank'],
    ['clutch'],
    ['rocket'],
    ['squad wipe', 'funny'],
  ],
  'Ready Or Not': [['breach'], ['clutch', 'no casualties'], ['breach', 'flashbang']],
  forzahorizon6: [['drift'], ['near miss'], ['jump']],
  Phasmophobia: [['jumpscare', 'funny']],
};

/**
 * Names for the demo clips, per game.
 *
 * A wall of `Battlefield 6_30.08.2026_13-17-24.mp4` is what the app is for
 * getting away from, so photographing one sells the opposite of the point. The
 * recordings themselves are never renamed, a display name is a database field
 *, and this library is thrown away afterwards.
 */
const NAMES = {
  'Battlefield 6': [
    'Last one standing',
    'Rocket, then silence',
    'Whole squad on the point',
    'He really did not expect that',
    'Tank, from the rooftop',
  ],
  'Ready Or Not': ['Breach and clear, eventually', 'Nobody got hit', 'Flashbang, then regret'],
  forzahorizon6: ['Held the drift all the way', 'Missed the wall by nothing', 'Off the ramp'],
  Phasmophobia: ['It followed us out'],
};

/** What the featured recording is called, since the trim shot is about it. */
const FEATURED_NAME = 'Caught him coming up the steps';

/** The collection that appears on the clip page, and in the sidebar. */
const COLLECTION = 'Best of the month';

/**
 * Tag the demo clips and put a few in a collection.
 *
 * An empty library photographs badly, and worse, it photographs dishonestly:
 * tags and collections are most of the point of the app and a screenshot
 * without them suggests there is nothing there.
 */
async function dressTheLibrary(page) {
  const applied = await page.evaluate(
    async ({ tags, names, collectionName, featured, featuredName }) => {
      const api = (method, path, body) => window.goodbit.apiRequest({ method, path, body });

      const clips = (
        await window.goodbit.apiRequest({
          method: 'GET',
          path: '/clips',
          query: { pageSize: 100 },
        })
      ).body.items;

      const used = {};
      let tagged = 0;
      let named = 0;

      for (const clip of clips) {
        const list = tags[clip.game];
        if (!list) continue;

        const index = used[clip.game] ?? 0;
        used[clip.game] = index + 1;

        const wanted = list[index % list.length];
        await api('PATCH', `/clips/${clip.id}`, { tags: wanted });
        tagged++;

        const pool = names[clip.game];
        const displayName = clip.filename === featured ? featuredName : pool?.[index % pool.length];
        if (displayName) {
          await api('PATCH', `/clips/${clip.id}`, { displayName });
          named++;
        }
      }

      const collection = (await api('POST', '/collections', { name: collectionName })).body;
      // A handful from different games, which is what a collection is for.
      const picked = [clips[0], clips[4], clips[7]].filter(Boolean);
      for (const clip of picked) {
        await api('POST', `/collections/${collection.id}/clips/${clip.id}`, undefined);
      }

      // One starred clip, so the Starred tab is not empty either.
      if (clips[1]) await api('POST', `/clips/${clips[1].id}/star`, undefined);

      return { tagged, named, collected: picked.length };
    },
    {
      tags: TAGS,
      names: NAMES,
      collectionName: COLLECTION,
      featured: FEATURED.file,
      featuredName: FEATURED_NAME,
    },
  );

  console.log(`  named and tagged ${applied.named} of ${applied.tagged} clips, collected ${applied.collected}`);
}

/**
 * Wait until every frame strip on the page has actually decoded.
 *
 * On the timeline they are CSS backgrounds and on the trim page an `<img>`, and
 * neither gives a usable event: a request that is still being generated leaves
 * `complete` false, while one that failed leaves it true. So both are re-fetched
 * into an `Image` and the question asked is whether there are pixels.
 */
/**
 * Wait for the suggestion banner to stop saying it is working.
 *
 * On a game whose HUD gets read this is a few seconds of ffmpeg, and a
 * screenshot taken before it lands shows a spinner instead of the answer.
 */
async function waitForSuggestion(page, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const settled = await page.evaluate(() => {
      const text = document.body.innerText;
      if (/Listening/i.test(text)) return false;
      return /worth keeping|loudest stretch/i.test(text);
    });
    if (settled) return;
    await page.waitForTimeout(500);
  }
  console.warn('  no suggestion appeared in time; shooting anyway');
}

async function waitForStrips(page, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ready = await page.evaluate(async () => {
      const fromStyles = Array.from(document.querySelectorAll('[style*="media/strip"]'))
        .map((node) => /url\("?([^")]+)"?\)/.exec(node.getAttribute('style') || '')?.[1])
        .filter(Boolean);

      const fromImages = Array.from(document.querySelectorAll('img[src*="media/strip"]')).map(
        (img) => img.getAttribute('src'),
      );

      const urls = [...new Set([...fromStyles, ...fromImages])];
      if (urls.length === 0) return false;

      const answers = await Promise.all(
        urls.map(
          (url) =>
            new Promise((resolve) => {
              const image = new Image();
              image.onload = () => resolve(image.naturalWidth > 0);
              image.onerror = () => resolve(false);
              image.src = url;
            }),
        ),
      );

      return answers.every(Boolean);
    });

    if (ready) {
      // One more beat for the page to paint what it just decoded.
      await page.waitForTimeout(1500);
      return;
    }

    await page.waitForTimeout(2000);
  }

  console.warn('  frame strips never finished; shooting anyway');
}

/** `Battlefield 6_17.05.2026_21-09-49` → a Date. */
function dateFromName(name) {
  const m = /_(\d{2})\.(\d{2})\.(\d{4})_(\d{2})-(\d{2})-(\d{2})$/.exec(name);
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, s);
}

/** PNG is what Chromium gives us; webp is what should be on a web page. */
function toWebp(png) {
  const webp = png.replace(/\.png$/, '.webp');
  execFileSync(FFMPEG, ['-hide_banner', '-v', 'error', '-i', png, '-q:v', '82', '-y', webp]);
  if (!KEEP_PNG) unlinkSync(png);
  return webp;
}

async function main() {
  if (!existsSync(join(ROOT, 'out', 'main', 'index.js'))) {
    throw new Error('Build first: npm run build');
  }

  const base = mkdtempSync(join(tmpdir(), 'goodbit-shots-'));
  const dataDir = join(base, 'data');
  const videosRoot = join(base, 'videos');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(base, 'music'), { recursive: true });
  mkdirSync(SHOTS, { recursive: true });

  writeFileSync(
    join(dataDir, 'settings.json'),
    JSON.stringify({
      videosRoot,
      audioRoot: join(base, 'music'),
      publisherBaseUrl: '',
      startAtLogin: false,
      keepRunningInTray: false,
      migratedFromWebApp: false,
      window: { width: 1440, height: 900, maximized: false },
    }),
  );

  console.log('making a library to photograph…');
  seed(videosRoot);

  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: ROOT,
    env: { ...process.env, GOODBIT_USER_DATA: dataDir },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.setViewportSize({ width: 1440, height: 900 });

  // The watcher waits for a file to stop changing before it indexes it, and
  // these are real 3440x1440 recordings whose thumbnails take a moment. Wait
  // for the count to stop moving rather than guessing at a delay.
  console.log('waiting for the library to be indexed…');
  let seen = -1;
  for (let settled = 0; settled < 3; ) {
    await page.waitForTimeout(3000);
    const count = await page.evaluate(async () => {
      const answer = await window.goodbit.apiRequest({
        method: 'GET',
        path: '/clips',
        query: { pageSize: 1 },
      });
      return answer.body.total ?? answer.body.items.length;
    });

    settled = count === seen && count > 0 ? settled + 1 : 0;
    seen = count;
  }
  console.log(`  ${seen} clips indexed`);

  await dressTheLibrary(page);

  await page.evaluate(() => localStorage.setItem('goodbit-theme', 'dark'));
  await page.reload();
  await page.waitForTimeout(3000);

  const go = async (hash, settle = 2500) => {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await page.waitForTimeout(settle);
  };

  const shoot = async (name) => {
    const png = join(SHOTS, `${name}.png`);
    await page.screenshot({ path: png });
    console.log(`  ${toWebp(png)}`);
  };

  await go('#/');
  await shoot('library');

  await go('#/stats');
  await shoot('stats');

  // The featured recording if it is in there, else whatever is newest.
  const subject = await page.evaluate(async (wanted) => {
    const answer = await window.goodbit.apiRequest({
      method: 'GET',
      path: '/clips',
      query: { pageSize: 100 },
    });
    const items = answer.body.items;
    return (items.find((c) => c.filename === wanted) ?? items[0]).id;
  }, FEATURED.file);

  await go(`#/clips/${subject}`);
  await shoot('clip');

  await go(`#/trim/${subject}`, 4000);
  // Same story as the editor: the strip is generated on demand, and for a real
  // 3440x1440 recording that is ten seconds of ffmpeg.
  await waitForStrips(page);
  // And the suggestion takes a moment of its own on a game whose HUD is read,
  // which is the whole reason this clip was chosen.
  await waitForSuggestion(page);
  await shoot('trim');

  await go('#/editor', 4000);
  // Put a couple of clips on the timeline so the lane is not empty.
  const thumbs = page.locator('img[src^="goodbit://media/thumb"]');
  for (let i = 0; i < 3; i++) {
    await thumbs.nth(i).click();
    await page.waitForTimeout(1200);
  }
  // Select the first block, so the properties panel shows the highlight the
  // analysis found rather than "no clip selected".
  await page.locator('.cursor-grab').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // The strip behind a timeline block is a CSS background, generated on demand
  // from the source clip, which for a real 3440x1440 recording takes several
  // seconds. Shooting before it arrives gives a picture of an empty block.
  await waitForStrips(page);
  await shoot('editor');

  await go('#/settings?section=general');
  await shoot('settings');

  await app.close();
  rmSync(base, { recursive: true, force: true });
  console.log('done');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

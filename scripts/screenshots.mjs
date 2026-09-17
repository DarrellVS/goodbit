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
const IMG = join(ROOT, 'site', 'assets', 'img');

/**
 * The social card, at the size the pages promise it is.
 *
 * `index.html` declares `og:image:width` 1200 and `og:image:height` 630, so
 * this is shot at exactly that rather than cropped down from a 1440x1080 one,
 * which would cut the library in half. It is the picture Discord and every
 * other unfurler shows for the whole site, and it was the most out of date
 * thing here by a wide margin: a "Published / Not Published" tab pair, "Tags"
 * and "Rescan" buttons, "9 Videos", and the browser's own video controls on
 * every card, none of which the app has had for a long time.
 */
const OG_CARD = { width: 1200, height: 630 };

/**
 * Shot at this size, then scaled down to `OG_CARD`.
 *
 * Same 1.905 aspect ratio, so nothing is stretched, but 840 logical pixels of
 * height instead of 630. At 630 the app had less room than it needs: the
 * sidebar grew its own scrollbar and scrolled `Phasmophobia` out of sight, so
 * the card showed three game rows adding to eleven beside a header reading
 * `12 clips`, and the only clip card was sliced in half by the bottom edge
 * with no border under it. A scrollbar in a social card is a tell by itself.
 */
const OG_SHOT = { width: 1600, height: 840 };
const FFMPEG = ffmpegPath;

const KEEP_PNG = process.argv.includes('--keep-png');

/** Where the real recordings are. Override with `--source <folder>`. */
const SOURCE_ROOT = libraryRoot();

/**
 * The size everything is photographed at.
 *
 * Taller than the 900 it used to be, because of one screen. The trim page is a
 * flex column and the preview is the `flex-1` in it, so it gets whatever the
 * frame strip, the suggestion banner, the scrubber, the range readouts and the
 * mark bar leave behind. At 900 that was 145 pixels, and a 3440x1440 recording
 * fitted into a 1310x145 box by height is a 330 pixel picture between two
 * enormous black bars: the shot was mostly letterbox.
 *
 * Nothing in the app was changed for this. That layout is right for somebody
 * who has a small window, and the website is not the place to argue about it.
 *
 * `site/index.html` and `site/docs.html` carry these same numbers as `width`
 * and `height` on each `<img>`, so a page reserves the right space before the
 * picture arrives. Change these and change those.
 */
const SHOT_WIDTH = 1440;
const SHOT_HEIGHT = 1080;

/** How much of each recording to copy. Enough for a thumbnail, a strip and a trim. */
const EXCERPT_SEC = 30;

/**
 * How short a recording may be and still be photographed.
 *
 * Newest-first alone put a wall of four and six second clips on the website,
 * because the most recent things in this library are already-trimmed keepers
 * rather than full replays. Every duration on the page read "0:06", the
 * trimmer had nothing to scrub through, and two marked ranges came out 1.3
 * seconds each. Length is what makes these screens look like they have
 * something in them.
 *
 * A floor rather than "the longest ones": sorting by length would photograph
 * the same handful of clips for ever and quietly stop being a sample of the
 * library.
 */
const MIN_SEC = 18;

/**
 * What a trim leaves behind, which is not a recording.
 *
 * The same test `ScanAndSyncClipsAction` uses, and it has to be here for the
 * same reason the bench needed its own copy: this library really does contain
 * `.goodbit-trim-Battlefield 6_22.08.2026_16-21-30-1789506667787.mp4`, it
 * really was recent enough to be picked, and it really was copied in. The app
 * then skipped it, so twelve excerpts became eleven clips and the only sign
 * was a number in a log.
 */
const WORKING_FILE = /(^\.goodbit-(trim|bak)-|\.tmp-\d+\.[a-z0-9]+$)/i;

/**
 * `Game_DD.MM.YYYY_HH-MM-SS.mp4`, which is what OBS and GoodBit produce.
 *
 * Anything else in a game folder arrived some other way. `Edited_2025-10-10.mp4`
 * and `Edited_2025-10-10_1.mp4` are both sitting in Satisfactory, and they are
 * exports, not recordings: no date to read out of the name, and a name nobody
 * would want photographed.
 */
const RECORDING_NAME = /^.+_\d{2}\.\d{2}\.\d{4}_\d{2}-\d{2}-\d{2}\.(mp4|mov|mkv)$/i;

/**
 * The games that appear on the website, and how many clips of each.
 *
 * A deliberate short list rather than whatever is on the disk: these are the
 * ones cleared for publication.
 */
const LIBRARY = [
  { game: 'Battlefield 6', take: 4 },
  { game: 'Ready Or Not', take: 3 },
  // Was `forzahorizon6`, which is not in this library any more and, being
  // named after an executable, is exactly the kind of folder name the game
  // override exists to tidy up before anybody photographs it.
  { game: 'Satisfactory', take: 3 },
  { game: 'Phasmophobia', take: 1 },
];

/**
 * The recording the clip and trim shots are taken of.
 *
 * Picked rather than left to whichever clip happens to be newest, and picked
 * by running the shipped detector over the library rather than by watching
 * them: `node scripts/hud-check.mjs "Battlefield 6" --limit 30`. This is the
 * one clip in that sample whose reason reads **"two kills, 5 seconds apart"**,
 * where every other hit says "you dropped someone here". The suggestion banner
 * is the part of the trim page worth photographing, so it should be showing
 * the most interesting thing the detector can say.
 *
 * It is also 27 seconds. The clip that was here before was 6, which put "0:06"
 * on the library card, on the clip page, and three times over on the trimmer,
 * and made the two marked ranges 1.3 seconds each. Always copied in, whether
 * or not it is recent enough to make the `take` above.
 */
const FEATURED = { game: 'Battlefield 6', file: 'Battlefield 6_20.08.2026_20-45-47.mp4' };

const VIDEO = /\.(mp4|mov|mkv)$/i;

/**
 * How long a recording is, from the header.
 *
 * `ffprobe` is not in `ffmpeg-static`, only `ffmpeg` is, and asking ffmpeg for
 * a file with no output is an error by definition: it prints what it read and
 * exits non-zero. So the duration is parsed off the failure, which is the
 * documented way to do this with only the one binary.
 */
function probeSeconds(file) {
  try {
    execFileSync(FFMPEG, ['-hide_banner', '-i', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const said = (error.stderr ?? '').toString();
    const found = /Duration: (\d+):(\d+):([\d.]+)/.exec(said);
    if (found) return Number(found[1]) * 3600 + Number(found[2]) * 60 + Number(found[3]);
  }
  return 0;
}

/**
 * At most `PROBE_LIMIT` headers read per game before settling for what we have.
 *
 * A header read is cheap, but Battlefield 6 has 176 clips in it and reading
 * every one to choose four is a slow way to be thorough about something that
 * only has to look right.
 */
const PROBE_LIMIT = 40;

/**
 * The clips to photograph from one game folder: newest first, long enough, and
 * actually recordings.
 *
 * Newest first is still the order, because the site should show what is being
 * played now rather than the best clips of all time. The floor just refuses
 * the ones with nothing in them to look at, and if a game cannot field enough
 * of those, the longest of whatever was read is better than a 3.8 second one
 * picked on its timestamp.
 */
function pick(from, take) {
  const candidates = readdirSync(from)
    .filter((name) => VIDEO.test(name) && !WORKING_FILE.test(name) && RECORDING_NAME.test(name))
    .map((name) => ({ name, at: statSync(join(from, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);

  const kept = [];
  const probed = [];

  for (const candidate of candidates.slice(0, PROBE_LIMIT)) {
    const seconds = probeSeconds(join(from, candidate.name));
    probed.push({ ...candidate, seconds });
    if (seconds >= MIN_SEC) kept.push(candidate);
    // Through `dropLonelyNewestDay` on the way out, like the fallback path
    // below. Returning `kept` raw here skipped it, which is most of the time:
    // this library has plenty of long clips, so the early return is the normal
    // exit and the lonely-day rule never ran.
    if (kept.length === take) return dropLonelyNewestDay(kept);
  }

  // Not enough long ones. Fill the rest with the longest that were read, still
  // newest first among those, and never the same clip twice.
  const filler = probed
    .filter((row) => !kept.some((row2) => row2.name === row.name))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, take - kept.length)
    .sort((a, b) => b.at - a.at);

  return dropLonelyNewestDay([...kept, ...filler]);
}

/**
 * Drop the newest day if it holds a single clip and a fuller day follows.
 *
 * The library groups by game and day, so one clip recorded on its own becomes
 * a heading with one card under it and the rest of that row empty. Newest
 * first put exactly that at the top of the library screenshot: a single card
 * beside about eleven hundred pixels of nothing, directly under the header,
 * as the first thing anybody saw of a screen called My Library.
 *
 * It was also the worst thumbnail in the set, a near-black frame you could not
 * read, and it was the one the clip and card shots were nearest to.
 *
 * This is a choice about what to photograph, not about how the app groups. A
 * day with one clip in it is real and the app is right to show it that way;
 * it is just a poor thing to lead a picture with. Nothing is backfilled,
 * because the point is to start on a full row rather than to hit a count.
 */
function dropLonelyNewestDay(picked) {
  if (picked.length < 3) return picked;

  const dayOf = (row) => {
    const when = dateFromName(row.name.replace(VIDEO, ''));
    return when ? when.toDateString() : String(row.at);
  };

  const byDay = new Map();
  for (const row of picked) {
    const key = dayOf(row);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  if (byDay.size < 2) return picked;

  const newest = [...picked].sort((a, b) => b.at - a.at)[0];
  const newestDay = dayOf(newest);
  if (byDay.get(newestDay) !== 1) return picked;

  const fullest = Math.max(...[...byDay.entries()].filter(([k]) => k !== newestDay).map(([, n]) => n));
  if (fullest < 3) return picked;

  return picked.filter((row) => row.name !== newest.name);
}

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
    const files = pick(from, take);

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
  Satisfactory: [['factory'], ['belts'], ['trains']],
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
  Satisfactory: ['The factory finally runs', 'Belt jam, fixed', 'Train arrives on time'],
  Phasmophobia: ['It followed us out'],
};

/**
 * The moments marked on the demo clips, per game, as fractions of the clip.
 *
 * Two on some, one on others, none at all on the rest, which is what a real
 * library looks like. Marking every clip would photograph a feature nobody
 * uses that evenly, and the library card's bands read as a progress bar rather
 * than as marks when every card carries them.
 */
const MARKS = {
  'Battlefield 6': [
    [[0.18, 0.42, 'The smoke goes up'], [0.61, 0.79, 'Last one down']],
    [[0.3, 0.55, 'Direct hit']],
    [[0.24, 0.41, 'Both of them at once']],
  ],
  'Ready Or Not': [
    [[0.22, 0.4, 'Door goes in'], [0.58, 0.76, 'Corner, cleared']],
    [[0.35, 0.6, 'Flash lands right']],
  ],
  Satisfactory: [[[0.4, 0.66, 'The belts line up']]],
  Phasmophobia: [[[0.55, 0.72, 'It was behind us']]],
};

/**
 * The featured clip's own marks.
 *
 * Separate from the list above because this recording is photographed twice,
 * on the clip page and on the trim page, and both shots are about what has
 * been marked on it. Two, spread apart, so the bands are legibly two things
 * rather than one wide one.
 */
const FEATURED_MARKS = [
  [0.24, 0.46, 'Coming up the steps'],
  [0.63, 0.84, 'The one that counted'],
];

/** What the featured recording is called, since the trim shot is about it. */
const FEATURED_NAME = 'Caught him coming up the steps';

/**
 * A note on the featured clip, because that panel is in the shot.
 *
 * "No notes yet. Add context, or mark a moment with a timestamp." is what the
 * clip page showed underneath everything else, which photographs a feature by
 * showing the state it is in before anybody uses it.
 *
 * The timestamps are real positions in this recording and they are the point:
 * the editor turns `0:17` into a chip that seeks there, so a note written like
 * this is also a set of jumps into the clip. Markdown works, hence the bold.
 */
const FEATURED_NOTE = [
  'Went wide along the containers and waited instead of pushing.',
  '',
  '**0:17** is the pair of them, about five seconds apart, and neither one',
  'worked out where it was coming from. 0:06 is getting into position, which',
  'is the boring half and the reason the rest worked.',
].join('\n');

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
    async ({
      tags,
      names,
      marks,
      featuredMarks,
      collectionName,
      featured,
      featuredName,
      note,
    }) => {
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

      // The featured clip gets a note, since its panel is in the shot.
      const noted = clips.find((clip) => clip.filename === featured);
      if (noted) await api('PATCH', `/clips/${noted.id}`, { notes: note });

      // One starred clip, so the Starred tab is not empty either.
      if (clips[1]) await api('POST', `/clips/${clips[1].id}/star`, undefined);

      /*
       * Mark some GoodBits, because a screenshot without them argues the app
       * has nothing to point at.
       *
       * They are the feature the product is named after and they show in three
       * of these pictures: as bands over a library card, as highlights on the
       * player's progress bar, and as a list beside the trimmer. A trim page
       * photographed with nothing marked is the emptiest possible version of
       * the screen that matters most.
       *
       * Keyed by game like the tags and the names above, and for the same
       * reason: these are labels a person would write, so "Breach goes in" on
       * a Battlefield clip reads as placeholder text the moment anybody looks.
       *
       * The ranges are fractions of each clip's own length rather than fixed
       * seconds, because the excerpts run to `EXCERPT_SEC` but a recording
       * shorter than that stays short, and a hardcoded 18.0 on a nine second
       * clip is a mark past the end of it.
       */
      let marked = 0;
      const mark = async (clip, ranges) => {
        const length = clip?.durationSec ?? 0;
        if (!clip || length <= 1) return;

        for (const [from, to, label] of ranges) {
          await api('POST', `/clips/${clip.id}/goodbits`, {
            startSec: Number((length * from).toFixed(2)),
            endSec: Number((length * to).toFixed(2)),
            name: label,
            source: 'manual',
          });
          marked += 1;
        }
      };

      const seenPerGame = {};
      for (const clip of clips) {
        if (clip.filename === featured) continue;

        const list = marks[clip.game];
        if (!list) continue;

        const index = seenPerGame[clip.game] ?? 0;
        seenPerGame[clip.game] = index + 1;

        // One game runs out of written marks before it runs out of clips, and
        // a library where every single clip is marked is its own kind of lie.
        const ranges = list[index];
        if (ranges) await mark(clip, ranges);
      }

      // And the featured recording, which is what the clip and the trim shots
      // are both of, so each shows the bands rather than an empty bar.
      await mark(
        clips.find((clip) => clip.filename === featured),
        featuredMarks,
      );

      return { tagged, named, collected: picked.length, marked };
    },
    {
      tags: TAGS,
      names: NAMES,
      marks: MARKS,
      featuredMarks: FEATURED_MARKS,
      collectionName: COLLECTION,
      featured: FEATURED.file,
      featuredName: FEATURED_NAME,
      note: FEATURED_NOTE,
    },
  );

  console.log(
    `  named and tagged ${applied.named} of ${applied.tagged} clips, ` +
      `collected ${applied.collected}, marked ${applied.marked} GoodBits`,
  );
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

/**
 * Put the timeline back to its start, and check the gutter survived.
 *
 * The lanes sit `TIMELINE_OFFSET_PX` in from the scroller's edge, and that
 * gutter is only visible while the scroller is at zero. Adding clips and
 * zooming both move `scrollLeft`, and the editor screenshot came back with the
 * playhead sitting on the panel's own border: correct code, photographed from
 * 26 pixels along. Nothing in the app is wrong there, a scrolled timeline is
 * supposed to scroll its gutter away, so this is the rig's problem to fix.
 *
 * It measures afterwards rather than trusting the reset, and says so when the
 * number is wrong, because this is exactly the sort of thing that is invisible
 * until somebody puts a screenshot next to a ruler.
 */
async function settleTimeline(page) {
  const gutter = await page.evaluate(() => {
    const lane = document.querySelector('.h-16.rounded-lg');
    if (!lane) return null;

    // The lanes' own scroller, and the ruler that scrolls in step with it.
    const content = lane.parentElement?.parentElement;
    const ruler = content?.previousElementSibling;
    if (content) content.scrollLeft = 0;
    if (ruler) ruler.scrollLeft = 0;

    const scroller = content?.getBoundingClientRect().left;
    const inset = lane.getBoundingClientRect().left;
    return scroller == null ? null : Math.round((inset - scroller) * 100) / 100;
  });

  await page.waitForTimeout(600);

  if (gutter === null) {
    console.warn('  could not measure the timeline gutter');
    return;
  }

  console.log(`  timeline gutter: ${gutter}px`);
  if (gutter < 6) {
    console.warn(`  the timeline is photographed flush against its panel (${gutter}px)`);
  }
}

/**
 * The window with the app in it, which is not reliably the first one.
 *
 * The clip toast is a second `BrowserWindow`, built during boot so the first
 * replay of a session does not wait for one to be constructed, and it can win
 * that race. `firstWindow()` then hands back a transparent 344 pixel overlay,
 * and every screenshot below is of that. The same fix as `tests/e2e/app.ts`,
 * and told apart the same way: the overlay is a self contained `data:` page,
 * the app is a file.
 */
async function mainWindow(app) {
  const isApp = (candidate) => !candidate.url().startsWith('data:');

  const existing = app.windows().find(isApp);
  if (existing) return existing;

  for (;;) {
    const opened = await app.waitForEvent('window', { timeout: 30_000 });
    if (isApp(opened)) return opened;
  }
}

/** `Battlefield 6_17.05.2026_21-09-49` → a Date. */
function dateFromName(name) {
  const m = /_(\d{2})\.(\d{2})\.(\d{4})_(\d{2})-(\d{2})-(\d{2})$/.exec(name);
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, s);
}

/**
 * The social card is a jpg, because that is the name every unfurler is given.
 *
 * `size` scales it on the way out, so the page can be photographed with more
 * room than the card has and still land on the exact dimensions the meta tags
 * promise. `lanczos` because this is a downscale of text.
 */
function toJpeg(png, target, size) {
  const filter = size ? ['-vf', `scale=${size.width}:${size.height}:flags=lanczos`] : [];
  execFileSync(FFMPEG, [
    '-hide_banner', '-v', 'error', '-i', png,
    ...filter, '-q:v', '3', '-y', target,
  ]);
  if (!KEEP_PNG) unlinkSync(png);
  return target;
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
  mkdirSync(IMG, { recursive: true });

  writeFileSync(
    join(dataDir, 'settings.json'),
    JSON.stringify({
      videosRoot,
      audioRoot: join(base, 'music'),
      publisherBaseUrl: '',
      startAtLogin: false,
      keepRunningInTray: false,
      migratedFromWebApp: false,
      window: { width: 1440, height: SHOT_HEIGHT, maximized: false },
    }),
  );

  console.log('making a library to photograph…');
  seed(videosRoot);

  const app = await electron.launch({
    args: ['out/main/index.js'],
    cwd: ROOT,
    env: { ...process.env, GOODBIT_USER_DATA: dataDir },
  });

  const page = await mainWindow(app);
  await page.waitForLoadState('domcontentloaded');
  await page.setViewportSize({ width: SHOT_WIDTH, height: SHOT_HEIGHT });

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

  const go = async (hash, settle = 2500) => {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await page.waitForTimeout(settle);
  };

  /*
   * Both palettes, because the website follows the reader's own.
   *
   * `style.css` switches on `prefers-color-scheme` and has no toggle, so a
   * reader in light mode got a page of light panels wrapped around six dark
   * screenshots. The app has the same two palettes, so the honest fix is to
   * photograph it twice. The light set is suffixed and the dark set keeps the
   * bare names, since the dark ones are what every existing `<img>` points at.
   */
  for (const palette of ['dark', 'light']) {
    const suffix = palette === 'dark' ? '' : '-light';
    console.log(`${palette}:`);

    await page.evaluate((choice) => {
      localStorage.setItem('goodbit-theme', choice);

      /*
       * Put the OBS banner away before anything is photographed.
       *
       * It is correct, and it is the single loudest thing on the library shot:
       * a full width orange warning saying OBS is not set up to record into
       * your library, above the clips. It is correct because this *is* a
       * throw-away library in a temp folder that no OBS has ever recorded
       * into, which makes it a true statement about the screenshot rig and a
       * false impression of the app. The same key the dismiss button writes,
       * so nothing here has to know how the banner decides.
       */
      sessionStorage.setItem('goodbit.obs-banner-dismissed', 'yes');
    }, palette);
    await page.reload();
    await page.waitForTimeout(3000);

    const shoot = async (name) => {
      const png = join(SHOTS, `${name}${suffix}.png`);
      await page.screenshot({ path: png });
      console.log(`  ${toWebp(png)}`);
    };

    await go('#/');
    await shoot('library');

    /*
     * The social card, from the dark palette only, and taken here rather than
     * at the end.
     *
     * There is one `og:image` and no way to offer an unfurler a choice, so it
     * gets the dark one, which is what the app ships as by default.
     *
     * The position in the sequence is the load-bearing part. Taken last, after
     * the clip and trim shots, it came back showing the trim screen: a clip is
     * a *layer* over the library held in module state rather than a route, so
     * setting the hash back to `#/` stepped the route back and left the layer
     * open on top of it. Here, nothing has been opened yet, so there is no
     * state to undo and no modal to race.
     */
    if (palette === 'dark') {
      await page.setViewportSize(OG_SHOT);
      await page.waitForTimeout(2000);

      const png = join(IMG, 'og-card.png');
      await page.screenshot({ path: png });
      console.log(`  ${toJpeg(png, join(IMG, 'og-card.jpg'), OG_CARD)}`);

      await page.setViewportSize({ width: SHOT_WIDTH, height: SHOT_HEIGHT });
      await page.waitForTimeout(1500);
    }

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
    /*
     * Hold the player still, just before the first marked range.
     *
     * The `<video>` autoplays, so without this the shot lands wherever the clip
     * happened to be two and a half seconds in, with the button caught between
     * its two states.
     *
     * The position is the part that matters, and two things decide it.
     *
     * The played portion is `orange-500` and it is drawn *over* the bands, which
     * are `orange-400/80`, so a playhead past a mark covers it and a playhead
     * between the two joins them into one long orange run: the bar stops reading
     * as "two moments in here" and starts reading as a progress bar that has
     * lost track of itself. That rules out everything from the first mark on.
     *
     * Which leaves the opening few seconds, and those were looked at rather than
     * guessed: rendering the candidates as a contact sheet puts a sniper scope
     * over the middle of this clip, so 12% and 16% are both a big black donut.
     * 4% is the open shot, water and sky and the weapon in frame, with the HUD
     * legible. The fill is short there, which is the honest thing for a clip
     * that has just started.
     */
    await page.evaluate(async () => {
      /*
       * The biggest `<video>` on the page, not the first one.
       *
       * `document.querySelector('video')` does not return the player. A card's
       * thumbnail is a `<video>` too (`AppClipCard.vue`), the library is still
       * mounted behind the modal because a clip is a layer over it rather than a
       * route, and those come first in the document. So every pause and every
       * seek was being applied to a 270 pixel thumbnail in the grid underneath,
       * while the player carried on playing: the shot kept coming back at 0:03
       * with the button showing the playing state, from code that looked right.
       *
       * Area tells them apart with nothing to keep in sync.
       */
      const videos = Array.from(document.querySelectorAll('video'));
      const player = videos
        .map((element) => {
          const box = element.getBoundingClientRect();
          return { element, area: box.width * box.height };
        })
        .sort((a, b) => b.area - a.area)[0]?.element;

      if (!player) return;
      if (!Number.isFinite(player.duration) || player.duration <= 0) return;

      await new Promise((resolve) => {
        player.addEventListener('seeked', resolve, { once: true });
        player.currentTime = player.duration * 0.04;
        // A seek that lands on the frame it is already showing fires nothing.
        setTimeout(resolve, 3000);
      });
      player.pause();
    });
    await page.waitForTimeout(1200);
    /*
     * Pause everything, with nothing between this and the shutter.
     *
     * The element autoplays, so a pause issued while it is still opening is
     * simply overtaken. Asking again once it has settled leaves nothing that can
     * restart it in between, and every video rather than the player alone,
     * because the thumbnails behind the modal are playing too.
     */
    await page.evaluate(() => {
      for (const video of document.querySelectorAll('video')) video.pause();
    });
    await shoot('clip');

    await go(`#/trim/${subject}`, 4000);
    // Same story as the editor: the strip is generated on demand, and for a real
    // 3440x1440 recording that is ten seconds of ffmpeg.
    await waitForStrips(page);
    // And the suggestion takes a moment of its own on a game whose HUD is read,
    // which is the whole reason this clip was chosen.
    await waitForSuggestion(page);

    /*
     * Take the suggestion, so the trim screen shows a trim.
     *
     * Shot without this it read `Start: 0:00:00`, `End: 0:27:00`,
     * `Length: 0:27:00`, with both handles pinned at the ends: the one screen
     * whose job is to demonstrate trimming, demonstrating an untrimmed clip,
     * under a header saying "Drag the handles to keep the good bit" and beside
     * a banner offering 0:16 to 0:25. Saving that would have written an
     * identical copy. The GoodBit row under it said `0:00 - 0:27 . 27s`, which
     * is marking the whole clip and equally meaningless.
     *
     * Pressing the app's own "Use it" is what a person does with a suggestion
     * they agree with, so the picture is of the feature working rather than of
     * the feature waiting.
     */
    await page
      .getByRole('button', { name: 'Use it', exact: true })
      .click({ timeout: 4000 })
      .catch(() => {});
    await page.waitForTimeout(2000);
    await shoot('trim');

    await go('#/editor', 4000);

    /*
     * Throw away the scratch draft before building the timeline.
     *
     * The editor keeps one unsaved timeline per profile, so the first palette's
     * three clips are still there when the second one opens, and the light
     * editor shot came back with "Continue where you left off? 3 clips, just
     * now" across the top of it, which the dark shot does not have. Two
     * screenshots of the same screen should differ by palette and nothing
     * else.
     *
     * Discard rather than Resume: this pass is about to add its own clips, and
     * resuming would leave the timeline holding both.
     */
    await page
      .getByRole('button', { name: 'Discard', exact: true })
      .click({ timeout: 2500 })
      .catch(() => {});
    await page.waitForTimeout(1000);
    // Put a couple of clips on the timeline so the lane is not empty.
    const thumbs = page.locator('img[src^="goodbit://media/thumb"]');
    for (let i = 0; i < 3; i++) {
      await thumbs.nth(i).click();
      await page.waitForTimeout(1200);
    }
    /*
     * Zoom out until the whole movie is on screen.
     *
     * The editor opens at 100%, which is 50 pixels per second, so a minute and
     * a half of clips runs several screens wide and the shot showed the first
     * thirteen seconds of it: one block, no sense that there is a sequence here
     * at all. The point of this screen is the arrangement, so the arrangement
     * has to fit in the picture.
     */
    for (let i = 0; i < 3; i += 1) {
      await page.getByTitle('Zoom out').click();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1500);

    /*
     * Select a block whose highlight the analysis actually found, and apply it,
     * so Clip Properties says something.
     *
     * Unpressed, that panel reads `Original: 27.65s`, `Current: 27.65s`,
     * `Trim Start: 0.00s`, `Trim End: 27.65s`: four values restating one
     * untrimmed clip, which is the standard look of a panel nobody has used.
     *
     * The footer's "Trim to highlights" is the wrong button for a photograph.
     * It starts the analysis for every clip at once, so the shot caught
     * `Listening...` in the footer, and on a clip whose sound never changes it
     * resolves to "The sound of this clip never really changes, so there is
     * nothing to point at", which is a true sentence and a poor advertisement.
     *
     * So: walk the blocks, and take the first one whose own panel offers a
     * `Trim to <a>s-<b>s`. That button only exists when there is a highlight
     * to trim to, which makes this self-checking: no button, no click, and the
     * panel is left honest rather than mid-analysis.
     */
    const blocks = page.locator('.cursor-grab');
    const blockCount = await blocks.count().catch(() => 0);

    for (let i = 0; i < blockCount; i += 1) {
      await blocks.nth(i).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1200);

      const applyHighlight = page.getByRole('button', { name: /^Trim to [\d.]+s/ });
      if ((await applyHighlight.count().catch(() => 0)) > 0) {
        await applyHighlight.first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(2500);
        break;
      }
    }

    // And let any analysis the selection kicked off settle, so the footer is
    // not photographed saying `Listening...`.
    for (let i = 0; i < 20; i += 1) {
      const busy = await page
        .getByText(/Listening/)
        .count()
        .catch(() => 0);
      if (busy === 0) break;
      await page.waitForTimeout(1000);
    }

    // The strip behind a timeline block is a CSS background, generated on
    // demand from the source clip, which for a real 3440x1440 recording takes
    // several seconds. Shooting before it arrives gives an empty block.
    await waitForStrips(page);
    await settleTimeline(page);
    await shoot('editor');

    await go('#/settings?section=general');
    await shoot('settings');

  }

  await app.close();
  rmSync(base, { recursive: true, force: true });
  console.log('done');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

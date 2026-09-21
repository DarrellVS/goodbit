import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { reportTokenState } from './middlewares/requireToken.js';
import { posterPathFor, posterUrlFor } from './utils/posterPath.js';
import { parseGoodBits, type PublishedGoodBit } from './utils/goodBits.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/*
 * Where the mark, the source link and every redirect point. Both are the
 * project's own pages, not anything this server hosts.
 *
 * Module level because three things need the first one now: the embed page's
 * footer, `/`, and a clip that is not here.
 */
const SITE_URL = 'https://darrellvs.github.io/goodbit/';
const REPO_URL = 'https://github.com/DarrellVS/goodbit';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/*
 * The root is not a clip, and this server has no front page of its own.
 *
 * It exists to hold the files behind share links, so somebody who trims the
 * end off one, or who is simply curious what this host is, gets the project's
 * own page rather than a 404 from a bare Express. 302 rather than 301: this
 * is where the root points today, not a permanent move of a resource, and a
 * 301 is cached hard enough that changing your mind means asking people to
 * clear their browser.
 */
app.get('/', (_req, res) => res.redirect(302, SITE_URL));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', apiRouter);

/*
 * The bytes: clips, and the poster frames beside them.
 *
 * These asked browsers and the edge alike to revalidate on every request,
 * which made the CDN in front of this server a proxy rather than a cache: the
 * first frame of every share link came off somebody's home uplink, every
 * time, and a clip opened by five people in a Discord thread was uploaded
 * five times over. So this splits the two caches, because they are not the
 * same problem and only one of them can be reached afterwards.
 *
 * `s-maxage` is a year, for the edge. That is safe precisely because it can
 * be taken back: every write in this server purges the URL it changed, and
 * each of those was a bug fixed the hard way. `PublishClipAction` purges the
 * clip, `StoreThumbnailAction` purges the poster (a re-uploaded trim keeps its
 * filename, so the CDN would otherwise hold a frame from before the cut), and
 * `UnpublishClipAction` purges both. Nothing here changes bytes at a URL
 * without purging it.
 *
 * `max-age` is five minutes, for the browser, and deliberately not the year
 * the issue asked for. A browser cache has no purge: a viewer who watched a
 * clip, and then watched it again after the owner trimmed and re-published it
 * under the same filename, would be served the old cut out of their own disk
 * for a year with no way for anybody to fix it. Five minutes covers the thing
 * `max-age` is actually for here, a reload or a second tab, and costs the
 * edge one revalidation afterwards rather than the origin one.
 *
 * `immutable` is not set for the same reason: these URLs are addressed by the
 * clip's own filename rather than by a content hash, so the promise it makes
 * is one this server cannot keep.
 *
 * Range requests are untouched. `express.static` answers them, and it has to:
 * seeking a `<video>` is nothing but a range request, and so is the pre-warm.
 */
const MEDIA_EDGE_MAX_AGE = 31536000; // one year
const MEDIA_BROWSER_MAX_AGE = 300; // five minutes
const MEDIA_EXTENSIONS = /\.(mp4|mov|mkv|jpg|jpeg|png|webp)$/i;

app.use('/media', express.static(UPLOAD_DIR, {
  etag: true,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (MEDIA_EXTENSIONS.test(filePath)) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${MEDIA_BROWSER_MAX_AGE}, s-maxage=${MEDIA_EDGE_MAX_AGE}, stale-while-revalidate=86400`,
      );
      return;
    }
    /*
     * Anything else in this directory is a sidecar rather than an asset: the
     * `.meta.json` next to each clip is rewritten by `PATCH /metadata` and
     * nothing purges it, because nothing is supposed to read it over HTTP.
     * It keeps the old header, so a long life can never be granted to a file
     * by accident.
     */
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

// Video embed page with Open Graph meta tags for Discord/social media
app.get('/:filename', (req, res) => {
  /*
   * `path.basename`, because a route parameter is not a filename.
   *
   * Express matches `/:filename` against the still-encoded path and decodes
   * the parameter afterwards, so `/..%2F..%2Fetc%2Fpasswd` never contains a
   * slash where the router looks for one and arrives here as `../../etc/passwd`.
   * That went into a `path.join` and then, for anything that did not end in
   * `.mp4`, into `res.sendFile`, which takes an absolute path as given.
   */
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_DIR, filename);

  /*
   * A clip that is not here is almost always one that was unpublished.
   *
   * The link outlives the clip: it is in a Discord message, and unpublishing
   * deletes the file without reaching into that message. "Video not found" as
   * bare text told the reader nothing about what this host is or what the
   * thing they were sent was, so it goes to the project's page instead.
   *
   * Only this page redirects. `/media/<file>` stays a 404, because that URL is
   * the `src` of a `<video>` and an element that follows a redirect to an HTML
   * page fails in a worse way than one that gets an honest 404.
   */
  if (!fs.existsSync(filePath)) {
    return res.redirect(302, SITE_URL);
  }

  // Check if it's a video file
  const isVideo = /\.(mp4|mov)$/i.test(filename);
  if (!isVideo) {
    // For non-video files, serve them directly
    return res.sendFile(filePath);
  }

  // Get metadata file if it exists
  const metaPath = path.join(UPLOAD_DIR, `${filename}.meta.json`);
  let displayName = filename;
  let game = '';
  
  let publishedAt = '';
  /*
   * The marks inside the clip, if the desktop sent any.
   *
   * Parsed rather than trusted, even though this file is one this server
   * wrote: it is a file on disk, it can be edited by hand, and what comes out
   * of it is injected into the page below. The same function checks the
   * request that writes it, so there is one idea of what a mark is.
   */
  let goodBits: PublishedGoodBit[] = [];

  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      displayName = meta.displayName || filename;
      game = meta.game || '';
      publishedAt = meta.publishedAt || '';
      goodBits = parseGoodBits(meta.goodBits) ?? [];
    } catch (e) {
      // Ignore parsing errors
    }
  }

  // What each band and each chip is called, decided once so the tooltip over
  // the scrubber and the chip under it cannot say different things about the
  // same moment.
  const labelled = goodBits.map((bit, index) => ({
    ...bit,
    label: bit.name || bit.reason || `GoodBit ${index + 1}`,
  }));

  // The page names a date and a size. Both come off the file itself rather
  // than out of a probe: an ffprobe per page view is a lot to pay for one
  // line of grey text, and the length the player works out for itself once
  // its metadata lands.
  const stat = fs.statSync(filePath);
  const shown = publishedAt ? new Date(publishedAt) : stat.mtime;
  const dateLabel = Number.isNaN(shown.getTime())
    ? ''
    : shown.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const sizeLabel = formatBytes(stat.size);

  const baseUrl = process.env.PUBLIC_BASE_URL || req.protocol + '://' + req.get('host');
  const videoUrl = `${baseUrl}/media/${encodeURIComponent(filename)}`;
  const pageUrl = `${baseUrl}/${encodeURIComponent(filename)}`;
  const thumbnailUrl = posterUrlFor(baseUrl, filename);

  /*
   * The poster is named only if there is one.
   *
   * It arrives with the clip now, from the desktop's own thumbnail cache, so
   * this server no longer carries ffmpeg to draw one. Three things can leave a
   * clip without one: a desktop older than that change, a poster request that
   * failed after the upload succeeded, and a file somebody removed by hand.
   * In all three `poster=""` and `og:image` would point at a 404, which is
   * worse than leaving them out: the player paints a broken image over the
   * first frame it has decoded, and Discord shows a placeholder where it would
   * otherwise show the video's own frame.
   *
   * Clips published before any of this keep working untouched: their
   * `.thumb.jpg` is already here, and nothing deletes one except unpublishing.
   */
  const hasPoster = fs.existsSync(posterPathFor(UPLOAD_DIR, filename));

  // Title with game name if available
  const title = game ? `${displayName} | ${game}` : displayName;
  
  /*
   * This page is generated per request, and must never be cached.
   *
   * Its URL ends in .mp4, because it is named after the clip, and a CDN reads
   * that extension and files the response under static assets: Cloudflare
   * cached the HTML at the edge and went on serving a page from before the
   * redesign. Publishing purges the URL it just wrote, so a new clip looked
   * right while every clip already published looked old, and a hard refresh
   * could not fix it because the browser was not the one holding the copy.
   *
   * The media route beside this one no longer says the same thing, and this
   * one still does. Giving the page an `s-maxage` was considered and refused,
   * for a reason the per-request writes do not cover: every write that
   * changes what this page says already purges its URL, so the clip's own
   * metadata is not the hazard. The deploy is. This HTML is a template
   * compiled into the server, so shipping a new publisher changes the page of
   * every clip ever published at once, and there is no list of them to purge
   * and no hook that would know to. That is exactly the failure the paragraph
   * above describes, and it was found by a reader looking at a stale page
   * rather than by anything here. Purging the whole zone on boot would fix it
   * and would also throw away every warmed clip on every restart.
   *
   * So the page is uncached and the bytes are cached, which is the split that
   * matters anyway: the HTML is a couple of kilobytes generated from one
   * `stat` and one small JSON read, and the video is the clip.
   */
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Serve HTML with Open Graph meta tags for Discord embed
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Open Graph / Discord -->
    <meta property="og:type" content="video.other">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:site_name" content="GoodBit">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:video" content="${videoUrl}">
    <meta property="og:video:url" content="${videoUrl}">
    <meta property="og:video:secure_url" content="${videoUrl}">
    <meta property="og:video:type" content="video/mp4">
    <meta property="og:video:width" content="1280">
    <meta property="og:video:height" content="720">
    ${hasPoster ? `<meta property="og:image" content="${thumbnailUrl}">` : ''}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="player">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:player" content="${videoUrl}">
    <meta name="twitter:player:width" content="1280">
    <meta name="twitter:player:height" content="720">
    ${hasPoster ? `<meta name="twitter:image" content="${thumbnailUrl}">` : ''}

    <title>${escapeHtml(title)}</title>
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
    >

    <style>
      /*
       * A shared clip, in the website's design language.
       *
       * Same tokens, same fonts, same square corners, hairlines instead of
       * shadows and timecodes set in mono, because a link someone opens from
       * Discord should look like it came from the same project as the pages
       * that describe the app. Kept in step with site/assets/css/style.css by
       * hand: this file cannot import it, the publisher serves media and this
       * page and nothing else.
       */
      :root {
        --bg: #08090a;
        --panel: #0e1012;
        --panel-2: #14171a;
        --rule: #20242a;
        --rule-soft: #171b1f;
        --ink: #f4f5f6;
        --ink-2: #9aa1aa;
        --ink-3: #6d757e;
        --accent: #f97316;
        --accent-soft: #ffb066;

        --wrap: 1180px;
        --rail: 108px;

        --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        --display: "Space Grotesk", "Segoe UI", system-ui, sans-serif;
        --body: "IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif;

        color-scheme: dark;
      }

      @media (prefers-color-scheme: light) {
        :root {
          --bg: #f6f5f3;
          --panel: #ffffff;
          --panel-2: #f0eeea;
          --rule: #dcd8d2;
          --rule-soft: #e8e5e0;
          --ink: #14161a;
          --ink-2: #4e545c;
          --ink-3: #757c85;
          --accent: #d85a06;
          --accent-soft: #b44a05;

          color-scheme: light;
        }
      }

      *,
      *::before,
      *::after { box-sizing: border-box; }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font: 400 clamp(0.95rem, 0.9rem + 0.22vw, 1.05rem) / 1.62 var(--body), sans-serif;
        -webkit-font-smoothing: antialiased;
        overflow-x: hidden;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }

      img, svg, video { max-width: 100%; display: block; }

      h1 {
        font-family: var(--display), sans-serif;
        font-weight: 600;
        letter-spacing: -0.02em;
        line-height: 1.18;
        font-size: clamp(1.15rem, 0.95rem + 0.8vw, 1.6rem);
        margin: 0;
        /* A display name can be a filename, which has nowhere to break. */
        overflow-wrap: anywhere;
      }

      .wrap {
        width: min(100% - 2.5rem, var(--wrap));
        margin-inline: auto;
      }

      /*
       * The ruler. A repeating hairline pattern down the left edge, the way the
       * editor's timeline marks seconds. Decorative, so it is hidden from
       * assistive tech and dropped entirely when there is no room for it.
       */
      .rail {
        position: fixed;
        inset: 56px auto 0 0;
        width: var(--rail);
        border-right: 1px solid var(--rule-soft);
        background: repeating-linear-gradient(
            to bottom,
            var(--rule-soft) 0 1px,
            transparent 1px 100%
          )
          right / 12px 24px no-repeat;
        background-position: right 0 top 0;
        background-size: 10px 100%;
        pointer-events: none;
        z-index: 1;
      }

      .rail::before {
        content: "";
        position: absolute;
        inset: 0 0 0 auto;
        width: 9px;
        background-image: repeating-linear-gradient(
          to bottom,
          var(--rule) 0 1px,
          transparent 1px 22px
        );
      }

      @media (max-width: 1340px) {
        .rail { display: none; }
      }

      .site-header {
        position: sticky;
        top: 0;
        z-index: 50;
        background: var(--bg);
        border-bottom: 1px solid var(--rule);
      }

      .site-header .wrap {
        display: flex;
        align-items: center;
        gap: 1rem;
        min-height: 56px;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        font-family: var(--display), sans-serif;
        font-weight: 600;
        font-size: 1.02rem;
        letter-spacing: -0.02em;
        color: var(--ink);
        text-decoration: none;
        flex-shrink: 0;
      }

      .brand svg { width: 24px; height: 24px; }

      .site-nav {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: clamp(0.75rem, 1.8vw, 1.5rem);
        font-family: var(--mono);
        font-size: 0.78rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        min-width: 0;
      }

      .site-nav a {
        color: var(--ink-2);
        text-decoration: none;
        white-space: nowrap;
      }

      .site-nav a:hover { color: var(--ink); }

      .site-nav .cta {
        color: var(--accent);
        border: 1px solid var(--accent);
        padding: 0.34rem 0.7rem;
      }

      .site-nav .cta:hover {
        background: var(--accent);
        color: #000;
      }

      main {
        flex: 1;
        padding: clamp(1.6rem, 4vw, 3rem) 0 clamp(2rem, 5vw, 3.6rem);
      }

      /* Hairlines, not shadows. */
      .player {
        border: 1px solid var(--rule);
        background: #000;
      }

      video {
        width: 100%;
        /*
         * Black, and the wrapper behind it black too. Until a frame is
         * decoded the element paints its own surface, and the default is the
         * page's, which flashes pale against a dark player for as long as the
         * first byte takes to arrive.
         */
        background: #000;
      }

      /*
       * The chapter rail: where the marked moments are, as a strip of its own
       * under the picture rather than an overlay on the player's own scrubber.
       *
       * A native "video controls" draws its bar inside a shadow root no page
       * can reach, so the choice is a full custom player or a second bar. A
       * custom player is a keyboard map, a fullscreen button, a volume slider
       * and a buffering state to get wrong on somebody's phone, for a page
       * whose whole job is to play one clip that was linked in a chat. So the
       * rail sits directly beneath the video, the same width, with a playhead
       * of its own, and the browser's controls go on working exactly as they
       * did.
       */
      .marks {
        position: relative;
        height: 14px;
        background: var(--panel-2);
        border-top: 1px solid var(--rule);
        cursor: pointer;
      }

      .mark {
        position: absolute;
        top: 0;
        bottom: 0;
        /*
         * A one-second mark on a five-minute clip is a third of a pixel, so
         * every band gets a floor it cannot go under, and the shortest ones
         * grow around their own middle rather than to the right.
         */
        min-width: 4px;
        padding: 0;
        border: 0;
        background: var(--accent);
        opacity: 0.72;
        cursor: pointer;
        transition: opacity 0.12s linear;
      }

      .mark:hover,
      .mark:focus-visible { opacity: 1; }

      /*
       * The playhead, so the rail says where you are as well as what is in it.
       *
       * Moved with a transform rather than a left percentage: "left" is a
       * layout property, so writing it sixty times a second reflows the rail,
       * and a transform is handed to the compositor and costs nothing.
       */
      .playhead {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 2px;
        margin-left: -1px;
        background: var(--ink);
        pointer-events: none;
        will-change: transform;
      }

      /*
       * The chips. Same mono small caps as everything else on this page, and
       * the timecode is the part that is always true: a hand-marked GoodBit
       * usually has no name and no reason, so most of these read
       * "GoodBit 2 0:14" and the number is what somebody aims at. The app's
       * own word for the thing, so a page and the library that made it do not
       * have two names for one mark.
       */
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 1.1rem;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        height: 34px;
        padding: 0 0.7rem;
        border: 1px solid var(--rule);
        background: transparent;
        color: var(--ink-2);
        font-family: var(--mono);
        font-size: 0.74rem;
        letter-spacing: 0.06em;
        cursor: pointer;
        max-width: 100%;
        transition: border-color 0.12s linear, color 0.12s linear;
      }

      .chip:hover { border-color: var(--accent); color: var(--accent); }

      .chip .play {
        color: var(--accent);
        flex-shrink: 0;
      }

      .chip .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .chip .at {
        color: var(--ink-3);
        flex-shrink: 0;
      }

      .below {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: clamp(1rem, 3vw, 2.4rem);
        border-top: 1px solid var(--rule-soft);
        margin-top: 1.4rem;
        padding-top: 1.1rem;
      }

      /* The site's own small-caps mono label, with the game standing out. */
      .tag {
        font-family: var(--mono);
        font-size: 0.72rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ink-3);
        margin-top: 0.6rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 0.7rem;
      }

      .tag .on { color: var(--accent); }
      .tag [hidden] { display: none; }

      .actions {
        display: flex;
        gap: 0.6rem;
        flex-shrink: 0;
      }

      .button {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        /*
         * A height rather than symmetric padding: one of these is a button and
         * the other is a link, and their line boxes do not agree, so the pair
         * came out a pixel apart.
         */
        height: 46px;
        padding: 0 1.15rem;
        border: 1px solid var(--rule);
        background: transparent;
        color: var(--ink);
        font-family: var(--mono);
        font-size: 0.82rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        text-decoration: none;
        cursor: pointer;
        transition: background 0.12s linear, border-color 0.12s linear, color 0.12s linear;
      }

      .button:hover {
        border-color: var(--accent);
        color: var(--accent);
      }

      .button svg {
        width: 15px;
        height: 15px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.7;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .button.primary {
        background: var(--accent);
        border-color: var(--accent);
        color: #000;
        font-weight: 600;
      }

      .button.primary:hover {
        background: var(--accent-soft);
        border-color: var(--accent-soft);
        color: #000;
      }

      .hint {
        margin: 1.4rem 0 0;
        font-family: var(--mono);
        font-size: 0.72rem;
        letter-spacing: 0.04em;
        color: var(--ink-3);
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      kbd {
        font-family: var(--mono);
        font-size: 0.7rem;
        padding: 0.16rem 0.4rem;
        border: 1px solid var(--rule);
        background: var(--panel);
        color: var(--ink-2);
      }

      @media (max-width: 860px) {
        .below { flex-direction: column; }
        .actions { width: 100%; }
        .button { flex: 1; justify-content: center; }
      }

      @media (max-width: 620px) {
        .site-nav [data-optional] { display: none; }
      }
    </style>
  </head>
  <body>
    <div class="rail" aria-hidden="true"></div>

    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="${SITE_URL}">
          <!--
            The app's own mark, drawn rather than fetched. This server serves
            media and this page; an <img> would mean an asset route for one
            24 pixel square.
          -->
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect width="24" height="24" rx="5.2" fill="#f57c20"/>
            <g fill="#ffab70">
              <rect x="2.8" y="8.7" width="3.5" height="6.8" rx="1"/>
              <rect x="6.9" y="8.7" width="3.5" height="6.8" rx="1"/>
              <rect x="17.7" y="8.7" width="3.5" height="6.8" rx="1"/>
            </g>
            <rect x="11.1" y="6.6" width="6" height="10.9" rx="1.5" fill="#fff"/>
          </svg>
          GoodBit
        </a>

        <nav class="site-nav" aria-label="Links">
          <a href="${SITE_URL}" data-optional>The app</a>
          <a href="${REPO_URL}" target="_blank" rel="noopener">Source</a>
          <a class="cta" href="${videoUrl}" download>Download</a>
        </nav>
      </div>
    </header>

    <main>
      <div class="wrap">
        <div class="player">
          <video id="video" controls preload="metadata"${hasPoster ? ` poster="${thumbnailUrl}"` : ''}>
            <source src="${videoUrl}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
          ${labelled.length ? `<div class="marks" id="marks" role="group" aria-label="Marked moments">
            <div class="playhead" id="playhead"></div>
          </div>` : ''}
        </div>

        ${labelled.length ? `<div class="chips">
          ${labelled
            .map(
              (bit, index) => `<button class="chip" type="button" data-at="${bit.startSec}" title="${escapeHtml(bit.label)}">
            <span class="play" aria-hidden="true">&#9654;</span>
            <span class="name">${escapeHtml(bit.label)}</span>
            <span class="at">${timecode(bit.startSec)}</span>
          </button>`,
            )
            .join('\n          ')}
        </div>` : ''}

        <div class="below">
          <div>
            <h1>${escapeHtml(displayName)}</h1>
            <p class="tag">
              ${game ? `<span class="on">${escapeHtml(game)}</span>` : ''}
              <span id="duration" hidden></span>
              <span>${dateLabel}</span>
              <span>${sizeLabel}</span>
            </p>
          </div>

          <div class="actions">
            <button class="button" id="copy" type="button">
              <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
              <span id="copy-label">Copy link</span>
            </button>
            <a class="button primary" href="${videoUrl}" download>
              <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
              Download
            </a>
          </div>
        </div>

        <p class="hint"><kbd>Space</kbd> play <kbd>F</kbd> fullscreen</p>
      </div>
    </main>

    <script>
      const video = document.getElementById('video');

      /*
       * The marked moments, written into the page rather than fetched.
       *
       * This page is generated per request and never cached, so a second round
       * trip for a list of three numbers would buy nothing. "<" is escaped in
       * the serialisation, because a name ending in a closing script tag would
       * otherwise close this block: the names come from whatever somebody
       * typed in their own library, which is not a reason to trust them here.
       */
      const goodBits = ${JSON.stringify(labelled).replace(/</g, '\\u003c')};

      // The length is not in the metadata file, and probing for it would cost
      // an ffprobe per page view. The player already knows.
      video.addEventListener('loadedmetadata', () => {
        if (!Number.isFinite(video.duration)) return;
        const total = Math.round(video.duration);
        const mins = Math.floor(total / 60);
        const secs = String(total % 60).padStart(2, '0');
        const label = document.getElementById('duration');
        label.textContent = mins + ':' + secs;
        label.hidden = false;
      });

      const marks = document.getElementById('marks');
      const playhead = document.getElementById('playhead');

      function seekTo(seconds) {
        video.currentTime = seconds;
        video.play().catch(() => {});
      }

      /*
       * The bands need a length to be laid out against, and the length only
       * exists once the player has read the file's metadata. The "loadedmetadata" event
       * has usually fired by the time this runs on a cached clip, so the
       * readyState is checked as well: a rail that stayed empty on a second
       * visit and filled on the first is the shape that bug takes.
       */
      function drawMarks() {
        if (!marks || !Number.isFinite(video.duration) || video.duration <= 0) return;
        for (const old of marks.querySelectorAll('.mark')) old.remove();

        for (const bit of goodBits) {
          /*
           * A mark that is not inside this file is not drawn.
           *
           * The clip on the publisher and the marks in the library are two
           * copies that can go out of step: a shorter cut re-published under
           * the same name keeps the sidecar until the next metadata sync, and
           * a band running off the end of the rail, or past 100% and out of
           * the page, is a worse way to say so than one band missing.
           */
          if (bit.startSec >= video.duration) continue;
          const end = Math.min(bit.endSec, video.duration);

          const band = document.createElement('button');
          band.className = 'mark';
          band.type = 'button';
          band.style.left = (bit.startSec / video.duration) * 100 + '%';
          band.style.width = ((end - bit.startSec) / video.duration) * 100 + '%';
          band.title = bit.label;
          band.setAttribute('aria-label', 'Play ' + bit.label);
          band.addEventListener('click', (e) => {
            // The rail seeks where it was clicked, and a band is on the rail.
            e.stopPropagation();
            seekTo(bit.startSec);
          });
          marks.appendChild(band);
        }
      }

      if (goodBits.length) {
        video.addEventListener('loadedmetadata', drawMarks);
        if (video.readyState >= 1) drawMarks();

        /*
         * The playhead follows an animation frame, not the "timeupdate" event.
         *
         * That event fires about four times a second at irregular intervals,
         * so a head driven by it steps across the rail rather than moving, and
         * a CSS transition over the top only smears the steps into each other.
         * The loop runs only while the clip is actually playing.
         */
        let frame = null;
        let railWidth = marks.clientWidth;

        function placePlayhead() {
          if (!Number.isFinite(video.duration) || video.duration <= 0) return;
          const fraction = Math.min(1, Math.max(0, video.currentTime / video.duration));
          playhead.style.transform = 'translateX(' + fraction * railWidth + 'px)';
        }

        function follow() {
          placePlayhead();
          frame = requestAnimationFrame(follow);
        }

        video.addEventListener('play', () => {
          if (frame === null) frame = requestAnimationFrame(follow);
        });

        for (const event of ['pause', 'ended']) {
          video.addEventListener(event, () => {
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
            // One last read, so a pause lands where it paused rather than
            // wherever the previous tick left the head.
            placePlayhead();
          });
        }

        // A seek while paused moves the head, and nothing is reading the clock.
        video.addEventListener('seeked', placePlayhead);
        video.addEventListener('loadedmetadata', placePlayhead);

        // The rail is a percentage of the page, and the transform is in pixels.
        window.addEventListener('resize', () => {
          railWidth = marks.clientWidth;
          placePlayhead();
        });

        marks.addEventListener('click', (e) => {
          if (!Number.isFinite(video.duration) || video.duration <= 0) return;
          const box = marks.getBoundingClientRect();
          seekTo(((e.clientX - box.left) / box.width) * video.duration);
        });

        for (const chip of document.querySelectorAll('.chip')) {
          chip.addEventListener('click', () => seekTo(Number(chip.dataset.at)));
        }
      }

      const copyButton = document.getElementById('copy');
      const copyLabel = document.getElementById('copy-label');
      let copyTimer = null;

      copyButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          copyLabel.textContent = 'Copied';
        } catch {
          copyLabel.textContent = 'Press Ctrl+C';
        }
        clearTimeout(copyTimer);
        copyTimer = setTimeout(() => { copyLabel.textContent = 'Copy link'; }, 1600);
      });

      document.addEventListener('keydown', (e) => {
        const typing = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
        if (typing) return;

        if (e.code === 'Space') {
          e.preventDefault();
          if (video.paused) video.play(); else video.pause();
        }

        if (e.code === 'KeyF') {
          e.preventDefault();
          if (!document.fullscreenElement) {
            video.requestFullscreen().catch((err) => console.log('Fullscreen error:', err));
          } else {
            document.exitFullscreen();
          }
        }
      });
    </script>
  </body>
</html>`);
});

// Helper to escape HTML entities
/** Megabytes once a clip is past a megabyte, which all of them are. */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

/** `m:ss`, the way every other timecode on this page and in the app is set. */
function timecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, () => {
  console.log(`Publisher listening on http://localhost:${PORT}`);
  console.log(`UPLOAD_DIR=${UPLOAD_DIR}`);
  reportTokenState();
});



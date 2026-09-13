# Filmpje → GoodBit

How the self-hosted web app became a desktop application, and what was deliberately thrown away on
the way. Written as a plan; kept as the record of what was actually done.

**Status: the migration is complete.** The app boots as a background service, indexes clips as OBS
writes them, and packages into an installer that has been run and tested. What remains before a
public 1.0 is listed at the bottom — the real blocker is database migrations, not features.

---

## The short version

| | today | after |
|---|---|---|
| Runs as | Express on :4000 + Vite client, reached over the network | One Electron app, local only |
| Starts | `start-local-client.vbs` at login, serving a web page | Background service at login, window on demand |
| Scanning | Once at boot, plus a manual rescan button | A watcher that notices clips as OBS writes them |
| Auth | Firebase + a hardcoded API token | None. There is no remote surface to protect |
| Media | HTTP with a `?token=`, LAN-probed to avoid the internet round trip | `goodbit://` protocol straight off disk |
| Data API | ~60 REST routes + axios | Typed IPC over a preload bridge |
| Publisher | Assumed present, IP hardcoded | Optional. Unset = the publish feature is simply absent |
| Updates | Service worker | electron-updater against GitHub releases |

Three whole subsystems **disappear** rather than get ported: Firebase auth, the LAN streaming probe
(`LOCAL_STREAMING.md`), and the PWA service worker. That is the single biggest simplification here —
each of them exists only because the app had to cross a network.

---

## What actually happened

The plan below is kept because the reasoning still holds, but several things changed on contact.
Where this section and the plan disagree, this section is what was built.

### Deviations from the plan

**Auth removal moved out of Phase 0.** The plan had it first. The web app was live at
`filmpje.darrellvs.nl`, so deleting Firebase there would have left the whole library publicly
readable. It happened inside the Electron work instead, where there is no network surface, and the
web app kept its login until it was retired.

**The API is still Express, and that is deliberate.** The plan said the routes would become IPC
handlers one at a time. What shipped is one IPC channel relaying to a loopback listener in the same
process. Faking a `ServerResponse` to dispatch the router in-process was tried first and does not
work — `app.handle` reassigns the response prototype to Express's own, which inherits from
`http.ServerResponse`, so hand-written methods are bypassed and Node's real `getHeader` runs against
an object with no socket. Relaying keeps Express on the objects it expects.

Loopback alone is not enough, since any other program on the machine can reach `127.0.0.1` and this
API deletes clips, so every request carries a secret generated at launch that never reaches the
renderer. The renderer's axios only had its **adapter** swapped, leaving all forty call sites
unchanged.

**Dark mode was rebuilt on tokens, not repaired.** Adding `dark:` variants beside literal colours had
already shipped broken: variants cannot reach colours inside bound `:class` expressions, and
`bg-white/60` is a different class from `bg-white`, so Settings and the editor stayed light while the
shell went dark. In places it was worse than incomplete — text on `bg-white/85` gained a dark variant
while its background stayed light, turning readable into invisible. 794 literals became semantic
tokens and 539 variants were dropped.

**The legacy importer is opt-in, not opt-out.** It was originally excluded by setting an environment
variable at release time, which meant forgetting it would ship the thing that must never reach anyone
else. `GOODBIT_LEGACY_IMPORT=1` now turns it on; a plain build has no trace of it.

### Bugs the work surfaced

Each of these was live before the migration or introduced during it, and none was visible to a
typecheck:

- **Exports of HDR clips came out grey.** OBS writes PQ/bt2020 here; converting to SDR with no tone
  mapping reads the PQ curve as sRGB. Fixed everywhere a frame is decoded.
- **Frame strips lied about time.** Sampled at a flat `fps=1` and tiled ten wide, so on any clip
  longer than ten seconds the strip covered only the first ten while the UI stretched it across the
  whole width.
- **A scan could delete the entire library.** `ScanAndSyncClipsAction` pruned unconditionally, so a
  videos folder that was momentarily unreachable — an unmounted drive, a wrong first-run pick — took
  every tag, note, display name, collection and star with it. It now refuses to prune when the folder
  looks empty or when one scan would remove more than half the library.
- **An open window never showed new clips.** The service indexed correctly and the database was
  right, but nothing in the renderer subscribed to the events main was emitting, so the window showed
  whatever was there when it loaded. Every test asked the API directly, which is why none caught it.
- **The packaged app would not start**, then would not spawn ffmpeg. Shipping `node_modules` let
  electron-builder misplace a hoisted transitive dependency; bundling removed the class of problem.
  `ffmpeg-static` then reported a path inside `app.asar`, which is an archive, so thumbnails, trims
  and exports failed only when packaged.
- **Errors read as "Request failed with status 500".** Routes answer `{ error }` but anything that
  throws returns `{ status, code, message }`, and the adapter only read the first.

### What is verified

18 end-to-end tests run against the **packaged installer binary**, not just the dev build — which is
what caught the last two bugs above. They cover the bridge and protocol (including Range requests, so
video can seek), indexing, tagging, the analysis, a lossless trim, a real export landing on disk,
publishing being absent rather than broken, an open window keeping up with the watcher, and every
screen in both palettes against a contrast floor.

Each run gets a throw-away data directory, videos root and database, so a test can never touch a real
library.

### Still to do before 1.0

- **Database migrations.** `synchronize: true` is the one real blocker; see the risks section.
- A licence, and confirming the `goodbit` name and org are free before the update feed goes live.
- Deleting the Firebase project, which is what actually revokes the committed key — after that, the
  history scrub is tidiness rather than remediation.
- The derivation queue still runs on the main thread. Fine at this scale; worth a `utilityProcess`
  if a large import ever makes the UI stutter.

---

---

## Target architecture

```
┌─ Electron main ─ the background service ──────────────────────────────────┐
│  Registered at login. Lives in the tray. Owns everything stateful.        │
│                                                                           │
│   lifecycle    single-instance lock, tray menu, autostart registration,   │
│                hide-on-close (the window closing must not stop scanning)  │
│   database     SQLite via TypeORM — one writer, in this process only      │
│   watcher      chokidar over the videos root → index new clips            │
│   queue        derived assets: thumbnail, frame strip, audio analysis     │
│   actions/     the current server/src/actions, moved almost unchanged     │
│   ipc/         one handler module per domain, replacing routes/           │
│   protocol     filmpje://media/… with Range support                       │
└───────────────────────────────────────────────────────────────────────────┘
                                    ▲
                         typed bridge │ window.filmpje
                                    ▼
┌─ Renderer ─ the Vue app, opened on demand ───────────────────────────────┐
│  Today's client/, minus auth, minus the LAN probe, minus the service      │
│  worker. Components and composables are otherwise untouched.              │
└───────────────────────────────────────────────────────────────────────────┘

┌─ publisher/ ─ optional, unchanged ────────────────────────────────────────┐
│  Still Express + multer in Docker. The app points at it if you have one.   │
└───────────────────────────────────────────────────────────────────────────┘
```

### Why main is the service, not a separate process

The scanning work is almost entirely I/O: walking directories, `ffprobe`, SQLite writes, and spawning
ffmpeg — which is a child process already, so it never blocks anything. There is no CPU-bound
JavaScript to get off the main thread, and putting the database in a second process would mean two
SQLite writers and a locking problem invented for no reason.

So: **main is the background service.** The window is a client that attaches to it. Closing the window
hides it; the watcher keeps running; the tray icon brings it back.

The one exception worth a real worker is the derivation queue. If a large import lands 200 clips at
once, the queue does 200 ffprobe + ffmpeg runs; those are child processes, but the orchestration and
the JSON parsing around them can make the main thread stutter. Run the queue in a `utilityProcess`
that owns no database — it receives a file path, returns numbers, and main does the writing.

### The background service, concretely

```ts
// Only one service, or two watchers fight over the same database.
if (!app.requestSingleInstanceLock()) app.quit();

// Launched by Windows at login with --hidden: no window, just the watcher and the tray.
app.setLoginItemSettings({
  openAtLogin: settings.get('startAtLogin'),
  args: ['--hidden'],
});

// Closing the window must not stop the scanning — that is the whole point.
window.on('close', (event) => {
  if (!app.isQuitting) { event.preventDefault(); window.hide(); }
});
```

Tray menu: Open Filmpje · Clips today: N · Scan now · Start with Windows ✓ · Quit.

**The watcher replaces the boot-time scan.** Today `server/src/index.ts` runs a fixed sequence once
and then never looks again until you press Rescan. A service that is always running should notice a
clip the moment OBS finishes writing it:

- chokidar on the videos root, depth 2, matching `*.mp4|*.mov|*.mkv`.
- `awaitWriteFinish` is **not optional** — OBS writes for the whole recording, and indexing a file
  mid-write gives a garbage duration and a black thumbnail. Wait for the size to hold steady.
- New file → insert the Clip row → enqueue thumbnail, frame strip, and the audio analysis from the
  ApexCut port. By the time you open the window, the clip is there with its strip already drawn.
- Deleted file → mark missing rather than delete the row, so tags and notes survive a file that moved.
- A full reconciliation sweep on start and every few hours, because filesystem events are not a
  guarantee — that is the existing `ScanAndSyncClipsAction`, kept as the backstop.
- A Windows notification on a new clip ("Battlefield 6 — 28s") is nearly free once this exists, and is
  the natural place for "the loudest moment is at 0:21" from the analysis.

---

## Migration phases

Each phase ends somewhere shippable. Nothing below requires a big-bang cutover.

### Phase 0 — shrink the surface first (stays a web app)

Everything here is worth doing regardless and makes the move smaller. No Electron yet.

1. **Delete Firebase and auth.** `server/src/auth.ts`, `services/firebaseService.ts`,
   `secrets/firebase.json`, `VerifyFirebaseTokenAction`, the client's `stores/auth.ts`, `LoginPage.vue`,
   the router guard, the axios token interceptor, and `utils/withAuthToken.ts`. The `?token=` query
   parameter on media URLs goes with it.
2. **Delete the three public endpoints** (`/api/clips/today/count`, `/api/clips/latest`,
   `/api/rescan`) and `getClientIp`. Confirmed unused.
3. **Move tag patterns into SQLite — do this first.** They live in browser IndexedDB today
   (`client/src/services/tagPatternsDb.ts`) with no server involvement. Electron gets its own profile,
   so they do not survive the move at all unless they are in the database beforehand. A `TagPattern`
   entity, the same way editor drafts just became `Project`.
4. **Make the videos root a setting.** `data-source.ts` throws on boot if `VIDEOS_ROOT` does not
   exist. That is correct for a machine you own and fatal for an app someone installs. It becomes a
   stored setting with a first-run picker.
5. **Wrap the Windows-only calls.** `trash`, `explorer.exe` and `start` get a single
   `services/platform.ts` wrapper, so Phase 2 swaps them for `shell.trashItem` / `shell.showItemInFolder`
   / `shell.openPath` in one file — and the app stops being Windows-only as a side effect.

### Phase 1 — the shell, with nothing else changed

Goal: the existing app, in a window, working. Fastest possible path to "everything still works".

- `electron-vite` scaffold: three builds (main, preload, renderer), `electron-builder` config.
- Main boots the **existing Express app** on `127.0.0.1` at an ephemeral port and points the renderer
  at it. The client keeps using axios exactly as it does now.
- `asarUnpack` for `ffmpeg-static` and `ffprobe-static` — a packaged binary inside an asar archive
  cannot be spawned. This is the classic first-day failure.
- Rebuild the SQLite native module for Electron's ABI (see Risks).
- Drop `start-local-client.vbs`.

At the end of this phase it is a desktop app. Ugly inside, but complete.

### Phase 2 — cut the HTTP cord

- `src/preload/index.ts` exposes a typed `window.filmpje`, and a renderer-side `api.ts` wraps it.
  Steal ApexCut's rule here: **the renderer never touches the bridge directly** (a lint rule enforces
  it), because Vue reactive proxies cannot cross the contextBridge — they arrive as "An object could
  not be cloned". The wrapper copies arguments to plain data.
- Migrate `client/src/services/*.ts` one file at a time. Each is already a thin axios wrapper with one
  function per endpoint, so each becomes a thin IPC wrapper with the same signature — the composables
  and components above them do not change at all. This is the payoff for the existing layering.
- **Media moves to a custom protocol.** `filmpje://media/<clipId>` with Range support, plus
  `filmpje://thumb/<id>` and `filmpje://strip/<id>`. `client/src/utils/mediaUrl.ts` collapses to a
  URL builder with no LAN probe, no token, no origin juggling. `useLocalMode`, the `/api/local-info`
  endpoint, `utils/networkInfo.ts` and `LOCAL_STREAMING.md` are all deleted.
- Delete the service worker (`sw.ts`, `utils/serviceWorker.ts`, the PWA plugin). The `UpdateBanner`
  component survives, repointed at electron-updater.
- Express, `asyncHandler`, `middlewares/errorHandler.ts` and `routes/` are deleted last, once nothing
  calls them.

### Phase 3 — become a real background service

Tray, autostart, single-instance lock, hide-on-close, the chokidar watcher, the derivation queue in a
`utilityProcess`, new-clip notifications. Described above.

### Phase 4 — 1.0 packaging

- NSIS installer + portable build, unsigned. `electron-updater` against GitHub releases, wired to the
  existing `UpdateBanner`.
- First-run: pick the videos folder, optionally the music folder, offer "start with Windows".
- Settings screen gains Publisher (URL, optional), Storage (cache size, clean up), and a health panel
  — ffmpeg version, detected encoder, free space, publisher reachable — which the encoder detection
  from the ApexCut port already provides.
- **CI lands here, not earlier.** One workflow: typecheck + Prettier + unit tests on push. The
  build-and-publish job triggers on a `v*` tag only, so routine development costs nothing. Until this
  point everything is verified locally.

---

## Where the code lands

| Now | After |
|---|---|
| `server/src/actions/**` (40 classes) | `src/main/actions/**` — unchanged except imports |
| `server/src/entity/**` | `src/main/entity/**` |
| `server/src/services/{encoders,jobs,ffmpegRun,videoService,audioLibrary}.ts` | `src/main/services/**` — unchanged |
| `server/src/services/publisherService.ts` | `src/main/services/publisher.ts` — becomes optional |
| `server/src/routes/**` | `src/main/ipc/**` — one module per domain |
| `server/src/services/firebaseService.ts`, `auth.ts`, `secrets/` | deleted |
| `server/src/utils/{networkInfo,clientDist}.ts` | deleted |
| `server/src/index.ts` startup sequence | `src/main/startup.ts` + the watcher |
| `shared/**` | `src/shared/**` — same DTOs, now a plain import rather than a relative-path package |
| `client/src/**` | `src/renderer/src/**` — as-is |
| `client/src/services/*.ts` | same files, axios → IPC |
| `client/src/{stores/auth,views/LoginPage}.ts` | deleted |
| `client/src/composables/useLocalMode.ts`, `utils/withAuthToken.ts` | deleted |
| `client/src/sw.ts`, `utils/serviceWorker.ts` | deleted |
| `client/src/services/tagPatternsDb.ts` (IndexedDB) | a SQLite entity |
| `client/src/services/editorDraftsDb.ts` | keep as the local autosave; named drafts already go to `Project` |
| `publisher/**` | untouched |

**`shared/` stops being awkward.** Today it is consumed by relative path, compiled to CommonJS, and
the client's typecheck reads stale `dist/` declarations unless you remember to rebuild it — which bit
during this very feature port (Rollup could not pull a named runtime export out of the CJS bundle).
Inside one electron-vite project it is just `@shared/*`, compiled once, with no dist to go stale.

---

## Everything that has to keep working

The explicit requirement. Each row is a thing to verify after Phase 2.

| Feature | How it survives |
|---|---|
| Scan & index by game folder | Watcher + the existing `ScanAndSyncClipsAction` as reconciliation |
| Library browsing, filters, pagination | Unchanged; the service call underneath becomes IPC |
| Clip detail, rename, notes, tags, collections, star | Unchanged |
| Games: displayName rename, hidden | Unchanged, including the re-push of published metadata |
| Smart tag patterns | **Moves** from IndexedDB to SQLite (Phase 0) |
| Stats, Today's clips | Unchanged |
| Trim (lossless + exact) | Unchanged — already hardware-aware after the port |
| Editor, music lane, drafts | Unchanged; named drafts already live in `Project` |
| Export: formats, crop, loudness, cancel, progress/ETA | Unchanged |
| Highlight suggestions | Unchanged; now also runs ahead of time in the watcher |
| Thumbnails, frame strips, hover scrub | Unchanged; served over `filmpje://` |
| Batch operations | Unchanged |
| Import by drag & drop | Unchanged, and gains a real file dialog |
| Audio library | Unchanged |
| Keyboard shortcuts + customisation | Unchanged. Global hotkey to summon the window is now possible |
| Publish / unpublish / Discord embeds | Unchanged when a publisher is configured; **hidden when not** |
| Recycle Bin deletes, open in Explorer | `shell.trashItem` / `shell.showItemInFolder` |
| Dark mode, command palette, QR share | Unchanged |
| Update notification | Service worker → electron-updater, same banner |
| Login | **Gone.** No remote surface to protect |
| LAN streaming | **Gone.** Files are read from disk |

Publishing is the one feature that can be absent. It needs to degrade properly: no publisher
configured means the publish action is not shown at all, not shown-and-broken. `SyncPublisherAction`
must no-op rather than log failures on every boot.

---

## Decisions made

1. **Database lives in `%APPDATA%/Filmpje/`.** The videos root stays a setting pointing at wherever
   OBS writes. Derived caches (`.filmpje-cache/`) stay next to the videos, since they are regenerable
   and belong with the media they describe.
2. **The folder layout is followed, not owned.** The top-level folder name remains the game name,
   because OBS keeps writing to `Battlefield 6/`. Renaming a game already sets `displayName` only and
   leaves the folder alone — that behaviour ships as-is.
3. **Ship unsigned.** SmartScreen will warn on first run; the README says so plainly, the way ApexCut
   does. Revisit if it ever becomes a real support burden.
4. **Updates work like ApexCut's:** `electron-updater` against GitHub releases, with the existing
   `UpdateBanner` repointed at it — downloading shows progress, then turns into "ready · Restart to
   update".
5. **CI is written last.** No workflow file until the migration is essentially done, so development
   does not burn Actions minutes on a moving target. When it lands it runs typecheck + Prettier +
   unit tests only; the build-and-publish job is tag-triggered (`v*`), not per-push.

6. **The app is called GoodBit.** The good bit is what the app is for: a thirty second replay buffer
   arrives, and the job is finding the ten seconds worth keeping. Plain-spoken, with a quiet second
   reading for anyone who knows what a bit is. A search turned up no software using it, so it is
   ownable — worth confirming the domain and a GitHub org before the installer bakes the name in.

   Everything downstream follows from it: `appId` (`com.darrellvs.goodbit` or similar), the product
   name in the installer, the window title, the update feed's repository, the custom protocol
   (`goodbit://media/…` rather than `filmpje://`), and `%APPDATA%/GoodBit/`. Settle the domain and org
   first, because renaming after the auto-update feed is live means stranding anyone already on it.

   `Filmpje` stays as the repository name until the rename lands, to avoid churn mid-migration.

---

## Not losing your library

291 clips, 5 tags, 4 collections, 47 games as of 2026-09-13. None of it is derivable from the files
on disk: `displayName`, tags, notes, collections, stars and publish state exist only in the database.
The video files themselves are never at risk — nothing in this migration writes to them — but the
metadata is the thing to be careful with.

**A verified backup already exists.** `server/scripts/backup-db.mjs` takes a consistent snapshot with
`VACUUM INTO` (rather than copying a file out from under a live writer), checks
`PRAGMA integrity_check`, and compares row counts before and after. Backups are timestamped and never
overwritten:

```
C:\Users\darre\AppData\Roaming\Filmpje\backups\filmpje-<timestamp>.db
```

Run it before anything that touches the schema. It is also the thing to run before the first launch
of a migration build.

### The import path

A one-time importer in the desktop app:

1. Looks for a legacy database at `<videosRoot>/filmpje.db`.
2. Snapshots it to `%APPDATA%/Filmpje/backups/` first, using the same `VACUUM INTO` route.
3. Copies it to `%APPDATA%/Filmpje/filmpje.db` and opens it there.
4. Verifies row counts per table against the source and refuses to mark itself done if they differ.
5. **Never moves or deletes the original.** The web app keeps working off the old file until you are
   satisfied, and going back is just running the old server again.

**This does not ship publicly.** It lives in `src/main/migration/importLegacy.ts` behind a build-time
constant, so electron-vite's define-replacement removes the branch entirely from a production build —
not merely hides it. Belt and braces: the code path also requires an actual legacy database to exist,
which no external user will ever have. Gate:

```ts
// Compiled out of public builds: `__LEGACY_IMPORT__` is defined false in the release config,
// so the whole branch is dead code the bundler drops.
if (__LEGACY_IMPORT__ && existsSync(legacyDbPath)) { … }
```

### The quiet one: browser storage does not come with you

Electron has its own profile, so anything in the browser's IndexedDB or localStorage is **not**
carried over by copying the database. That covers:

- **Smart tag patterns** (`client/src/services/tagPatternsDb.ts`) — IndexedDB, no server copy. These
  are lost unless they move into SQLite **while still running as a web app**. That is why it is
  Phase 0 item 3 and not something to leave until later.
- **Editor drafts** — named drafts already sync to the `Project` table as of the ApexCut port, so
  they survive. The rolling `__autosave__` record does not, which is fine; it is scratch.
- **Settings** (`filmpje-public-config`, theme, shortcut customisations) — small and quick to redo,
  but worth an export/import if you have tuned them.

Do Phase 0 item 3 before anything else in this document.

---

## Known broken: dark mode

Shipped visibly wrong and **deliberately not fixed in the web app**, since the UI is rebuilt here
anyway. Recorded so the rewrite fixes the cause rather than the screen.

The Settings sidebar renders dark text on a dark ground. The Advanced Editor is worse: every panel is
a washed light slab on a dark shell, with filenames, game headings and the Discard button close to
invisible. Two systematic gaps in the pass that added `dark:` variants, both invisible to typecheck
and to the build:

1. **Opacity-modified utilities were not in the map** — `bg-white/10`, `bg-gray-50/50`,
   `border-gray-200/80`. The map held `bg-white` and `bg-gray-50` but Tailwind treats
   `bg-white/50` as a different class entirely, so those elements kept their light backgrounds.
   **101 occurrences** across the client.
2. **Bound classes were skipped on purpose.** `:class="active ? 'bg-orange-50' : 'text-gray-700'"`
   holds colours inside a JavaScript expression. The pass deliberately left these alone after an
   earlier attempt appended Tailwind tokens into the expressions and broke the parse in six files —
   correct to skip, but it means every conditional style stayed light-only. **11 files.**

**In places the partial pass made things worse rather than merely incomplete.** Where an element had
`text-gray-900` on `bg-white/85` — as the editor's timeline labels do — the text gained a
`dark:text-slate-100` while the background stayed light, turning readable dark-on-light into
light-on-light. `components/Editor` holds 30 of the opacity-modified classes and
`components/App` 46, which is why those two areas look the most broken. Anywhere the light styling
survived intact is fine; it is the half-converted elements that are unreadable.

**The fix in the rewrite is not another find-and-replace.** Both gaps come from colours being spelled
literally at 600-odd call sites, where a mechanical pass can only ever approximate. `styles.css`
already defines a full semantic token ladder (`--bg0..3`, `--fg`/`--fg2`/`--fg3`, `--card`, `--border`)
with both palettes, and Tailwind already maps them — it is simply unused, because components say
`bg-white` instead of `bg-card`. Converting to the tokens makes dark mode fall out of the token
definitions instead of being maintained per-element, and it works inside bound classes and with
opacity modifiers alike. ApexCut's `docs/design.md` is the reference for what a finished ladder looks
like.

**This is what Playwright is for.** Every automated check passed on a screen no one could read:
`vue-tsc` was clean, the build succeeded, the CSS contained the right rules. Nothing that existed
could see the result. The Electron suite gets, at minimum, a light and dark screenshot of every top
level screen, so a palette regression is a failing test rather than something spotted in use.

### The styling pass, once the rebuild is done

Not "fix the Settings sidebar". Every screen gets walked in **both palettes**, against a test library,
after the token conversion. The full surface:

| | Screens |
|---|---|
| Library | grouped view, grid view, empty state, a game with one clip, drag-and-drop overlay |
| Lists | Today's clips, a collection, an empty collection, Smart Tag Patterns, Stats |
| Clip detail | player, tags, collections, notes (rendered + editor dialog), published badge, share sheet |
| Trim | frame strip, range handles, suggestion banner (both present and absent) |
| Editor | clip library, music library, timeline in both lanes, clip and audio properties, resume banner, drafts dialog, export dialog mid-render |
| Settings | all five sections, plus export/import/reset |
| Overlays | command palette, toasts, update banner, batch toolbar, every confirm dialog |

Two rules worth fixing in place of the old habits, since both produced this mess:

- **No literal colour in a component.** Tokens only, so a palette is defined once rather than
  maintained at 600 call sites. This is the rule ApexCut's `docs/design.md` states and is the reason
  its two themes stay consistent.
- **Contrast is checked, not eyeballed.** The Discard button in the resume banner was low-contrast in
  *light* mode too — this is not purely a dark-mode problem, and a screenshot diff catches what
  reading the class list does not.

### Testing never touches the real library

A hard requirement, not a convention: **no test run may see or write the real clips, database or
settings.** ApexCut's arrangement, which transplants directly:

- `GOODBIT_USER_DATA=<folder>` points a run at its own data directory **and its own single-instance
  lock**, so a test can run beside the tray app without the two fighting over one SQLite file or the
  lock rejecting the launch.
- Each Playwright test gets a throw-away directory (`tests/e2e/app.ts`), with its own videos root,
  output folder and database. Nothing is shared between tests.
- A seeded fixture library — a handful of short clips generated with the bundled ffmpeg, plus one
  deliberately unreadable file — so tests do not depend on what happens to be in anyone's Videos
  folder. Tests needing a real recording take a path from an env var and **skip** without one, rather
  than reaching for the real library.
- The same applies to me: any manual verification runs against a temporary root and database, the way
  the ApexCut port was tested, never against `C:\Users\darre\Videos`.

---

## Risks, honestly

**1. The native SQLite module — the one that can actually stall you.** TypeORM's `sqlite3` driver is a
native module and must be rebuilt against Electron's ABI (`@electron/rebuild`), then rebuilt again on
every Electron upgrade, and it has to be `asarUnpack`ed. `better-sqlite3` is the better-behaved
choice and TypeORM supports it, but switching drivers touches `data-source.ts` and wants a careful
look at anything relying on sqlite3's async behaviour. **Do this in Phase 1, on day one** — if it is
going to be painful, find out before the rest is built on top of it.

**2. `synchronize: true` with no migrations.** Correct for a single-user app you can always rebuild
from disk. Not correct once strangers have libraries full of tags and notes they cannot re-derive:
TypeORM's SQLite auto-sync resolves some schema changes by rebuilding a table, and a bad release
would take their metadata with it. **Real migrations are a 1.0 blocker,** not a nice-to-have. The
files on disk are safe either way; the metadata is not.

**3. The committed Firebase key, now that the repo goes public.** `server/secrets/firebase.json` is a
service-account key and it is in the git *history*, so deleting the file is not enough — history has
to be rewritten (`git filter-repo`) and the key rotated in the Firebase console. Phase 0 deletes
Firebase entirely, which makes the key useless to the app, but not useless to whoever finds it. Same
for the `API_TOKEN` string in `auth.ts`. Both were fine under "the repo is private"; that premise is
the thing that is changing.

**4. Watching a folder OBS is actively writing to.** Get `awaitWriteFinish` wrong and you index
half-written files. Worth testing against a real recording session rather than by copying files in.

**5. Scope.** Phases 1 and 2 are mechanical but broad — roughly 60 route handlers and 6 service files.
The layering makes each step small; there are just a lot of them.

---

## 1.0 checklist

- [ ] **Delete the Firebase project, then scrub it from history.** Deliberately still alive until the
      desktop build is tested locally — that is the agreed order, not an oversight. Once it is proven:
      delete project `clips-b0bbe` (this is what actually revokes the key), rewrite history with
      `git filter-repo` to drop `server/secrets/firebase.json`, and remove the `API_TOKEN` string from
      `server/src/auth.ts`. Deleting the file alone does nothing; the key is in the history.
- [ ] Legacy importer compiled out of the public build — verify by grepping the packaged bundle
- [ ] Real migrations replacing `synchronize: true`
- [ ] First-run wizard; no env var can be required to start
- [ ] Existing `filmpje.db` adopted without data loss
- [ ] Publisher genuinely optional, end to end
- [ ] Installer + portable build (unsigned), auto-update feed live
- [ ] CI workflow added — last, and tag-gated for the build job
- [ ] Name settled; app id, icon and publisher string follow from it
- [ ] README rewritten for someone who has never seen it, including the SmartScreen note
- [ ] Colours converted to the semantic tokens; dark mode verified on every screen
- [ ] Unit tests over the pure logic worth pinning — `sanitizeOutputName`, the crop maths, the
      analysis thresholds, `useTimeline`'s reflow, `timestampParser`
- [ ] **Playwright against the built app** (`_electron.launch` on `out/main/index.js`, ApexCut's
      arrangement): each test gets a throw-away data folder so runs never touch the real library.
      Covers the screens in both palettes, plus scan → trim → export. Kept **out of CI** — it is the
      pre-release gate, with the build depending on it, so an installer cannot be cut from a tree
      whose tests fail.
- [ ] A licence decision (there is an MIT `LICENSE` in ApexCut; this repo has none)

# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**GoodBit** is a single-user desktop app for game clips. It watches the folder OBS records into
(`<videosRoot>/<GameName>/*.mp4|*.mov|*.mkv`. The top-level folder name *is* the game name), indexes
what appears, and provides a UI to browse, tag, annotate, trim, edit and optionally publish.

Files on disk are the source of truth for *content*; the database is the source of truth for
*metadata*. **Clips are never renamed**, `displayName` is a DB field only. Deletes go to the Recycle
Bin via `shell.trashItem`, never `unlink`.

It was a self-hosted web app (four packages, Express on :4000, Firebase auth, LAN streaming) until the
Electron migration. `ELECTRON_MIGRATION.md` records what changed and why; the short version is that
Firebase, the LAN streaming probe and the service worker were all deleted rather than ported, because
each existed only to cross a network.

## Layout

One electron-vite project, three builds.

| Path | Role |
|---|---|
| `src/main` | Electron main, **the background service**. Owns the database, the folder watcher, ffmpeg, the tray. Runs whether or not a window is open |
| `src/preload` | The typed bridge, `window.goodbit`. The only way the renderer reaches main |
| `src/renderer` | Vue 3 + Pinia + vue-router + Tailwind |
| `src/shared` | DTOs and constants both processes agree on, imported as `@shared/*` |
| `publisher/` | Optional: Express + multer in Docker, serves `/media/*` and an embed page. **No ffmpeg**: the poster frame arrives with the clip |
| `tests/e2e` | Playwright against the built app |

## Commands

```bash
npm run dev            # electron-vite, hot reload
npm run typecheck      # tsconfig.node.json (main+preload) and tsconfig.web.json (renderer)
npm run test:unit      # vitest over the pure logic, under a second, no GPU and no window
npm run check          # typecheck + unit tests. The gate to run while iterating
npm run build          # typecheck, then all three bundles into out/
npm run test:e2e       # builds, then Playwright drives the real app. Minutes, not seconds
npm run build:win      # check:pre-release (check + e2e) then electron-builder
node scripts/backup-db.mjs   # verified snapshot of the library database
node scripts/migration-check.mjs  # run the shipped migrations against a copy of a real library
node scripts/restore-check.mjs    # prove a backup can be put back, and that a bad one is refused
node scripts/obs-backup.mjs  # verified snapshot of a real OBS configuration
node scripts/obs-check.mjs   # what GoodBit makes of this machine's OBS
node scripts/obs-apply-check.mjs  # apply the setup against a throw-away OBS directory
node scripts/trim-check.mjs  # run the shipped trim on a real clip and check where it landed
node scripts/export-check.mjs   # render a short movie with a dissolve and read back what landed
node scripts/ux-seed.mjs     # a throw-away library to drive the app against
node scripts/ux-session.mjs  # replay a list of actions and screenshot every step
```

Keep `npm run typecheck` green, `build` runs it first and fails otherwise.

**Check the exit status, never the log text.** vite colours its own failures, so
`[31merror during build:` does not match a grep for `^error`, and a build that failed reads as a
build that passed while the app keeps running the previous bundle. `npm run build > out.log 2>&1;
echo "exit=$?"`.

## Where things live at runtime

`%APPDATA%/GoodBit/`: `goodbit.db`, `settings.json`, `backups/`. Derived caches
(`.filmpje-cache/{thumbnails,frames,analysis}`) stay next to the clips, since they are regenerable
and belong with the media.

`settings.json` holds what main needs before a window exists: `videosRoot`, `audioRoot`,
`publisherBaseUrl`, `startAtLogin`, `keepRunningInTray`. **There are no required environment
variables**, a missing videos root opens the first-run picker rather than throwing at boot.
`GOODBIT_USER_DATA` overrides the whole data directory *and the single-instance lock*, which is how
tests run beside the installed app without touching a real library.

## Architecture

### Main is the service, not a host for the window

Registered at login, lives in the tray, hides on window close. `startup.ts` runs the boot sequence
(each step isolated so one failure does not stop the rest) and then a chokidar watcher with
`awaitWriteFinish`, **not optional**, because OBS writes for the length of the recording and
indexing mid-write reads a garbage duration and a black first frame. A reconciliation sweep is the
backstop, since filesystem events are a hint rather than a guarantee.

### No network surface

- **Data** goes over one IPC channel (`api:request`) to a listener in the same process, on a
  **named pipe on Windows and a Unix socket elsewhere**, at a path generated each launch, behind a
  secret generated at the same time. It used to bind 127.0.0.1 on an OS-chosen port, which nothing
  outside the machine could reach but every other program on it could, and this API deletes clips.
  A socket has no address to find; the secret stays because one lock is a single point of failure.
- **Media** is served by the `goodbit://` protocol straight off disk, with Range support, without
  which `<video>` cannot seek.
- The Express **router is kept** rather than rewritten into forty IPC channels. Faking a
  `ServerResponse` to dispatch it in-process does not work: `app.handle` reassigns the response
  prototype to Express's own, so hand-written methods are bypassed and Node's real `getHeader` runs
  against an object with no socket.
- The renderer's axios only had its **adapter** swapped, so every `services/*.ts` call site is
  unchanged.
- **One thing does come in from outside**: a `goodbit://` link, which the publisher setup guide
  ends with so nobody retypes a forty character token. `deeplink.ts` parses it strictly and
  `PublisherInviteDialog.vue` shows what it is being asked to do, in full. **A link never writes a
  setting.** Anything that can open a browser can send one, and one that silently repointed the
  publisher would send every clip published afterwards to whoever sent it.

### The schema, and how it is allowed to move

`synchronize: false`, `migrationsRun: true`, and the chain is in `src/main/migrations/`. It used to
be `synchronize: true`, which compared the entities to the tables on every boot and changed the
tables to match. Fine while entities only gain columns; on SQLite, not fine at all when one changes
type or goes away, because TypeORM resolves that by rebuilding the table and a clip row is the only
copy of its tags, notes, display name, stars and collections.

- **The first migration is idempotent**, every statement `IF NOT EXISTS`. Every library in existence
  was built by `synchronize` and has no migration history, so the baseline has to be a no-op against
  a schema that is already there and the full creation against an empty file. Faking a `migrations`
  row for existing databases instead breaks on one that is *almost* current, which is exactly what a
  half-finished `synchronize` boot leaves behind.
- **Its SQL was read out of `sqlite_master`** on a real 278 clip library, not written by hand, so a
  fresh install gets byte-identical DDL to an upgrade, down to TypeORM's own hashed constraint and
  index names. Those names matter: a later migration that drops one has to name the one really
  there.
- **The list is imported, never globbed.** Main is bundled into one file, so a glob finds no folder
  and returns an empty array, and an empty array with `synchronize: false` is a database that is
  never created and never updated and reports nothing.
- **The verified backup still runs first**, in `initDatabase`, before the migrations do. And one
  can now be put back: `restoreBackup` verifies the chosen copy, copies and verifies the current
  library first so the restore is itself undoable, refuses any path outside `backupsDir()`, removes
  the stale `-wal` and `-shm` so SQLite cannot replay the old database's pages into the new one, and
  clears `schemaVersion` so the next boot takes a copy before migrating a file it may never have
  seen. The caller restarts the app, because the connection pool, the watcher and every cache key
  are derived from rows that just changed. `scripts/restore-check.mjs` covers it.
- **Backup filenames are made unique, not just stamped.** `stamp()` is second-resolution because a
  person reads it in a list, and `VACUUM INTO` refuses to write a file that exists, so two copies
  inside one second were one copy and one error.
- `node scripts/migration-check.mjs` bundles the real `initDatabase` with esbuild and runs it
  against a copy of a real library: row counts before and after, the search index backfilled, a
  second boot applying nothing, and a fresh database landing on the same schema as an upgraded one.
  The last of those is the check that matters, because a fresh install and an upgrade diverging is
  how the app works on one machine and not another.

### GoodBits, and why a clip is not one moment

A **GoodBit** is a named in and out range on a clip, stored as metadata, leaving the recording
whole. A trim replaces the file, so thirty seconds with two kills fifteen seconds apart is one clip
and you keep one of them; a GoodBit writes the other one down instead. Entity `GoodBit`, table
`good_bit`, cascading on clip delete.

Consistent with the rule at the top of this file rather than an exception to it: files on disk are
the truth about content, the database is the truth about metadata, and a GoodBit is metadata about
content that is already there. Same footing as `displayName`.

- **Marking by hand is the primary path.** `scripts/hud-check.mjs` over 174 real recordings found
  **7, or 4%**, holding two or more detected moments above the confidence floor, against the 15%
  that would have made the detector the story. A person watching a clip knows it has two good bits
  whether or not a kill banner appeared. `source` is `manual` by default for that reason.
- **The detector still feeds it.** `decide()` used to sort events by confidence and keep `[0]`; it
  carries every confident one as `anchors` now, best first, so a suggestion chip can be kept as a
  GoodBit in one press. Across the real library that stops discarding eight found moments.
- **A trim moves them.** `services/goodBitsAfterTrim.ts`: marks inside the cut shift by its start,
  marks outside go, and a mark straddling a boundary is kept and clamped, because cutting two
  seconds off a five second mark leaves three seconds of the thing that was marked. Getting this
  wrong is invisible: the band still draws, over a moment where nothing happens.
- **Rendering one writes a new clip** into the library and the source keeps its marks, which avoids
  inventing a second kind of clip that only the publisher would understand.

### Drafts, and which store owns one

Two stores used to hold an unsaved timeline and they could disagree silently. IndexedDB always won,
the `project` row was a write-behind copy read only when the local one had vanished, and
`entity/Project.ts` and `services/editorDraftsDb.ts` each carried a comment claiming the opposite
of the other.

- **A named draft lives in `project`, and only there.** It is what gets backed up, what 1.2's
  restore can put back, and what outlives the Electron profile.
- **One scratch record stays in IndexedDB**, never listed as a draft. It answers "what was this
  window doing when it closed", which is a question about the profile rather than the library, it is
  rewritten on an 800 ms debounce, and a backup carrying it carries noise. `utils/draftResume.ts` is
  the one place the two are reconciled.
- **The first-run migration runs on the first editor open**, not at boot, and in this order: hand
  everything over, set the marker once the library has confirmed, then delete the local copies.
  Marking it done before confirmation is the one ordering that could lose a draft. A migrated draft
  keeps its own date, for the same reason a trim keeps the recording's.

### Searching the library

`clip_search`, an FTS5 index over `filename`, `displayName`, `notes` and `game`,
**external content** so the text is not stored twice, maintained by triggers on `clip`. It replaced
four `LIKE '%q%'` clauses that could not use an index, matched inside words, and **never looked at
notes**, which is the one place somebody wrote down what happened in a clip.

- **`services/clipSearch.ts` exists because user input cannot go into a `MATCH` expression.** FTS5's
  syntax has operators (`AND`, `OR`, `NOT`, `NEAR`, `*`, `^`, `-`, `:`, `"`), and a bare apostrophe
  or an unbalanced quote is a **syntax error rather than zero results**: somebody typing `don't`
  would have got a 500 from the library screen. Input is tokenised, every term is quoted so nothing
  typed is ever syntax, terms are joined with `AND` because two words narrow, and only the last term
  gets a `*` so results move while somebody is still typing.
- **The triggers retire the old row using its old values.** With external content FTS5 cannot see a
  change, and an index that has drifted is worse than none: it returns clips that no longer match and
  misses ones that do, silently. `tests/e2e/search.spec.ts` is the only thing that watches a row
  change and the index follow.
- **Tags are deliberately not indexed.** They are a join table, so keeping them in would need
  triggers there too, and a tag is a filter rather than prose. The library's own tag dropdown is the
  better answer to "show me the funny ones" than typing the word and hoping.
- **It falls back rather than failing.** `searchIndexUsable()` probes once per process, because a
  `MATCH` against a missing virtual table is a SQL error and by then the query is already built and
  counted. A SQLite without FTS5, a database opened by a bench script before migrating, or a restore
  in the window before its relaunch all mean a slower search rather than a library that will not
  load.

### Server-side actions

Every non-trivial operation is a class in `src/main/actions/` extending `BaseAction<TInput, TOutput>`
with a single `execute(input)`. **Add new business logic as an Action**, not inline in a route.

`ScanAndSyncClipsAction` has a **prune guard**: it refuses to delete rows when the videos folder looks
empty or when one scan would remove more than half the library. A clip row carries the only copy of
its tags, notes, display name, collections and stars, and an unmounted drive makes every file look
missing at once.

### Highlights: listening, and reading the screen

Two halves, and they cost three orders of magnitude apart.

`AnalyzeClipAction` **listens**, one `ebur128` pass, about 100 ms, and runs for every clip. It
measures; it never judges. `services/highlights/decide.ts` turns a measurement into a verdict, which
is why the expensive half can stay cached while the bar, a game's calibration or a trained model
change underneath it.

`WatchClipHudAction` **reads the screen**, and runs only for a game with a module in
`services/highlights/games/`. Roughly a sixth of a second per second of footage, so it is cached
hard, keyed by the clip's own mtime, and is never triggered by indexing, only by the Trim page
asking for suggestions. Decoding video while OBS is writing clips is the thing to avoid.

Three rules hold the vision code together, and each is there because the obvious alternative was
measured and was worse:

- **Geometry is in units of frame height from an anchor** (`vision/geometry.ts`), never fractions of
  width. A HUD scales with height and sticks to an edge or the middle, so the same numbers land on
  the same pixels at 16:9 and at 21:9; a fraction of width slides a centre element a third of the
  way across the screen when the aspect changes.
- **Frames stay on the GPU until after they are dropped.** `-hwaccel cuda` alone copies every decoded
  frame to system memory and only then lets `fps` throw nine tenths away, eleven gigabytes of
  transfer for a half-minute clip. `-hwaccel_output_format cuda` halves the wall time.
- **Crop at full resolution, scale only the crop.** Scaling the frame down first blurs the HUD into
  the scenery it has to stand out from: a signal that read 0 then 6128 collapsed into noise between
  145 and 1162.

A module declares boxes to sample and turns them into `GameEvent`s carrying a `reason`, a sentence
shown to the user. Adding one is a **measuring job**: `scripts/visual-*.mjs` renders contact sheets
of what a candidate rule actually picked, and `scripts/hud-check.mjs` runs the *shipped* modules over
a real library by bundling `src/main` with esbuild, so the bench and the app cannot drift apart.
Nothing belongs in the registry until those sheets show the thing it claims to find. Battlefield 6 is
the only module: 2042's HUD is different and four recordings is too thin to check a second one
against.

### Setting OBS up, from inside GoodBit

`src/main/services/obs/` reads and writes another program's configuration, which is why it is the
most defensive code here. Everything it knows was checked against a real OBS on a real machine;
none of it is from documentation, because OBS documents its plugin API and not its config files.

**The rules.**

- **Nothing is written while OBS runs.** It parses `basic.ini` once and rewrites the whole file from
  memory at every save point, so an edit underneath it is discarded, and a profile folder created
  while it runs stays invisible until restart.
- **Nothing the user made is edited.** A profile and a scene collection of GoodBit's own, both named
  `GoodBit`. One file outside them is touched, OBS's own `user.ini`, and it gets three keys:
  `[General] FirstRun`, which stops OBS opening its auto-configuration wizard over the profile the
  setup has just written, and `[BasicWindow] SysTrayEnabled` plus `SysTrayMinimizeToTray`, which put
  OBS in the tray rather than the taskbar, since GoodBit starts it and nothing about it is meant to
  be looked at again. `SysTrayWhenStarted` is deliberately not written: a program that gives no sign
  of having launched is a different promise, and if OBS fails to start the buffer, seeing the window
  is how anyone finds out. The list is `userConfigEdits()` so the preview and the write cannot
  disagree, and `tests/unit/main/obsUserConfig.spec.ts` asserts that nothing else in that file
  changes.
- **A preview before every write**, in OBS's own vocabulary, and a manifest of what was written so
  `undoObsSetup` can put it back.
- **The launch flags choose the profile** (`--profile GoodBit --collection GoodBit
  --startreplaybuffer`), never `[Basic] Profile`. Switching somebody's active profile is not ours to
  do.

**Things that cost a debugging session each, and are load-bearing:**

- **OBS cannot name a file after a game.** `os_generate_formatted_filename` takes the clock and the
  video settings, and nothing else; an unknown token silently loses its `%`. So OBS records into
  `<videosRoot>/.goodbit-incoming/` and **GoodBit files the clip itself**, from the program that was
  in front while it was recording. See `services/capture/`. Nothing runs inside OBS.
- **The hotkey is the output's, not the frontend's.** `[Hotkeys] OBSBasic.SaveReplayBuffer` with a
  `bindings` array is the documented shape and binds nothing on OBS 31: what works, and what the
  hotkey list shows, is `ReplayBuffer={"ReplayBuffer.Save":[…]}`.
- **Colour and encoder are one decision.** `ColorFormat=P010` with an 8 bit encoder makes the replay
  buffer refuse to start, and OBS blames your drivers. `chooseEncoder` reads what the machine's own
  profiles already ask for before trusting a probe.
- **HDR has to be detected, not inferred.** Electron reports an HDR display as `P3/sRGB`, 8 bits per
  channel. `displayQuery.ts` asks Windows through `QueryDisplayConfig`, with a C# shim PowerShell
  compiles on demand, and gets the HDR state **and** the device path OBS stores for a display
  capture in the same call.
- **Recording an HDR screen as SDR is unrecoverable.** OBS tone maps and quantises at capture, so
  the highlights are gone from the file. The reverse is recoverable: GoodBit tone maps every frame
  it decodes.
- **A new profile is not an empty profile.** OBS fills one with 1920x1080 at 30, downscaled to 720p.
  Leaving `[Video]` alone is only right for a profile somebody else made.
- **Installed means the executable exists**, and only that. `obsIsInstalled` used to accept the
  config folder as proof too, which is backwards: uninstalling OBS leaves `%APPDATA%/obs-studio`
  exactly where it was, so the app reported "set up and recording" on a machine with no OBS and a
  Start button that could only fail.
- **An empty `Untitled` collection is not "scenes you have built".** Deciding from "has a profile"
  meant a fresh OBS got no scene and opened on a blank one.
- **Installed means the executable exists**, not the config folder: OBS writes that on its first
  run, so a machine that has just installed it has one and not the other.

`scripts/obs-check.mjs` prints the diagnostic against the real OBS on this machine;
`scripts/obs-apply-check.mjs` applies the whole thing against a throw-away `GOODBIT_OBS_DIR` and
reads back what landed; `scripts/obs-backup.mjs` takes a verified copy of a real OBS configuration
before any of this is trusted with it.

### Naming a clip, without anything running inside OBS

`src/main/services/capture/` decides which game a clip belongs to. OBS cannot name a file after a
game, so this is the half that makes a library readable.

- **OBS records into `<videosRoot>/.goodbit-incoming/`**, a staging folder GoodBit owns. Inside the
  videos root deliberately, so filing a clip is a same volume `fs.rename`: atomic, instant, and the
  file is never half present at its final path. `%APPDATA%` would be a cross volume copy of a few
  hundred megabytes for anybody whose library is on another drive.
- **Dot prefixed**, so all three sweepers leave it alone. The watcher and the scan skip it for free
  (`dot: false`, plus an explicit `ignore: ['.*/**']` so a later option change cannot index a half
  written replay). `cleanupEmptyFolders` had to be taught, because an empty staging folder is its
  normal resting state and it was deleting it at every boot.
- **The foreground is sampled at 1 Hz** by a 5 KB C# helper compiled on demand into
  `%APPDATA%/GoodBit/bin/`, the same trick `displayQuery.ts` uses. Measured at 0.11% of one core.
- **`PROCESS_QUERY_LIMITED_INFORMATION`, never `PROCESS_VM_READ`.** A protected process denies the
  second and allows the first, so asking for the pair fails to name exactly the games most likely to
  be protected, and those clips land with no game at all.
- **Attribution is a vote over the clip's own window**, not a reading at the moment it lands. A clip
  arrives seconds after the moment it records, by which time the user has often alt-tabbed. Games
  win the vote over non-games, so Discord in front for most of the window still names it after the
  game behind it; when nothing in the window is a game the most-seen program wins, because
  recording a browser is a thing people do on purpose.
- **A folder that already exists wins over a better name for it.** A library holding
  `Headliners-Win64-Shipping` keeps it, because writing the better name would leave two folders for
  one game.
- **A filed clip is indexed at once, not by the library watcher.** `incoming.ts` reports what it
  filed and `startup.ts` indexes that path immediately. The watcher would find it anyway, four
  seconds later, behind a second `awaitWriteFinish` on top of the four staging already spent; that
  settle is there because a file being written gives a garbage duration and a black first frame, and
  it buys nothing for a file that arrived by an atomic same-volume rename and was whole before it
  appeared.

### Saying the clip was saved, over the game

`src/main/services/clipToast.ts`. Pressing the replay key and getting nothing back is the most
uncertain moment in using this app: OBS says nothing useful, its window is behind a game, and the
clip takes seconds to reach the library. **Off by opting out**, in Settings, Recording.

- **Two states, one card.** "Saving your clip" the instant a file appears in staging, becoming
  "Clip saved · Game · 0:30" once the row exists. The wait is the reason the feature exists, so the
  wait is the thing to show; a card that only appeared at the end would leave the uncertain seconds
  exactly as uncertain.
- **The second state fires on the row, never on the key.** A keypress says a request was made, not
  that a file arrived, was attributed and was indexed. Saying "saved" about a buffer that was not
  running is worse than saying nothing, so a clip that is filed but not indexed gets silence and a
  log line. The first card is a promise, the second is the receipt.
- **The first card names no game**, deliberately. It could only guess from whatever is in front
  *now*, and the whole reason attribution is a vote over the clip's own window is that the instant
  reading is usually wrong. A guess the second card contradicts is worse than no guess.
- **Nothing about it may disturb a game.** `focusable: false` and `showInactive()`, so it can never
  alt-tab somebody out of a firefight; `setIgnoreMouseEvents(true)`, so a click cannot be eaten; the
  `'screen-saver'` always-on-top level, because plain `alwaysOnTop` loses to a maximised game; and
  it opens on the display the pointer is on, which is the one being played on.
- **Opaque card, transparent window.** At 92% the button behind it bled through and read as a
  control of ours. Only the frame around the card is transparent, and only so the shadow and the
  rounded corners have somewhere to fall. The shadow's offset plus blur must stay inside `BLEED` or
  the window edge cuts it off in a straight line, and `MARGIN` must be at least `BLEED` or Windows
  shoves the window back on screen and moves the card with it.
- **Latency is the product, so both costs were paid up front.** The announce watch is a raw
  `fs.watch` rather than chokidar, which normalises events and stats every path, and the window is
  built during boot rather than on first use. Measured 4 ms from the filesystem event to the card,
  against roughly a second before.
- **The chime is synthesised**, two sine notes with an exponential tail: no asset to package, no
  codec to depend on, and no click, which a raw gate on a sine gives you at both ends.
- **A game in exclusive fullscreen owns the display** and nothing another window draws reaches it.
  Borderless windowed, the default in most modern games and what OBS display capture wants anyway,
  is fine. The Settings text says so.

Both windows are real, so **`BrowserWindow.getAllWindows()[0]` is no longer the app**, and neither
is Playwright's `firstWindow()`. `tests/e2e/app.ts` and `window-state.spec.ts` pick the window whose
URL is not a `data:` one. Ten tests across six specs failed at once when that was missed.

### Dragging a clip out of the window

`webContents.startDrag`, behind a grip beside the star on each card. The card body already drags,
into a collection, and `startDrag` takes the drag over completely, so one element cannot do both:
the grip's `dragstart` carries `.stop` or the clip starts moving into a collection at the same time.

The shell then offers the file back to the window it came from, which opened the import dropzone
over the library and asked whether to import a clip it was already showing. `useOsDrag.ts` holds a
module-level flag while a drag is ours, and `useFileImport` ignores both the dragenter and the drop.
Clearing that flag needs a real end signal, and there is no `dragend` in the renderer because the web
drag was cancelled to hand over to the shell; `webContents.startDrag` runs a nested message loop on
Windows and returns when the drop happens or is abandoned, so main sends `clip:dragOutEnded` in a
`finally` at that point.

### An MCP server, for Claude

`src/main/services/mcp/` lets Claude Code, Claude Desktop or Cursor work on the library. **Off
unless the user turns it on**, in Settings, Connections.

- **HTTP, not stdio, and that is forced.** A stdio server is spawned by the client, so it would be a
  second process that does not own the database, the ffmpeg jobs or the watcher. The app is already
  running and owns all three, so the client has to come to it.
- **Which is a port again**, after the internal API deliberately moved off one. So it carries what
  the pipe made unnecessary: bound to `127.0.0.1`, a bearer token checked before the request reaches
  the protocol, and `enableDnsRebindingProtection` with an Origin allow list, which the MCP spec
  makes a MUST rather than a suggestion. Verified: a request with `Origin: https://evil.example`
  gets 403, one with no token gets 401.
- **A server and a transport per request.** Holding one pair open answers the first request and then
  returns 500 for ever, because a stateless transport carries no session and refuses to be
  initialised twice. Building both per request is what the SDK expects and costs nothing.
- **Eleven tools, not seventy six endpoints.** A model picks a tool by reading its description, so
  the internal API is not mirrored. The tools are task shaped, and the interesting ones are the
  things only this app knows: `suggest_highlights` is the `ebur128` analysis and the HUD modules.
- **Nothing returns a video, and nothing deletes a clip.** Metadata and paths only. `trim_clip` is
  the one destructive tool and its description says so.
- **The token is not a defence against local software.** It lives in the reader's own Claude config,
  so anything running as that user can read it. It stops web pages and other machines, which is what
  a desktop app can honestly promise.
- **Claude Desktop's config is not where the documentation says.** It ships as an MSIX package, so
  Windows redirects its `%APPDATA%` into `%LOCALAPPDATA%/Packages/Claude_<id>/LocalCache/Roaming`.
  Writing the documented path on a Store install produces a file the app never reads.

### Steam, off the local disk

`src/main/services/steam/` reads what Steam has already downloaded. No key, no account, no network,
nothing that can be switched off.

- **The artwork is already here.** `appcache/librarycache/<appid>/` holds header, hero, portrait,
  logo and icon for every game whose library page Steam has drawn: 1011 games and 349 MB on the
  machine this was built against.
- **Glob by filename, one level deep.** Two layouts are live at once: most files sit in
  `<appid>/`, some in a forty character hex folder under it. That hash is Valve's content hash for
  the asset, so it changes when Valve re-cuts an image. **Never store it**, resolve each time.
- **Two names for one picture.** `header.jpg` and `library_header.jpg` never appear together, nor do
  `library_600x900.jpg` and `library_capsule.jpg`.
- **The appid comes from the database, never from a caller.** `Game.steamAppId` is matched once by
  `SyncGamesAction` from the install manifests and the registry, and `steamAppIdLocked` stops the
  matcher overwriting a person's correction.
- **`rungameid`, never `run`.** `steam://run/<id>//<args>/` passes its tail to the game as launch
  parameters. The appid is checked against `^\d+$` in main before it reaches a URL.
- **Art is for this machine's windows.** It is Valve's and the publisher's, cached locally.
  Displaying it here is not serving it: it must never reach `publisher/` or a public link.
- Name matching alone reaches about two thirds of a real library. The misses are folders named after
  an executable (`cs2`, `Headliners-Win64-Shipping`) and games from other stores, which is what the
  override is for. `scripts/steam-check.mjs` prints what matches on this machine.

### Deriving a picture from an HDR clip

Every recording here is PQ/bt2020 10 bit, so the tone map is the normal path rather than the
exception, and **its position in the filter chain is the whole cost**.

- **Shrink first, then tone map.** `TONEMAP_FILTER` converts every pixel to float32 and back, on the
  CPU. Run over 3440x1440 it took **28 seconds** for one frame strip; run over the 320 wide
  thumbnails it is **3 seconds**, about a hundred and fifteen times fewer pixels for the same
  picture (identical dimensions, mean brightness 49 against 48).
- **`-hwaccel cuda` alone is half a fix.** It decodes on the card and copies every frame back at
  full size. `-hwaccel_output_format cuda` plus `scale_cuda` keeps them there until they are small.
- **Always carry a CPU fallback, and not only for machines without a GPU.** NVDEC refuses files it
  looks like it should take: a plain h264 High 3440x1440 clip fails with `CUDA_ERROR_INVALID_VALUE`
  and ffmpeg silently decodes it in software, leaving a `scale_cuda` graph meeting system memory
  frames and failing outright. That wrote no file, and a missing thumbnail looks exactly like one
  not made yet, so those cards stayed black for ever.
- **A thumbnail is 1280 wide, and the width is in its cache key.** It used to be the recording's own
  size: 181 KB on disk, and **18.9 MB once the renderer decoded it**, so forty cards carried three
  quarters of a gigabyte of bitmaps.

### Keeping ffmpeg under control

`services/mediaQueue.ts` caps how many ffmpegs exist at once and collapses duplicate work by key.
**Every cache builder goes through it.** A thumbnail is one frame and costs nothing, which is why
nothing limited it, and then a few hundred cards scrolled past and each asked for its own: dozens of
`ffprobe` and `ffmpeg` pairs, each holding a few hundred megabytes to decode a 3440x1440 AV1 source
for a single frame. Four at a time, and one job per output path.

### Encoding

`services/encoders.ts` probes `h264_nvenc` / `qsv` / `amf` and `cuda` / `d3d11va` / `qsv` once per
process, by actually encoding a tiny clip, a build can list an encoder the GPU will refuse.

H.264 rather than HEVC: exports go to Discord and browsers. **GPU decode matters more than the
encoder here**, these are 3440x1440 AV1 files and software decoding them runs at 0.44x realtime.

**HDR sources must be tone mapped.** OBS writes PQ/bt2020; reading that as sRGB is what made every
export grey and washed out. `TONEMAP_FILTER` (hable) is applied wherever a frame is decoded, export,
exact trims, thumbnails, frame strips, HUD sampling.

**A trim lands on the frames that were asked for.** That rules out a stream copy, which cannot
begin in the middle of a group of pictures: asking for 4.5s to 12.8s produced a file that started
at 0 and ran half again as long. Both defaults re-encode and are frame accurate, and `compressTrims`
only chooses how hard the result is squeezed. `lossless` is still in the API for a caller that
wants the recorded bytes and can live with the snap.

**A trim also keeps the recording's own date and its new length.** The cut writes a new file, so its
mtime is the moment you pressed save; taking that as the clip's date moved an August recording into
today's group. The date is carried over, on disk as well, or the next scan undoes it.

**A `lossless` cut is two stream copies, not one.** Copying from the keyframe before the cut leaves
the frames ahead of it *flagged discardable and stamped at time zero* rather than out of the file.
Software decoders skip them; **NVDEC decodes them**, against a keyframe that is no longer there,
which shipped as four seconds of flat green with the sound a group of pictures ahead of the picture.
The second pass reads the file back and writes it out, which drops them because by then they carry
the flag that says so.

**An export is a list of steps, not a list of clips.** One segment per clip joined by the concat
demuxer cannot express a transition: `xfade` needs frames from two sources at the same instant and
the demuxer only puts one finished file after another. So `services/exportPlan.ts` plans steps, a
`cut` (one source, what a segment always was) or a `dissolve` (two sources overlapping, one command
reading two files), and the join is unchanged. The blend is its own segment rather than a second
pass over the joined movie, so **no frame outside a blend is encoded twice**.

- **A dissolve is taken out of both its neighbours**, so the movie is shorter by the overlap. A clip
  with one on each side gives up the sum, and `buildRenderPlan` scales both down rather than handing
  ffmpeg a segment of negative length. Borrowing frames from outside the trims instead would keep
  the length and play frames the person deliberately cut off.
- **Both sides are asked separately** about HDR and about a discard-flagged pre-roll, because a
  transition reads two files and the answers differ. One input can go without `-hwaccel` while the
  other gets it, in the same command.
- **Crop before tone map.** 2.8 seconds against 5.8 for a five second vertical export, and the frame
  is bit-identical (`framemd5` matches; they commute because `npl` is a constant rather than
  something measured off the frame). The same mistake in the same direction as the one that made a
  frame strip take 28 seconds.
- Measured: **1.35 s per second of output with cuts**, against 1.37 before the rework, so nothing
  was traded away. A dissolve costs about three seconds each, mostly fixed per dissolve rather than
  per second of it, because it opens and seeks two AV1 decoders.

The health of a trim is two numbers. **The range on disk must match the range asked for**, and for a
lossless cut **the count of packets carrying the discard flag must be zero**.
`scripts/trim-check.mjs` asserts both against a real recording, plus that the opening frame is not
green under `-hwaccel cuda`. Nothing else catches the second one: the container duration is right
either way, and so is any player that happens to honour the flag.

Because cuts made before that fix are still on disk, `decodeArgs` takes the file as well as the
encoder and **falls back to software decode for a source that still has a pre-roll**, which is 30%
slower and correct rather than fast and green.

**Compressing a trim and compressing a published copy are two settings.** A trim replaces the only
copy of that moment, so `compressTrims` is **off** by default and the cut stays close to the
recording;
`compressPublished` is **on**, because what goes behind a public link is a copy and the file on disk
is untouched either way. `shareEncoderArgs` is the share preset both use.

### Client

- `stores/` (Pinia): `clips`, `collections`, `games`, `tags`, `batchOperations`, `toast`.
  `clips` and `collections` use the abort-and-requestId pattern to drop stale responses; preserve it.
- `composables/` hold most component logic; `services/` are thin one-function-per-endpoint wrappers.
- **One switch component.** `Base/BaseToggle.vue` is the only on/off control; `Settings/SettingToggle.vue`
  wraps it with a label and a description. Native checkboxes were mixed in with hand-rolled switches
  and read as two different controls for the same kind of decision.
- **One dropdown component**, for the same reason. `Base/BaseComboBox.vue` on Reka UI's Combobox;
  `Settings/SettingSelect.vue` wraps it with a label and a description, the way `SettingToggle` wraps
  the switch. A native `<select>` is drawn by Windows at a height, a font and a focus ring the rest
  of the screen does not share, and it can hold text and nothing else. An option here carries an
  icon, a count and a second line, search is a prop and off by default, and multi-select is a prop.
  **There is one height and it is not a prop** (`COMBO_BOX_HEIGHT` in `Base/types.ts`): the sort and
  tag dropdowns sit beside each other in the library's filter row and have to match. The closed
  control is a button rather than the text input Reka's own examples use, so the search field lives
  at the top of the open list; when search is off there is still a screen reader only, read only
  input in there, because `ComboboxInput` is where the arrow keys, Enter and
  `aria-activedescendant` come from.
- `utils/mediaUrl.ts` is the single place media URLs are built.
- View preferences live in localStorage via `useConfiguration()`. App settings come from main via
  `useAppSettings()`, different things, do not merge them.

### Colours

**No literal colour in a component.** `styles.css` defines the token ladder (`--background`,
`--foreground`, `--muted-50..900`, `--card`, `--border`, `--line-strong`) for both palettes, and
Tailwind maps them. Dark mode falls out of the tokens.

This is not a style preference. Adding `dark:` variants beside literals was tried and shipped
visibly broken: variants cannot reach colours inside bound `:class` expressions, and `bg-white/60` is
a different class from `bg-white`, so whole screens stayed light while the shell went dark. Tokens
have neither problem.

White stays literal **only** where it sits on a brand or fixed-dark surface (an orange button, a chip
over video), since those grounds do not follow the theme.

## Testing

Two suites, three orders of magnitude apart, and the split is by what a test needs rather than by
what it covers.

`tests/unit` is vitest over **anything that takes values and returns values**: `decide.ts` turning a
measurement into a verdict, `geometry.ts` turning an anchor and a frame height into a pixel box,
`voteOver` turning a run of foreground samples into the name a clip gets filed under. Under a
second, so it can run on every edit. Every threshold in there was arrived at by measuring real
recordings and none of it is re-derivable from reading the code, which is exactly why a `<` quietly
becoming a `<=` needs to fail something.

What does not belong there: anything that runs ffmpeg, opens a database, writes another program's
configuration or needs a window. Those have `scripts/*-check.mjs` benches against real inputs, which
is the honest way to test them.

Two things the unit suite needs to know about. `vitest.config.ts` rewrites main's `.js` import
specifiers to the `.ts` files they mean, because main is ESM at runtime and Vite does not do what
`tsc` does here. And `tests/unit/stubs/electron.ts` stands in for `electron`, because `decide.ts`
reaches it transitively through `model.ts` looking for a trained model. That stub is a symptom worth
inverting rather than a fixture worth keeping.

A defect that is known and not yet fixed is recorded as `it.fails` with a comment saying which item
fixes it. Fixing it makes that test fail, which is the announcement.

`tests/e2e` drives the built app with Playwright. Each test gets a throw-away data directory, videos
root and database; fixtures are generated with the bundled ffmpeg. **A test must never touch the real
library.**

`screens.spec.ts` walks every screen in both palettes and fails on text below 2.5:1 against its own
*painted* background, translucent layers composited, since a tint like `bg-orange-500/10` computes to
`rgb(249 115 22 / 0.1)` and reading it as opaque orange flags every label on it.

These do not run in CI (they need a desktop session, a GPU and ffmpeg). `build:win` depends on them.

## Conventions

- **Never use an em dash (`unknown`).** Not in code, comments, commit messages, UI strings, docs or
  the website. Use a comma, a colon, a semicolon, brackets or a full stop, whichever the sentence
  actually wants; an em dash is usually a sign the sentence needed rewriting rather than
  punctuating. An en dash (`–`) in a numeric range like `0:20 – 0:26` is correct typography and
  stays.
- TypeScript strict, ESM everywhere. Main imports need the `.js` extension on relative paths.
- Vue: `<script setup lang="ts">`, typed `defineProps`/`defineEmits`, `ref` over `reactive`.
- Tailwind utilities over custom CSS; tokens over literals.
- Feedback through the toast store; destructive actions use `toastStore.confirm`.
- Long work runs as a job (`services/jobs.ts`) with progress, an ETA and an `AbortController`,
  never awaited inside a handler.

**A clip's length is stored, not probed.** `durationSec` is filled in by the scan, at one cheap
`probeDurationSec` each, because the library needs it for every tile at once and it is the first
thing anyone wants when deciding what to cut. Rows written before the column existed are backfilled
by the next scan, and a trim re-probes.

## Known gaps

- No linter. Typecheck, the unit suite and the e2e suite are the automated gates.
- `publisher/` reads its config from a `.env` with no schema validation. There is a documented
  `.env.example` and a loud boot check now, so a missing `PUBLISH_TOKEN` announces itself at start
  rather than as a 503 during somebody's upload, but nothing validates the rest. Setting it up is
  documented at `site/publisher.html`, which is a wizard rather than a page, a quick start and a
  seven-step route that writes the reader's own domain and paths into every command.
- The app is no longer Windows-only in principle (`shell.trashItem`, `shell.showItemInFolder`), but
  nothing has been built or tested anywhere else.

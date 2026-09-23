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
| `streamdeck-plugin/` | Optional: an Elgato Stream Deck plugin, its own `package.json`, built and versioned on its own. Never packed into the app |
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
node scripts/obs-audio-check.mjs  # which sound the setup routes to which OBS track
node scripts/visual-deaths.mjs   # what the two death cues score across a real library
node scripts/foreground-track-check.mjs  # prove the helper tells a running process from a closed one
node scripts/trim-check.mjs  # run the shipped trim on a real clip and check where it landed
node scripts/clip-audio-check.mjs  # prove muting a track mutes it, through the real ffmpeg
node scripts/compress-check.mjs   # squeeze a real recording and read back what landed
node scripts/publisher-views-check.mjs  # run the real publisher and see what it counts
node scripts/discord-webhook-check.mjs  # run the publisher against a fake Discord and read what it sent
node scripts/streamdeck-check.mjs  # start the app with the Stream Deck server on and knock on its door
node scripts/export-check.mjs   # render a short movie with a dissolve and read back what landed
node scripts/ux-seed.mjs     # a throw-away library to drive the app against
node scripts/ux-session.mjs  # replay a list of actions and screenshot every step
```

**Cutting a release is written down**, in `RELEASING.md`, and the order matters:
the gate runs on a real machine before the tag because the e2e suite cannot run
on the runner, `main` has to be merged before tagging because three workflows
only fire there, and a tag that finishes green is still a draft until somebody
publishes it.

Keep `npm run typecheck` green, `build` runs it first and fails otherwise.

**Check the exit status, never the log text.** vite colours its own failures, so
`[31merror during build:` does not match a grep for `^error`, and a build that failed reads as a
build that passed while the app keeps running the previous bundle. `npm run build > out.log 2>&1;
echo "exit=$?"`.

## `dev`, and never testing against the real library unprotected

A bundled release is integrated on **`dev`**, not on `main`. Every feature PR targets `dev`, the
whole branch is then tested by hand against a **real** library, and only once that passes is `dev`
promoted to `main`. Feedback from that testing arrives as a new PR onto `dev` like everything else.

`.github/workflows/dev-sync.yml` merges every push to `main` into `dev` and opens an issue when it
cannot. A long-lived branch that does not follow `main` drifts silently: a hotfix tagged off `main`
would be missing from the release that comes after it, and `dev` would merge cleanly without it.
A merge, never a rebase, because `dev` is pushed to by several branches and is checked out on a
real machine while it is being tested.

**Before an unreleased build is ever pointed at the real library, back up what it can destroy, and
verify the backup.** This is not a nicety. A clip row is the only copy of its tags, notes, display
name, stars, collections and marks; a migration that runs is not undone by checking out the old
branch; and a release like this one carries several PRs whose main verb replaces or deletes a file.

- `node scripts/backup-db.mjs` for the library database, which reads its copy back.
- `node scripts/obs-backup.mjs` before anything touches OBS, for the same reason.
- Copy `settings.json` too, since a new build writes new keys into it and an older one will not
  understand them.
- Prefer `GOODBIT_USER_DATA` pointed at a throw-away profile whose `videosRoot` is the real one:
  the database, the settings and the caches are then this run's own, and only the *files* are
  shared. That is the smallest blast radius that still tests anything real.
- `node scripts/restore-check.mjs` proves a backup can actually be put back, and that a corrupt one
  is refused. Run it when the backup is the thing standing between a test and somebody's library.

## Stacked pull requests

`gh stack`, the `github/gh-stack` extension, with the agent skill of the same name installed
alongside it (`gh extension install github/gh-stack`, `gh skill install github/gh-stack`). Needs
`gh` 2.90 or newer; this machine has it.

**A stack is a single linear chain, so it is for work that genuinely depends on earlier work, and
nothing else.** Stacking independent PRs invents an order that does not exist and then enforces it:
a middle PR cannot merge on its own, ever, because everything below it merges with it. Four
unrelated features in one stack means the slowest one holds the other three.

So the test before stacking anything: *would I have to rebase this PR onto that one anyway?* If
yes, stack it. If no, branch it off `main` like any other PR.

- `gh stack init`, then `gh stack add <branch>` from the top of the stack for each layer, then
  `gh stack submit`. `gh stack view` prints the chain, `gh stack up` / `down` / `top` / `bottom`
  move through it.
- **Fixing a lower layer is the whole point, and it has a shape**: `gh stack down`, edit, commit,
  `gh stack rebase --upstack`, `gh stack push`, `gh stack top`. Pushing to a lower branch without
  rebasing breaks the chain's linear history and GitHub blocks the merge until it is repaired.
- **Rebase from the CLI, not the website**, whenever the repository ever starts requiring signed
  commits. GitHub's own *Rebase stack* button force-pushes every branch with **unsigned** commits.
  It does not matter today, `main` carries only `deletion` and `non_fast_forward` rules, but it is
  the kind of thing that is discovered at the worst moment.
- **Merging is bottom-up and atomic.** `gh stack merge` takes everything up to your chosen PR in
  one all-or-nothing operation, and the survivors above it are automatically retargeted and
  rebased onto the stack base. Squash works and gives one commit per PR, so the house preference
  for a readable history survives.
- **Auto-merge does not work on a stack**, and the legacy merge endpoint cannot merge one. Nothing
  here uses either, but a bot added later would have to use the asynchronous merge API.
- Same repository only, no forks, and the CLI's shell alias helper does not work on Windows. Both
  are fine here.

The feature is in public preview and needs no repository setting turned on.

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
  Reading deaths as well as kills doubled that to **14, or 8%**, which is worth having and is still
  not the story: 76 of those 174 clips hold nothing the screen can name at all.
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

Four rules hold the vision code together, and each is there because the obvious alternative was
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
- **Every box rides one decode.** It was one ffmpeg per region, because raw video cannot share a
  pipe. True, and the conclusion did not follow: the boxes are stacked into one taller picture
  inside the filter graph and sliced apart in `sample.ts`, so a second box costs a crop and a scale
  rather than a second pass over the file. Reading Battlefield's two death cues as well as its kill
  banner took the whole library from 0.173 to 0.196 seconds per second of footage, and most of that
  is the extra template matching rather than the extra boxes; as three separate regions it would
  have been three decodes. **The tone map stays in front of the crop**, which is the one part that
  looks like an oversight and is not: running it on the small crops instead is a quarter faster and
  is not the same picture, because the source is 4:2:0 and cropping first moves the chroma phase.
  Measured over 40 recordings it shifted every score by about five thousandths and flipped four
  clips across the bar, two each way. A quarter off a cached measurement does not buy the right to
  change which moments the app finds.

A module declares boxes to sample and turns them into `GameEvent`s carrying a `reason`, a sentence
shown to the user. Adding one is a **measuring job**: `scripts/visual-*.mjs` renders contact sheets
of what a candidate rule actually picked, and `scripts/hud-check.mjs` runs the *shipped* modules over
a real library by bundling `src/main` with esbuild, so the bench and the app cannot drift apart.
Nothing belongs in the registry until those sheets show the thing it claims to find. Battlefield 6 is
the only module: 2042's HUD is different and four recordings is too thin to check a second one
against.

It reads **deaths as well as kills**: 20 of them across the 174 clip library, 3 of which fold into a
kill moment and 2 of which are dropped as already on screen when the recording starts. That took two
boxes rather than one. Dying puts MAN DOWN
under the revive ring in the middle of the screen and a PLAYER CARD prompt in the bottom right
corner, which are two anchors, so no single box catches both at more than one aspect ratio. Neither
cue is enough on its own either: over the whole 174 clip library MAN DOWN found 16 of the 23 deaths
and the prompt found 14, seven of which MAN DOWN had missed, because MAN DOWN is the revive state
and the prompt names whoever killed you. Two words of text separate far better than an icon
does, so where the skull needs three tests and a two-frame rule, a death is one threshold: nothing
without a death in it reaches 0.41, and every death scores 0.69 or better. **A lone frame is
believed here**, which it deliberately is not for a kill, and that is worth two of the 23: one where
MAN DOWN was legible in a single sample, and one caught while the words were still wiping on.

**A death within two seconds of a kill is part of that moment**, not a second one. Trading a kill
for your own life is one thing that happened and one range to cut, and the sentence says so: "two
kills, 5 seconds apart, then you went down". Further off it gets its own range, because a death
twenty seconds after a kill is a second story and merging them would suggest a cut with a long walk
in the middle. `composeMoments` is exported and takes numbers, so
`tests/unit/main/battlefieldMoments.spec.ts` owns those rules without needing a GPU.

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
- **One track is a decision that cannot be taken back.** OBS mixes every source
  into one stream unless two bitmasks say otherwise, and a friend chewing on
  voice chat is then in the same samples as the gunfire for ever. The setup
  writes both: `[SimpleOutput] RecTracks`, which is which tracks reach the file,
  and `mixers` on each source, which is which tracks that source feeds.
  **Track 1 stays the full mix**, so anything that reads one track still hears
  everything, and tracks 2 upward carry one source each. `mixers: 255` on every
  source, which is what this wrote before, reads as generous and is the
  opposite: every source feeding every track means every track holds the same
  mix, which is how a six stream recording is six copies of one decision.
  Refused, or with one device, it writes exactly what it wrote before.
  `planAudioTracks` lives in `src/shared` because the wizard draws the routing
  live while somebody ticks devices and the setup writes it, and two copies of
  one `1 << (index + 1)` is how a preview names a different track from the one
  that gets written. Game capture gets the mix and nothing else, or game audio
  would land on the voice chat track.
- **Simple output mode can do this, and that was checked rather than read.**
  OBS 32.2.2's own binary carries `simpleOutRecTrack1` through
  `simpleOutRecTrack6`, so the six checkboxes exist in Simple mode and no
  switch to Advanced is needed; and a real recording off this library holds six
  aac streams in an mp4, so the container is not the limit either. OBS's own
  warning about MP4 and multiple tracks is about a recording that cannot be
  finalised after a crash, not about capability.
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

### Reading a session's clips when the game closes

`services/capture/sessionWatch.ts`. Suggestions are worked out when somebody
opens the Trim page and not a second before, which is right for a half that
decodes video. Its cost is that the first open of every clip pays for the read
while somebody sits there waiting to cut. Closing the game is the one moment
the machine is unambiguously free and the answer is wanted. **On by default**,
in Settings, Recording.

- **The trigger is a close, not an alt-tab**, and the samples cannot tell those
  apart: `foregroundHistory` answers "what is in front", and a game tabbed away
  from and a game that has exited are the same absence. So the helper takes a
  pid on stdin and reports whether it is alive beside every sample.
  `process.kill(pid, 0)` would answer the same question and is the wrong answer
  to this one, because Windows reuses pids quickly; **a held handle pins the
  pid**, and the helper already opens one per sample.
- **`GetExitCodeProcess`, not `WaitForSingleObject`.** Waiting on a process
  handle needs the `SYNCHRONIZE` right, which `PROCESS_QUERY_LIMITED_INFORMATION`
  does not grant: the call fails, and a failure that is not `WAIT_OBJECT_0`
  reads as "still running". It reported a killed process as alive for as long
  as it was asked. Asking for `SYNCHRONIZE` too would be the same mistake as
  `PROCESS_VM_READ`, so the test is the one that needs no extra right.
- **The decision is a pure function**, `sessionEnd.ts`, taking samples and a
  liveness answer and returning the session that ended, so `tests/unit` owns it
  without a running helper. Same split as `voteOver` out of `dominantBetween`.
  An exit settles for 20 seconds before it is believed, because a crash and a
  relaunch, an anti-cheat wrapper re-execing and a launcher spawning the real
  game are all a pid going away and another arriving. A hole in the samples,
  which is what sleeping looks like, resets it rather than ending anything.
- **Staging drains first.** A clip still in `.goodbit-incoming/` when the game
  closes is the last play of the night, which is the one most likely to be
  worth cutting, and firing before it is filed reads every clip except that one.
- **It stands down if another game is in front**, and while the library is
  suspended for a move.
- **Two at a time on a machine with a hardware decoder and eight cores, one
  otherwise.** The screen-reading half is GPU bound, so a second clip overlaps
  the first; without NVDEC it is two things being slow at each other on a
  laptop that has just finished running a game.
- **It writes no GoodBits.** The measurement lands in the cache, keyed by
  mtime, and the verdict is recomputed as it always was. The one thing that
  does persist is `clip.suggestedCount`, because the library is a single query
  and cannot open a cache file per tile; null there means "nobody has looked",
  which is not the same as zero. Writing a band onto every confident reading
  while nobody is watching would fill a library with marks nobody asked for,
  and 4% of a real library holds two or more of them.
- **One card, and only when it found something.** The same overlay the clip
  toast uses, with a `finding`/`found` pair beside `saving`/`saved`. A sweep
  that turns up nothing takes its card down rather than interrupting with an
  empty result. The linger comes from the caller, because `SAVING_TIMEOUT_MS`
  is 45 seconds and a sweep can outrun it.
- **Its chime is nothing like the clip's**, and only on the half with news in
  it. A rising G major triad an octave below the clip pair's C6-E6: three
  notes against two, round rather than bright, because it only ever plays once
  a game has closed and has nothing to cut through. Somebody who has heard both
  a hundred times should not have to read the card to know which one played.
  The opening half is silent whatever the settings say: it fires as somebody
  closes a game, which is often the moment they get up.

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

### A Stream Deck plugin, and the second port

`src/main/services/streamdeck/` is a small HTTP server for the plugin in `streamdeck-plugin/`.
**Off unless the user turns it on**, in Settings, Connections, and built exactly like the MCP server
because that is the precedent for opening a port here honestly: `127.0.0.1` only, a bearer token
checked in constant time before routing, and **a Host and Origin check written by hand** in
`auth.ts`, because the MCP SDK does that for its server and a plain `http.createServer` does not.
Without it a web page the user merely has open can post to the port, and a page on a name it has
re-pointed at `127.0.0.1` arrives with a foreign `Host`. `tests/unit/main/streamdeckAuth.spec.ts`
owns the predicates, since a bug there is a security bug; `scripts/streamdeck-check.mjs` proves the
401, both 403s, and that the port answers on no address but loopback.

- **The handlers are a transport.** Each finds a clip and hands it to an Action that already exists:
  `BatchAddTagsAction`, `PublishClipAction`, `BatchDeleteAction`.
- **"The latest clip" refuses while staging holds a file.** For a few seconds after the replay key
  the newest row is the *previous* clip, and a key in that window would act on the wrong recording.
  Same rule as the clip toast: the receipt fires on the row, never on the key.
- **Discard is three locks, not one.** Its own setting, off by default; a long press, which the
  plugin says to the server as `confirm: true`; and `discardableFromAKey`, which keeps any clip
  carrying something that exists only in GoodBit. The file comes back from the Recycle Bin, the row
  does not, and a key has no room for the question `clipDeleteQuestion.ts` asks.
- **The save key presses the hotkey OBS already has**, through a compiled `SendInput` helper
  (`services/obs/saveReplay.ts`), and never obs-websocket: that is a server OBS binds to every
  interface once enabled, and a config of OBS's own to write. Nothing in OBS changes. The key goes
  to the foreground, the game, exactly as the physical key would. **It answers on the file, not the
  press**: "saved" only once a new recording lands in the folder OBS writes to, and otherwise one of
  four reasons. `replayHotkey.ts` maps OBS key names to virtual keys and `tests/unit` owns it,
  because a wrong entry presses a different key in somebody's game.
- **One press installs the plugin.** It ships in `resources/streamdeck/` (`build:streamdeck`, run
  by `build:win`); `shell.openPath` hands it to the Stream Deck app, and GoodBit then writes the
  address and token into the installed plugin's own `connection.json`, rewritten whenever the
  server starts. A key's own settings win over the file.

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

### The sound in a clip, once it is more than one thing

`services/clipAudio.ts`, and the section beside the trimmer and the editor's
clip panel. A recording made through GoodBit's own OBS setup carries a track per
source, which is only worth having because of what can be done with it: the
clutch is fine, the friend chewing on voice chat is not, and one press fixes it.

- **Track 1 is not a peer of the tracks below it.** It is every source summed,
  so it already holds the sound being muted: keeping it and dropping track 4
  mutes nothing at all, and the clip plays perfectly while the feature has
  silently done nothing. So whenever a selection changes one of the isolated
  tracks, **the mix is rebuilt out of what survived**, which is the one place
  this re-encodes audio nobody asked it to touch. Muting every part drops the
  mix as well, rather than carrying across a sum of things that are gone.
- **A trim carries the selection into the file**, because a trim replaces the
  recording. Everywhere else it is an export-time decision, like a crop.
- **The default changed, carefully.** A cut used to keep the first audio track
  and drop the rest, which was right for a library whose six tracks were six
  copies of one mix. It keeps every track now **only when something knows what
  they hold**, which is exactly when GoodBit wrote the OBS setup that recorded
  the clip. Told apart by whether the manifest's mapping fits the file: a
  mapping that does not is refused outright rather than applied to half the
  tracks, because naming stream 3 voice chat after voice chat has moved is how
  somebody mutes the game.
- **A level is a multiplier, shown as a percentage**, not decibels. The timeline
  fader, `ProjectTimelineClip.volume` and the `volume=` filter the export
  already writes are all linear, and a track reading `-6 dB` beside a clip
  reading `50%` is two units for one idea.
- **An export flattens, a trim does not.** A movie has one soundtrack, so
  `planMixedAudio` mixes the surviving parts down; `planTrimAudio` keeps them as
  tracks so the clip can be remixed tomorrow. Both refuse to claim every stream
  with one `-c:a`, since the streams beside a rebuilt one are being copied.
- **Nothing can preview one track.** Chromium does not implement
  `HTMLMediaElement.audioTracks`, so the `<video>` plays whatever the container
  calls first and no control in the renderer can reach it. *Only this* therefore
  mutes the others, which the cut and the export both understand, and the
  section says out loud that the preview is unaffected.
- `tests/unit` owns the arguments; `scripts/clip-audio-check.mjs` owns whether
  ffmpeg accepts them and whether the file that lands is the one that was asked
  for. It builds its own source, because a real recording's six identical tracks
  cannot show that the right one was dropped, and **the track it mutes is the
  loud one**: built the other way round the sum and the survivor differ by a
  tenth of a decibel, and a mix copied across unchanged reads exactly like a mix
  correctly rebuilt.

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

**Squeezing a clip already on disk is the same operation as a trim**, and it is careful in the same
ways plus one: `CompressClipAction` writes beside the file, reads the result back, and only then
sends the original to the Recycle Bin and renames. It is **allowed to refuse**, which is the part
worth keeping: a result that is not at least 5% smaller means the clip was already below what the
share preset aims for, and a result of the wrong length is a truncated encode, which is what a full
disk leaves behind and which would otherwise read as a spectacular saving.
`scripts/compress-check.mjs` asserts both, plus that every audio track survived, because
flattening six tracks to one is invisible until somebody tries to mute voice chat next month.

**Compressing a trim and compressing a published copy are two settings.** A trim replaces the only
copy of that moment, so `compressTrims` is **off** by default and the cut stays close to the
recording;
`compressPublished` is **on**, because what goes behind a public link is a copy and the file on disk
is untouched either way. `shareEncoderArgs` is the share preset both use.

### What the publisher promises a CDN

`/media` answers `s-maxage=31536000`, a year at the edge, and that is only honest because **every
write in the publisher purges the URL it changed**: `PublishClipAction` the clip,
`StoreThumbnailAction` the poster, `UnpublishClipAction` both. A new write path that forgets to
purge serves a stale clip for a year and no reload fixes it, because the browser is not the one
holding the copy. So the rule is the invariant rather than the header: nothing here may change the
bytes at a URL without purging it.

`max-age` for the browser is five minutes, deliberately not the year, and `immutable` is not set at
all. These URLs are the clip's own filename rather than a content hash, and a browser cache has no
purge, so a viewer who watched a clip and came back after the owner re-published a trimmed cut
under the same name would be served the old one off their own disk.

**The embed page stays `no-store`.** Its metadata writes all purge it already, so the per-request
generation is not the hazard. The deploy is: the HTML is a template compiled into the server, so
shipping a new publisher changes the page of every clip ever published at once and there is no list
of them to purge.

**The publisher counts one thing, and only on the page.** `services/viewCounter.ts` holds a map of
filename to a count and a date, loaded at boot, flushed when dirty and on `SIGTERM`. It lives in
**one file outside `UPLOAD_DIR`**, which is three decisions rather than one: a counter is written on
a *read* by strangers while a sidecar is rewritten wholesale on a publish, so a hot count in a
sidecar is reset by the next metadata sync; every question the dashboard asks is an aggregate, which
one file answers in one read; and everything inside `UPLOAD_DIR` is served by
`express.static`, so a counters file beside the clips would be public. The declared volume is
`/data` rather than `/data/public` for exactly that reason.

**Counted on the embed page, never on `/media`.** The page is `no-store`, so every open reaches the
origin. `/media` answers a year at the edge, so a counter there would measure cache misses rather
than viewers: a number that falls as the caching works better. The pre-warm and `HEAD` are skipped
by name, or every clip would start life with one view.

**The sidecars are no longer served**, and the rule sits *before* `express.static` rather than after
it, which is the difference between a rule and a comment. `scripts/publisher-views-check.mjs` caught
it returning 200.

**A Discord card is sent when the poster lands, not when the clip does.** The clip and its poster
arrive in separate requests, and Discord fetches an embed's image once and keeps what it got, so a
card sent at publish time is pictureless for ever. `StoreThumbnailAction` fires it; a clip whose
poster never comes is announced after a grace period without one. **Only a first publish is news**
(a sidecar that already existed means a re-upload), and **a takedown waits five minutes**, because a
trim of a published clip unpublishes and publishes again within seconds and would otherwise post
two messages per trim. **A restore is not news either**: at every boot the desktop re-uploads
any clip it holds as published that the server lacks, which on a fresh or moved container is the
whole library at once, so that upload carries `announce=0` and posts nothing. The webhook URL is a secret in the same class as `PUBLISH_TOKEN` and is never
logged; `scripts/discord-webhook-check.mjs` greps the log for it.

**Rate limits key on a header, never on `req.ip`.** The publisher runs behind a reverse proxy and
often Cloudflare, so `req.ip` is the proxy for every request, and a limit keyed on it is one bucket
for the whole internet. `middlewares/rateLimits.ts` reads `CF-Connecting-IP`, then the first
`X-Forwarded-For` hop. The embed page allows 300 a minute; the API counts **only failures**, 60 a
minute, because a batch publish over a LAN is several successful requests a second and a ceiling on
those would eventually refuse the owner. `/media` is not limited: a seeking video is a burst of
Range requests.

`cachePrewarm.ts` asks for a clip's own public URLs once after publishing, so the first viewer, who
is usually whoever just pressed Publish, does not pay for the miss. It waits for the purge in front
of it, it drains the body because an edge that has not finished receiving an object does not store
it, and it range-requests the video: a full GET would send the clip back down the same home uplink
it just came up, for a link that may never be opened.

### Client

#### Where a file goes, and how to tell

There used to be a `components/App/` holding forty two files, which is what a
folder becomes when its name does not say what belongs in it: the window's
title bar, a clip card, a batch toolbar, the OBS banner and a carousel slide
all lived there together. It is gone. **A folder is a claim about what is
inside it, so every folder here answers one question.**

Components, and the one question each folder answers:

| Folder | What belongs in it |
|---|---|
| `Base/` | Primitives with **no knowledge of this app**. No domain types, no stores, no services. Named `Base*` |
| `Shell/` | The frame that is there on every screen: title bar, sidebar, page header, command palette, update banner |
| `Library/` | Browsing many clips, and acting on the ones you picked: cards, grid, grouping, filters, batch |
| `ClipDetail/` | One clip, opened |
| `Trim/` | The trim and mark screen |
| `Editor/` | The multi-clip timeline |
| `Collection/`, `Game/`, `Obs/`, `Publish/`, `Settings/`, `Stats/` | That feature, and only it |

The test for `Base/` is mechanical: **if it imports a store, a service or a
type from `types/`, it is not a Base component.** A `BaseConfirmDialog` takes a
title and a description; a dialog that knows what a clip is does not.

**The folder gives the context, so the filename names the thing.** `Library/
ClipCard.vue`, not `AppClipCard`. The `App` prefix said nothing and its absence
said nothing either, which is why half the folder had it. `Base*` keeps its
prefix, because those are referenced from everywhere and the prefix is the
signal that it is safe to use anywhere.

Composables are grouped the same way, by subject rather than by shape:
`app/`, `ui/`, `clips/`, `library/`, `editor/`, `trim/`, `media/`, `obs/`,
`settings/`. `ui/` is the composable equivalent of `Base/`: `useConfirm`,
`useTheme`, `useFormat` know nothing about clips.

**Imports across folders use the `@renderer/*` alias, never `../../..`.** A
relative path encodes where the importer happens to sit, so moving either file
breaks it; the alias survives both. Same-folder `./Sibling.vue` is fine and
stays.

#### The rest

- `stores/` (Pinia): `clips`, `collections`, `games`, `tags`, `batchOperations`, `toast`.
  `clips` and `collections` use the abort-and-requestId pattern to drop stale responses; preserve it.
- `composables/` hold most component logic; `services/` are thin one-function-per-endpoint wrappers.
- **The trimmer and the clip panel are the same two columns.** The picture and
  everything that acts on it on the left, a 336px column beside it, `gap-6`,
  the same numbers in both, so opening the trimmer from a clip does not move
  the furniture. The trimmer's column is the clip panel's own
  `ClipGoodBitsSection`, not a second list styled to match: marking used to be
  a bar under the timeline carrying a heading, a range readout that repeated
  the one six pixels above it, a name field and a button, level with *Save
  Trimmed Clip* and in the same corner of the eye. A GoodBit is named on its
  own row now, the way it always was on the clip panel, and **the only filled
  accent button left on that screen is the one that replaces the recording**.
- **The trimmer can also throw the recording away**, beside the cut, because
  they are the same question asked the other way: the trimmer is where a clip
  is watched end to end deciding what part of it is worth keeping, and "none of
  it" is one of the answers that produces. It was the only one the screen could
  not act on, so reaching it cost backing out to the library, finding the tile
  again and opening its menu. Outlined in `danger` rather than filled: two
  filled buttons a hand's width apart are the same weight, and the layout rests
  on there being exactly one filled button on that screen. It reads
  `confirmBeforeDelete`, the same switch the library's own delete reads, and
  `utils/clipDeleteQuestion.ts` builds what the question says, which is the
  half worth getting right. The **file** goes to the Recycle Bin and can be
  fetched back; the **row** cannot, so the name, the tags, the notes and the
  marks are named in the sentence when the clip has them, and only when it has
  them. A warning about notes on a clip with no notes is what teaches somebody
  to press Confirm without reading.
- **A section header has a floor on its height** (`SECTION_HEADER` in
  `Base/geometry.ts`). Two sections side by side must line up whether or not
  either has a button in its header, and the notes header grows one the moment
  a note exists: without the floor, writing a note moved its own title up
  fourteen pixels.
- **A confirmation is a dialog, never a toast.** `Base/BaseConfirmDialog.vue`,
  asked through `composables/ui/useConfirm.ts`. This used to be
  `toastStore.confirm` with `duration: 10000`, which put the question in the
  corner on top of the button that had just been pressed, and then answered
  "no" on the user's behalf when the timer ran out. A question waits for its
  answer: Cancel takes focus so Enter is safe, the backdrop cancels and never
  confirms, and `danger` is the default tone because nearly everything worth
  asking about here deletes, replaces or overwrites. `confirm` no longer exists
  on the toast store, so the old shape cannot come back by habit.
  **Three things about it are load-bearing and invisible in a screenshot**, and
  all three come from the same fact: it teleports to `body`, so it is *outside*
  whatever it was asked over. A Reka dialog that is already open, a clip panel
  or the trimmer inside it, sets `pointer-events: none` there so nothing
  outside itself can be clicked: without `pointer-events-auto` the question
  painted perfectly and passed every click straight through, so pressing
  *Confirm* over the trimmer played the video and left the question standing.
  Escape is caught on `window` in the capture phase, because those panels close
  themselves from a listener on `document`: one press cancelled the question
  *and* shut the panel somebody was working in. And **the overlay stops
  `pointerdown`**, because a modal Reka dialog also dismisses itself on a
  pointer down outside its own content, and every press inside the question is
  one: *either* button shut the panel underneath, about two tenths of a second
  later, so cancelling, the answer that is supposed to change nothing, closed
  the clip you were working on. Late enough that a `toBeVisible` taken straight
  after the click passes and sees nothing wrong, which is why the e2e
  assertion waits before it looks. Bubble phase on the overlay rather than
  capture on `window` like Escape: capture runs before the target, so stopping
  it there would stop the buttons being pressed at all.
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

**No literal colour in a component.** `styles.css` defines the ladder for both palettes and Tailwind
maps it. Dark mode falls out of the tokens.

This is not a style preference. Adding `dark:` variants beside literals was tried and shipped
visibly broken: variants cannot reach colours inside bound `:class` expressions, and `bg-white/60` is
a different class from `bg-white`, so whole screens stayed light while the shell went dark. Tokens
have neither problem.

**What each rung is for**, because the ramp was doing several jobs at once until the audit went
through it by usage rather than by name:

| Rung | For |
|---|---|
| `muted-50`, `-100`, `-200` | surfaces. Raised panels, chips, hover grounds. **Never text** |
| `muted-300` | decorative only: rules, toggle tracks, disabled glyphs. **Never a label or a number** |
| `muted-400` .. `-900` | text, dimmest to strongest |
| `card`, `surface-sunk` | a panel above the page, and a well below it |
| `accent` / `accent-hover` / `accent-fg` / `accent-sunk` | the fill, its rollover, ink **on** it, its wash |
| `accent-ink` | accent-coloured **text**, which is a different problem from an accent fill |
| `danger`, `danger-fg`, `danger-ink` | the same three, for the same reason |
| `success`, `warning` (+ `-fg`) | it worked; it worked with a caveat |
| `border`, `line-strong` | the two hairlines |
| `on-video`, `video-bed`, `scrim*` | fixed in both palettes, because a frame is its own ground |

Every rung from `muted-400` up clears **4.5:1 against all five grounds it can land on**, not just
against the page, because a label moves onto a panel all the time. `accent` at button size is 4.28:1
on a card, which is why accent *text* is `accent-ink` instead: a fill and a letterform are not the
same problem.

**The accent has one meaning: the good bit, plus the single primary action per region.** It is not a
hover colour, not a decoration, and not the colour of every icon. It was on 46 icons at once, which
is how a screen ends up with no obviously primary anything.

White stays literal **only** where it sits on the accent or over video, and those have tokens
(`accent-fg`, `on-video`) so the allowance is visible in a grep. Three literals survive on purpose
and each says why beside itself: the QR code's ink and ground, which a camera reads rather than a
person, and the Windows caption glyph colour, which crosses IPC into a title bar overlay that has
never heard of a CSS variable.

### Geometry, and why nothing is centred by eye

`Base/geometry.ts` holds one height per control class, one icon box, one gap, one focus ring.
`COMBO_BOX_HEIGHT` was already doing this for dropdowns; the rest followed for the same reason.

Almost every alignment defect in the 3.x review was the same defect: two things that should have
lined up were each given their own padding by hand, and drifted. The rules that come out of it:

- **An icon and a label are an `inline-flex` centred on one axis**, never baseline aligned, with the
  glyph in a fixed square box and `block` on the svg. An inline svg sits on the text baseline and
  picks up the line box's descender gap.
- **A list row is a grid, not a flex row of guesses.** Every row in a list uses the same template, so
  glyphs, labels and counts each form a column whatever an individual row contains. `Shell/
  SidebarRow.vue` is the worked example: the navigation links, the utility links, `All` and every
  game are all it.
- **Sibling actions share a height, a padding and a line-height.** If any trigger in a group has a
  leading icon, every trigger in that group reserves the icon column.
- **A vertical divider is a 1px element with an explicit height**, vertically centred, never a border
  on a padded box, whose height is whatever the padding happens to make it.
- **Numbers that can change are mono, tabular and right-aligned**, and anything holding one has a
  `min-width` for its largest value. `font-variant-numeric` binds to the mono face in `styles.css`
  rather than to each call site.
- **Nothing changes size on hover, focus, active or select.** Colour moves; geometry does not. A
  hover-revealed affordance either overlays its container absolutely or has its space reserved at
  rest with only its opacity changing. Selection is an `outline`, which is painted outside the box.
  `screens.spec.ts` measures every control on every route, hovers it, focuses it and measures again.
- **Depth is a tone step and a hairline.** One shadow, `shadow-pop`, on the three things that
  genuinely float: modals, menus, toasts.
- **Motion is 120 to 180ms**, opacity and transform, nothing bouncing. `prefers-reduced-motion` is
  honoured once in `styles.css`, not per component.

### Variants, and where a look is written down

**Anything that comes in kinds is a `cva` recipe in `Base/variants.ts`; anything with one look is a
constant in `Base/geometry.ts`.** That is the whole rule, and it is decided once so it is not
decided per file. Buttons, menu rows, panels, chips, empty states, status dots, wizard steps, the
switch and the editor's toolbar toggles are recipes; heights, the icon box, the focus ring, the menu
frame and the section header are constants.

- **One button.** `BaseButton` on `buttonVariants`: `tone` (`default | strong | quiet | danger |
  success`), `size` (`md | sm | dense`), `icon-only`, `reserve-icon`. The `BUTTON*` strings that
  used to sit in `geometry.ts` beside a `BaseButton` with a hand-written `switch` are gone; the two
  disagreed about danger. An icon-only button is `BaseButton icon-only`, not a second component.
- **`strong` is the only filled accent**, one per region. **`danger` is outlined, never filled**:
  a filled red button beside the filled accent is two primaries, and what keeps a destructive press
  honest is `useConfirm` and the sentence beside it, not the colour.
- **A caller's `class` goes through `cn`** (`clsx` plus `tailwind-merge`), because `BaseButton`
  turns `inheritAttrs` off for exactly that: `class="px-2"` on a recipe that says `px-3.5` means
  `px-2`, not both with the stylesheet deciding.
- **A recipe is exported as well as its component**, so something that must look like a button
  and is not a `<button>` (a Reka trigger) calls the recipe. Menu rows are `menuItemVariants` on
  Reka's own `MenubarItem` or `DropdownMenuItem`, since Reka owns their keyboard and focus, and
  `:disabled` on the item replaces the `opacity-50 pointer-events-none` each row used to carry.
- **A ternary in `:class` is a variant only when it names a state of the thing it styles**
  (selected, pressed, on, reached, a tone). Layout switches (`compact`, `flush`, `block`),
  animation states (`open ? 'rotate-180'`, a collapsing `grid-rows`) and one-off emphasis stay
  where they are, because a variant nobody else will ever ask for is a second place to look.
- **An empty state is `BaseEmptyState`**, `size="page"` for a whole screen and `size="panel"` for
  one section of a busier one, with an `actions` slot. Six were hand-rolled in 3.5.0 and one first
  shipped with no button at all.

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

`screens.spec.ts` walks every screen in both palettes and measures each text node against its own
*painted* background, translucent layers composited, since a tint like `bg-accent/10` computes to
`rgb(193 99 62 / 0.1)` and reading it as opaque terracotta flags every label on it. The floor is
**4.5:1 for body and small text and 3:1 for large**, by WCAG's own definition of large. Exceptions
are named in a list in `contrast.ts` with a reason each, never a lower global floor.

**A checker must assert its own instrument.** That file's regex lost its two backslashes on the day
it was written, so `/rgba?\(([^)]+)\)/` shipped as `/rgba?(([^)]+))/`, which still matches and
returns a group starting with `(`. `parseFloat` gave `NaN`, every ratio was `NaN`, `NaN < threshold`
is `false`, and the gate reported zero problems across 400 runs of text in two palettes for four
days and two releases. So it now throws if a single channel comes back non-finite, and asserts a
floor on how much it inspected: an empty problem list and a broken walk look identical.

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
- Feedback through the toast store; destructive actions ask through `useConfirm`, never the toast.
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
- **Two dependencies are deliberately not on their latest major**, and both are blocked by a peer
  rather than by choice. `typescript` stays on 6.0.3 because 7.0 is the Go port and ships no
  programmatic API, which `vue-tsc` loads to do its work, so `vue-tsc --noEmit` exits with
  `ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './lib/tsc' is not defined`; TypeScript's own
  release says Vue projects should stay on 6.0 until the API returns in 7.1. `vite` stays on 7.3.6
  because `electron-vite@5`, the newest there is, peers `^5 || ^6 || ^7`. Both are worth retrying
  when those two ship, and neither should be forced.
- The app is no longer Windows-only in principle (`shell.trashItem`, `shell.showItemInFolder`), but
  nothing has been built or tested anywhere else.

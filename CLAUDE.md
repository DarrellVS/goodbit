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
| `publisher/` | Optional, unchanged: Express + multer in Docker, serves `/media/*` and an embed page |
| `tests/e2e` | Playwright against the built app |

## Commands

```bash
npm run dev            # electron-vite, hot reload
npm run typecheck      # tsconfig.node.json (main+preload) and tsconfig.web.json (renderer)
npm run build          # typecheck, then all three bundles into out/
npm run test:e2e       # builds, then Playwright drives the real app
npm run build:win      # check:pre-release (typecheck + e2e) then electron-builder
node scripts/backup-db.mjs   # verified snapshot of the library database
node scripts/obs-backup.mjs  # verified snapshot of a real OBS configuration
node scripts/obs-check.mjs   # what GoodBit makes of this machine's OBS
node scripts/obs-apply-check.mjs  # apply the setup against a throw-away OBS directory
node scripts/trim-check.mjs  # run the shipped trim on a real clip and check where it landed
node scripts/ux-seed.mjs     # a throw-away library to drive the app against
node scripts/ux-session.mjs  # replay a list of actions and screenshot every step
```

Keep `npm run typecheck` green, `build` runs it first and fails otherwise.

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
  `GoodBit`. The only keys touched outside them are `[Python] Path64bit` and `[General] FirstRun`.
- **A preview before every write**, in OBS's own vocabulary, and a manifest of what was written so
  `undoObsSetup` can put it back.
- **The launch flags choose the profile** (`--profile GoodBit --collection GoodBit
  --startreplaybuffer`), never `[Basic] Profile`. Switching somebody's active profile is not ours to
  do.

**Things that cost a debugging session each, and are load-bearing:**

- **OBS cannot name a file after a game.** `os_generate_formatted_filename` takes the clock and the
  video settings, and nothing else; an unknown token silently loses its `%`. A folder per game needs
  code inside OBS, which is why Smart Replays is downloaded at all.
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
- **Python is GoodBit's own.** OBS loads 3.10 to 3.12 and refuses 3.13 with one line in its log. The
  installer ignores `TargetDir` when the same minor is already installed, and upgrades *that* one
  instead, so `pickPrivateVersion` chooses a minor the machine does not have. The embeddable and
  NuGet builds have no Tkinter, which Smart Replays imports at module level.
- **An empty `Untitled` collection is not "scenes you have built".** Deciding from "has a profile"
  meant a fresh OBS got no scene and opened on a blank one.
- **Installed means the executable exists**, not the config folder: OBS writes that on its first
  run, so a machine that has just installed it has one and not the other.

`scripts/obs-check.mjs` prints the diagnostic against the real OBS on this machine;
`scripts/obs-apply-check.mjs` applies the whole thing against a throw-away `GOODBIT_OBS_DIR` and
reads back what landed; `scripts/obs-backup.mjs` takes a verified copy of a real OBS configuration
before any of this is trusted with it.

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

- **`synchronize: true` with no migrations.** Fine while the only library is one that can be rebuilt
  from disk; **a 1.0 blocker** once strangers have tags and notes they cannot re-derive, because
  TypeORM's SQLite auto-sync resolves some schema changes by rebuilding a table.
- No linter. Typecheck and the e2e suite are the only automated gates.
- `publisher/` still reads its config from a `.env`; it was deliberately left alone. Setting it up
  is documented at `site/publisher.html`, which is a wizard rather than a page, a quick start
  and a seven-step route that writes the reader's own domain and paths into every command.
- The app is no longer Windows-only in principle (`shell.trashItem`, `shell.showItemInFolder`), but
  nothing has been built or tested anywhere else.

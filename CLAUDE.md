# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**GoodBit** is a single-user desktop app for game clips. It watches the folder OBS records into
(`<videosRoot>/<GameName>/*.mp4|*.mov|*.mkv` — the top-level folder name *is* the game name), indexes
what appears, and provides a UI to browse, tag, annotate, trim, edit and optionally publish.

Files on disk are the source of truth for *content*; the database is the source of truth for
*metadata*. **Clips are never renamed** — `displayName` is a DB field only. Deletes go to the Recycle
Bin via `shell.trashItem`, never `unlink`.

It was a self-hosted web app (four packages, Express on :4000, Firebase auth, LAN streaming) until the
Electron migration. `ELECTRON_MIGRATION.md` records what changed and why; the short version is that
Firebase, the LAN streaming probe and the service worker were all deleted rather than ported, because
each existed only to cross a network.

## Layout

One electron-vite project, three builds.

| Path | Role |
|---|---|
| `src/main` | Electron main — **the background service**. Owns the database, the folder watcher, ffmpeg, the tray. Runs whether or not a window is open |
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
```

Keep `npm run typecheck` green — `build` runs it first and fails otherwise.

## Where things live at runtime

`%APPDATA%/GoodBit/`: `goodbit.db`, `settings.json`, `backups/`. Derived caches
(`.filmpje-cache/{thumbnails,frames,analysis}`) stay next to the clips, since they are regenerable
and belong with the media.

`settings.json` holds what main needs before a window exists: `videosRoot`, `audioRoot`,
`publisherBaseUrl`, `startAtLogin`, `keepRunningInTray`. **There are no required environment
variables** — a missing videos root opens the first-run picker rather than throwing at boot.
`GOODBIT_USER_DATA` overrides the whole data directory *and the single-instance lock*, which is how
tests run beside the installed app without touching a real library.

## Architecture

### Main is the service, not a host for the window

Registered at login, lives in the tray, hides on window close. `startup.ts` runs the boot sequence
(each step isolated so one failure does not stop the rest) and then a chokidar watcher with
`awaitWriteFinish` — **not optional**, because OBS writes for the length of the recording and
indexing mid-write reads a garbage duration and a black first frame. A reconciliation sweep is the
backstop, since filesystem events are a hint rather than a guarantee.

### No network surface

- **Data** goes over one IPC channel (`api:request`) to a loopback listener in the same process,
  behind a secret regenerated each launch. Loopback alone is not enough: any other program on the
  machine can reach 127.0.0.1, and this API deletes clips.
- **Media** is served by the `goodbit://` protocol straight off disk, with Range support — without
  which `<video>` cannot seek.
- The Express **router is kept** rather than rewritten into forty IPC channels. Faking a
  `ServerResponse` to dispatch it in-process does not work: `app.handle` reassigns the response
  prototype to Express's own, so hand-written methods are bypassed and Node's real `getHeader` runs
  against an object with no socket.
- The renderer's axios only had its **adapter** swapped, so every `services/*.ts` call site is
  unchanged.

### Server-side actions

Every non-trivial operation is a class in `src/main/actions/` extending `BaseAction<TInput, TOutput>`
with a single `execute(input)`. **Add new business logic as an Action**, not inline in a route.

`ScanAndSyncClipsAction` has a **prune guard**: it refuses to delete rows when the videos folder looks
empty or when one scan would remove more than half the library. A clip row carries the only copy of
its tags, notes, display name, collections and stars, and an unmounted drive makes every file look
missing at once.

### Encoding

`services/encoders.ts` probes `h264_nvenc` / `qsv` / `amf` and `cuda` / `d3d11va` / `qsv` once per
process, by actually encoding a tiny clip — a build can list an encoder the GPU will refuse.

H.264 rather than HEVC: exports go to Discord and browsers. **GPU decode matters more than the
encoder here** — these are 3440x1440 AV1 files and software decoding them runs at 0.44x realtime.

**HDR sources must be tone mapped.** OBS writes PQ/bt2020; reading that as sRGB is what made every
export grey and washed out. `TONEMAP_FILTER` (hable) is applied wherever a frame is decoded — export,
exact trims, thumbnails, frame strips.

### Client

- `stores/` (Pinia): `clips`, `collections`, `games`, `tags`, `batchOperations`, `toast`.
  `clips` and `collections` use the abort-and-requestId pattern to drop stale responses; preserve it.
- `composables/` hold most component logic; `services/` are thin one-function-per-endpoint wrappers.
- `utils/mediaUrl.ts` is the single place media URLs are built.
- View preferences live in localStorage via `useConfiguration()`. App settings come from main via
  `useAppSettings()` — different things, do not merge them.

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
*painted* background — translucent layers composited, since a tint like `bg-orange-500/10` computes to
`rgb(249 115 22 / 0.1)` and reading it as opaque orange flags every label on it.

These do not run in CI (they need a desktop session, a GPU and ffmpeg). `build:win` depends on them.

## Conventions

- TypeScript strict, ESM everywhere. Main imports need the `.js` extension on relative paths.
- Vue: `<script setup lang="ts">`, typed `defineProps`/`defineEmits`, `ref` over `reactive`.
- Tailwind utilities over custom CSS; tokens over literals.
- Feedback through the toast store; destructive actions use `toastStore.confirm`.
- Long work runs as a job (`services/jobs.ts`) with progress, an ETA and an `AbortController` —
  never awaited inside a handler.

## Known gaps

- **`synchronize: true` with no migrations.** Fine while the only library is one that can be rebuilt
  from disk; **a 1.0 blocker** once strangers have tags and notes they cannot re-derive, because
  TypeORM's SQLite auto-sync resolves some schema changes by rebuilding a table.
- No linter. Typecheck and the e2e suite are the only automated gates.
- `publisher/` still reads its config from a `.env`; it was deliberately left alone.
- The app is no longer Windows-only in principle (`shell.trashItem`, `shell.showItemInFolder`), but
  nothing has been built or tested anywhere else.

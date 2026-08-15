# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Filmpje is a single-user game-clip manager. It indexes video files that OBS drops into
`C:\Users\darre\Videos\<GameName>\*.mp4|*.mov` (top-level folder name = game name), stores metadata in
SQLite, and provides a web UI to browse, tag, annotate, trim, edit, and publish clips to a public URL
with Discord-friendly embeds.

Files on disk are the source of truth for *content*; the database is the source of truth for *metadata*.
**Clip files are never renamed** — `displayName` is a DB field only. Deletes go to the Windows Recycle
Bin (`trash` package), never permanent unlink.

## Repository layout

Four packages, no monorepo tooling — each has its own `package.json` and `npm i`, and `shared/` is
consumed via **relative paths** (`../../shared/index.js`), not as an installed dependency.

| Path | Stack | Port | Role |
|---|---|---|---|
| `server/` | Express, TypeORM, SQLite, fluent-ffmpeg, firebase-admin | 4000 | API + filesystem + video processing, and serves the built client. Windows-only (Recycle Bin, `explorer.exe`, `start`) |
| `client/` | Vue 3, Vite, Pinia, vue-router, Tailwind, radix-vue, PWA | 5173 dev | The UI |
| `publisher/` | Express, multer | 5555 (Docker) / 5000 (dev default) | Public CDN origin: serves `/media/*` and an OG-tagged embed page per clip |
| `shared/` | plain TS | — | DTO classes shared by all three |

### Runtime topology

Two machines on the LAN:

- **Windows PC** — runs `server/` and the client. `client/vite.config.ts` proxies `/api` to
  `http://192.168.178.28:4000`.
- **NAS / ARM box** — runs `publisher/` in Docker. `server/.env` sets
  `PUBLISHER_BASE_URL=http://192.168.178.26:5555`. Cloudflare sits in front; the publisher purges its
  cache on publish/unpublish.

These hardcoded IPs are real, not placeholders. Don't "fix" them to localhost.

**Local network streaming.** The client probes the server's LAN address on shell mount and, when it
answers, builds all media URLs against it — so video and thumbnails come straight off the LAN even
though the page was served over HTTPS from the internet. Browsers permit requests to private-network
addresses (measured, including `<img>`/`<video>`; the mixed-content console warning is not a block).
If the probe fails, media falls back to the page's own origin. The server also serves `client/dist`,
so `http://192.168.178.28:4000` works as a standalone app. See `LOCAL_STREAMING.md`.

`client/src/utils/mediaUrl.ts` is the single place media URLs are built — always go through it, or
the LAN routing is silently bypassed.

`client/docker-compose.bat` builds `darrellvs/filmpje:arm64` (static `dist` served by `http-server`)
for the same ARM box.

## Commands

```bash
# server  (terminal A)
cd server && npm i && npm run dev      # tsx watch, listens on :4000

# client  (terminal B)
cd client && npm i && npm run dev      # vite, :5173

# publisher (usually only on the NAS)
cd publisher && npm run dev
```

`server/npm run build` → `tsc`. `client/npm run build` → `vue-tsc` over the app plus `tsc` over
`src/sw.ts` (separate program: the worker's WebWorker lib collides with the app's DOM lib), then
`vite build`. `client/npm run typecheck` runs just the checks. Keep both green — the build fails
otherwise. No test, lint, or CI setup exists.

`server/start-local-client.vbs` launches the built server silently at Windows login.

## Environment

Server (`server/.env`, gitignored):
- `VIDEOS_ROOT` — default `C:\Users\darre\Videos`. Must exist or startup throws.
- `AUDIO_ROOT` — default `C:\Users\darre\Music`.
- `DB_PATH` — default `<VIDEOS_ROOT>/filmpje.db`.
- `PORT` — default 4000.
- `PUBLISHER_BASE_URL`.
- `CLIENT_DIST` — override the auto-detected `client/dist` location.

Publisher (`publisher/.env`, gitignored): `PORT`, `PUBLIC_BASE_URL`, `UPLOAD_DIR`,
`CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`.

## Data model

`server/src/entity/`, `synchronize: true` — **no migrations**. Schema changes apply on next boot;
be careful with anything TypeORM auto-sync would resolve destructively on SQLite.

- **Clip** — `filePath` (absolute, unique), `relPath`, `game`, `filename`, `displayName?`, `extension`,
  `sizeBytes`, `fileModifiedAt`, `published`/`publishedUrl`, `starred`, `notes` (markdown). M:N `Tag`.
- **Tag** — `id`, unique `name`. Relation owned by `Clip` (inverse side omitted to dodge circular imports).
- **Collection** — `id`, `name`, timestamps. M:N `Clip`.
- **Game** — PK `name` = the on-disk folder name (immutable, keeps OBS working), nullable `displayName`.
  Renaming a game only sets `displayName` and re-pushes metadata for that game's published clips so
  Discord embeds update.

On-disk siblings of the game folders: `.thumbnails/`, `.frame-strips/`, `filmpje.db`.

## Architecture patterns

### Server: routes are thin, Actions hold the logic

Every non-trivial operation is a class in `server/src/actions/` extending `BaseAction<TInput, TOutput>`
with a single `execute(input)`. Routes parse/validate, call an action, map to a DTO, respond. Wrap every
handler in `asyncHandler` so `middlewares/errorHandler.ts` catches throws. **Add new business logic as
an Action**, not inline in a route.

Startup (`server/src/index.ts`) runs a fixed sequence before listening: cleanup empty folders → scan &
sync clips → SyncGames → SyncClipCreationDates → SyncPublishedClipsMetadata → SyncPublisher. Each is
wrapped in try/catch so one failure doesn't block boot.

### Shared DTOs

`shared/dtos/**` exports DTO classes extending `BaseDTO` with static `fromEntity()` / `fromQueryResult()`
and instance `validate()`. Server converts entities → DTOs at the route boundary. Changing a DTO changes
both sides at once — that's the point.

The client must **not** use the DTO classes directly as data types: what arrives over the wire is JSON,
with no prototype and none of `validate`/`toJSON`/`clone`. `client/src/types/plain.ts` defines
`PlainData<T>`, which strips the methods, and `types/{clip,collection,tag,game}.ts` export the client
types through it. Use those (`Clip`, `Tag`, `Game`, `Collection`), not the raw DTO classes.

### Client

- `stores/` (Pinia): `auth`, `clips`, `collections`, `games`, `tags`, `batchOperations`, `toast`.
  `clips` and `collections` both use the abort-and-requestId pattern to drop stale responses; preserve it.
- `composables/` (~40): reusable logic and side effects. Most component logic lives here, not in `.vue`.
- `services/`: thin axios wrappers, one function per endpoint. Components call composables, composables
  call services.
- `components/Base/` = generic primitives, `components/App/` = app-specific, plus `ClipDetail/`,
  `Editor/`, `Trim/`, `Settings/`, `Stats/` feature folders.
- `axios.ts` attaches the Firebase ID token as a `Bearer` header globally. For `<video>`/`<img>` src
  attributes, which can't send headers, `utils/withAuthToken.ts` appends `?token=` instead — the server
  accepts either.
- Settings live in localStorage under `filmpje-public-config` via `useConfiguration()`, not in a store.
  Defaults: `viewMode: 'grouped'`, `pageSize: 15`.

### Routes

`/login`, then everything under a `ShellLayout` parent: `/` (library), `/today`, `/tag-patterns`,
`/stats`, `/settings`, `/collections/:id`, `/clips/:id`. Outside the shell: `/trim/:id`, `/editor`.
Route `meta.title`/`meta.subtitle` drive the header. All eagerly imported — no lazy routes.

### Auth

Firebase Auth (project `clips-b0bbe`). `server/src/auth.ts` guards everything under `/api` except a few
public endpoints declared before the middleware in `index.ts`: `/api/health`, `/api/clips/today/count`,
`/api/clips/latest`, `/api/rescan`. The last two additionally gate on client IP `::1`.

## Conventions

- TypeScript strict, ESM everywhere (`"type": "module"`) — **server imports need the `.js` extension**
  on relative paths.
- Vue: `<script setup lang="ts">`, typed `defineProps`/`defineEmits` interfaces, `ref` over `reactive`.
- Tailwind utilities over custom CSS; scoped styles when needed.
- User feedback goes through the toast store; destructive actions use `toastStore.confirm` and respect
  the `confirmBeforeDelete` setting.
- Errors bubble from services up to the component/composable, which shows a toast.

## Known gaps

Real, and worth knowing before you trust a green build:

- No tests, no linter, no CI. (The client is typechecked as of the local-streaming work; it previously
  was not, which had let four type errors accumulate. They are fixed.)
- `.cursor/rules/*.mdc` predates the Game-rename work and has drifted: it describes tag patterns as
  server-side SQLite with `/api/tag-patterns` routes, but they actually live in **browser IndexedDB**
  (`client/src/services/tagPatternsDb.ts`) with no server involvement at all. It also omits the `Game`
  entity, `AUDIO_ROOT`, and the public endpoints. Every rule file also contains its own content twice.
  Prefer this file when the two disagree.
- `getClientIp()` trusts `X-Forwarded-For` unconditionally, so the `::1` gate on `/api/clips/latest`
  and `/api/rescan` is spoofable by anything that can reach port 4000.
- `server/src/auth.ts` hardcodes a static `API_TOKEN` string that bypasses Firebase entirely, and
  `server/secrets/firebase.json` (a Firebase Admin service account key) is committed. Both are known
  and accepted — the GitHub repo is private. Don't re-flag them; do keep the values out of anything
  that leaves the machine.

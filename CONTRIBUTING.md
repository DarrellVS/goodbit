# Contributing to GoodBit

GoodBit is a single-user Windows desktop app: Electron plus Vue 3, built with
electron-vite and electron-builder, shipped as an unsigned NSIS installer and
a portable exe through GitHub Releases. `CLAUDE.md` at the repository root is
the fuller account of what the app is and why several of its parts are built
the way they are; read that first if something here seems terse. This file is
the short version, aimed at getting a pull request through the gates.

It is maintained by one person. That shapes some of what follows: there is no
CI, no linter, and no second reviewer, so the checks below are the whole
automated safety net, and a careful read is the rest of it.

## Setting up

Node 22 and npm.

```bash
npm install
npm run dev            # electron-vite, hot reload
```

## The gates

```bash
npm run typecheck      # tsconfig.node.json (main + preload), tsconfig.web.json (renderer)
npm run test:e2e       # builds, then Playwright drives the built app
```

`npm run typecheck` is fast and has no dependencies beyond the source tree.
Run it before every commit; `npm run build` runs it first and fails if it
does not pass, so a red typecheck never quietly becomes a build.

`npm run test:e2e` builds the app and then drives the real, built Electron
app with Playwright: it needs a desktop session, a GPU and ffmpeg, which is
why it **does not run in CI** and cannot: there is no CI at all for this
repository. `npm run build:win` depends on it, so an installer cannot be
produced from a tree whose end-to-end suite fails. In practice this means a
pull request is checked locally, not by a bot: run `npm run test:e2e`
yourself before asking for it to be looked at, and say in the pull request
that you did.

Each e2e test gets a throw-away data directory, videos root and database.
`GOODBIT_USER_DATA` is what makes that possible: it redirects the whole data
directory, including the single-instance lock, so a test run can sit beside
an installed copy of GoodBit without touching it. **A test must never touch
the real library.** If you add a test, make sure it goes through this
mechanism rather than pointing at `%APPDATA%/GoodBit` directly.

## There is no linter

Typecheck and the e2e suite are the only automated gates. That means a class
of mistakes a linter would normally catch (dead code, inconsistent naming,
an unawaited promise that happens to still typecheck) is caught by review or
not at all. Lean on the conventions below and on `CLAUDE.md` rather than on
tooling to enforce them, because nothing else will.

## Where logic goes

Business logic is a class in `src/main/actions/` extending
`BaseAction<TInput, TOutput>` with a single `execute(input)` method. Add new
non-trivial logic as an Action, not inline in a route handler. This keeps the
Express router (kept deliberately, see `CLAUDE.md`'s "No network surface")
thin, and keeps every operation testable and reusable from both the internal
API and, where it applies, the MCP tools.

Long-running work runs as a job (`services/jobs.ts`) with progress, an ETA
and an `AbortController`, and is never awaited directly inside a route
handler.

## Where tests go

At the moment this repository has no unit test harness, only
`tests/e2e` (Playwright against the built app) and the `scripts/*-check.mjs`
benches (`obs-check.mjs`, `trim-check.mjs`, `hud-check.mjs`, `steam-check.mjs`
and others), which run the shipped code against something real (a real OBS
install, a real recording, a real Steam cache) and print what happened for a
human to read rather than asserting pass or fail. If you add logic that
touches ffmpeg, the database, another program's configuration, or a window,
it belongs in one of those two places: a Playwright spec if it needs to be
asserted automatically, a bench script if the useful output is a human
reading a contact sheet or a diagnostic. Do not reach for a mocking
framework to fake any of those out; the project's position, argued at length
in `CLAUDE.md`, is that the obvious mocked alternative was tried for several
of these and was measurably worse.

## Conventions the compiler will not catch

- **Never use an em dash.** Not in code, comments, commit messages, UI
  strings or docs. Use a comma, a colon, a semicolon, brackets or a full
  stop. An en dash in a numeric range (`0:20 – 0:26`) is correct typography
  and stays.
- **No literal colour in a component.** `src/renderer/styles.css` defines a
  token ladder (`--background`, `--foreground`, `--muted-50..900`, `--card`,
  `--border`, `--line-strong`) for both palettes, and Tailwind maps them.
  Dark mode falls out of the tokens; a hardcoded `bg-white` or a `dark:`
  variant next to a literal does not, and has shipped visibly broken before.
  White stays literal only on a brand or fixed-dark surface (an orange
  button, a chip over video), since that ground does not follow the theme.
- TypeScript strict, ESM everywhere. Main's relative imports need the `.js`
  extension, even though the source file is `.ts`; that is how Node resolves
  an ESM build's output.
- Vue: `<script setup lang="ts">`, typed `defineProps` / `defineEmits`, `ref`
  over `reactive`.
- Feedback goes through the toast store; destructive actions confirm through
  `toastStore.confirm` rather than a native `confirm()`.

## Windows only, in practice

The codebase does not depend on the Windows API directly, but several
services do, indirectly, in ways that make a cross-platform port a real
project rather than a quick patch:

- `services/obs/` was reverse-engineered against a real OBS install on
  Windows: what `basic.ini` looks like, what the hotkey format actually is
  on OBS 31 versus what its own documentation claims, how a scene collection
  is laid out. None of that was checked against OBS on Linux or macOS.
- `displayQuery.ts` and the foreground-window sampler in `services/capture/`
  work by compiling small C# shims on demand and running them through
  PowerShell, to call `QueryDisplayConfig` and to read the foreground
  process. That is a Windows-only mechanism end to end.
- `services/encoders.ts` probes `h264_nvenc` / `qsv` / `amf` and
  `cuda` / `d3d11va` / `qsv` by actually encoding a tiny clip, assuming the
  Windows GPU driver stack.

If you want to take this on, say so in an issue first. A cross-platform pull
request would need an equivalent for each of those three, verified against
the real thing the way the Windows versions were, not a guess at what the
Linux or macOS equivalent should look like.

## Commit messages

Plain and specific, explaining why rather than restating the diff, in the
style the existing log already uses (`git log --oneline` is the reference).
No em dash there either.

## Questions

Open an issue. There are no Discussions on this repository.

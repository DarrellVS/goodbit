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
npm run test:unit      # vitest over the pure logic. Under a second
npm run check          # both of the above. The one to run before every commit
npm run test:e2e       # builds, then Playwright drives the built app. Minutes
```

`npm run check` is the loop. It is typecheck plus the unit suite, around forty
seconds, and there is no reason not to run it on every change.

If you only touched one side, the halves run separately:
`npm run typecheck:node` for `src/main`, `src/preload` and `src/shared`,
`npm run typecheck:web` for `src/renderer`. `vue-tsc` is the slow one.

`npm run test:unit` is vitest over **anything that takes values and returns
values**: a measurement turned into a verdict, an anchor and a frame height
turned into a pixel box, a run of foreground samples turned into the name a
clip gets filed under. Under a second, so it belongs in the loop rather than at
the end of it. Every threshold it covers was arrived at by measuring real
recordings and none of it is re-derivable from reading the code, which is
exactly why a `<` quietly becoming a `<=` needs to fail something.

**Check the exit status, never the log text.** vite colours its own failures,
so `error during build:` arrives wrapped in escape codes and does not match a
grep for `^error`. A build that failed has read here as a build that passed,
while the app went on running the previous bundle and the fix appeared not to
work.

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

Typecheck, the unit suite and the e2e suite are the automated gates. That means a class
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

Three places, and the choice is made by what the test *needs*, not by what it
covers.

**`tests/unit`**, vitest, for anything that takes values and returns values.
This is the default: if a function can be exercised without opening a file, it
belongs here, and it will run in milliseconds for ever afterwards. A defect
that is known and not yet fixed is recorded as `it.fails` with a comment naming
what fixes it, so that fixing it makes the test fail, which is the
announcement.

**`tests/e2e`**, Playwright against the built app, for anything that needs the
real thing: the database, the internal API, a window, the `goodbit://`
protocol, two processes racing each other. Each test gets a throw-away data
directory through `GOODBIT_USER_DATA`.

**`scripts/*-check.mjs`**, the benches, for anything whose honest answer is a
number or a picture rather than a pass. `obs-check.mjs`, `trim-check.mjs`,
`hud-check.mjs`, `migration-check.mjs`, `steam-check.mjs` and others run the
shipped code against something real, a real OBS install, a real recording, a
real library, and print what happened for a person to read. Several of them
bundle `src/main` with esbuild on the way, so the bench and the app cannot
drift into two implementations.

Do not reach for a mocking framework to fake ffmpeg, the database or another
program's configuration out. The project's position, argued at length in
`CLAUDE.md`, is that the obvious mocked alternative was tried for several of
these and was measurably worse. The one stub that does exist, for `electron` in
the unit suite, is documented as a symptom rather than a fixture.

Write the test with the change. A patch that says "it compiles" about something
behavioural is not finished, and if you could not cover part of it, say which
part in the pull request.

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

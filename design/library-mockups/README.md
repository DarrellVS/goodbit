# Library redesign: research, evidence, six directions

Everything here is local and uncommitted. Nothing has been released.

## Open it

```
cd design/library-mockups
python -m http.server 8877
```

Then open `http://127.0.0.1:8877/`. It has to be served rather than opened from disk, only
because the page is large and Chrome throttles a 1 MB `file://` document.

Six tabs across the top, plus a seventh called **The system**. Dark and light both work. The
readout on the right counts how many clips are on screen right now, next to what today's build
manages, so the comparison is live rather than asserted.

If you would rather just flip through them, `shots/` holds a still of each at 1920 x 1080.

The clips are real: 41 synthetic recordings across six games, with real thumbnails and three real
frames each, generated into a sandbox. **The real library at `C:/Users/darre/Videos` was never
opened by any of this.**

## What was measured first

Three scripts, all sandbox only, all run through `GOODBIT_USER_DATA`:

| Script | What it answers |
|---|---|
| `scripts/ux-seed.mjs` | Builds a throw-away library of 41 clips across six games |
| `scripts/ux-audit.mjs` | Counts type sizes, weights, radii, shadows and colours per screen |
| `scripts/ux-density.mjs` | Counts how many clips fit on screen at three window sizes |
| `scripts/ux-session.mjs` | Replays a list of actions and screenshots every step |

### The number that matters

| Window | Clips visible | Card size | Screen height before the first clip |
|---|---|---|---|
| 1366 x 768 | 5 | 250 x 227 | 35% |
| 1920 x 1080 | 8 | 389 x 287 | 25% |
| 3440 x 1440 | 8 | 769 x 450 | 18% |

An ultrawide shows the same eight clips as a 1080p monitor. The extra 1520 pixels go into making
each card bigger, not into showing more. A 769 x 450 tile for one clip is roughly a quarter of a
1080p screen.

### The rest of the audit

| | Library | Settings | Target |
|---|---|---|---|
| Type sizes | 5 | 6 | 4 |
| Font weights | 4 | 4 | 2 |
| Text colours | 6 | 8 | 3 |
| Corner radii | 4, including one 14px | 3 | 1 |
| Native video players in the DOM | 15 | 0 | 0 |

Every clip tile renders a real `<video controls>`, so each one carries the browser's own play,
mute, fullscreen and overflow buttons. The app's controls compete with the video's on every tile,
and fifteen video elements are live at once.

## Two bugs found on the way, and fixed

Neither is a design question. Both are fixed in the working tree, both verified.

**The library showed when GoodBit first indexed a clip, not when it was recorded.**
`AppClipCard.vue`, `ClipsGrouped.vue` and `useClipGrouping.ts` all read `createdAt`, the row's own
creation time. The recording date was sitting in `fileModifiedAt` the whole time. Anyone pointing
GoodBit at a library that existed before they installed it saw every clip dated the afternoon of
the install, in one enormous "Today" group. Proven against the database: `fileModifiedAt` said
2026-06-01, the tile said 2026-09-14.

**The library was ordered by row insert time.** `routes/clips.ts` sorted on `clip.createdAt`, and
every clip found in one scan shares that timestamp, so an existing library came back in no
meaningful order. Now ordered by `fileModifiedAt` with `createdAt` breaking ties.

A third, smaller one is noted but not fixed: `formatRelativeTime` returns "just now" for any date
in the future, because it tests `diffSecs < 60` without checking the sign. A clock-skewed recording
reads as brand new.

## The accent

`#f97316` is **Tailwind's `orange-500`**. It is the framework default, not a chosen colour, and
that is the same mechanism that made indigo the signature of AI-generated interfaces. Tailwind's
author has publicly apologised for it.

The mockups use `#f57f3a` on dark and `#b64600` on light. Both are solved for a contrast target in
OKLCH rather than picked off a palette: a few degrees off the default hue, less chroma, and better
contrast (7.30:1 against the canvas, up from 6.85:1). It still plainly reads as the GoodBit orange.

**This is your call.** Keeping the brand and dropping the default is what these do. Moving to a hue
nobody else is using is a bigger decision than a redesign.

## The six directions

Each one is the same data, the same tokens and the same shell. What differs is layout.

| | 1366 | 1920 | 3440 | Best at | Worst at |
|---|---|---|---|---|---|
| Today's build | 5 | 8 | 8 | | |
| **A. Contact sheet** | 14 | 25 | 34 | Recognising a moment by eye | Comparing clips on facts |
| **B. Triage list** | 17 | 26 | 32 | Volume, sorting, bulk work | Looking like a clip app |
| **C. Sessions** | 5 | 5 | 5 per session, 12 listed | Remembering an evening | Finding one specific clip |
| **D. Moments** | 11 | 20 | 28 | Showing what the app found | Density, and games with no module |
| **E. Split browser** | 8 | 11 | 21 | Watching, reviewing in a run | Overview |
| **F. Filmstrip** | 18 | 34 | 38, or all 41 ungrouped | Seeing length without reading | Short clips, tidiness |

No direction overflows sideways at any of the three widths.

The ultrawide column is the one to read. Today's build shows the same eight clips on a 3440 wide
monitor as on a 1080p one. Every direction here turns that width into more clips instead of bigger
ones.

Full trade-offs for each are written under the mockup itself, so they are read next to the thing
they describe.

Two of them carry an idea worth separating from the layout:

- **F** encodes duration as tile **width**, which is what Final Cut Pro's browser does. It is the
  only layout here where you know a clip is long before you read anything, and the zoom control
  becomes seconds per pixel rather than pixels per tile, so density and scrub precision are one
  control instead of two.
- **C** and **F** both draw where the detected moment sits **to scale** inside the clip, so a whole
  evening can be skimmed for the one worth cutting.

## The grouping trap

Grouping by day and game is why the current grid wastes space, and the date bug was hiding it.
With every clip dated "today" the groups were large and the rows filled. With real dates, most
day-and-game groups hold one or two clips, and each group starts a new row, so the rest of that row
is empty at every window size.

Both grid directions have a **Group by day** toggle in the toolbar so the cost is visible rather
than decided quietly. On this library, at 1920 x 1080: grouped shows 25, ungrouped shows 41.

## The user simulations

Three people with no knowledge of the code used the app end to end, each in their own sandbox, 65
sessions between them. **`FRICTION.md`** has the full report. The short version:

- All three independently hit the same three walls: **you cannot open a clip**, **selection needs a
  32 pixel corner checkbox**, and **duration is nowhere in the library**.
- Seven further findings were verified against the source and are listed with file and line in
  `FRICTION.md`. The worst is that **a trim rewrites the only copy, lands somewhere different from
  what the screen promised, and reports megabytes instead of the numbers it already has**.

## What is still outstanding

- The design system tab covers the Library. Applying it across the app comes after you pick a
  direction, and only then.
- Nothing here is committed. `git status` shows the design folder, five `scripts/ux-*.mjs` helpers,
  the two date fixes, the executable name fix and the publisher Dockerfile fix, all local.

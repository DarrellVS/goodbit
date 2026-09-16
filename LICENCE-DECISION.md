# Licence decision

`package.json` has no `license` field and there is no `LICENSE` file. As the
README already says, that legally means all rights reserved. This is the
owner's decision, not something to default into by adding a template file,
and it is not fully reversible once a release with a licence attached has
gone out and been downloaded. This note lays out the options that actually
fit this project and the exact steps to apply whichever one is picked. It
does not apply one itself.

## The bundled ffmpeg, checked first

GoodBit depends on `ffmpeg-static` (currently resolving to `5.3.0`) and
`ffprobe-static`, which download prebuilt binaries rather than building
ffmpeg from source. `package-lock.json` records `ffmpeg-static`'s own
declared license as `GPL-3.0-or-later`: its Windows build comes from
Gyan.dev's "full" builds, which include `libx264`, and a build with `libx264`
in it is GPL, not LGPL. `ffprobe-static` is declared MIT and `fluent-ffmpeg`
(the JS wrapper that spawns both) is MIT; neither changes the picture.

That does not force GoodBit's own code to be GPL. `ffmpeg.exe` is invoked as
a separate process, communicating over a pipe and a command line, the
classic case the FSF's own guidance treats as aggregation rather than a
combined work; GoodBit shipping alongside a GPL binary it did not modify and
does not link against is the same situation as OBS or a video editor
shipping ffmpeg. But it does mean **a GPL obligation exists on this project
already**, attached specifically to that binary, regardless of what licence
GoodBit's own code ends up under: the GPL notice for ffmpeg has to stay
reachable, and its source has to remain available, which it already is
upstream. Picking GPL-3.0 for GoodBit's own code would not add a new
obligation here; it would just mean one licence covers the whole installer
instead of two.

## The options

**MIT.** Anyone can take the source, modify it, and redistribute it,
including as a closed, sold product, as long as the copyright notice
survives. No obligation flows back. For a fork: nothing is owed to this
project, ever, not even a return of changes.

**GPL-3.0.** Anyone can do the same, but a redistributed copy, modified or
not, must stay under GPL-3.0 and ship (or offer) its source. For a fork:
distributing a modified build, even just posting a `.exe`, carries a
standing obligation to make that version's source available under the same
terms. Running a private modified copy carries no obligation; GPL's
copyleft is triggered by distribution, not by use.

**AGPL-3.0.** Everything GPL-3.0 does, plus: offering the software's
functionality over a network counts as distribution, so a modified version
run as a hosted service has to offer its source to that service's users too.
That clause is aimed at exactly the case GoodBit does not have: the
maintainer does not run a hosted copy of GoodBit itself. `publisher/` is an
optional, separately licensed piece a user points GoodBit at and runs
themselves; it is not GoodBit served over a network by this project. AGPL's
distinguishing clause would be protecting against a scenario that does not
exist here, at the cost of being the option contributors and downstream
users recognise least.

## Recommendation

MIT. GoodBit is a desktop app distributed as a binary installer through
GitHub Releases, contains no third-party service credentials or hosted
component of its own, and is maintained by one person who has said the goal
is for other people to be able to do something with it. Permissive licensing
is the lower-friction choice for exactly that shape of project: it does not
ask a future contributor to think about copyleft before opening a PR, and it
does not ask anyone who wants to fork this for their own OBS setup to
justify keeping their changes open. The GPL-3.0 obligation already attached
to the bundled ffmpeg binary is unaffected either way and does not favour
one choice over the other on its own.

GPL-3.0 is the defensible alternative if the actual goal is different from
"let people use this freely": specifically, if the concern is a fork getting
repackaged and sold closed, GPL-3.0 is what stops that. That is a real
trade-off, not a lesser choice, and worth stating plainly rather than
assuming MIT is obviously correct: it is a recommendation, not the only
reasonable answer.

## How to apply it

**If MIT:**

1. Add a `LICENSE` file at the repository root with the standard MIT text,
   copyright line `Copyright (c) 2026 Darrell van Swinderen`.
2. Set `"license": "MIT"` in `package.json`.
3. `electron-builder.yml` needs nothing. Optionally, an `nsis.license:
   LICENSE` entry would make the installer show a licence acceptance page;
   that is cosmetic, not required to apply the licence.

**If GPL-3.0:**

1. Add a `LICENSE` file at the repository root with the full GPL-3.0 text.
2. Set `"license": "GPL-3.0-or-later"` in `package.json`.
3. `electron-builder.yml` needs nothing to remain compliant, since the
   ffmpeg binary it already unpacks is GPL-3.0-or-later too. The same
   optional `nsis.license: LICENSE` entry applies if an acceptance screen is
   wanted.

Either way, nothing under `src/`, `tests/`, `scripts/` or `node_modules`
needs to change; this is a root-level file and one field.

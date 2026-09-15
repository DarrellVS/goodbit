# One button, and OBS is ready

A plan for OBS onboarding: what GoodBit offers to do, what it refuses to do, and why.

Nothing here is built yet. Written 2026-09-15, against OBS 31 on this machine, Smart Replays
1.0.8.2, and the research in `tasks/af126f8075307f3c6.output`.

---

## The problem, stated honestly

GoodBit indexes `<videosRoot>/<GameName>/*.mp4`. The top level folder name *is* the game. Nothing
in OBS can produce that. Its filename formatter takes two inputs, the clock and the video settings,
and there is no token for a process, a window or a game. A setup button that only wrote an OBS
profile would leave every clip in one flat folder, and GoodBit would show one game named after it.

So the setup has three parts, and only two of them are OBS:

| Part | Who does it | Where it lives |
|---|---|---|
| Record on a hotkey, into one folder | OBS | Profile, `basic.ini` |
| Capture the game | OBS | Scene collection, `<name>.json` |
| Put the clip in a folder named after the game | **Smart Replays**, a Python script | Scene collection, `modules.scripts-tool` |

The third is the one that matters and the one nobody finds on their own.

## What the machine already proves

The whole chain is running here, built by hand over months, and the setup button reproduces exactly
this:

```
OBS profile "Replay"       [AdvOut] RecRB=true, RecRBTime=30, RecFilePath=C:\Users\darre\Videos
                           [Hotkeys] ReplayBuffer={"ReplayBuffer.Save":[{"key":"OBS_KEY_F8"}]}
Smart Replays              clips_base_path = C:\Users\darre\Videos
                           clips_save_to_folder = true
                           aliases_list = [ "…\bf6.exe > Battlefield 6", … ]
GoodBit settings.json      videosRoot = C:\Users\darre\Videos
```

Three programs, one folder, and a game name that came from an alias the user typed. That is the
target state, and every partial setup below is a subset of it.

## The finding that makes this cheap

**A script and all of its settings live in the scene collection JSON**, under
`modules["scripts-tool"]`, as an array of `{ path, settings }`. Verified here:

```json
{ "path": "C:/Scripts/OBS/smart_replays.py",
  "settings": { "aliases_list": [ { "value": "…\\bf6.exe > Battlefield 6", "uuid": "…",
                                    "selected": false, "hidden": false } ], … } }
```

So GoodBit can install the script **and configure it** by writing one JSON file, with OBS closed.
No modification of the script, no automation of its UI, no obs-websocket. The script's own property
names are stable and readable in its source (`clips_base_path`, `clips_filename_template`,
`clips_save_to_folder`, `clips_naming_mode`, `aliases_list`, `restart_buffer_loop`).

This is also why the setup **must** own a scene collection rather than edit the user's: the script
config is per collection, and pre-seeding aliases into someone's existing collection means editing
a file that holds every scene they have built.

---

## What GoodBit writes, exactly

Two new objects, both named `GoodBit`, and nothing else is touched.

### 1. Profile `basic/profiles/GoodBit/basic.ini`

| Key | Value | Why |
|---|---|---|
| `[Output] Mode` | `Simple` | Simple mode aliases are resolved and *repaired* by OBS at runtime; Advanced takes raw encoder ids with no safety net |
| `[SimpleOutput] FilePath` | GoodBit's `videosRoot` | Smart Replays defaults its base path to this |
| `[SimpleOutput] RecRB` | `true` | |
| `[SimpleOutput] RecRBTime` | user's choice, default `30` | |
| `[SimpleOutput] RecRBSize` | `512` | |
| `[SimpleOutput] RecFormat2` | `mp4` (`hybrid_mp4` is the OBS 30.2+ default) | GoodBit reads mp4, mov, mkv; be explicit rather than inherit |
| `[Hotkeys] OBSBasic.SaveReplayBuffer` | `{"bindings":[{"key":"OBS_KEY_F8"}]}` | The modern form; OBS migrates the legacy `ReplayBuffer` shape on load |

**Not written, deliberately**: encoder, resolution, framerate, colour space. The research is
unambiguous: a bad `[AdvOut] RecEncoder` fails at hotkey-press time with nothing pointing at
GoodBit, and an HDR colour setting goes stale the moment the user toggles HDR in Windows. Those get
*detected and reported*, never set. See "The diagnostic" below.

### 2. Scene collection `basic/scenes/GoodBit.json`

One scene, `GoodBit`, containing:

- `game_capture` with `capture_mode: "any_fullscreen"`. This needs no monitor id, no window string
  and no per-game configuration, which sidesteps the entire monitor-mapping problem: OBS identifies
  a display by a Windows device interface path that Electron cannot see.
- `monitor_capture` underneath it, disabled by default, offered as a fallback for games that refuse
  to be hooked. If the user picks a monitor, GoodBit resolves the device path through
  `QueryDisplayConfig` (native, see Open questions).
- `wasapi_output_capture` for desktop audio and optionally `wasapi_input_capture` for the mic.
- `modules["scripts-tool"]`, with the script path and its settings:

```json
{ "clips_base_path": "<videosRoot>",
  "clips_save_to_folder": true,
  "clips_naming_mode": 0,
  "clips_filename_template": "%NAME_%d.%m.%Y_%H-%M-%S",
  "restart_buffer": true,
  "restart_buffer_loop": 0,
  "aliases_list": [ … ] }
```

`restart_buffer_loop` is `0`, not the script's default of `3600`. Open issue #21 ("Crash each
morning on wake … Instructing OBS to restart buffer") implicates the cyclic restart, it is unfixed,
and the script has had no commits since March 2025. The user can turn it on in the script's own UI;
GoodBit will not turn it on for them.

### 3. `user.ini` (OBS 31+) or `global.ini` (below 31)

One key, `[Python] Path64bit`, and only with consent, because OBS refuses to run any Python script
until it is set. Never `[Basic] Profile`: switching someone's active profile behind their back is
exactly the kind of thing this feature must not do. The launch button passes `--profile` instead.

### 4. The manifest, `%APPDATA%/GoodBit/obs-setup.json`

Every key GoodBit wrote, with the value it wrote and a hash of each file as it left them. There is
no version field, no schema and no checksum anywhere in OBS's config, and OBS rewrites `basic.ini`
on profile switch even when nothing changed, so mtime proves nothing. The manifest is the only way
to answer "has the user edited this since we wrote it", and the answer decides whether a re-run
overwrites or stops and asks.

---

## Smart Replays: how it is delivered

**Downloaded, not vendored.** The licence (AGPL-3.0) permits shipping the file verbatim next to its
`LICENSE` as an aggregate, and that is not the deciding factor. These are:

- There is no tagged release, so vendoring means shipping a `master` blob and owning whatever is in
  it, including two open unfixed bugs.
- The project has been quiet since March 2025 with issue creation restricted, so a vendored copy
  drifts and GoodBit becomes its support desk.
- A download keeps the user's relationship with the author intact, which the script itself asks for
  with a "star it" button.

So: fetch from a **pinned commit SHA**, verify a SHA-256 that ships with GoodBit, write to
`%APPDATA%/GoodBit/obs-scripts/smart_replays.py`, and put `LICENSE` beside it. The setup screen
names the script, its version, its author, its licence and its repository, with a link, before it
downloads anything. No silent fetch.

If the download fails or the machine is offline, the step degrades to "here is the link, save it to
this folder, then press Continue", and the rest of the setup carries on without it.

### Python

The script needs Python 3.10 or newer **with Tkinter**, and OBS needs to be pointed at it. GoodBit
can detect (`py -0p`, the registry, `PATH`), and can write the OBS key. It cannot install Python,
and should not try: the installer needs the tcl/tk checkbox ticked, which is exactly the kind of
thing to show a person a screenshot of rather than automate.

No Python is not the end of the setup. It is a fork in it:

- **Path A, Smart Replays.** Folder per game, written by OBS itself, works whether GoodBit is
  running or not.
- **Path B, GoodBit sorts.** OBS writes flat into a staging folder and GoodBit moves each clip into
  `<root>/<Game>/` on the watcher event, attributing it to the foreground process at save time. No
  Python, no third-party script, and a wrong guess is a dropdown in the UI rather than a folder
  named `TabTip`. It only sorts while GoodBit is running, which is the honest trade.

Path B is worth building regardless, because it is also the repair path for every clip Smart
Replays misfiles.

---

## The screens

### In the app: Settings, a new "Recording" section

Three things, in one card, in this order:

```
┌─────────────────────────────────────────────────────────────┐
│  OBS is not set up for GoodBit yet                          │
│  Clips land in one folder, so every clip looks like one game│
│                                                             │
│  [ Set up OBS for me ]   Choose what to change ▾            │
│  Rather do it by hand? Read the guide →                     │
└─────────────────────────────────────────────────────────────┘
```

The heading is the diagnostic's verdict, not a fixed string. When everything is right it reads
"OBS is set up and recording into your library", with the same expander for changing one thing.

**"Choose what to change"** opens the same dialog as the primary button, with every step listed and
individually switchable:

| Step | Default | Off means |
|---|---|---|
| Create a `GoodBit` profile | on | Use my current profile, only change the replay buffer keys in it |
| Turn on the replay buffer, 30s | on | Leave my buffer settings alone |
| Bind Save Replay to F8 | on | I have my own hotkey |
| Create a `GoodBit` scene with game capture | **off when a scene collection already exists** | Keep my scenes; I will point the profile at them |
| Install Smart Replays | on | Skip it, and offer Path B instead |
| Write aliases for games I already have | on | Start with an empty list |
| Point GoodBit's library at the same folder | on when they differ | |

Defaulting the scene step *off* for an existing user is the important one. Someone who already uses
OBS has scenes they care about, and the setup has nothing to teach them about capturing a game.

### The preview, which is the whole security model

Nothing is written until a person has seen the list of files and keys. One dialog, three panes:

```
  Will create    basic/profiles/GoodBit/basic.ini
                   [SimpleOutput] RecRB          = true
                   [SimpleOutput] RecRBTime      = 30
                   [SimpleOutput] FilePath       = C:\Users\darre\Videos
                   [Hotkeys] OBSBasic.SaveReplayBuffer = F8
  Will create    basic/scenes/GoodBit.json          (1 scene, 3 sources, 1 script)
  Will change    user.ini
                   [Python] Path64bit            = C:\…\Python311      (was: not set)
  Will download  smart_replays.py 1.0.8.2 from github.com/qvvonk/smart_replays (AGPL-3.0)
```

Every line is a file and a key, in OBS's own vocabulary, so a person who knows OBS can check it and
a person who does not can still see how small it is. "Undo this setup" is offered afterwards and
uses the manifest.

### OBS must be closed

OBS parses `basic.ini` once and rewrites the whole file from memory at every save point, so an
external edit made while it runs is silently lost, and a profile folder created while it runs stays
invisible until restart. The dialog detects `obs64.exe` and says so plainly, with a Retry. It does
not offer to kill OBS.

### The part that makes it feel finished

After writing, one button: **Start OBS and try it**. It launches

```
obs64.exe --profile "GoodBit" --collection "GoodBit" --startreplaybuffer --minimize-to-tray
```

and then GoodBit waits, with a live line: *"Press F8 in your game. Waiting for the first clip…"*.
The watcher already sees new files, so the moment one lands the line becomes *"Battlefield 6,
0:30. That is the whole loop working."* with a thumbnail. Nothing else in the setup proves the
chain end to end, and this costs almost nothing because every piece already exists.

### The diagnostic, which ships first

Read-only, and useful on its own. It parses the active profile and scene collection and reports
what is wrong in plain sentences:

- "Your replay buffer is off."
- "OBS records to `D:\Recordings`, GoodBit watches `C:\Users\darre\Videos`."
- "No Save Replay hotkey is bound."
- "Smart Replays is loaded, but its base path is on a different drive from OBS's recording path, so
  it cannot move clips."
- "Your monitor is in HDR mode and OBS is set to Rec. 709, so your clips will look flat."

Every line has a Fix button where GoodBit can fix it and a link where it cannot. This is phase one
because it is safe, it is most of the value, and it is the same reader the setup needs anyway.

---

## The website

A new page, `site/obs.html`, in the site's own language, built like `publisher.html`: a wizard
rather than a page, with the reader's own paths written into every step.

Two routes from the top:

1. **"I have GoodBit installed"** ends in a `goodbit://` handoff, the same shape as the publisher
   invite. The link carries what the reader picked and **never writes a setting**: it opens the
   preview dialog above, already filled in, and a person clicks Apply in the app.

   ```
   goodbit://setup/obs?root=C%3A%5CUsers%5Cdarre%5CVideos&buffer=30&hotkey=F8&steps=profile,buffer,hotkey,scene,script,aliases
   ```

   Parsed strictly in `deeplink.ts`, alongside `configure/publisher`: unknown step names dropped, a
   root that is not an absolute path refused, buffer seconds clamped, hotkey matched against the
   `OBS_KEY_*` table.

2. **"I would rather do it myself"** is the full manual route: every key, every screenshot, the
   Python installer's tcl/tk checkbox, where the script goes, what to type in the aliases box. This
   is also the page the app links to from "Rather do it by hand", and the page someone lands on
   from a forum post with no GoodBit installed at all.

Both routes end at the same verification: press F8, look for a folder named after your game.

---

## Order of work

1. **The reader.** Parse `global.ini` / `user.ini` / `basic.ini` / scene collection JSON, resolve
   which profile and collection are active, honour `[Locations]`. Pure functions over a directory,
   unit tested against fixtures copied from this machine.
2. **The diagnostic**, in Settings. Read-only, no writes anywhere. Ships on its own and is useful
   on its own.
3. **The writer**, behind the preview dialog: profile, hotkey, scene collection, manifest, undo.
   Dry run mode writes to a temp OBS directory, which is how it gets tested.
4. **Smart Replays**: pinned download with hash check, Python detection, `scripts-tool` injection,
   alias generation from folders GoodBit already knows.
5. **Start OBS and try it**, the live verification.
6. **The website wizard** and the `goodbit://setup/obs` route.
7. **Path B**, GoodBit's own sorter, for machines without Python and as the repair path for
   misfiled clips.

Steps 1 and 2 are worth shipping before any of the rest exists.

---

## What this deliberately does not do

- **It does not manage OBS continuously.** It writes once, records what it wrote, and afterwards
  only reads. OBS's config has no schema and no version, keys have been renamed between releases
  with no migration (`NVENCPreset` to `NVENCPreset2` in 28.1), and there is no way to tell a user
  edit from an OBS migration. A program that keeps rewriting that file is a program that will
  eventually overwrite something deliberate.
- **It does not touch encoder, resolution, framerate or colour space.** Detect, report, link.
- **It does not enable obs-websocket.** Writing `server_enabled` into its config would open a
  network listener on someone's machine without telling them. The same reasoning that put the data
  API on a named pipe applies here in the other direction.
- **It never switches the active profile or collection.** The launch flags say which to use.

## Open questions

- **Monitor selection** needs `QueryDisplayConfig` from native code to map an Electron display to
  OBS's device path. Worth it only if game capture's `any_fullscreen` turns out to be insufficient
  in practice. Park it until someone asks.
- **Aliases from where?** Folders GoodBit already indexes give names but not executable paths. A
  Steam library scan (`libraryfolders.vdf`, then each `appmanifest_*.acf`) would give both, and
  would make the alias list useful before the first clip rather than after it. Probably phase 5.
- **Renaming a game in GoodBit** could rewrite the matching alias, so the next clip lands in the
  new folder. That is the one piece of ongoing management that would genuinely help, and it is
  writing one array in one JSON file while OBS is closed. Worth considering, with the same preview.
- **The anti-cheat question is unanswered.** The script opens the foreground process with
  `PROCESS_QUERY_INFORMATION | PROCESS_VM_READ` on every sample. No incident is documented anywhere
  and the author does not mention it, but that is a handle kernel anti-cheat can notice. The naming
  mode "current OBS scene" never touches another process and is the conservative fallback worth
  mentioning in the guide.

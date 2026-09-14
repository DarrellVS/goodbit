# Friction reports from three sandboxed users

Three people with no knowledge of the code used GoodBit end to end, each in their own throw-away
library of 41 clips. The real library was never opened. Every claim below is tied to a screenshot
in that user's own sandbox.

- **Alex**, installed it ten minutes ago, has never used a clip manager.
- **Robin**, posts highlights several times a week, came from Premiere and Resolve.
- **Sam**, plays most evenings, wants last night's clip cut and sent to a friend.

All three finished. Between them they ran 65 sessions.

### Three things all three of them hit

1. **You cannot open a clip.** Clicking the picture plays a muted preview in place. Clicking the
   name puts a cursor in a rename field. There is no "Open" anywhere. Sam found the working route
   by accident: **clicking the file size**.
2. **Selection needs a 32 pixel corner checkbox**, and clicking the clip does something else
   instead. All three assumed multi-select was broken.
3. **Duration is nowhere in the library.** All three asked for it independently, and all three
   pointed out that file size is shown instead and is useless for deciding what to cut.

---

## Verified in the code, not just observed

Seven of the findings were checked against the source rather than taken on trust. These are defects
with a file and a line, and none of them needs a redesign to fix.

| What | Where | What is wrong |
|---|---|---|
| The trim never says where it landed | `views/TrimPage.vue:225` | `actualStartSec` and `actualEndSec` come back from the API and are typed at `services/clips.ts:169`. The toast reports megabytes instead |
| Delete claims to be permanent | `components/App/CarouselSlide.vue:27` | Says *"cannot be undone"*. `MoveFileToTrashAction` uses `shell.trashItem`, so it can |
| "0 months ago" | `helpers/dateFormat.ts` | The weeks branch ends at 4 weeks, the months branch starts at 30 days. 28 and 29 days fall through the gap |
| Any future date reads "just now" | `helpers/dateFormat.ts` | `diffSecs < 60` catches negative differences too |
| Exporting invents a game | `actions/ExportTimelineAction.ts:96` | Renders land in `<videosRoot>/Editor/`, and a top-level folder is a game |
| Smart Tags cannot fire | `utils/tagSuggestions.ts`, `composables/useClipTags.ts:29` | Patterns match the filename, and an OBS filename is a timestamp |
| Rescan is silent, including on failure | `layouts/ShellLayout.vue:83` | `try/finally` with no `catch`, no toast, no count |

Two more were already fixed during this work, both in the same area: the library was showing the
indexing date rather than the recording date, and was ordered by row insert time. See the README.

---

## Read this one first: the trim does not do what the screen says, and cannot be undone

Robin asked for two cuts and checked the files afterwards.

| Asked for | Screen said | File on disk |
|---|---|---|
| 4.5s to 12.8s of a 15s clip | 8.3s long | **12.82s, starting at 0** |
| 12.5s to 20.9s of a 34s clip | 8.4s long | **12.60s** |

In both cases the end was honoured and **the start slid backwards by about four and a half
seconds**, so the file is roughly half again as long as promised with several seconds of footage in
front of the chosen moment.

This is the lossless trim snapping back to the nearest keyframe, which is deliberate and is the
right default. The problem is everything around it:

- **The original is overwritten in place.** No confirmation, no `.bak`, no undo. `TrimAndSwapClipAction`
  keeps a backup only for the duration of the swap and then removes it.
- **The app knows exactly where the cut landed and does not say.** `TrimVideoAction` returns
  `actualStartSec` and `actualEndSec`, and they are typed all the way through to the renderer at
  `services/clips.ts:169`. `TrimPage.vue:225` ignores both and reports **megabytes**:
  `"Trimmed  1.49 MB → 1.36 MB"`. The one number that would have caught this is discarded.
- **The one sentence that explains it is three screens away**, in Settings, as a subordinate clause
  justifying a compression default.

Robin's conclusion: *"This is the finding that would make me stop using GoodBit for real cuts."*

The fix is small and does not need a redesign: say what actually happened. *"Saved 0:00 to 0:12.8.
Your start moved back 4.5s to the nearest keyframe. Re-encode for an exact cut?"* The app already
has every number in that sentence.

Note the contrast Robin drew: bulk delete **does** confirm, and says *"15 clips will be moved to
the Recycle Bin"*, which is both accurate and reversible. The app confirms before a reversible
action on fifteen files and stays silent before an irreversible one on the only copy.

---

## Headline: the app explains itself in the last place anybody looks

Alex's single most useful finding is not a bug. It is that **the two sentences that tell you what
GoodBit is are both in Settings**, and a new person reaches Settings after they have already used
or avoided every feature.

> "A trim replaces the only copy of that moment, so this is off: the cut keeps the recorded
> picture, snapped to the nearest keyframe."

> "it fits a small model to those decisions and uses it instead of the built-in rule ... **Nothing
> leaves this machine.**"

Meanwhile the front door says *"My Library / Browse and manage your video clips"*, which describes
the least interesting thing the app does and never mentions finding the good bit. Alex's verdict on
first sight: *"this is a folder viewer for my clips. If I had not been told, I would have thought I
had installed the wrong thing."*

---

## Blockers

**1. The clip name on every card is an editable text box with no affordance.**
It looks like a label. No border, no pencil, no hint. Alex refused to touch it: *"the most
frightening thing a clip manager can do to me, rename my recording, is sitting under a label with
no sentence anywhere saying what editing it actually changes."* The word "rename" appears nowhere
in the app. (It is a display name only, and the file is never renamed, but nothing on screen says
so.)

**2. The delete confirmation says something that is not true.**
The whole message is *"Delete this clip? This action cannot be undone."* It does not name the clip,
does not say whether the file leaves the disk, and the words "Recycle Bin", "trash" and "original"
appear nowhere in the application.

Checked against the code, and the copy is simply wrong: `MoveFileToTrashAction.ts` deletes through
`shell.trashItem`, so the file goes to the Recycle Bin and **can** be undone. The sentence is in
`CarouselSlide.vue:27`. The app's most alarming message is frightening people about something that
does not happen, while the reassuring fact goes unsaid.

The toast also appears in the opposite corner from the button that opened it, and its Confirm
button is pale grey on pale orange, which reads as disabled.

**3. Smart Tags shows raw regular expressions to everybody.**
The screen lists `\b3k\b`, `1v[2-5]`, `team[-_]wipe` under an invitation to "+ Add Pattern". Alex:
*"this is the only screen where I concluded the app was not written for someone like me."* Four
questions the page never answers: what is matched, against what, when, and how it relates to tags
you type yourself. It also failed to fire: typing "insane" on a clip, which is listed as a pattern
for `#epic`, created a new tag called `#insane` instead.

**4. The highlight feature never says why.**
"Trim to highlights" shortens the timeline block and shows `0:15.00` become `0:08.30`. That is all.
The reason is reachable only by clicking the block, and even then it is four numbers and a badge
reading "Trimmed to the highlight", which restates the request rather than explaining the choice.
Alex: *"It gave me a number where it needed to give me a reason."* Asked whether they trusted it:
**no**, *"not because the cut looked wrong, but because I have no way to form an opinion."*

The app can already do better. Elsewhere it writes *"Puts the whole movie at -14 LUFS, the level the
platforms turn everything down to anyway."* That is a machine explaining itself.

---

## Major

**5. "Edit day" reads as "edit the date".**
It sits beside a heading that says "Battlefield 6 • Fri, Sep 25". It actually throws you into the
full screen editor with that day loaded. The verb belongs to a different noun than the one next to
it.

**6. The Editor removes all navigation.**
The sidebar disappears entirely, and the only way out is a 28 by 28 pixel back arrow in the window
title bar, in the OS chrome rather than the app. The most complicated screen is the one with no way
back.

**7. "Editor" in the sidebar, "Advanced Editor" on the page.**
Alex hunted for the simple editor. There isn't one. Calling the only editor "Advanced" tells a
beginner it is not for them. The subtitle is *"Create your masterpiece"*, which is filler where a
sentence explaining the timeline would have helped.

**8. "Today" looks like a filter and is a different application.**
Two sidebar items that read like two filters turn out to have different interaction models, and the
more dangerous one, with a red Delete on it, is the one that looks like a filter.

**9. One generic empty state doing three incompatible jobs.**
*"No clips found / Try adjusting your filters or adding some clips to your library"* appears on the
Starred tab, on the Published tab, and on a search with no matches. Alex has 41 clips, so the advice
to add some is wrong in all three cases. The three correct answers are different, and a search with
no matches has no button to clear the search.

**10. Rescan reports nothing, including when it fails.**
The second most prominent button in the app, orange, on a screen full of irreplaceable recordings.
*"I clicked it once and never dared again."*

Checked against the code: `ShellLayout.vue:83` spins the icon, refetches, and stops. There is no
toast and no count, so a scan that found nothing looks exactly like a scan that did not run. Worse,
the handler is `try/finally` with **no `catch`**, so a scan that throws also leaves the user with a
spinner that stops and no message at all.

**11. Publishing is counted and filtered on the surface, and only offered three layers down.**
Alex reported that no Publish action exists anywhere. That is not quite right, and the correction
is the more useful finding. Publish lives in `ClipActionsMenu.vue`, `ShareSheet.vue`,
`ClipActionsCard.vue` and `BatchOperationsToolbar.vue`, all of which are reached through the
three-dot menu that appears on hover. Alex's clicks on that menu timed out, so they never saw it.

What stands is that the Library shows a "Published" tab, a "Not Published" tab and a
"Published 0 / 0%" tile in Stats, and a new user looking at those never finds the verb they
describe. A filter for a state advertises a capability; the capability should not be hidden behind
a hover.

**12. "Tags" in the library toolbar is a navigation link, not a filter.**
It sits between search and Rescan, looks like a filter, and navigates away to the Smart Tag Patterns
screen, losing your place. Two differently named controls go to the same destination.

---

## Minor

- The timeline block is labelled **"Clip #28"**, a database row number.
- Drafts are described as *"Kept in this browser"* in a desktop app.
- The **"Continue where you left off?"** banner appears unprompted over unsaved work, and it is not
  clear whether Discard throws away the old session or the new one.
- The multi-select checkbox has no accessible name, and *"Select clips to perform actions"* never
  says which actions.
- Creating a collection asks you to name it before saying what one is.
- `formatRelativeTime` returns "just now" for any future date.
- Settings Alex was afraid to touch: **Reset to Defaults** (resets what, exactly?), **Change** on
  the clips folder (what happens to the 41 already indexed?), **+ Add Pattern**, and the publish
  token field.

---

## Robin, working at volume

Robin came from Premiere and Resolve and judged GoodBit against them. Their findings are mostly
about **what is missing**, and they line up exactly with the density measurements.

**Two clips per screen, and the density controls make it worse.**
Robin counted two visible clips at 1440x900, because grouping by game *and* day puts a single tile
in a four-column row under its own header. The grid toggle in the floating pill, which looks like
"denser", goes from four columns to **two**. The only real density control is Compact Mode, in
Settings, three screens away, and it saves about 8% because spacing was never the problem: the
one-clip-per-row grouping is.

**No duration anywhere in the library.** A tile shows the game, the file size and a relative date.
For a clip app, the single most useful triage number is absent, and file size is a bad proxy.
Stats has the same gap: it counts megabytes but never hours of footage, average length or longest
clip.

**No sort control at all.** Newest first is the only order the app offers. Robin wanted longest,
biggest, oldest.

**Pagination, in a clip library.** "Showing page 1 of 3 (41 total clips)". Every whole-library
operation has to be repeated once per page, and `Ctrl+A` selects only the current page. There is no
"select all 41" and no "select this day".

**Selection is a 32x32 corner checkbox, and clicking the clip plays it.** In selection mode the
obvious target, the whole tile, starts playback instead of selecting. The real target is about 1.7%
of the card. The checkbox has no label, no `aria-label` and no `title`, so it is unreachable by
keyboard and unnamed for a screen reader. Then one **Escape wipes all fifteen selections** along
with closing the menu, with no undo.

**The trim screen has no numbers you can type.** Start, End and Length are read-only text to one
decimal. No timeline zoom, no frame step, no "set in at playhead". On a 15 second clip a pixel is
about 13ms, which is fine. On a ten minute recording a pixel is about 500ms, roughly fifteen frames,
and there is nothing to zoom with.

**Four of seven steps in the core loop have no keyboard path.** Tab never enters the grid, so
focusing, selecting and opening a clip are mouse-only, and the trim handles are not focusable. The
app *does* have a rebindable shortcut system (`G`, `S`, `/`, `L`), and it is mentioned nowhere
outside a Settings panel Robin found on their fourth pass.

**The export dialog does not say what file you will get.** No output resolution, no bitrate, no
frame rate, no estimated size, and the destination is "your Editor folder" with no path and no
Browse. Picking Discord is *specifically* about a size limit, and size is the one thing not shown.
The vertical crop is a blind percentage slider with no preview, and the modal covers the player
behind it.

**There is no export from the library at all.** Exporting one clip as vertical means opening the
Advanced Editor, adding the clip, then exporting. Robin's main use case is one clip to one platform.

**Tagging has no picker.** Free text with no list of existing tags, so at clip 40 you are still
typing rather than picking, and nothing prevents "clutch" and "Clutch". The bulk path is much
better; the grid pushes you toward the slow one.

**Smart Tags cannot fire for a stock OBS library, and the reason is structural.** Checked against
the code: `utils/tagSuggestions.ts` says so in its own opening lines, *"Auto-suggests tags based on:
1. Filename pattern matching"*, and `useClipTags.ts:29` matches against
`clip.displayName || clip.filename`. The patterns look for words like `clutch`, `\b5k\b`,
`team[-_]wipe`, `ak47`.

An OBS filename is `Battlefield 6_25.09.2026_15-15-15.mp4`. It is a timestamp. It contains none of
those words and never will, so the patterns can only fire **after** somebody has typed a
descriptive display name by hand, which is the very work the feature is offered to save. Stats
confirms the outcome after a full scan: **Tagged 0 (0%), Top Tags: No tags yet**.

Both testers flagged this screen independently, for different reasons: Alex because it shows raw
regular expressions with no explanation, Robin because it produces nothing. The name oversells it
too. It is not automatic tagging: the file states *"Tags are NEVER automatically applied, only
suggested"*, and the suggestions appear only inside the tag popover, which is where Alex expected
`#epic` and got a new tag called `#insane`.

**Three names for one destination.** "Editor" in the sidebar, "Advanced Edit" in the clip menu,
"Open in Advanced Editor" in the bulk menu, "Edit day" on a group, all landing on "Advanced Editor
/ Create your masterpiece". Robin tried to learn the difference between "Edit day" and "Editor" and
could not state it afterwards: clicking "Edit day" on the Sep 25 group opened a timeline holding a
clip from Sep 23, with a draft-recovery banner on top.

**The Advanced Editor has everything the Trim screen lacks.** Undo, redo, hundredth-second
timecode, a zoom control, a ruler, per-clip trim properties, draft recovery. Robin's summary:
*"Two editors with opposite safety properties and no signposting about which to use."* The
destructive one is the one without the safety net.

---

## Sam, an evening with it

Sam wanted one thing: last night's clip, cut down, sent to a friend. They could not complete it.

**Choosing Edit on a specific clip opens an empty editor.** Sam picked a clip, opened its menu,
chose "Edit", and landed in the Advanced Editor showing *"No clips in timeline. Click clips from
the library to get started"* and *"No clip selected"*. The clip they had chosen was not there, and
they had to find it again in a second clip list. **This is the worst moment in all three reports.**

**The clip page promises two things its menu does not contain.** Grey helper text under the buttons
reads *"Open, trim, publish, delete…"*. The menu is: Edit, Reveal in Explorer, Export Audio, Move
to Game, Publish, Publish the original file, Delete. No Open. No Trim. The "Edit" row shows a
submenu chevron that never opens.

**Dates say "0 months ago".** Reproduced from the code: `helpers/dateFormat.ts` hands the weeks
branch anything under 4 weeks and the months branch anything from 30 days, so **28 and 29 days fall
between them** and render as `0 months ago`. Sam: *"'0 months ago' is not English and it makes me
distrust the rest of the dates."*

| Age | What it says |
|---|---|
| 27 days | 3 weeks ago |
| **28 days** | **0 months ago** |
| **29 days** | **0 months ago** |
| 30 days | 1 month ago |

**Exporting invents a game.** Checked against the code: `ExportTimelineAction.ts:96` writes renders
to `<videosRoot>/Editor/`, and in this app a top-level folder **is** a game. So every export grows
a fake game called "Editor" in the sidebar, in the game filter and in Stats. It gets worse with
every export.

**A clip started playing with sound while Sam was typing in the search box.** They had not clicked
it. *"The sort of thing that makes you slam the lid at 1am."*

**Publish throws two toasts for one click, and one gives wrong advice.** *"No publisher is set up.
Add one under Settings"* stacked under *"Publish failed / Please try again."* Trying again fails
identically. Meanwhile every clip offers both "Publish" and "Publish the original file", one word
apart, with nothing explaining the difference, to someone who is never going to run a server.

**Tag chips do not do anything when clicked.** Sam: *"The whole point of putting a tag on a clip is
to click it later."*

**Export finishes silently.** No progress, no toast, no "saved", and the dialog says the render
lands in *"your Editor folder"* without a path or an offer to open it. Sam confirmed it worked by
going and looking on disk.

**"Send to my phone" is the best sharing feature in the app and is named so that nobody opens it.**
Behind it: a QR code, a local link, *"Nothing leaves the house, and the link stops working in 30
minutes"*, and a Stop sharing button. Nothing to configure. Sam called it *"a big missed
opportunity"*, because it reads as a phone feature rather than as sharing, and it does not help
with the actual job of sending a clip to someone who is not in the house.

**The grid toggle makes things bigger and throws the dates away.** Grouped view fits four across
with day headers. "Grid view" fits two across and drops every date. All three testers read that
icon as "more, smaller".

**Coming back loses your place.** Selection survives a trip to Settings; scroll position does not.
Sam: *"Keeping the selection and dropping the scroll is the wrong half to keep."*

---

## What is already good, in their words

- **Search.** Pressing `/` and watching 41 clips become 6 while typing. *"Instant and required no
  explanation. This is the thing the app does best."*
- **The game list with counts.** *"The only part of the opening screen I understood immediately."*
- **The Settings descriptions**, nearly all of them. The best sentence in the app is on the Games
  tab: *"The files stay on disk, they just stop showing up in clips, stats and the editor."* It
  anticipates exactly the fear a new user has.
- **The export dialog.** "Made for: YouTube / Shorts · Reels · TikTok / Discord" and "Even out the
  sound ... the level the platforms turn everything down to anyway". Two genuinely technical choices
  turned into things people want.
- **Stats**, and its honest empty states.
- **The collection empty state**, which teaches the next step instead of reporting an absence.
- **"Nothing leaves this machine."** Alex: *"Four words that did more for my trust than the rest of
  the app combined. Put them on the front page."*

Robin, who came from Premiere and Resolve, added several more:

- **The loudest-stretch suggestion on the trim screen.** *"The loudest stretch is 0:04 to 0:12,
  8.3s, which is usually where the good bit is"*, with **Use it** and **Wrong**. It picked a
  sensible range both times. Having "Wrong" as a button is the right instinct.
- **"Space plays the trimmed range on loop"**, written on screen beside the play button.
  Preview-the-selection is what an editor actually needs, it is the default here, and it is
  documented where you are already looking.
- **The export platform presets.** Choosing "Shorts, Reels, TikTok" flips the shape to Vertical
  *and* turns on loudness normalisation by itself. *"Exactly right."*
- **Bulk delete says "Move to Recycle Bin" and names the count.** The right promise and the right
  wording, and the reason the silent trim stands out so badly by comparison.
- **The Advanced Editor**, which Robin called *"a real editor, nicer than I expected from a clip
  manager"*.
- **The shortcut system is rebindable**, with sensible defaults. It only needs to be visible.

Sam, who is the least technical of the three, singled out two more:

- **"Send to my phone."** A QR code, a link that expires in thirty minutes, and one sentence:
  *"Nothing leaves the house."* Nothing to configure. Sam called it the best feature in the app.
- **Delete naming the file and saying "Move to Recycle Bin".** *"That single word stopped me
  worrying."* Which is the whole argument for fixing the other delete message.

Robin's closing line is worth keeping: *"The bones here are good. The trim screen is one
confirmation dialog, two numeric fields and an accurate toast away from being something I would
trust with my only copy."*

---

## What this means for the redesign

Three of the four blockers are **copy and affordance**, not layout. They can be fixed inside
whichever direction you pick, and they should be, because they are the difference between an app
that looks careful and one that is. The pattern across all of them is the same: GoodBit is careful
with people's recordings, and never says so where it counts.

Four findings bear directly on the choice of direction:

- **The highlight needs a reason, on the surface.** Direction **D. Moments** puts the reason on the
  tile. Directions **C** and **F** draw where the moment sits, to scale. Any of those would answer
  Alex's "I have no way to form an opinion" without opening anything.
- **Duration has to be on the tile.** Robin could not find it anywhere in the library, and it is
  the first number you need when deciding what to cut. Every direction here shows it; **F** goes
  further and makes it the tile's width, so you read length before you read anything.
- **The grouping is the density problem, not the spacing.** Compact Mode saves 8% because it
  attacks the wrong thing. Both grid directions carry a **Group by day** toggle so the real cost is
  visible: on this library, 25 clips grouped against 41 ungrouped.
- **The front door has to say what the app is for.** Every direction here drops
  *"My Library / Browse and manage your video clips"*, because the rail already names the screen.
  That frees the space; it does not yet use it.

And one that does not depend on the direction at all, and should be fixed regardless: **the trim
must report where it actually landed.** The numbers are already in hand.

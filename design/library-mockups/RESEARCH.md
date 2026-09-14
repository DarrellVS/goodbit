# What makes an interface read as machine-generated, and what mature apps do instead

Condensed from a research pass over design-system documentation, practitioner critique and the
shipped CSS of several applications. Sources are linked inline.

---

## The finding that reframes the complaint

**`#f97316` is Tailwind's `orange-500`.** It is not a chosen brand colour, it is a framework
default, and that is exactly the mechanism that turned indigo into the signature of AI-generated
interfaces. Tailwind's author has publicly apologised for it: *"I'd like to formally apologize for
making every button in Tailwind UI `bg-indigo-500` five years ago, leading to every AI generated UI
on earth also being indigo."*

GoodBit did not escape that by picking orange. It moved one hue across the same unchosen palette.

The empirical backing for the wider complaint is Adrian Krebs's study of 1,590 Show HN landing
pages scored against sixteen deterministic DOM and CSS checks
([adriankrebs.ch/blog/design-slop](https://www.adriankrebs.ch/blog/design-slop/)). 22% triggered
four or more patterns. The most common single tell was a permanent dark theme at 34%, then gradient
backgrounds at 27%, then icon-card grids at 22%.

---

## The tells, and the mature alternative

**Gradients, glows and glassmorphism.** A gradient is a non-neutral surface that competes with
content and blurs the boundary between regions. Nielsen Norman on glassmorphism: text *"might only
have enough contrast over certain areas"*. Linear refused Liquid Glass outright because
*"refraction can make dense professional interfaces harder to read"*. Use flat fills and a
background ladder. Linear ships four near-blacks and nothing else.

**Drop shadows everywhere.** Adobe scopes them hard: *"Shadows are reserved for transient
components that appear elevated and are dismissible (e.g., dropdown menus)."* Measured across 5,100
elements on linear.app, **five elements carry a real drop shadow**. What looks raised is a 1px
inset ring.

**Over-rounded corners.** Radius reads as tone. Adobe's desktop default is **4px**, with full
rounding *"reserved for only calls to action"*. A 16px radius on a dense data surface reads as a
consumer app doing a professional app's job.

**Uniform card grids.** Cards deliberately flatten rank: they *"make all content look similar,
which can make it hard for users to discern the ranking importance"*. They get chosen *"not because
they're the best solution, but because they're the safest"*. Adobe's answer is the **quiet card**,
which has no container at all: the thumbnail is the object, and a box drawn around a picture adds
nothing.

**Coloured left borders.** Per the discussion of Krebs's study, the single most reliable marker:
one designer called them *"almost as reliable a sign of AI-generated design as em-dashes for
text"*. It is decoration that mimics encoding.

**Emoji as icons.** Each one injects an uncontrolled hue, renders differently per platform, and
JAWS on Windows often does not announce them at all. Use one icon set on one grid at one stroke
weight, or none.

**Centred everything.** Centring destroys the left scan edge, so readers *"must search for the
start of each new line"*. Left-align everything that is read. Numbers are the exception and go
right: Adobe specifies tabular lining figures, right aligned.

**Colour as decoration rather than encoding.** *"Color should signal importance; painting every row
nullifies meaning."* Linear ships six hues total. Raycast ships nine names. Adobe defines four
semantic colours and adds the hard rule: *"Color should never be used by itself for
communication."*

Final Cut Pro is the master class: seven meanings, all carried by 2 to 3px coloured rules on
otherwise achromatic chrome, positioned so they cannot collide, and the lines are click targets.
Lightroom's rule is sharper still: **if the user can assign colour, the interface must not.** Its
flags and star ratings are deliberately achromatic so three classification systems can coexist.

**Evenly weighted typography.** Nothing recedes, so nothing advances. *"Avoid using lighter font
weights to de-emphasize text; instead use a lighter color."* Measured on linear.app: weight 400 on
679 text nodes, weight 510 on 130. **Two weights carry 97% of the page.** Adobe's panel titles are
14px, identical to body, distinguished by weight and colour only.

**Too many sizes.** Adobe uses a 1.125 ratio from a 14px base. Linear's app ladder is 11 / 12 / 13
/ 15 / 18. Nielsen Norman's blunter version: *"limiting your designs to 3 type sizes will establish
a strong hierarchy without overwhelming the design."*

**Oversized heroes in a utility app.** Landing-page grammar applied to a tool. Nielsen Norman's
eyetracking: *"Some types of pictures are completely ignored... big feel-good images that are
purely decorative."* A decorative hero above a clip grid will not be looked at, it will only push
the clips down.

The cautionary tale is Plex, which put content the user does not own above content they do. The
forum thread titled "New UI on Roku is hot steaming garbage" carries **5,656 likes**; the thread
about the official response carries **7,517**. GoodBit has nothing to upsell. That is an advantage.

**Badge and pill overuse.** *"When every nav item, every card, and every button has a badge, none
of them mean anything."* A subtler problem: static indicator pills look identical to clickable
filter chips.

**Over-animation.** Emil Kowalski, now at Linear: *"A hover effect is nice, but if used multiple
times a day, it would likely benefit the most from having no animation at all."* Linear's shipped
tokens: highlights fade **in at 0s** and **out at 150ms**. The transitioned property, on 274
elements, is `color`. Twenty-two elements transition `transform` and they are all in marketing
illustrations. Material's desktop ceiling is 150 to 200ms.

**Web affordances in a desktop app.** The highest-value single change for an Electron app, and two
teams arrived at it independently. Raycast: *"No hover highlights on most controls to match native
macOS behavior (web conventions like `cursor: pointer` deliberately avoided)."* Linear ships
`--pointer: default` and offers the hand cursor only as an opt-in preference.

**Empty states that cannot tell empty from broken.** Jellyfin's string is
`"No Items are currently available."` whether the library is empty or the scan failed, and the
result is a multi-year tail of duplicate bug reports (jellyfin#3030, #6140, #8518, #13900, #10386,
#15240). Carbon's anatomy subordinates the illustration and requires a **primary action**.

---

## What the benchmarks do

**Linear** dims its own navigation so content wins: *"The navigation sidebar used to appear bright
enough that it remained visually prominent even after a user had reached their destination."*
Density is not a compact toggle, it is **21 toggles for what is in the row**. The best single idea:
**the command palette is the bulk editor.** Select rows, press the palette key, and it re-scopes to
the selection; right-click opens the same menu, mostly to teach the shortcut.

**Lightroom Classic** enforces a strict spatial rule: **left is where things come from, right is
what you are doing to them, bottom is the selection, top is filtering.** Nothing crosses over.
Density has four independent axes: view mode, thumbnail size, cell style, and what is in the cell.
Its selection model is the best idea researched and spends no hue at all: *"Selected photos have a
slightly darker cell, and unselected photos have the darkest gray cell... The lightest colored cell
indicates the active photo."* Three tones plus a hairline.

Adobe's warning is worth taking with it: the implicit rule about whether an action hits the active
item or the whole selection confused people enough that a **Target Photo / Selected Photos** toggle
had to be added. Name the scope in the action instead: "Tag 14 clips", not "Tag".

**Final Cut Pro** is the closest structural analogue, because its items are clips with durations.
Its browser's zoom is a **time-per-pixel** control, not a size control: the Duration slider *"sets
the time represented by each thumbnail"*, and Apple states the trade directly, *"Expanding the
width of a filmstrip helps you make more precise selections."* Density and scrub precision are the
same quantity, so they are one control. Its list view pins a fully interactive filmstrip of the
selected clip above the table, which would serve GoodBit's trim workflow directly.

**Apple Photos** has two density axes, and the second is the important one. Zoom changes tile size.
**The ladder changes how many items exist**, by summarising: Years, Months, All Photos. Zoom alone
cannot get from 50,000 photos to a scannable screen. GoodBit's equivalent already exists in the
data, because the top-level folder is the game name and clips have dates.

**Raycast** is the strongest example of a web-technology desktop app that does not read as one.
Its bottom action bar permanently shows the primary and secondary action for whatever is selected,
with their shortcuts, so the app teaches its own keyboard. Its store tone rules double as
anti-playfulness rules: *"Avoid articles"*, *"Don't use a subtitle if it doesn't add context"*,
*"If your subtitle is almost a duplication of your command title, you probably don't need it."*

That last one is worth reading twice next to *"My Library / Browse and manage your video clips"*
and *"Advanced Editor / Create your masterpiece"*.

---

## The rules these mockups are held to

Each is checkable against a screenshot or a grep, which is the point.

1. **No more than four type sizes on a screen, and no more than two weights.**
2. **Primary and secondary differ by colour only**, never by weight, and by at most one size step.
3. **Region boundaries are a luminance step of 1.1:1 to 1.3:1 plus at most a 1px hairline.** No
   `box-shadow` on any persistent surface.
4. **One border radius**, 4px, plus `9999px` for pills only. Media is square.
5. **Zero gradients, zero glows, zero translucent surfaces over content.** GoodBit tone maps HDR,
   so a tinted surround actively degrades the judgement the user is making.
6. **The accent is derived, not a framework step**, and appears only on selection, focus, the
   single primary action and in-progress state.
7. **Colour never lands on the thumbnail**, and is never the only carrier of meaning.
8. **Selection is three grey tones plus a hairline**: unselected, selected, active. Every bulk
   action names its scope in its own label.
9. **The grid starts at the top.** No hero, no greeting, no stat banner, no sentence under the
   page title. No page title either: the rail already names the screen.
10. **Two density controls**, both persistent, both meaning the same thing everywhere: tile size,
    and a grouping ladder that changes how many items exist.
11. **Motion is 100 to 200ms and transitions colour**, never transform. No hover lift, no scale.
12. **Default cursor everywhere.** The hand is only for links that leave the app.
13. **Three empty states, never one**, each naming its cause and carrying its action, plus a
    fourth for "filtered to nothing" that offers Clear Filters inline.
14. **If a field is sortable it is filterable**, and every filter panel has a Reset.

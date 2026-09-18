GoodBit 3.0.0

The whole app has been redrawn, and a library that used to page now scrolls.

## It looks like one thing now

Every screen was built to its own taste: a clip card had its tools in three
corners, the editor had a filled segmented control where the library had plain
text, Settings had five bordered boxes where a page above it had none, and
there were forty six icons in the accent colour, which is the same as having
none.

There is a system underneath it now and every screen is drawn from it.

- **One colour ladder.** Nothing in a component names a colour any more. Every
  rung from `muted-400` up clears 4.5:1 against all five grounds it can land
  on, not just against the page, because a label moves onto a panel all the
  time. The accent means one thing: the good bit, plus the single primary
  action in a region.
- **One of each control.** One height per class, one icon box, one gap, one
  focus ring, one shadow. Almost every alignment defect in the review was the
  same defect twice: two things that should have lined up were each given their
  own padding by hand and drifted.
- **Nothing moves when you point at it.** Colour changes; geometry does not. A
  card that grew on hover, a row whose label shifted by a pixel when it became
  active, a button that gained a border only when focused: each was invisible
  in a screenshot and obvious the moment a pointer crossed it.
- **Numbers are numbers.** Anything that can change is mono, tabular and
  right-aligned, with room reserved for its largest value, so a readout going
  from 9 to 10 no longer moves the controls beside it.

Three fonts ship with the app rather than being asked for over the network, so
the first paint is the right one on a machine that has never been online.

## The library scrolls

The page bar is gone. It was the wrong control for a grid of pictures: pressing
Next put the row you were reading at the top of the screen, you lost your place
in a way scrolling never does, and a clip from three weeks ago was six presses
away instead of a flick of the wheel. The list grows as you reach the end of
it, in the library, in a collection and in the editor's clip panel, and it says
how many there are when you get to the bottom.

**That had to be paid for.** Scrolling to the bottom of a library keeps every
card you have passed, and on a real one it took the app from 445 MB to 1424 MB
over 266 clips. Measured at a thousand: 29,175 nodes, 27,556 event listeners,
237 MB of heap. The decoded pictures were not the cost, a thousand live
components were. A clip's place in the grid is always there now, and the card
inside it exists only while it is near the window, which takes the same
thousand clips to 1,519 nodes and 120 MB.

Nothing is recycled, so a card never loses its hover, its focus or its
selection, and the scroll height is exact rather than estimated.

## The screens that changed most

**The library's control line** is one row of mostly text: Filter, the sort, the
count, Select. Filter is one popover holding the three questions worth asking,
and starred stopped fighting published: "starred and published" was a question
the library could always answer and could not be asked, because a four tab row
had collapsed two independent fields into one.

**The clip panel** opens over the library rather than replacing it, keeps its
scroll position and filters, and steps to the next clip without closing. Its
marks and its notes sit side by side. Trimming happens inside it.

**Stats** is tiles divided by hairlines and flat ranked lists, with no boxes at
all.

**Settings** is six sections down the left and one column of rules on the
right, and every row on every page now has the same rhythm.

**The editor** shares the library's vocabulary: text tabs, the same dropdowns,
the same list rows. The timeline draws a labelled ruler, flat blocks and one
lane ground, and everything in the column is the same width.

**OBS setup** says what is true rather than what was intended, as a dot and a
sentence, with whatever is wrong listed underneath it as rows.

## Four things that had quietly been broken

- **The contrast gate had never worked.** Its regex lost two backslashes on the
  day it was written, so every ratio it computed was `NaN`, and `NaN < 2.5` is
  false. It reported zero problems across 400 runs of text in two palettes, for
  four days and two releases. It measures properly now, at WCAG's own floors,
  and it throws if it cannot read a colour rather than reporting nothing.
- **Three tests found elements by how they were painted**, so the colour work
  blinded them. They use names in the markup now.
- **The trim handles had a 16px grab target** and grew on hover, which is why
  the frame strip behind them kept getting dragged instead.
- **Today's Clips showed the library's current page**, narrowed by whatever
  filters were set on the screen you came from, which is neither everything nor
  today. It asks for its own list.

## Smaller, and worth knowing

- Dragging a clip out to Discord or Explorer is the whole card now, not a grip
  you had to find. Adding one to a collection is in the card's menu.
- Space plays and pauses in the clip panel, unless something that owns space
  has focus.
- The settings search says which switch reveals a row that is behind one,
  instead of navigating you to a page and going quiet.
- Toasts are centred.
- Nothing behind a modal is blurred any more; it dims.

## Upgrading

Nothing about your library changes. There is no migration in this release: the
same database, the same clips, the same folders. A verified backup is still
taken before every boot that changes the schema, and this one does not.

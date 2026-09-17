/**
 * One height per control class, one box per icon, one gap between them.
 *
 * Almost every alignment defect in the 3.x review was the same defect: two
 * things that should have lined up were each given their own padding by hand,
 * and drifted. A sidebar glyph a pixel off its label's centre, two dropdown
 * triggers whose labels start at different x because one has a leading icon,
 * a pager whose chevrons move when the number goes from 9 to 10.
 *
 * None of those is fixable by nudging. They are fixable by there being one
 * number, in one place, that every consumer asks for. `COMBO_BOX_HEIGHT` was
 * already doing that for dropdowns, for exactly this reason, and this is the
 * same idea for the rest.
 *
 * These are Tailwind class strings rather than pixel numbers because that is
 * what a template needs. The pixel value is in the comment.
 */

/**
 * 36px. Buttons, inputs, dropdown triggers, chips with an action.
 *
 * There is one height, and it is not a prop. In the library's filter row the
 * sort dropdown sits beside the tag dropdown and a Select button, and three
 * controls of the same class at three heights is the thing this exists to
 * stop. A `size` prop is an invitation to get it wrong.
 */
export const CONTROL_HEIGHT = 'h-9';

/**
 * 32px. A control that is a word in a line of words.
 *
 * The library's control line is mostly text by design: `Filter`, the sort,
 * `Select` and the count describe the list below them rather than changing it,
 * and boxing them gives them the weight of things that do. So they are a class
 * of their own, with one height, rather than bordered controls with the border
 * switched off.
 */
export const QUIET_CONTROL_HEIGHT = 'h-8';

/**
 * 28px, and only inside a dense toolbar where 36 will not fit.
 *
 * Still above the 24px minimum target in its smaller dimension. If a screen
 * wants this outside a toolbar, the screen is too dense.
 */
export const CONTROL_HEIGHT_DENSE = 'h-7';

/** 36px square. A control that is only a glyph, sitting in a row of them. */
export const ICON_BUTTON = 'size-9 inline-flex items-center justify-center shrink-0';

/** 28px square. The dense-toolbar version, matching `CONTROL_HEIGHT_DENSE`. */
export const ICON_BUTTON_DENSE = 'size-7 inline-flex items-center justify-center shrink-0';

/**
 * A fixed square box for a glyph, so a label beside it cannot drift.
 *
 * `block` on the svg matters: an inline svg sits on the text baseline and
 * picks up the line box's descender gap, which is where the half-pixel in
 * example 01 came from. Iconify renders an `<svg>`, so the class lands on it.
 */
export const ICON_BOX = 'size-4 shrink-0 block';
export const ICON_BOX_LG = 'size-5 shrink-0 block';

/** 8px. The one gap between a glyph and the word it belongs to. */
export const ICON_GAP = 'gap-2';

/**
 * An icon and a label are centred on one axis, never on a baseline.
 *
 * Baseline alignment puts the glyph's own baseline on the text's, and a glyph
 * has no descenders, so it always rides high. This is the pair that every
 * icon-and-label in the app is built from.
 */
export const ICON_LABEL = `inline-flex items-center ${ICON_GAP}`;

/**
 * One row of a list: glyph, label, trailing number.
 *
 * A grid rather than a flex row of guesses, so the glyphs form a column, the
 * labels form a column and the counts form a column, down the whole list,
 * whatever any individual row contains. `03-games-list-counts-not-aligned`
 * was a flex row where the count's position depended on the label's length.
 */
export const LIST_ROW = 'grid grid-cols-[1rem_1fr_auto] items-center gap-2 w-full';

/**
 * A number in a list's trailing column.
 *
 * Mono, tabular, right-aligned, and wide enough for the largest value it can
 * hold, so the column does not breathe as the numbers change.
 */
export const LIST_COUNT = 'font-mono text-xs text-muted-400 text-right tabular-nums';

/**
 * The focus ring, once.
 *
 * `focus-visible` rather than `focus` so a pointer does not leave rings
 * behind it. The utility itself is in `styles.css` and is a box-shadow, so
 * the ring follows a rounded corner and costs no layout.
 */
export const FOCUS_RING = 'outline-none focus-visible:focus-ring';

/**
 * A popover or panel header, and the only treatment either gets.
 *
 * `14-popover-header-too-big` was `MANAGE TAGS` in caps with wide tracking at
 * the size of a screen title, over a list of seven tags. A header inside a
 * panel labels the panel, it does not announce it.
 */
export const PANEL_HEADER = 'text-sm font-medium text-muted-600';

/** The motion budget. Opacity and transform only, and nothing bounces. */
export const MOTION = 'transition-colors duration-150';
export const MOTION_OPACITY = 'transition-opacity duration-150';

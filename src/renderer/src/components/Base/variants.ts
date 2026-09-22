import { cva, type VariantProps } from 'class-variance-authority';
import {
  CONTROL_HEIGHT,
  CONTROL_HEIGHT_DENSE,
  FOCUS_RING,
  ICON_GAP,
  MOTION,
  QUIET_CONTROL_HEIGHT,
} from './geometry';

/**
 * Every styled thing that comes in kinds, as one recipe per thing.
 *
 * These used to be concatenated strings (`BUTTON`, `BUTTON_STRONG`, ...) beside
 * a `BaseButton` that did the same job with a hand-written `switch`, and the
 * two disagreed: one had a danger tone and the other refused to. A recipe
 * names each axis a thing varies on, so a variant is a word at the call site
 * and the classes behind it exist once.
 *
 * Exported as recipes, not only as components, because a few things that
 * must look like a button are not a `<button>`: a Reka trigger, a
 * `RouterLink`. They call the recipe and look the same by construction.
 */

/**
 * A button: what kind of act it is, and how big.
 *
 * **`strong` is the only filled accent there is**, and there is one per
 * region. It is the single action a screen is for; everything else is
 * `default` or `quiet`, which is what makes the filled one mean something.
 *
 * **`danger` is outlined, never filled.** `geometry.ts` refused a danger tone
 * so that one was not easy to reach for, and every destructive button in the
 * app then hand-wrote the same outline (`border-danger text-danger-ink
 * hover:bg-danger/10`) anyway, which is the worst of both. So the tone exists,
 * and it is deliberately the quieter of the two it could have been: a filled
 * red button beside the filled accent is two primaries, and the layout of the
 * trimmer rests on there being exactly one. What keeps a destructive press
 * honest is `useConfirm` and the sentence beside the button, not its colour.
 *
 * **Nothing changes size between states.** No variant touches a border width
 * or a padding on hover, focus or press; `strong` and `quiet` have no border
 * at all rather than a transparent one, so each is exactly as wide as it
 * always was.
 */
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center rounded-md text-sm',
    ICON_GAP,
    FOCUS_RING,
    MOTION,
    'disabled:opacity-50 disabled:pointer-events-none',
  ],
  {
    variants: {
      tone: {
        default: 'border border-line-strong font-medium text-foreground hover:bg-muted-50',
        strong: 'font-medium bg-accent text-accent-fg hover:bg-accent-hover',
        quiet: 'text-muted-600 hover:text-foreground hover:bg-muted-50',
        danger: 'border border-danger font-medium text-danger-ink hover:bg-danger/10',
        /**
         * A button whose job is already done, like a client that is already
         * registered: it still works, and says it has worked.
         */
        success: 'border border-success/40 font-medium text-success hover:bg-success/10',
      },
      /**
       * `md` is the one height controls are (`CONTROL_HEIGHT`). `sm` is a row
       * inside a list, `dense` only inside a toolbar where 36 will not fit.
       */
      size: {
        md: `${CONTROL_HEIGHT} px-3.5`,
        sm: `${QUIET_CONTROL_HEIGHT} px-3`,
        dense: `${CONTROL_HEIGHT_DENSE} px-2.5`,
      },
      /** No label, so the box is square and the glyph sits in its middle. */
      iconOnly: {
        true: 'px-0 shrink-0',
        false: '',
      },
    },
    compoundVariants: [
      // A quiet button is a word you can press, and was always a touch tighter.
      { tone: 'quiet', size: 'md', iconOnly: false, class: 'px-3' },
      /*
       * A glyph on its own needs a firmer ground on hover than a word does,
       * because the ground is the only thing that shows how big the target
       * is. Twenty icon buttons wrote this by hand, in four slightly different
       * greys and three disabled opacities; this is the one they share now.
       */
      { tone: 'quiet', iconOnly: true, class: 'text-muted-500 hover:bg-muted-100' },
      { iconOnly: true, size: 'md', class: 'w-9' },
      { iconOnly: true, size: 'sm', class: 'w-8' },
      { iconOnly: true, size: 'dense', class: 'w-7' },
    ],
    defaultVariants: { tone: 'default', size: 'md', iconOnly: false },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
export type ButtonTone = NonNullable<ButtonVariants['tone']>;
export type ButtonSize = NonNullable<ButtonVariants['size']>;

/**
 * One row of a menu: a glyph, a label, and what pressing it does.
 *
 * Sixteen of these were written out by hand across the clip menu and the batch
 * toolbar, and the destructive ones had drifted to a geometry of their own
 * (`gap-2 px-3 py-2` against everybody else's `gap-2.5 h-[34px] px-2.5`), so
 * Delete sat two pixels off the column every other label formed. A tone is a
 * colour and nothing else, which is what keeps the column.
 *
 * Applied to Reka's own item rather than wrapped in a component: the rows are
 * `MenubarItem` in one menu and `DropdownMenuItem` in the other, and Reka owns
 * their focus, keyboard and dismissal. `data-[highlighted]` is Reka's keyboard
 * cursor, which had no style at all, so arrowing through a menu showed nothing.
 * `data-[disabled]` replaces the `{ 'opacity-50 pointer-events-none': busy }`
 * each row carried: pass `:disabled` and Reka also skips it from the keyboard.
 */
export const menuItemVariants = cva(
  [
    'flex items-center gap-2.5 h-[34px] px-2.5 text-sm rounded-sm outline-hidden cursor-pointer select-none',
    'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
  ],
  {
    variants: {
      tone: {
        default: 'text-foreground hover:bg-muted-100 data-[highlighted]:bg-muted-100',
        /** Undoing something the view is built on, like leaving a collection. */
        accent: 'text-accent-ink hover:bg-muted-100 data-[highlighted]:bg-muted-100',
        danger: 'text-danger-ink hover:bg-danger/8 data-[highlighted]:bg-danger/8',
      },
    },
    defaultVariants: { tone: 'default' },
  },
);

export type MenuItemTone = NonNullable<VariantProps<typeof menuItemVariants>['tone']>;

/**
 * A bordered panel above the page.
 *
 * Six of these across four files were each `rounded-lg border
 * border-border/60` with a padding written beside it, and one of them had
 * drifted to `p-4`. One padding is in use, so there is one, plus `none` for a
 * panel whose rows carry their own.
 */
export const panelVariants = cva('rounded-lg border border-border/60', {
  variants: {
    padding: {
      md: 'px-4 py-3.5',
      none: '',
    },
  },
  defaultVariants: { padding: 'md' },
});

export type PanelVariants = VariantProps<typeof panelVariants>;

/**
 * A small label that sits over a video frame.
 *
 * Fixed in both palettes, like everything over video, because a frame is its
 * own ground: `bg-scrim text-on-video` whatever the theme. Six were written by
 * hand across four files. `numeric` is a length or a count, mono and tabular
 * so it does not breathe as the digits change.
 */
export const chipVariants = cva(
  'inline-flex items-center gap-1 rounded-full bg-scrim px-2 py-0.5 text-[11px] text-on-video',
  {
    variants: {
      numeric: {
        true: 'font-mono tabular-nums',
        false: 'font-medium',
      },
    },
    defaultVariants: { numeric: false },
  },
);

/**
 * An empty state, in its parts: the frame, the glyph, the words, the way out.
 *
 * One recipe per part, handed out together, because the two sizes differ in
 * every part at once and a caller should not be choosing five classes to get
 * one of two looks. `page` is the whole screen; `panel` is one section of a
 * busier screen, drawn in the bordered panel beside it.
 */
const emptyRoot = cva('flex flex-col items-center text-center', {
  variants: {
    size: {
      page: 'justify-center py-20 gap-4',
      panel: 'rounded-lg border border-border/60 px-4 py-8',
    },
  },
});

const emptyIcon = cva('block shrink-0', {
  variants: {
    size: { page: 'size-8', panel: 'size-5 mb-2' },
    tone: { neutral: '', success: 'text-success', warning: 'text-warning' },
  },
  compoundVariants: [
    // A glyph that is only decoration at page size; a panel's is read beside its words.
    { size: 'page', tone: 'neutral', class: 'text-muted-300' },
    { size: 'panel', tone: 'neutral', class: 'text-muted-400' },
  ],
});

const emptyText = cva('', { variants: { size: { page: 'space-y-1', panel: '' } } });

const emptyTitle = cva('text-foreground', {
  variants: { size: { page: 'font-display text-lg font-medium', panel: 'text-sm' } },
});

const emptyDescription = cva('text-sm text-muted-500', {
  variants: { size: { page: 'max-w-md', panel: 'mx-auto mt-1 max-w-[52ch]' } },
});

const emptyActions = cva('flex items-center justify-center gap-2', {
  variants: { size: { page: 'mt-1', panel: 'mt-4' } },
});

export type EmptyStateSize = 'page' | 'panel';
export type EmptyStateTone = 'neutral' | 'success' | 'warning';

export function emptyStateVariants(options: { size: EmptyStateSize; tone: EmptyStateTone }) {
  const { size, tone } = options;
  return {
    root: () => emptyRoot({ size }),
    icon: () => emptyIcon({ size, tone }),
    text: () => emptyText({ size }),
    title: () => emptyTitle({ size }),
    description: () => emptyDescription({ size }),
    actions: () => emptyActions({ size }),
  };
}

/**
 * The dot beside a status line: listening, set up, or in the way.
 *
 * Four copies of `running ? 'bg-success' : 'bg-accent'` across three settings
 * cards, which is a variant written out as a ternary each time. `waiting` is
 * the accent because it is the thing to act on; `blocker` is danger; `quiet` is
 * a finding that is only information.
 */
export const statusDotVariants = cva('size-1.5 rounded-full shrink-0', {
  variants: {
    tone: {
      ok: 'bg-success',
      waiting: 'bg-accent',
      blocker: 'bg-danger',
      quiet: 'bg-muted-300',
    },
  },
  defaultVariants: { tone: 'quiet' },
});

export type StatusDotTone = NonNullable<VariantProps<typeof statusDotVariants>['tone']>;

/** One segment of a wizard's progress bar, reached or not yet. */
export const stepVariants = cva('h-1 flex-1 rounded-full transition-colors', {
  variants: {
    reached: { true: 'bg-accent', false: 'bg-muted-100' },
  },
  defaultVariants: { reached: false },
});

/**
 * A switch, in its two parts. Off, the track is a raised surface with a
 * hairline and the knob is muted; on, the track is the accent's wash with an
 * accent edge and the knob is the accent.
 */
export const switchTrackVariants = cva(
  'absolute left-px h-6 w-11 rounded-full border transition-colors duration-150',
  {
    variants: {
      on: { true: 'bg-accent-sunk border-accent', false: 'bg-muted-100 border-line-strong' },
    },
    defaultVariants: { on: false },
  },
);

export const switchThumbVariants = cva(
  'absolute left-[5px] size-4 rounded-full transition-[transform,background-color] duration-150',
  {
    variants: {
      on: { true: 'translate-x-5 bg-accent', false: 'translate-x-0 bg-muted-400' },
    },
    defaultVariants: { on: false },
  },
);

/**
 * A toolbar button that shows or hides a panel, and stays down while it is
 * shown. Pressed is a ground, not a border, and the transparent border is
 * there at rest too, so the box is the same size in both states.
 */
export const toolbarToggleVariants = cva(
  [
    'h-8 px-2.5 inline-flex items-center gap-2 rounded-md text-xs font-medium border border-transparent',
    FOCUS_RING,
    MOTION,
  ],
  {
    variants: {
      pressed: {
        true: 'bg-muted-200 text-foreground',
        false: 'text-muted-600 hover:bg-muted-100 hover:text-foreground',
      },
    },
    defaultVariants: { pressed: false },
  },
);

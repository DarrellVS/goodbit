import { readonly, ref } from 'vue';

/**
 * Whether the screen has been scrolled away from the top.
 *
 * One flag for the whole window, because the two things that answer it are in
 * different components: the page header lives in the shell, above the
 * scrollport, and the filter row and the collections live inside whatever
 * screen is showing. Both have to shrink at the same instant or the band they
 * form together comes apart while it moves.
 *
 * Module level for the same reason `useClipDetail` is: the shell owns the one
 * element that scrolls and every screen inside it is a child of that element.
 */
const scrolled = ref(false);

/**
 * How far down before the header collapses, and how far back up before it
 * comes back.
 *
 * **Both are small on purpose**: the band should start shrinking on the first
 * notch of the wheel, not half a row of clips later. A wheel notch is about a
 * hundred pixels, so anything above that means the full-size band spends the
 * first scroll pinned over the clips, which is the one arrangement that looks
 * like a mistake.
 *
 * They were 120 and 12 for a while, and that was the wrong fix for a real
 * problem. Collapsing removes height from inside the scrollport and the
 * browser compensates: Chromium's scroll anchoring keeps whatever you were
 * looking at still by moving the scroll position by the same amount, so the
 * state change moved the very number the state is read from. Scrolling back up
 * to near the top, but not to it, expanded the band, anchoring pushed the
 * scroll position back down past the collapse line, and it bounced for as long
 * as you left it there. A gap wider than the band's own height hid it.
 *
 * `overflow-anchor: none` on the scrollport in `ShellLayout` is the fix, and
 * with the compensation gone the loop cannot form at any threshold. So these
 * are back to what the screen wants rather than what the bug needed. The two
 * numbers still differ, because a threshold somebody can sit exactly on is a
 * threshold that flickers.
 */
const COLLAPSE_AT = 12;
const EXPAND_AT = 2;

export function useScrolledPage(): {
  scrolled: Readonly<typeof scrolled>;
  watchScroller: (element: HTMLElement | null) => () => void;
} {
  /**
   * Follow one element's scroll position. Returns the detach.
   *
   * Passive, because this never calls `preventDefault` and a non-passive
   * listener on a scrollport asks the compositor to wait for it on every
   * frame of every scroll.
   */
  function watchScroller(element: HTMLElement | null): () => void {
    if (!element) return () => undefined;

    const read = (): void => {
      const top = element.scrollTop;
      if (!scrolled.value && top > COLLAPSE_AT) scrolled.value = true;
      else if (scrolled.value && top < EXPAND_AT) scrolled.value = false;
    };

    read();
    element.addEventListener('scroll', read, { passive: true });
    return () => element.removeEventListener('scroll', read);
  }

  return { scrolled: readonly(scrolled) as Readonly<typeof scrolled>, watchScroller };
}

import { nextTick, shallowRef, watch, type Ref } from 'vue';
import { useIntersectionObserver } from '@vueuse/core';

interface Options {
  /** A page is in flight. Any page. */
  loading: Ref<boolean> | (() => boolean);
  /** Whether the server has more than what is on screen. */
  hasMore: Ref<boolean> | (() => boolean);
  /** Ask for the next page. */
  load: () => void;
}

/** How far past the bottom of the window still counts as "nearly here". */
const REACH_PX = 800;

/**
 * Ask for the next page while the end of the list is in sight.
 *
 * Returns the element to put at the foot of the list. Three lists use this and
 * each scrolls a different thing: the library scrolls `ShellLayout`'s `main`,
 * the collection layer scrolls its own body, and the editor's clip panel a
 * third element inside an aside. The question is the same in all three, which
 * is why it is one composable: is the foot of the list nearly on screen.
 *
 * Three things took a measurement each to get right.
 *
 * **An `IntersectionObserver` reports crossings, not states.** The sentinel
 * comes into view, one page is fetched, and the sentinel is *still* in view, so
 * no second callback ever arrives: the list settled at ten clips of thirty
 * three with the end of it on screen, and scrolling to the bottom did nothing
 * at all. So the observer is only the edge trigger, and after every page the
 * geometry is read again directly.
 *
 * **But the flag alone cannot drive the fill either.** Answering "is it still
 * in sight" from the observer's last notification fetches the whole library in
 * one go: the notifications are delivered after layout, so between one page and
 * the next the flag is a frame stale and still says yes. `footInSight` measures
 * the element instead, after a tick, so the fill stops exactly when the foot is
 * pushed off the bottom of the window.
 *
 * **The sentinel needs a height.** A zero-area target reports an intersection
 * ratio of zero for ever, so an `h-0` div is never seen. One pixel, pulled back
 * out of the flow with a negative margin, so it cannot move anything.
 *
 * `REACH_PX` is about one row of cards on a 21:9 window, so the next page is
 * usually there by the time the last row is. Waiting for the foot to be
 * properly visible means every page ends in a spinner.
 *
 * **It is not the only way to ask.** Every caller also draws a button, because
 * a list that only grows on scroll cannot be reached from a keyboard and
 * announces nothing to a screen reader.
 */
export function useLoadMoreWhenSeen(options: Options): Ref<HTMLElement | null> {
  const sentinel = shallowRef<HTMLElement | null>(null);

  const read = (value: Ref<boolean> | (() => boolean)): boolean =>
    typeof value === 'function' ? value() : value.value;

  /** Measured, not remembered. See the note above. */
  function footInSight(): boolean {
    const element = sentinel.value;
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    return rect.top < window.innerHeight + REACH_PX && rect.bottom > -REACH_PX;
  }

  async function check(): Promise<void> {
    // A page has just been added to the DOM; let it land before measuring.
    await nextTick();
    if (read(options.loading) || !read(options.hasMore)) return;
    if (!footInSight()) return;
    options.load();
  }

  useIntersectionObserver(sentinel, () => void check(), { rootMargin: `${REACH_PX}px` });

  // And again after every page, because the foot may still be in sight.
  watch(
    () => read(options.loading),
    (busy) => {
      if (!busy) void check();
    },
  );

  return sentinel;
}

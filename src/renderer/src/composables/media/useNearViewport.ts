import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue';

/**
 * Whether an element is on screen or nearly on screen.
 *
 * This exists to keep a thumbnail's *pixels* off the heap while its card stays
 * in the DOM, which is the cheap two thirds of virtualising a list without any
 * of the expensive third.
 *
 * ## The measurement
 *
 * A clip card is a `<video preload="none">` with a 1280 wide poster, and a
 * poster is decoded outside the JS heap: 1280 by 536 at four bytes a pixel is
 * 2.7 MB, and neither the file on disk nor the width of the recording changes
 * that. On a real library, scrolling to the bottom of 266 clips took the app
 * from 445 MB to 1424 MB, of which 895 MB was the renderer and 415 MB the GPU
 * process. Nothing was leaking: every card that had ever been on screen was
 * still holding a decoded picture, because the DOM keeps them and Chromium only
 * evicts under pressure it had not reached yet.
 *
 * ## Why this rather than a virtual list
 *
 * The list cannot easily be virtualised here and the issue says so: the grid is
 * `repeat(auto-fill, minmax(400px, 1fr))`, so the column count is decided by
 * CSS from the container's width and nothing in JavaScript knows it; the
 * grouped view is date headers interleaved with cards rather than a flat array;
 * and a recycled card loses its hover, its focus and its selection.
 *
 * Keeping every card and dropping only the media keeps all of that. The card
 * still has its own box, its own hover, its own place in the grid, and the
 * scroll height stays exact because nothing is removed from the layout.
 *
 * ## Two details
 *
 * **One observer, not one per card.** A thousand observers is a thousand
 * objects Chromium checks on every scroll, which is the cost this is trying to
 * avoid. They all ask the same question at the same margin, so they share an
 * instance and a `WeakMap` from element to flag.
 *
 * **The margin is generous on purpose.** 1200px is about three rows past the
 * edge of the window on a 21:9 screen, so a card is loaded well before it can
 * be seen and released well after it cannot. A tight margin trades memory for
 * grey rectangles during a fast scroll, which is the wrong way round: three
 * rows of slack costs about 25 MB.
 */

/** How far outside the window still counts as near. */
const MARGIN_PX = 1200;

let shared: IntersectionObserver | null = null;
const flags = new WeakMap<Element, Ref<boolean>>();

function observer(): IntersectionObserver {
  if (!shared) {
    shared = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const flag = flags.get(entry.target);
          if (flag) flag.value = entry.isIntersecting;
        }
      },
      { rootMargin: `${MARGIN_PX}px` },
    );
  }
  return shared;
}

export function useNearViewport(target: Ref<Element | null>): Ref<boolean> {
  const near = shallowRef(false);
  let watched: Element | null = null;

  const forget = (): void => {
    if (!watched) return;
    observer().unobserve(watched);
    flags.delete(watched);
    watched = null;
  };

  const stop = watch(
    target,
    (element) => {
      forget();
      if (!element) {
        near.value = false;
        return;
      }
      watched = element;
      flags.set(element, near);
      observer().observe(element);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    stop();
    forget();
  });

  return near;
}

/**
 * How tall a clip card is, measured by whichever ones are rendered.
 *
 * A card that renders nothing still has to occupy exactly what it would have,
 * or the scroll height is a lie. Every card in a given view is the same height
 * by construction, so one number serves all of them, and it is module level
 * because a card that has never rendered has nothing of its own to measure.
 *
 * The starting value is only ever seen for the first frame of the first paint,
 * and is the measured height of a card at the default width.
 */
const CARD_HEIGHT_FALLBACK = 264;
const cardHeight = shallowRef(CARD_HEIGHT_FALLBACK);

export function sharedCardHeight(): Ref<number> {
  return cardHeight;
}

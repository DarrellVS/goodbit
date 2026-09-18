let _savedScrollPosition: number | null = null;

export function saveScrollPosition(): void {
  const target = document.querySelector('main');
  _savedScrollPosition = target?.scrollTop ?? 0;
}

export function restoreScrollPosition(): void {
  const target = document.querySelector('main');
  if (target !== null && _savedScrollPosition !== null) {
    target.scrollTop = _savedScrollPosition;
    _savedScrollPosition = null;
  }
}

/**
 * Where each screen was scrolled to, so leaving one and coming back lands where
 * you left off.
 *
 * Only the clip page used to do this, and only on the way out to a clip. Going
 * to Settings and back put you at the top of the library again, which after
 * scrolling through several weeks of recordings is the whole journey repeated.
 */
const byPath = new Map<string, number>();

export function rememberScrollFor(path: string): void {
  const target = document.querySelector('main');
  if (target) byPath.set(path, target.scrollTop);
}

/**
 * Put a screen back where it was, or leave it at the top.
 *
 * The list is fetched after the route changes, so the page is short for a few
 * frames and an assignment made then would be clamped. It waits for the
 * content to be tall enough to hold the position, and gives up quickly rather
 * than fighting a screen that is genuinely shorter now.
 *
 * **It never assigns a position the content cannot hold**, and that is the
 * whole of the rewrite. The library loads as you scroll, so a remembered
 * offset of 4000px belongs to a list of two hundred cards and the screen you
 * are coming back to has fetched fifty. Assigning it landed at the bottom of
 * the fifty, which the list reads as "you have reached the end" and answers by
 * fetching the next page, whose arrival makes a slightly lower position
 * reachable, which this function was still trying to assign. Between them they
 * walked the whole library back, one page at a time, for somebody who only
 * wanted to be where they were.
 *
 * So the offset is either reachable, in which case it is restored in one
 * assignment, or it is not, in which case the screen stays where a fresh visit
 * would put it. Either way it is forgotten: a position that can never be
 * reached is worse than none, because it keeps being tried.
 */
export function restoreScrollFor(path: string): void {
  const wanted = byPath.get(path);
  if (!wanted) return;

  let framesLeft = 40;
  const settle = (): void => {
    const target = document.querySelector('main');
    if (!target) return;

    if (wanted <= target.scrollHeight - target.clientHeight) {
      target.scrollTop = wanted;
      byPath.delete(path);
      return;
    }

    framesLeft -= 1;
    if (framesLeft > 0) {
      requestAnimationFrame(settle);
      return;
    }

    // Out of reach. Leave the screen at the top and stop remembering it.
    byPath.delete(path);
  };

  requestAnimationFrame(settle);
}

export async function preserveScrollPosition(callback: () => Promise<void>): Promise<void> {
  const target = document.querySelector('main');
  const scrollTop = target?.scrollTop ?? 0;
  await callback();
  // Wait a tick for Vue to flush DOM updates before restoring
  await new Promise(resolve => requestAnimationFrame(resolve));
  if (target) {
    target.scrollTop = scrollTop;
  }
}

export function scrollToTop(element?: HTMLElement | null, behavior: ScrollBehavior = 'smooth'): void {
  const target = element || document.querySelector('main');
  if (target) {
    target.scrollTo({ top: 0, behavior });
  }
}

export function scrollDown(element?: HTMLElement | null, amount: number = 300): void {
  const target = element || document.querySelector('main');
  if (target) {
    target.scrollBy({ top: amount, behavior: 'smooth' });
  }
}

export function scrollUp(element?: HTMLElement | null, amount: number = 300): void {
  const target = element || document.querySelector('main');
  if (target) {
    target.scrollBy({ top: -amount, behavior: 'smooth' });
  }
}


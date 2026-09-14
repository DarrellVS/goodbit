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
 * Put a screen back where it was.
 *
 * The list is fetched after the route changes, so the page is short for a few
 * frames and a single assignment would be clamped to zero. It keeps trying
 * until the content is tall enough to hold the position, and gives up quickly
 * rather than fighting a screen that is genuinely shorter now.
 */
export function restoreScrollFor(path: string): void {
  const wanted = byPath.get(path);
  if (!wanted) return;

  let framesLeft = 40;
  const settle = (): void => {
    const target = document.querySelector('main');
    if (!target) return;

    target.scrollTop = wanted;
    framesLeft -= 1;
    if (Math.abs(target.scrollTop - wanted) > 1 && framesLeft > 0) {
      requestAnimationFrame(settle);
      return;
    }
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


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


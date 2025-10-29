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


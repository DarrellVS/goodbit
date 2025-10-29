import { scrollToTop, scrollDown, scrollUp } from '../utils/scroll';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

export function usePageScroll() {
  function handleScrollToTop(element?: HTMLElement | null): void {
    scrollToTop(element);
  }

  function handleScrollDown(element?: HTMLElement | null): void {
    scrollDown(element);
  }

  function handleScrollUp(element?: HTMLElement | null): void {
    scrollUp(element);
  }

  function setupKeyboardShortcuts(): void {
    useKeyboardShortcuts({
      actions: {
        'scroll-down': () => handleScrollDown(),
        'scroll-up': () => handleScrollUp(),
      },
    });
  }

  return {
    scrollToTop: handleScrollToTop,
    scrollDown: handleScrollDown,
    scrollUp: handleScrollUp,
    setupKeyboardShortcuts,
  };
}


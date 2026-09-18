import { ref, readonly } from 'vue';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
} from '@renderer/components/Base/geometry';

/**
 * Clamp a requested width within the allowed design bounds.
 *
 * Keeps the sidebar wide enough for navigation labels, narrow enough to not
 * overpower content, and reserves at least 300px for the main pane.
 */
export function clampSidebarWidth(width: number, viewportWidth?: number): number {
  const windowWidth = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);
  const maxAvailable = Math.max(MIN_SIDEBAR_WIDTH, windowWidth - 300);
  const upper = Math.min(MAX_SIDEBAR_WIDTH, maxAvailable);
  return Math.round(Math.max(MIN_SIDEBAR_WIDTH, Math.min(upper, width)));
}

/**
 * Module-level state so ShellLayout and Sidebar share the exact same reactive
 * width without prop drilling.
 */
const { public: config } = useConfiguration();
const initialWidth = clampSidebarWidth(config.value.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH);
const sidebarWidth = ref(initialWidth);
const isDragging = ref(false);

export function useSidebarResize() {
  function persistWidth(width: number): void {
    config.value.sidebarWidth = width;
  }

  function setWidth(width: number): void {
    const clamped = clampSidebarWidth(width);
    sidebarWidth.value = clamped;
    persistWidth(clamped);
  }

  function resetWidth(): void {
    setWidth(DEFAULT_SIDEBAR_WIDTH);
  }

  function startResize(e: PointerEvent): void {
    // Only primary mouse button (left click).
    if (e.button !== 0) return;
    e.preventDefault();

    const target = e.currentTarget as HTMLElement | null;
    const pointerId = e.pointerId;
    if (target && target.setPointerCapture) {
      try {
        target.setPointerCapture(pointerId);
      } catch {
        // Ignored if capture is not supported or already active.
      }
    }

    isDragging.value = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth.value;

    const onPointerMove = (moveEvent: PointerEvent): void => {
      const deltaX = moveEvent.clientX - startX;
      sidebarWidth.value = clampSidebarWidth(startWidth + deltaX);
    };

    const onPointerUp = (): void => {
      isDragging.value = false;
      if (target && target.releasePointerCapture) {
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          // Ignored.
        }
      }

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      persistWidth(sidebarWidth.value);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onKeyDown(e: KeyboardEvent): void {
    const step = e.shiftKey ? 16 : 8;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setWidth(sidebarWidth.value - step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setWidth(sidebarWidth.value + step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setWidth(MIN_SIDEBAR_WIDTH);
    } else if (e.key === 'End') {
      e.preventDefault();
      setWidth(MAX_SIDEBAR_WIDTH);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      resetWidth();
    }
  }

  return {
    sidebarWidth: readonly(sidebarWidth),
    isDragging: readonly(isDragging),
    startResize,
    resetWidth,
    setWidth,
    onKeyDown,
    MIN_SIDEBAR_WIDTH,
    MAX_SIDEBAR_WIDTH,
    DEFAULT_SIDEBAR_WIDTH,
  };
}

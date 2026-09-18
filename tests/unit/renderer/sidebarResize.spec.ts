// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  clampSidebarWidth,
  useSidebarResize,
} from '../../../src/renderer/src/composables/ui/useSidebarResize';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
} from '../../../src/renderer/src/components/Base/geometry';

describe('clamping the sidebar width', () => {
  it('keeps the default width within bounds', () => {
    expect(clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH, 1280)).toBe(232);
  });

  it('clamps values below the minimum width to 180px', () => {
    expect(clampSidebarWidth(100, 1280)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(0, 1280)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(-50, 1280)).toBe(MIN_SIDEBAR_WIDTH);
  });

  it('clamps values above the maximum width to 480px on wide screens', () => {
    expect(clampSidebarWidth(600, 1920)).toBe(MAX_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(1000, 1920)).toBe(MAX_SIDEBAR_WIDTH);
  });

  it('reserves at least 300px for the main content on smaller viewports', () => {
    // With 600px viewport, max available is 600 - 300 = 300px.
    expect(clampSidebarWidth(400, 600)).toBe(300);
  });

  it('rounds fractional widths to whole integer pixels', () => {
    expect(clampSidebarWidth(215.4, 1280)).toBe(215);
    expect(clampSidebarWidth(215.6, 1280)).toBe(216);
  });
});

describe('useSidebarResize composable', () => {
  it('provides the current width and bounds', () => {
    const { sidebarWidth, MIN_SIDEBAR_WIDTH: min, MAX_SIDEBAR_WIDTH: max, DEFAULT_SIDEBAR_WIDTH: def } =
      useSidebarResize();
    expect(min).toBe(180);
    expect(max).toBe(480);
    expect(def).toBe(232);
    expect(sidebarWidth.value).toBeGreaterThanOrEqual(min);
    expect(sidebarWidth.value).toBeLessThanOrEqual(max);
  });

  it('resets to default width on resetWidth', () => {
    const { sidebarWidth, setWidth, resetWidth } = useSidebarResize();
    setWidth(300);
    expect(sidebarWidth.value).toBe(300);

    resetWidth();
    expect(sidebarWidth.value).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it('updates width via keyboard arrow navigation', () => {
    const { sidebarWidth, setWidth, onKeyDown } = useSidebarResize();
    setWidth(240);

    // ArrowLeft decreases by 8px
    const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    onKeyDown(leftEvent);
    expect(sidebarWidth.value).toBe(232);

    // ArrowRight with shift increases by 16px
    const shiftRightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true });
    onKeyDown(shiftRightEvent);
    expect(sidebarWidth.value).toBe(248);

    // Home jumps to minimum width
    const homeEvent = new KeyboardEvent('keydown', { key: 'Home' });
    onKeyDown(homeEvent);
    expect(sidebarWidth.value).toBe(MIN_SIDEBAR_WIDTH);

    // End jumps to maximum width
    const endEvent = new KeyboardEvent('keydown', { key: 'End' });
    onKeyDown(endEvent);
    expect(sidebarWidth.value).toBe(MAX_SIDEBAR_WIDTH);

    // Enter resets to default width
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    onKeyDown(enterEvent);
    expect(sidebarWidth.value).toBe(DEFAULT_SIDEBAR_WIDTH);
  });
});

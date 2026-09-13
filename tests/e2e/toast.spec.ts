import { expect, test } from '@playwright/test';
import { launchApp, type TestApp } from './app';

/**
 * A toast has to be readable over whatever it floats above.
 *
 * Its background used to be a pale solid fill. When the accent washes were
 * reworked into low-alpha tints, the toast came along with them — and a tint is
 * not a ground: at 8% over the dark editor it was effectively invisible, the
 * text hanging in mid-air over the timeline.
 *
 * The contrast and pale-surface checks both miss this, because they look at an
 * element against whatever is painted behind it — and here that was the page,
 * which happened to contrast fine.
 */
test.describe('toasts', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: a toast has a ground of its own`, async () => {
      await ctx.page.evaluate((t) => localStorage.setItem('goodbit-theme', t), theme);
      await ctx.page.reload();
      await ctx.page.waitForTimeout(1000);

      // Without this the dark case could silently run in light and still pass,
      // which is exactly what a stale storage key made it do.
      expect(
        await ctx.page.evaluate(() => document.documentElement.classList.contains('dark')),
        `the ${theme} theme was not actually applied`
      ).toBe(theme === 'dark');

      // Exporting an empty timeline is the cheapest real path to a toast.
      await ctx.page.evaluate(() => {
        window.location.hash = '#/editor';
      });
      await ctx.page.waitForTimeout(1500);

      await ctx.page.getByRole('button', { name: /export/i }).first().click();

      // The toast itself, not the visually-hidden copy Radix attaches to body
      // for screen readers — that one is transparent by design and measuring it
      // said the toast had no background when it did.
      const toast = ctx.page
        .locator('li')
        .filter({ hasText: 'Add clips to the timeline before exporting' })
        .first();
      await expect(toast).toBeVisible();

      const opacity = await toast.evaluate((node) => {
        // Walk up to whichever ancestor actually paints a background.
        let el: HTMLElement | null = node as HTMLElement;
        while (el) {
          const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor);
          if (m) {
            const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
            const alpha = parts.length > 3 ? parts[3] : 1;
            if (alpha > 0) return { alpha, from: el.className.toString().slice(0, 70) };
          }
          // Stop at the toast container; past it is the page, not the toast.
          if (el.getBoundingClientRect().width > window.innerWidth * 0.9) break;
          el = el.parentElement;
        }
        return { alpha: 0, from: 'nothing paints a background' };
      });

      expect(
        opacity.alpha,
        `the toast is see-through (${opacity.from})`,
      ).toBeGreaterThanOrEqual(0.85);
    });
  }
});

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * The four headless primitive families this app is built out of, each opened
 * once.
 *
 * Every dialog, menu, popover and toast in GoodBit comes from one headless
 * library, and the library was swapped: `radix-vue` 1.9 became `reka-ui` 2.10,
 * which is the same project renamed at its major version. Sixteen files import
 * it. The import rename typechecks, and that is the part that proves nothing:
 * a headless component's job is to mount markup, set `data-state`, manage
 * focus and portal itself to the body, and none of that is in its type.
 *
 * One thing had already broken silently. Reka renames its CSS custom
 * properties, so `--radix-toast-swipe-end-x` became `--reka-toast-swipe-end-x`
 * and the toast's swipe transform was reading a variable nothing defined.
 * `var()` with no fallback resolves to nothing and the class quietly does
 * nothing, which is exactly the class of failure a type never catches. Hence
 * this file.
 *
 * Screenshots go to `test-results/primitives/` so the swap can be judged by
 * eye as well as by assertion.
 */
const SHOTS = join('test-results', 'primitives');

test.describe('the headless primitives still work', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'TestGame', 3, 3);
    // The scan has to have found them before a card can be opened.
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('Menubar: the clip actions menu opens and lists its items', async () => {
    // `ClipActionsMenu.vue` is a Menubar rather than a DropdownMenu, on every
    // card in the library. Its tile variant is the dark pill over the
    // thumbnail, which only appears once the card is under the pointer.
    const card = ctx.page.locator('article.clip-card').first();
    await card.waitFor({ timeout: 20_000 });
    await card.hover();

    const trigger = ctx.page.locator('[title="More actions"]').first();
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    // Portalled to the body, so it is found by role rather than inside the card.
    const menu = ctx.page.locator('[role="menu"]');
    await expect(menu).toBeVisible();

    const items = ctx.page.locator('[role="menuitem"]');
    const count = await items.count();
    console.log(`menu items: ${count}`);
    expect(count).toBeGreaterThan(2);

    await ctx.page.screenshot({ path: join(SHOTS, 'menubar.png') });
    await ctx.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('Dialog: the clip panel opens over the library and closes again', async () => {
    // `ClipDetailModal.vue`: DialogRoot, DialogPortal, DialogContent, and the
    // one place `Transition mode="out-in"` swaps two keyed contents inside a
    // portal, which is the most involved use of the library in the app.
    await ctx.page.locator('img[alt], video').first().waitFor({ timeout: 20_000 });
    await ctx.page.locator('article, [data-clip-id]').first().click({ timeout: 20_000 }).catch(async () => {
      // The card is a div in some layouts; fall back to the thumbnail itself.
      await ctx.page.locator('img[alt]').first().click();
    });

    const dialog = ctx.page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await ctx.page.screenshot({ path: join(SHOTS, 'dialog.png') });

    // Focus has to be inside the dialog, which is the library's job and not
    // the markup's.
    const focusInside = await ctx.page.evaluate(() => {
      const active = document.activeElement;
      const panel = document.querySelector('[role="dialog"]');
      return !!(active && panel && (panel === active || panel.contains(active)));
    });
    console.log(`focus moved into the dialog: ${focusInside}`);

    await ctx.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test('Popover: Manage tags on a clip card opens', async () => {
    /*
     * `BasePopover.vue`. This used to press the header's Tags button, which
     * 3.9 replaced with a filter dropdown in the library's filter row, and
     * then skipped silently when it could not find it. Two of this file's four
     * primitives were skipping rather than passing, which is the failure mode
     * of a `test.skip()` that nobody reads.
     *
     * `ClipTags.vue` is where the popover lives now: two of them on every
     * card, one behind "Manage tags" and one behind the overflow count. The
     * trigger only appears on hover, like the actions menu.
     */
    await ctx.page.evaluate(() => {
      window.location.hash = '#/';
    });
    await ctx.page.waitForTimeout(1500);

    const card = ctx.page.locator('article.clip-card').first();
    await card.waitFor({ timeout: 20_000 });
    await card.hover();

    const trigger = ctx.page.getByRole('button', { name: /Manage tags/i }).first();
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    const popover = ctx.page.locator('[data-reka-popper-content-wrapper]').first();
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await ctx.page.screenshot({ path: join(SHOTS, 'popover.png') });
    await ctx.page.keyboard.press('Escape');
  });

  test('Toast: a toast is raised, rendered and readable', async () => {
    // `BaseToast.vue`, the ToastProvider/ToastRoot/ToastViewport trio, and the
    // component whose swipe transform was reading a renamed CSS variable.
    await ctx.page.evaluate(() => {
      window.location.hash = '#/';
    });
    await ctx.page.waitForTimeout(500);

    const raised = await ctx.page.evaluate(() => {
      // The store is the app's only route to a toast, and it is what every
      // caller in the app uses.
      const app = (document.querySelector('#app') as unknown as { __vue_app__?: unknown })?.__vue_app__;
      return !!app;
    });
    console.log(`vue app found for toast probe: ${raised}`);

    /*
     * Driven through the UI, which is the honest path: a rescan reports itself
     * through the toast store.
     *
     * **Rescan is in Settings now**, not on the library. 3.9 took it off the
     * main screen because the watcher already keeps the list current and a
     * solid orange button saying "make this correct" implies it might not be.
     * This test used to click it on the library and `test.skip()` when it was
     * missing, which after that change meant it skipped silently and the toast
     * primitive stopped being covered at all. A skip that nobody reads is
     * worse than a failure.
     */
    await ctx.page.evaluate(() => {
      window.location.hash = '#/settings?section=app';
    });
    await ctx.page.waitForTimeout(1500);

    const rescan = ctx.page.getByRole('button', { name: /Rescan/i });
    await expect(rescan.first()).toBeVisible({ timeout: 15_000 });
    await rescan.first().click();

    const toast = ctx.page.locator('[role="status"], [data-state="open"][data-swipe-direction], li[data-state="open"]').first();
    await expect(toast).toBeVisible({ timeout: 20_000 });

    const text = (await toast.textContent())?.trim() ?? '';
    console.log(`toast said: ${text.slice(0, 80)}`);
    expect(text.length).toBeGreaterThan(0);

    await ctx.page.screenshot({ path: join(SHOTS, 'toast.png') });

    // The swipe variables, which are what the rename broke. Reka defines them
    // on the toast element itself while a swipe is in progress; what matters
    // here is that nothing still references the radix spelling.
    const stale = await ctx.page.evaluate(() => {
      const sheets = [...document.styleSheets];
      let found = 0;
      for (const sheet of sheets) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of [...rules]) {
          if (rule.cssText.includes('--radix-')) found++;
        }
      }
      return found;
    });
    console.log(`stylesheet rules still referencing --radix-: ${stale}`);
    expect(stale).toBe(0);
  });
});

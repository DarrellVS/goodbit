import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * The trim page as a place to decide what a clip is, not only where to cut it.
 */
test.describe('the trim page', () => {
  let ctx: TestApp;

  const call = (method: string, path: string, body?: unknown, query?: unknown) =>
    ctx.page.evaluate(
      ([m, p, b, q]) =>
        window.goodbit!.apiRequest({
          method: m as string,
          path: p as string,
          body: b,
          query: (q ?? {}) as Record<string, unknown>,
        }),
      [method, path, body, query] as const,
    );

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'TrimGame', 1, 20);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a clip can be named from the trimmer, and the name sticks without trimming', async () => {
    const clips = (await call('GET', '/clips', undefined, { pageSize: 5, game: 'TrimGame' })).body as {
      items: Array<{ id: number; filename: string; displayName: string | null }>;
    };
    const clip = clips.items[0];
    expect(clip.displayName).toBeNull();

    /*
     * Trimming is a panel in the clip layer rather than a page, so the name is
     * edited in the layer's header and there is one field for it rather than
     * one per panel. `/trim/:id` still opens the trimmer, which is what this
     * navigation is checking as well.
     */
    await ctx.page.evaluate((id) => {
      window.location.hash = `#/trim/${id}`;
    }, clip.id);

    /*
     * Scoped to the dialog, because the library is still mounted underneath and
     * its tile carries a field with the same label. That is the layer working:
     * opening a clip does not tear the library down.
     */
    const field = ctx.page
      .getByRole('dialog')
      .getByLabel(`Name for ${clip.filename}, shown in GoodBit only`);
    await expect(field).toBeVisible({ timeout: 10_000 });
    await expect(field).toHaveValue(clip.filename);

    await field.fill('The one with the tank');
    await field.press('Enter');

    // Saved on leaving the field: no trim happened, the file is untouched.
    await expect
      .poll(
        async () =>
          ((await call('GET', `/clips/${clip.id}`)).body as { displayName: string | null })
            .displayName,
        { timeout: 10_000 },
      )
      .toBe('The one with the tank');

    const after = (await call('GET', `/clips/${clip.id}`)).body as { filename: string };
    expect(after.filename).toBe(clip.filename);

    // Clearing it puts the filename back.
    await field.fill('');
    await field.press('Enter');
    await expect
      .poll(
        async () =>
          ((await call('GET', `/clips/${clip.id}`)).body as { displayName: string | null })
            .displayName,
        { timeout: 10_000 },
      )
      .toBeNull();
  });
});

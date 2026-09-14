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

  test('a clip can be named right there, and the name sticks without trimming', async () => {
    const clips = (await call('GET', '/clips', undefined, { pageSize: 5, game: 'TrimGame' })).body as {
      items: Array<{ id: number; filename: string; displayName: string | null }>;
    };
    const clip = clips.items[0];
    expect(clip.displayName).toBeNull();

    await ctx.page.evaluate((id) => {
      window.location.hash = `#/trim/${id}`;
    }, clip.id);

    const field = ctx.page.getByLabel('Clip name');
    await expect(field).toBeVisible({ timeout: 10_000 });
    // With no name, the filename is the placeholder rather than the value,
    // so typing does not mean editing a filename.
    await expect(field).toHaveAttribute('placeholder', clip.filename);
    await expect(field).toHaveValue('');

    await field.fill('The one with the tank');
    await field.press('Enter');

    await expect(ctx.page.locator('li').filter({ hasText: 'Named "The one with the tank"' })).toBeVisible();

    // Saved on leaving the field: no trim happened, the file is untouched.
    const after = (await call('GET', `/clips/${clip.id}`)).body as {
      displayName: string | null;
      filename: string;
    };
    expect(after.displayName).toBe('The one with the tank');
    expect(after.filename).toBe(clip.filename);

    // Clearing it puts the filename back.
    await field.fill('');
    await field.press('Enter');
    await expect(ctx.page.locator('li').filter({ hasText: 'Name cleared' })).toBeVisible();
    const cleared = (await call('GET', `/clips/${clip.id}`)).body as { displayName: string | null };
    expect(cleared.displayName).toBeNull();
  });
});

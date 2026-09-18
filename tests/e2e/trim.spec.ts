import { existsSync } from 'node:fs';
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
    // Three short ones to delete, in a folder of their own. The prune guard
    // refuses a sweep that would remove more than half the library, so the
    // deleting tests need more clips than they delete.
    seedClips(ctx.videosRoot, 'BinGame', 3, 2);
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

  /**
   * Deciding a recording is worth nothing, on the screen built for deciding
   * what part of it is worth keeping.
   *
   * The trimmer is where a clip is watched end to end, so "none of it" is one
   * of the answers that watching produces, and until now it was the only
   * answer the screen could not act on.
   */
  const binClip = async (index: number) => {
    const clips = (await call('GET', '/clips', undefined, { pageSize: 20, game: 'BinGame' }))
      .body as { items: Array<{ id: number; filename: string; filePath: string }> };
    // By name, not by position: these are seeded in the same second, so the
    // library's own ordering between them is not something to lean on, and a
    // test that deletes the wrong clip still passes.
    const wanted = clips.items.find((item) => item.filename === `BinGame_clip_${index}.mp4`);
    expect(wanted, `BinGame_clip_${index}.mp4 is in the library`).toBeTruthy();
    return wanted!;
  };

  const openTrimmer = async (id: number) => {
    await ctx.page.evaluate((clipId) => {
      window.location.hash = `#/trim/${clipId}`;
    }, id);
    const panel = ctx.page.getByRole('dialog');
    await expect(panel.getByRole('button', { name: 'Delete Clip' })).toBeVisible({
      timeout: 10_000,
    });
    return panel;
  };

  test('the trimmer asks before it deletes, and cancelling changes nothing', async () => {
    const clip = await binClip(0);
    const panel = await openTrimmer(clip.id);

    await panel.getByRole('button', { name: 'Delete Clip' }).click();

    /*
     * A question, in a dialog, naming the clip. Not a toast: a toast for this
     * would sit over the button that was just pressed and answer "no" on the
     * user's behalf when its timer ran out.
     */
    const question = ctx.page.getByRole('alertdialog');
    await expect(question).toBeVisible();
    await expect(question).toHaveAttribute('aria-label', `Delete ${clip.filename}?`);

    // What it promises, and what it warns about, are different halves and both
    // are said. The file comes back out of the bin; the row does not.
    await expect(question).toContainText('Recycle Bin');

    await question.getByRole('button', { name: 'Cancel' }).click();
    await expect(question).toBeHidden();

    /*
     * A pause, and it is the assertion.
     *
     * The question teleports to `body`, so every press inside it is a press
     * outside the Reka dialog underneath, and a modal Reka dialog dismisses
     * itself on a pointer down outside its own content. It did: the trimmer
     * shut about two tenths of a second after either button, which is late
     * enough that a `toBeVisible` taken straight after the click passes on its
     * first try and sees nothing wrong. `BaseConfirmDialog` stops `pointerdown`
     * at its own overlay now, the same defect the Escape handler there already
     * covered, one input along.
     */
    await ctx.page.waitForTimeout(1500);
    await expect(panel.getByRole('button', { name: 'Delete Clip' })).toBeVisible();

    // Still in the library, still on disk.
    expect((await call('GET', `/clips/${clip.id}`)).status).toBe(200);
    expect(existsSync(clip.filePath)).toBe(true);
  });

  test('and Escape over the question answers the question, not the trimmer', async () => {
    const clip = await binClip(2);
    const panel = await openTrimmer(clip.id);

    await panel.getByRole('button', { name: 'Delete Clip' }).click();
    const question = ctx.page.getByRole('alertdialog');
    await expect(question).toBeVisible();

    await ctx.page.keyboard.press('Escape');
    await expect(question).toBeHidden();

    // The panel closes itself on Escape from a listener on `document`, so one
    // press used to cancel the question and shut the clip somebody was working
    // on. The question catches it on `window`, in the capture phase.
    await ctx.page.waitForTimeout(1000);
    await expect(panel.getByRole('button', { name: 'Delete Clip' })).toBeVisible();
    expect((await call('GET', `/clips/${clip.id}`)).status).toBe(200);
  });

  test('the question names the marks, which are the part the bin cannot give back', async () => {
    const clip = await binClip(1);

    const made = (
      await call('POST', `/clips/${clip.id}/goodbits`, {
        startSec: 0.2,
        endSec: 0.8,
        name: 'the one',
      })
    ).body as { id: number };
    expect(made.id).toBeGreaterThan(0);

    const panel = await openTrimmer(clip.id);
    // The panel reads its marks on mount, and the question is built from what
    // it has: asking before they land would be asking a different question.
    await expect(panel.getByText('the one')).toBeVisible({ timeout: 10_000 });

    await panel.getByRole('button', { name: 'Delete Clip' }).click();

    const question = ctx.page.getByRole('alertdialog');
    await expect(question).toContainText('1 mark live only in GoodBit');

    await question.getByRole('button', { name: 'Cancel' }).click();
    expect((await call('GET', `/clips/${clip.id}`)).status).toBe(200);
  });

  test('confirming moves the file out of the library and closes the trimmer', async () => {
    const clip = await binClip(0);
    const panel = await openTrimmer(clip.id);

    await panel.getByRole('button', { name: 'Delete Clip' }).click();
    await ctx.page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

    // The panel is showing a clip that no longer exists, so it goes.
    await expect(panel).toBeHidden({ timeout: 10_000 });

    await expect
      .poll(async () => (await call('GET', `/clips/${clip.id}`)).status, { timeout: 10_000 })
      .toBe(404);

    // Moved, not unlinked: gone from where it was, and the Recycle Bin has it.
    expect(existsSync(clip.filePath)).toBe(false);
  });
});

import { expect, test } from '@playwright/test';
import { launchApp, seedClips, seedSpikyClip, type TestApp } from './app';

/**
 * The path from "a day of clips" to "a montage": the library hands a whole day
 * to the editor in recording order, and the editor trims each clip down to the
 * moment its sound spikes.
 */
test.describe('a day, edited', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    // Long enough that a ten-second highlight window is a real cut rather than
    // the whole clip. Two flat clips the analysis should refuse, and one with
    // something in it.
    seedClips(ctx.videosRoot, 'DayGame', 2, 26);
    seedSpikyClip(ctx.videosRoot, 'DayGame');
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  async function editTheDay(): Promise<number[]> {
    await ctx.page.evaluate(() => {
      window.location.hash = '#/';
    });
    await ctx.page.waitForTimeout(1500);

    // Renamed from "Edit day", which read as "edit the date" beside a heading
    // that shows one.
    await ctx.page.getByRole('button', { name: /open this day in the editor/i }).first().click();
    await ctx.page.waitForTimeout(3000);

    const url = await ctx.page.evaluate(() => window.location.hash);
    expect(url).toContain('/editor?clips=');
    return decodeURIComponent(url.split('clips=')[1]).split(',').map(Number);
  }

  test('opening a day sends the whole day to the editor, oldest first', async () => {
    const ids = await editTheDay();
    expect(ids.length).toBe(3);

    // The library lists newest first; the timeline has to be the other way up.
    const order = await ctx.page.evaluate(async (wanted: number[]) => {
      const answers = await Promise.all(
        wanted.map((id) => window.goodbit!.apiRequest({ method: 'GET', path: `/clips/${id}` })),
      );
      return answers.map((a) => (a.body as { createdAt?: string }).createdAt ?? '');
    }, ids);

    expect([...order].sort()).toEqual(order);
  });

  test('the analysis finds the loud moment and the lane gets shorter', async () => {
    await editTheDay();

    const readClock = () => ctx.page.locator('div.text-sm.font-mono').first().innerText();
    // The transport's own readout: "0:00.00 / 1:18.00". The per-clip figures
    // in the properties panel share the font and would not move.
    const before = await readClock();

    await ctx.page.getByTitle(/trim every clip/i).click();

    // One ffmpeg listen per clip, four at a time.
    const toast = ctx.page.locator('li').filter({ hasText: /good bit/i }).first();
    await expect(toast).toBeVisible({ timeout: 30_000 });

    // Two of the three clips are a constant tone, which the analysis is built
    // to refuse, so this also asserts it leaves those alone rather than
    // cutting them at random.
    await expect(toast).toContainText(/Trimmed 1 clip to the good bit/);
    await expect(toast).toContainText(/2 left alone/);

    // And it has to say why it cut, not just how many. Reporting a count alone
    // gave nobody any basis for trusting the app's headline trick.
    await expect(toast).toContainText(/Kept \d+:\d\d to \d+:\d\d/);

    expect(await readClock(), 'the timeline should be shorter after trimming').not.toBe(before);
  });
});

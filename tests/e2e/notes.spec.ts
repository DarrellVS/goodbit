import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * Notes, read as well as written, and the timestamp chip.
 *
 * Two reasons this exists rather than a unit test. `@vue/test-utils` is not a
 * dependency, so an SFC cannot be mounted in the unit suite and the read mode
 * is only reachable by driving the app. And the chip has **never rendered**:
 * `MarkdownPreview.vue`'s whole scoped style block was written as
 * `:deep(.markdown-preview p)`, which compiles to
 * `[data-v-hash] .markdown-preview p` and therefore asks for that class
 * *inside* the scoped root, while the root is the element carrying it. Nothing
 * matched, and nobody noticed because the working copy of those rules lived in
 * `NotesDisplay.vue`, where `.prose` really was a child, and that component
 * became dead code.
 *
 * So there is no old screenshot to compare against, and the assertions here are
 * about computed style rather than about markup: that the chip is a pill, that
 * it is not the same colour as the prose around it, and that pressing it moves
 * the player.
 *
 * Screenshots go to `test-results/notes/`.
 */
const SHOTS = join('test-results', 'notes');

test.describe('notes', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'TestGame', 1, 20);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  /** Open the clip panel, which is where notes live. */
  async function openClip(): Promise<void> {
    const card = ctx.page.locator('article.clip-card').first();
    await card.waitFor({ timeout: 20_000 });
    await card.click();
    await expect(ctx.page.getByRole('dialog').first()).toBeVisible({ timeout: 15_000 });
  }

  test('a note is written, saved, and then read as rendered prose', async () => {
    await openClip();

    const dialog = ctx.page.getByRole('dialog').first();

    // A clip with no note shows an empty state, not a textarea. That is the
    // point of the read mode: a note nobody is editing shows no controls.
    await expect(dialog.getByText('No notes yet', { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await dialog.getByRole('button', { name: /Write a note/i }).click();

    const textarea = dialog.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // The sentence from the brainstorm, because it is how a note really gets
    // written: a timestamp in the middle of a thought.
    await textarea.fill('**shit at 0:04** is hilarious, and 0:12 is worse');
    await ctx.page.screenshot({ path: join(SHOTS, 'editing.png') });

    await dialog.getByRole('button', { name: /Save notes/i }).click();
    await ctx.page.waitForTimeout(1500);

    // Read mode: the markdown is rendered, so the bold is a <strong> and the
    // textarea has gone.
    const rendered = dialog.locator('.markdown-preview').first();
    await expect(rendered).toBeVisible({ timeout: 10_000 });
    await expect(rendered.locator('strong')).toHaveText('shit at 0:04');

    const chips = rendered.locator('.timestamp-link');
    await expect(chips).toHaveCount(2);

    await ctx.page.screenshot({ path: join(SHOTS, 'reading.png') });

    /*
     * The chip has to look like a chip.
     *
     * Asserted as computed style rather than as a class list, because the
     * defect being guarded against is a rule that exists and does not apply.
     * A class list would have passed the whole time it was broken.
     */
    const chip = chips.first();
    const style = await chip.evaluate((element) => {
      const computed = getComputedStyle(element);
      const prose = getComputedStyle(element.closest('.markdown-preview')!);
      return {
        radius: computed.borderTopLeftRadius,
        background: computed.backgroundColor,
        colour: computed.color,
        proseColour: prose.color,
        display: computed.display,
        cursor: computed.cursor,
        seconds: element.getAttribute('data-seconds'),
      };
    });

    console.log(`chip: ${JSON.stringify(style)}`);

    // A pill, not a rectangle. 9999px, or whatever rounded-full computes to.
    expect(parseFloat(style.radius)).toBeGreaterThan(8);
    // Something behind it, which is the rule that never used to apply.
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
    // And not the same colour as the sentence around it.
    expect(style.colour).not.toBe(style.proseColour);
    expect(style.display).toContain('flex');
    expect(style.cursor).toBe('pointer');
    expect(style.seconds).toBe('4');
  });

  test('pressing a chip moves the player', async () => {
    const dialog = ctx.page.getByRole('dialog').first();
    const video = dialog.locator('video').first();
    await expect(video).toBeVisible({ timeout: 10_000 });

    await video.evaluate((element: HTMLVideoElement) => {
      element.currentTime = 0;
      element.pause();
    });

    await dialog.locator('.timestamp-link').nth(1).click();
    await ctx.page.waitForTimeout(1200);

    const at = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
    console.log(`player moved to ${at.toFixed(2)}s`);

    // 0:12 is the second chip. Seeking is not exact on a keyframe boundary, so
    // this asks that it went to roughly the right place rather than exactly.
    expect(at).toBeGreaterThan(9);
    expect(at).toBeLessThan(15);
  });

  test('clicking the prose hands back the textarea', async () => {
    const dialog = ctx.page.getByRole('dialog').first();

    /*
     * Deliberately at the very start of the paragraph.
     *
     * A chip stops its own click and seeks instead, which is correct and is
     * what a click in the middle of this sentence hits: the first attempt at
     * this test aimed at x=300 and landed on the 0:12 chip, so the player
     * moved and the textarea never came back. x=5 is the first character.
     */
    await dialog.locator('.markdown-preview p').first().click({ position: { x: 5, y: 8 } });

    await expect(dialog.locator('textarea').first()).toBeVisible({ timeout: 10_000 });
    await ctx.page.screenshot({ path: join(SHOTS, 'back-to-editing.png') });

    // Nothing was changed, so the way out is Done rather than Save.
    await expect(dialog.getByRole('button', { name: /^Done$/i })).toBeVisible();
  });

  test('the styled block quote and code rules apply too', async () => {
    // The same scoped-style defect hid every rule in that block, not only the
    // chip, and one of them was `bg-gray-900 text-muted-100` on `pre`, which
    // would have been near-black on near-black in dark mode the moment it
    // started working.
    const dialog = ctx.page.getByRole('dialog').first();

    // Whichever mode the previous test left it in, ask for the editor.
    const textarea = dialog.locator('textarea').first();
    if (!(await textarea.isVisible())) {
      await dialog.getByRole('button', { name: /^Edit$/i }).click();
    }
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill('# A heading\n\n`inline code`\n\n```\na block\n```\n\n> a quote');
    await dialog.getByRole('button', { name: /Save notes/i }).click();
    await ctx.page.waitForTimeout(1500);

    const rendered = dialog.locator('.markdown-preview').first();
    const sizes = await rendered.evaluate((element) => {
      const of = (selector: string): string | null => {
        const found = element.querySelector(selector);
        return found ? getComputedStyle(found).fontSize : null;
      };
      const pre = element.querySelector('pre');
      return {
        heading: of('h1'),
        paragraph: of('p'),
        preBackground: pre ? getComputedStyle(pre).backgroundColor : null,
        preColour: pre ? getComputedStyle(pre).color : null,
      };
    });

    console.log(`markdown styles: ${JSON.stringify(sizes)}`);
    await ctx.page.screenshot({ path: join(SHOTS, 'markdown.png') });

    // A heading that is not the same size as body text means the rules paint.
    expect(sizes.heading).not.toBe(sizes.paragraph);
    expect(sizes.preBackground).not.toBe(sizes.preColour);
  });
});

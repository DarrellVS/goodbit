import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';
import {
  assertParserWorks,
  collectTextRuns,
  contrast,
  excused,
  floorFor,
  FREEZE_CSS,
} from './contrast';

/**
 * Every screen, in both palettes.
 *
 * The dark-mode work shipped visibly broken, unreadable text on unreadable
 * ground, while typecheck, build and the CSS itself were all correct. Nothing
 * that existed could see the result. These walk the app and assert that what is
 * drawn is actually legible, which is the only check that would have caught it.
 *
 * The measuring is in `./contrast.ts`, along with the story of why it is worth
 * a file of its own.
 */

const ROUTES = [
  { hash: '#/', name: 'library' },
  { hash: '#/today', name: 'today' },
  { hash: '#/stats', name: 'stats' },
  { hash: '#/tag-patterns', name: 'tag-patterns' },
  { hash: '#/storage', name: 'storage' },
  { hash: '#/publisher', name: 'publisher' },
  /*
   * All six settings sections, by their real names.
   *
   * This walked `general`, `games`, `playback` and `advanced`. 3.11 renamed the
   * sections, and those four still *resolve*, because old links are aliased so
   * somebody's muscle memory and a bench script keep working. So this would
   * have gone on passing while three of its four visits landed on the same
   * page, and `editing`, `data` and `connections` were never painted at all.
   *
   * An alias that keeps a test green while it stops testing anything is worse
   * than a broken link, which at least says so.
   */
  { hash: '#/settings?section=recording', name: 'settings-recording' },
  { hash: '#/settings?section=watching', name: 'settings-watching' },
  { hash: '#/settings?section=editing', name: 'settings-editing' },
  { hash: '#/settings?section=data', name: 'settings-data' },
  { hash: '#/settings?section=connections', name: 'settings-connections' },
  { hash: '#/settings?section=advanced', name: 'settings-advanced' },
  { hash: '#/editor', name: 'editor' },
];

test.describe('every screen, in both palettes', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'TestGame', 3);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: text is readable against its own background`, async () => {
      // Set the stored preference and reload, rather than toggling the class by
      // hand: the app applies the theme itself from that value, and a class
      // added from outside is clobbered the next time it does.
      await ctx.page.evaluate((t) => localStorage.setItem('goodbit-theme', t), theme);
      await ctx.page.reload();
      await ctx.page.waitForTimeout(1200);

      const applied = await ctx.page.evaluate(() =>
        document.documentElement.classList.contains('dark'),
      );
      expect(applied, `the ${theme} theme was not actually applied`).toBe(theme === 'dark');

      // Nothing may be caught mid-transition while its colour is being read.
      await ctx.page.addStyleTag({ content: FREEZE_CSS });

      const problems: string[] = [];
      let measured = 0;
      let skipped = 0;

      for (const route of ROUTES) {
        await ctx.page.evaluate((h) => {
          window.location.hash = h;
        }, route.hash);
        await ctx.page.waitForTimeout(700);
        await ctx.page.addStyleTag({ content: FREEZE_CSS });

        await ctx.page.screenshot({
          path: `test-results/screens/${theme}-${route.name}.png`,
          fullPage: false,
        });

        const runs = await ctx.page.evaluate(collectTextRuns);

        // Before believing a single number below: prove the thing that
        // produced them can still read a colour.
        assertParserWorks(runs);

        for (const run of runs) {
          if (excused(run)) {
            skipped++;
            continue;
          }
          measured++;

          const ratio = contrast(run.fg, run.bg);
          const floor = floorFor(run);
          if (ratio < floor) {
            problems.push(
              `${route.name}: "${run.text}" ${ratio.toFixed(2)}:1, wanted ${floor}:1 ` +
                `[${run.large ? 'large' : 'body'}] ` +
                `fg rgb(${run.fg.map(Math.round)}) on bg rgb(${run.bg.map(Math.round)}) ` +
                `at ${run.where}`,
            );
          }
        }
      }

      // A walk that found almost nothing is a walk that went wrong, and it
      // would report an empty problem list either way.
      expect(measured, `only ${measured} text runs were measured across every screen`)
        .toBeGreaterThan(200);
      console.log(`${theme}: measured ${measured} text runs, excused ${skipped}`);

      expect(
        problems,
        `Text below the contrast floor in ${theme}:\n${problems.join('\n')}`,
      ).toEqual([]);
    });
  }

  /**
   * Nothing moves when you point at it.
   *
   * A card that grows on hover, a row whose label shifts by a pixel when it
   * becomes active, a button that gains a border only when focused: each is
   * invisible in a screenshot and obvious the moment a pointer crosses the
   * screen. The rule is that a box may change colour, never size.
   *
   * Deliberate expansions are exempt by name. A disclosure is supposed to
   * grow; that is the whole of what it does.
   */
  const ALLOWED_TO_GROW = /(^|\s)(group\/disclosure|allow-grow)(\s|$)/;

  for (const theme of ['dark'] as const) {
    test(`${theme}: nothing changes size on hover or focus`, async () => {
      await ctx.page.evaluate((t) => localStorage.setItem('goodbit-theme', t), theme);
      await ctx.page.reload();
      await ctx.page.waitForTimeout(1200);
      await ctx.page.addStyleTag({ content: FREEZE_CSS });

      const problems: string[] = [];

      for (const route of ROUTES) {
        await ctx.page.evaluate((h) => {
          window.location.hash = h;
        }, route.hash);
        await ctx.page.waitForTimeout(700);
        await ctx.page.addStyleTag({ content: FREEZE_CSS });

        // Controls, and the containers the contract names beside them: a
        // card, a list row, a group header, a chip, a tile. The card was the
        // one the review actually caught (`13-card-hover-height-jump`), and
        // it is an `<article>`, so a selector for buttons alone would miss
        // the single example the rule was written for.
        const targets = await ctx.page
          .locator(
            'button:visible, a[href]:visible, [role="button"]:visible, ' +
              'article:visible, li:visible, [role="row"]:visible, [role="option"]:visible',
          )
          .all();

        for (const target of targets.slice(0, 40)) {
          const before = await target.boundingBox();
          if (!before || before.width < 4 || before.height < 4) continue;

          const className = (await target.getAttribute('class')) ?? '';
          if (ALLOWED_TO_GROW.test(className)) continue;

          // Hovering the element itself, then whatever contains it, because a
          // card reveals its actions from the card's own `group` rather than
          // from the button that appears.
          await target.hover({ force: true, timeout: 2000 }).catch(() => undefined);
          await ctx.page.waitForTimeout(120);
          const hovered = await target.boundingBox();

          await target.focus({ timeout: 2000 }).catch(() => undefined);
          await ctx.page.waitForTimeout(120);
          const focused = await target.boundingBox();

          for (const [state, after] of [
            ['hover', hovered],
            ['focus', focused],
          ] as const) {
            if (!after) continue;
            const dw = Math.abs(after.width - before.width);
            const dh = Math.abs(after.height - before.height);
            if (dw > 1 || dh > 1) {
              const text = ((await target.textContent()) ?? '').trim().slice(0, 30);
              problems.push(
                `${route.name}: "${text}" grows on ${state} by ${dw.toFixed(1)}x${dh.toFixed(1)}px ` +
                  `(${before.width.toFixed(1)}x${before.height.toFixed(1)} to ` +
                  `${after.width.toFixed(1)}x${after.height.toFixed(1)}) ` +
                  `class="${className.slice(0, 70)}"`,
              );
            }
          }
        }
      }

      expect(problems, `Layout shifts on state change:\n${problems.join('\n')}`).toEqual([]);
    });
  }
});

/**
 * The window is the viewport; only panes scroll.
 *
 * A long games list grew the sidebar past the window instead of scrolling
 * inside it, so the page itself picked up a second scrollbar next to the
 * content one. Invisible to every other check. The markup was valid and
 * nothing errored.
 */
test.describe('layout', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    // Enough games that the sidebar list is taller than the window.
    for (let i = 0; i < 14; i++) seedClips(ctx.videosRoot, `Game${i}`, 1);
    await ctx.page.waitForTimeout(10000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('the page itself never scrolls', async () => {
    await ctx.page.evaluate(() => {
      window.location.hash = '#/';
    });
    await ctx.page.waitForTimeout(2500);

    const overflow = await ctx.page.evaluate(() => ({
      body: document.body.scrollHeight - document.body.clientHeight,
      root: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      // The sidebar must be no taller than the window it sits in.
      sidebarOverflow: (() => {
        const aside = document.querySelector('aside');
        if (!aside) return 0;
        return Math.round(aside.getBoundingClientRect().height - window.innerHeight);
      })(),
    }));

    expect(overflow.body).toBeLessThanOrEqual(1);
    expect(overflow.root).toBeLessThanOrEqual(1);
    expect(overflow.sidebarOverflow).toBeLessThanOrEqual(1);
  });

  /*
   * Every page carries its own gutter on its root, `px-12`, and the page
   * header above it is inset by the same amount. Storage Saver and Publisher
   * shipped without it: the title was inset and every panel, heading and tile
   * under it ran flush from the sidebar to the window edge. Nothing measured
   * that, because nothing on those pages overflowed or changed size.
   *
   * So: whatever paints inside the page, text or a hairline, sits within the
   * header's inset on both sides.
   */
  test('a page keeps the gutter its header has', async () => {
    const paged = ROUTES.filter((r) => !r.name.startsWith('settings') && r.name !== 'editor');
    for (const route of paged) {
      await ctx.page.evaluate((h) => {
        window.location.hash = h;
      }, route.hash);
      await ctx.page.waitForTimeout(1200);

      const found = await ctx.page.evaluate(() => {
        const main = document.querySelector('main');
        // The page header sits above `main`, in the layout, not inside the page.
        const title = document.querySelector('h1');
        if (!main || !title) return { inspected: 0, outside: [] as string[] };
        const box = main.getBoundingClientRect();
        const inset = title.getBoundingClientRect().left - box.left;
        const left = box.left + inset - 1;
        // The scrollbar lives inside `main` and is not the page's to pad.
        const right = box.left + main.clientWidth - inset + 1;

        const outside: string[] = [];
        let inspected = 0;
        for (const el of main.querySelectorAll<HTMLElement>('*')) {
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
          const hasText = [...el.childNodes].some(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim(),
          );
          // A border counts only when it can be seen: the clip name field is
          // outset on purpose with a transparent one, so its text lines up.
          const seen = (width: string, colour: string) =>
            parseFloat(width) > 0 && !/rgba\([^)]*,\s*0\)|transparent/.test(colour);
          const hasBorder =
            seen(style.borderLeftWidth, style.borderLeftColor) ||
            seen(style.borderRightWidth, style.borderRightColor);
          if (!hasText && !hasBorder) continue;
          // Today's carousel scrolls sideways, so its later tiles are past the
          // edge by design. Something a scroller inside the page clips is that
          // scroller's business; the scroller itself is still measured.
          let clipped = false;
          for (let up = el.parentElement; up && up !== main; up = up.parentElement) {
            if (getComputedStyle(up).overflowX === 'visible') continue;
            const c = up.getBoundingClientRect();
            if (r.left < c.left - 1 || r.right > c.right + 1) clipped = true;
            break;
          }
          if (clipped) continue;
          inspected++;
          if (r.left < left || r.right > right) {
            outside.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}" at ${Math.round(r.left)}..${Math.round(r.right)}, gutter ${Math.round(left)}..${Math.round(right)}`);
          }
        }
        return { inspected, outside: outside.slice(0, 5) };
      });

      // An empty walk and a clean walk look the same; this page drew something.
      expect(found.inspected, `${route.name}: nothing inspected`).toBeGreaterThan(3);
      expect(found.outside, `${route.name} runs past its gutter`).toEqual([]);
    }
  });

  test('no screen is taller than the window', async () => {
    // The two routes that need a clip id are the two most likely to overflow:
    // both put a video on the page, and a video is as tall as it is asked to
    // be. The trim page pushed its own timeline off the bottom this way.
    const id = await ctx.page.evaluate(async () => {
      const answer = await window.goodbit!.apiRequest({
        method: 'GET',
        path: '/clips',
        query: { pageSize: 1 },
      });
      return (answer.body as { items: Array<{ id: number }> }).items[0].id;
    });

    const routes = [
      ...ROUTES,
      { hash: `#/clips/${id}`, name: 'clip detail' },
      { hash: `#/trim/${id}`, name: 'trim' },
    ];

    for (const route of routes) {
      await ctx.page.evaluate((h) => {
        window.location.hash = h;
      }, route.hash);
      // A video reports its own size only once the metadata has loaded, and
      // the layout is not final until it has.
      await ctx.page.waitForTimeout(route.name === 'trim' ? 3000 : 600);

      // The editor used h-screen, which is 100vh and ignores the title bar
      // above it, so it overflowed by exactly the bar's height.
      const over = await ctx.page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      );
      expect(over, `${route.name} overflows the window by ${over}px`).toBeLessThanOrEqual(1);
    }
  });

  test('the trim page fits its timeline on the screen', async () => {
    const id = await ctx.page.evaluate(async () => {
      const answer = await window.goodbit!.apiRequest({
        method: 'GET',
        path: '/clips',
        query: { pageSize: 1 },
      });
      return (answer.body as { items: Array<{ id: number }> }).items[0].id;
    });

    await ctx.page.evaluate((clipId) => {
      window.location.hash = `#/trim/${clipId}`;
    }, id);
    await ctx.page.waitForTimeout(3000);

    // Nothing overflowed the document. The page had its own scroller, so the
    // window-height test above was blind to this. What was actually wrong is
    // that the preview took the whole viewport and pushed the timeline, the
    // transport and the save button below the fold.
    const save = ctx.page.getByRole('button', { name: /save trimmed clip/i });
    await expect(save).toBeVisible();

    const room = await save.evaluate((node) => ({
      bottom: Math.round(node.getBoundingClientRect().bottom),
      window: window.innerHeight,
    }));

    expect(
      room.bottom,
      `the save button sits ${room.bottom - room.window}px below the window`
    ).toBeLessThanOrEqual(room.window);
  });

  test('the trim handles sit exactly where they say they do', async () => {
    const id = await ctx.page.evaluate(async () => {
      const answer = await window.goodbit!.apiRequest({
        method: 'GET',
        path: '/clips',
        query: { pageSize: 1 },
      });
      return (answer.body as { items: Array<{ id: number }> }).items[0].id;
    });

    await ctx.page.evaluate((clipId) => {
      window.location.hash = `#/trim/${clipId}`;
    }, id);
    await ctx.page.waitForTimeout(3000);

    // The range opens on the whole clip, so both handles are at the extremes,
    // which is exactly where a mispositioned one shows up. Radix pulls a thumb
    // back inside the track by a share of its own width, so a thumb with any
    // width at all lands short of the edge it is marking.
    const offsets = await ctx.page.evaluate(() => {
      const strip = document.querySelector('img[src*="media/strip"]')?.parentElement;
      const thumbs = Array.from(document.querySelectorAll('[role="slider"]'));
      if (!strip || thumbs.length < 2) return null;

      const track = strip.getBoundingClientRect();
      const [start, end] = thumbs.map((t) => t.getBoundingClientRect());

      return {
        startOff: Math.round(start.left - track.left),
        endOff: Math.round(end.left - track.right),
      };
    });

    expect(offsets, 'the strip or its handles were not found').not.toBeNull();
    expect(Math.abs(offsets!.startOff), `start handle is ${offsets!.startOff}px from the left edge`)
      .toBeLessThanOrEqual(2);
    expect(Math.abs(offsets!.endOff), `end handle is ${offsets!.endOff}px from the right edge`)
      .toBeLessThanOrEqual(2);
  });

  test('dark mode has no pale surfaces left over from light', async () => {
    await ctx.page.evaluate(() => localStorage.setItem('goodbit-theme', 'dark'));
    await ctx.page.reload();
    await ctx.page.waitForTimeout(1200);

    expect(
      await ctx.page.evaluate(() => document.documentElement.classList.contains('dark')),
      'dark mode was not applied, so this test would prove nothing',
    ).toBe(true);

    const pale: string[] = [];

    for (const route of ROUTES) {
      await ctx.page.evaluate((h) => {
        window.location.hash = h;
      }, route.hash);
      await ctx.page.waitForTimeout(600);

      // Tailwind's -50 and -100 steps are specific pale colours, not 'a hint
      // of the hue'. Over a dark ground they composite to washed cream, which
      // is what the editor's panels were.
      const found = await ctx.page.evaluate(() => {
        const out: string[] = [];

        for (const el of Array.from(document.querySelectorAll('*'))) {
          const colour = getComputedStyle(el).backgroundColor;
          const m = /rgba?\(([^)]+)\)/.exec(colour);
          if (!m) continue;

          const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
          const [r, g, b] = parts;
          const alpha = parts.length > 3 ? parts[3] : 1;

          // Only fills solid enough to actually read as a surface.
          if (alpha < 0.2) continue;
          // Bright and near-neutral: the pale end of Tailwind's ramps.
          if (r < 200 || g < 190 || b < 170) continue;

          const box = el.getBoundingClientRect();
          if (box.width > 120 && box.height > 24) {
            out.push(`${colour}, ${el.className.toString().slice(0, 60)}`);
          }
        }

        return out;
      });

      for (const entry of found) pale.push(`${route.name}: ${entry}`);
    }

    expect(pale, `Pale surfaces in dark mode:\n${pale.join('\n')}`).toEqual([]);
  });
});

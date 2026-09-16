import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * Every screen, in both palettes.
 *
 * The dark-mode work shipped visibly broken, unreadable text on unreadable
 * ground, while typecheck, build and the CSS itself were all correct. Nothing
 * that existed could see the result. These walk the app and assert that what is
 * drawn is actually legible, which is the only check that would have caught it.
 */

const ROUTES = [
  { hash: '#/', name: 'library' },
  { hash: '#/today', name: 'today' },
  { hash: '#/stats', name: 'stats' },
  { hash: '#/tag-patterns', name: 'tag-patterns' },
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

/** Relative luminance, for the contrast ratio below. */
function luminance([r, g, b]: number[]): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

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

      const problems: string[] = [];

      for (const route of ROUTES) {
        await ctx.page.evaluate((h) => {
          window.location.hash = h;
        }, route.hash);
        await ctx.page.waitForTimeout(700);

        await ctx.page.screenshot({
          path: `test-results/screens/${theme}-${route.name}.png`,
          fullPage: false,
        });

        // Walk the visible text and compare each run against whatever is
        // actually painted behind it.
        const bad = await ctx.page.evaluate(() => {
          const parse = (value: string): number[] | null => {
            const m = /rgba?(([^)]+))/.exec(value);
            if (!m) return null;
            const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
            const alpha = parts.length > 3 ? parts[3] : 1;
            if (alpha === 0) return null;
            return [parts[0], parts[1], parts[2], alpha];
          };

          /**
           * The painted background, with translucent layers composited.
           *
           * A tint like  computes to rgb(249 115 22 / 0.1);
           * reading that as opaque orange claims every label on it is
           * unreadable, when what is actually painted is a pale wash.
           */
          const backgroundOf = (el: Element): number[] => {
            const layers: number[][] = [];
            let node: Element | null = el;
            while (node) {
              const parsed = parse(getComputedStyle(node).backgroundColor);
              if (parsed) {
                layers.push(parsed);
                if (parsed[3] >= 1) break;
              }
              node = node.parentElement;
            }
            let [r, g, b] = [255, 255, 255];
            for (let i = layers.length - 1; i >= 0; i--) {
              const [lr, lg, lb, la] = layers[i];
              r = lr * la + r * (1 - la);
              g = lg * la + g * (1 - la);
              b = lb * la + b * (1 - la);
            }
            return [r, g, b];
          };

          const results: Array<{ text: string; fg: number[]; bg: number[] }> = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

          let node: Node | null;
          while ((node = walker.nextNode())) {
            const text = node.textContent?.trim() ?? '';
            if (text.length < 3) continue;

            const el = node.parentElement;
            if (!el) continue;

            const style = getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none') continue;
            if (parseFloat(style.opacity) < 0.5) continue;

            const box = el.getBoundingClientRect();
            if (box.width < 4 || box.height < 4) continue;
            if (box.bottom < 0 || box.top > window.innerHeight) continue;

            const fgRaw = parse(style.color);
            if (!fgRaw) continue;
            const fg = [fgRaw[0], fgRaw[1], fgRaw[2]];

            results.push({ text: text.slice(0, 40), fg, bg: backgroundOf(el) });
          }
          return results;
        });

        for (const item of bad) {
          const ratio = contrast(item.fg, item.bg);
          // 2.5:1 is far below the accessibility bar on purpose, this is
          // looking for text that is effectively invisible, not for text that
          // is merely low contrast.
          if (ratio < 2.5) {
            problems.push(
              `${route.name}: "${item.text}" ${ratio.toFixed(2)}:1 ` +
                `(fg rgb(${item.fg}) on bg rgb(${item.bg}))`,
            );
          }
        }
      }

      expect(problems, `Unreadable text in ${theme}:\n${problems.join('\n')}`).toEqual([]);
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

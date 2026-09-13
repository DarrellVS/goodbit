import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * Every screen, in both palettes.
 *
 * The dark-mode work shipped visibly broken — unreadable text on unreadable
 * ground — while typecheck, build and the CSS itself were all correct. Nothing
 * that existed could see the result. These walk the app and assert that what is
 * drawn is actually legible, which is the only check that would have caught it.
 */

const ROUTES = [
  { hash: '#/', name: 'library' },
  { hash: '#/today', name: 'today' },
  { hash: '#/stats', name: 'stats' },
  { hash: '#/tag-patterns', name: 'tag-patterns' },
  { hash: '#/settings?section=general', name: 'settings-general' },
  { hash: '#/settings?section=games', name: 'settings-games' },
  { hash: '#/settings?section=playback', name: 'settings-playback' },
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
          // 2.5:1 is far below the accessibility bar on purpose — this is
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
 * content one. Invisible to every other check — the markup was valid and
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
    for (const route of ROUTES) {
      await ctx.page.evaluate((h) => {
        window.location.hash = h;
      }, route.hash);
      await ctx.page.waitForTimeout(600);

      // The editor used h-screen, which is 100vh and ignores the title bar
      // above it — so it overflowed by exactly the bar's height.
      const over = await ctx.page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      );
      expect(over, `${route.name} overflows the window by ${over}px`).toBeLessThanOrEqual(1);
    }
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
            out.push(`${colour} — ${el.className.toString().slice(0, 60)}`);
          }
        }

        return out;
      });

      for (const entry of found) pale.push(`${route.name}: ${entry}`);
    }

    expect(pale, `Pale surfaces in dark mode:\n${pale.join('\n')}`).toEqual([]);
  });
});

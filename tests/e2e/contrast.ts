/**
 * Reading the colour that is actually painted, and judging it.
 *
 * This lives in its own file because the browser half of it is a string that
 * gets handed to `page.evaluate`, and the one thing it must survive is being
 * edited. The regex in here lost its two backslashes once, on the day the
 * gate was written: `/rgba?\(([^)]+)\)/` became `/rgba?(([^)]+))/`, which
 * still matches, still returns a group, and puts an opening bracket at the
 * front of it. `parseFloat('(18')` is `NaN`, every contrast ratio came out
 * `NaN`, and `NaN < threshold` is `false`, so the gate reported zero problems
 * on every screen in both palettes for four days while it measured nothing.
 *
 * Hence `assertParserWorks` below, which is run before the walk. A checker
 * that cannot fail is worse than no checker, because it is also a claim.
 */

/** sRGB relative luminance. */
export function luminance([r, g, b]: number[]): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface TextRun {
  text: string;
  fg: number[];
  bg: number[];
  /** WCAG's "large text": 24px, or 18.66px once it is bold. */
  large: boolean;
  where: string;
}

/**
 * WCAG's floors, which are what the design contract asks for.
 *
 * 4.5:1 for body and small text, 3:1 for large text. The gate used to sit at
 * 2.5:1 for everything, deliberately, because it was hunting for text that
 * was effectively invisible rather than text that was merely hard work. The
 * new ladder is built so that every text rung clears 4.5:1 on every surface
 * it can land on, so a floor below that cannot detect a mistake in it.
 */
export const FLOOR_BODY = 4.5;
export const FLOOR_LARGE = 3;

export function floorFor(run: TextRun): number {
  return run.large ? FLOOR_LARGE : FLOOR_BODY;
}

/**
 * Text this gate does not judge, each with the reason it does not.
 *
 * A named exception with a comment, never a lower global floor. If a fourth
 * one turns up, the question to ask is whether the token is wrong.
 */
export const EXCEPTIONS: Array<{ match: RegExp; why: string }> = [
  {
    // A frame is its own ground and it changes every clip, so no static
    // measurement of it means anything. These carry their own scrim and are
    // judged by eye, per the design contract.
    match: /^over-video:/,
    why: 'text over a video frame, judged by eye',
  },
  {
    // A placeholder is the field telling you what it wants, not content. It
    // is `muted-3`, which is the decorative rung on purpose.
    match: /^placeholder:/,
    why: 'placeholder text, deliberately decorative',
  },
];

export function excused(run: TextRun): string | null {
  for (const rule of EXCEPTIONS) if (rule.match.test(run.where)) return rule.why;
  return null;
}

/**
 * Collect every visible run of text with the colour behind it composited.
 *
 * Returned as a function to be passed whole to `page.evaluate`. It runs in
 * the renderer, so it cannot close over anything in this file.
 */
export function collectTextRuns(): TextRun[] {
  const parse = (value: string): number[] | null => {
    // Both `rgb(1, 2, 3)` and `rgb(1 2 3 / 0.5)` reach here, since which one
    // the engine returns depends on how the value was written.
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const parts = m[1]
      .split(/[,/\s]+/)
      .map((p) => parseFloat(p.trim()))
      .filter((n) => !Number.isNaN(n));
    if (parts.length < 3) return null;
    const alpha = parts.length > 3 ? parts[3] : 1;
    if (alpha === 0) return null;
    return [parts[0], parts[1], parts[2], alpha];
  };

  /**
   * The painted background, with translucent layers composited.
   *
   * A tint like `bg-accent/10` computes to `rgb(193 99 62 / 0.1)`; reading
   * that as opaque terracotta claims every label on it is unreadable, when
   * what is actually painted is a pale wash over whatever is underneath.
   */
  const backgroundOf = (el: Element): { rgb: number[]; overVideo: boolean } => {
    const layers: number[][] = [];
    let overVideo = false;
    let node: Element | null = el;

    while (node) {
      if (node.querySelector('video, canvas, img')) overVideo = true;
      const parsed = parse(getComputedStyle(node).backgroundColor);
      if (parsed) {
        layers.push(parsed);
        if (parsed[3] >= 1) break;
      }
      node = node.parentElement;
    }

    // Nothing opaque was found, so the page itself is the ground.
    let [r, g, b] = parse(getComputedStyle(document.body).backgroundColor)?.slice(0, 3) ?? [
      255, 255, 255,
    ];
    for (let i = layers.length - 1; i >= 0; i--) {
      const [lr, lg, lb, la] = layers[i];
      r = lr * la + r * (1 - la);
      g = lg * la + g * (1 - la);
      b = lb * la + b * (1 - la);
    }
    return { rgb: [r, g, b], overVideo };
  };

  const label = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const cls = typeof el.className === 'string' ? el.className.slice(0, 70) : '';
    return `${tag}${cls ? '.' + cls.trim().split(/\s+/).slice(0, 5).join('.') : ''}`;
  };

  const runs: TextRun[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim() ?? '';
    if (text.length < 3) continue;

    const el = node.parentElement;
    if (!el) continue;

    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    // Something mid-fade is not what anybody reads.
    if (parseFloat(style.opacity) < 0.95) continue;

    const box = el.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) continue;
    if (box.bottom < 0 || box.top > window.innerHeight) continue;
    if (box.right < 0 || box.left > window.innerWidth) continue;

    const fgRaw = parse(style.color);
    if (!fgRaw) continue;

    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);

    const { rgb, overVideo } = backgroundOf(el);

    // A colour the author set with an alpha is a colour over the ground, not
    // a colour on its own.
    let fg = [fgRaw[0], fgRaw[1], fgRaw[2]];
    if (fgRaw[3] < 1) {
      fg = fg.map((c, i) => c * fgRaw[3] + rgb[i] * (1 - fgRaw[3]));
    }

    const prefix = overVideo ? 'over-video:' : '';
    runs.push({
      text: text.slice(0, 40),
      fg,
      bg: rgb,
      large,
      where: prefix + label(el),
    });
  }

  return runs;
}

/**
 * Prove the colour parser can still read a colour before trusting a walk that
 * uses it. This is the check that the four silent days were missing.
 */
export function assertParserWorks(runs: TextRun[]): void {
  const broken = runs.filter(
    (r) => ![...r.fg, ...r.bg].every((n) => Number.isFinite(n)),
  );
  if (broken.length > 0) {
    throw new Error(
      `the colour parser returned a non-number for ${broken.length} of ${runs.length} runs, ` +
        `so nothing below this line measured anything. First: ${JSON.stringify(broken[0])}`,
    );
  }
  if (runs.length === 0) {
    throw new Error('no text runs were collected at all, so this screen proved nothing');
  }
}

/**
 * Stop every transition and animation before reading a colour.
 *
 * A backgrounded window freezes a colour transition part way, so a button
 * caught mid-hover reports a blend of two colours that nothing ever finishes
 * painting. Measured, that is a failure nobody can reproduce by looking.
 */
export const FREEZE_CSS = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
`;

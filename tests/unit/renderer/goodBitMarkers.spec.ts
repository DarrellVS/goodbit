// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import GoodBitBands from '../../../src/renderer/src/components/Trim/GoodBitBands.vue';
import ClipGoodBitPips from '../../../src/renderer/src/components/App/ClipGoodBitPips.vue';
import type { GoodBit } from '../../../src/renderer/src/types/goodbit';

/**
 * The two places a GoodBit is drawn rather than listed.
 *
 * These are components, so they are in the unit suite under the same narrow
 * exception `baseComboBox.spec.ts` claims: they need a window, which happy-dom
 * buys, and they need nothing else. `pipLayout`, `bandPosition` and
 * `assignLanes` are covered as pure functions in `goodBits.spec.ts`; what is
 * asserted here is the part only a mount can show, which is that the arithmetic
 * reaches the element. A band computed correctly and never rendered, or
 * rendered with `left` in the wrong unit, is arithmetic that passes its own
 * test and draws nothing.
 *
 * **Nothing visual is claimed.** Whether these read as markers on a real frame
 * strip, at a real card's width, over real footage, is the e2e suite's and a
 * human's. What is here is: how many elements, where each one is positioned,
 * and what a press emits.
 */

vi.mock('@iconify/vue', async () => {
  const { h: createElement } = await import('vue');
  return {
    Icon: {
      props: { icon: String },
      setup: (props: { icon?: string }) => () => createElement('i', { 'data-icon': props.icon }),
    },
  };
});

let mounted: App | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  document.body.innerHTML = '';
});

/** A stored GoodBit, with only the fields either component reads filled in. */
function marked(id: number, startSec: number, endSec: number, name: string | null = null): GoodBit {
  return {
    id,
    clipId: 1,
    startSec,
    endSec,
    durationSec: Math.round((endSec - startSec) * 1000) / 1000,
    name,
    source: 'manual',
    reason: null,
    confidence: null,
  };
}

function mount<P extends object>(component: unknown, props: P): { state: P; host: HTMLElement } {
  const state = reactive({ ...props }) as P;
  const host = document.createElement('div');
  document.body.appendChild(host);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mounted = createApp({ render: () => h(component as any, state as any) });
  mounted.mount(host);

  return { state, host };
}

describe('the bands on the trim timeline', () => {
  const bands = (): HTMLButtonElement[] => [
    ...document.querySelectorAll<HTMLButtonElement>('button'),
  ];

  it('draws one pressable band per GoodBit, positioned along the strip', () => {
    mount(GoodBitBands, {
      goodBits: [marked(1, 0, 15), marked(2, 21, 30, 'the tank')],
      durationSec: 30,
    });

    const drawn = bands();
    expect(drawn).toHaveLength(2);
    expect(drawn[0].style.left).toBe('0%');
    expect(drawn[0].style.width).toBe('50%');
    expect(drawn[1].style.left).toBe('70%');
    expect(drawn[1].style.width).toBe('30%');
    // Neither overlaps, so both sit on the bottom row.
    expect(drawn[0].style.bottom).toBe('0px');
    expect(drawn[1].style.bottom).toBe('0px');
  });

  it('lifts an overlapping band onto a second row', () => {
    // The case the measurement found: a long moment with a short one inside it.
    // Drawn in one row these would be one band, and the shorter of the two
    // would be invisible and unpressable.
    mount(GoodBitBands, {
      goodBits: [marked(1, 0, 30), marked(2, 12, 14)],
      durationSec: 30,
    });

    const drawn = bands();
    expect(drawn[0].style.bottom).toBe('0px');
    expect(drawn[1].style.bottom).toBe('7px');
  });

  it('names each band so it can be found without looking at it', () => {
    mount(GoodBitBands, {
      goodBits: [marked(1, 3.5, 5, 'the tank'), marked(2, 21, 24)],
      durationSec: 30,
    });

    const drawn = bands();
    expect(drawn[0].getAttribute('aria-label')).toBe('Edit the GoodBit the tank');
    // Nameless, so it is named by its range, which is the same fallback the
    // list uses.
    expect(drawn[1].getAttribute('aria-label')).toBe('Edit the GoodBit 0:21 – 0:24');
  });

  it('says which band the handles are sitting on', () => {
    mount(GoodBitBands, {
      goodBits: [marked(1, 0, 5), marked(2, 21, 24)],
      durationSec: 30,
      selectedId: 2,
    });

    const drawn = bands();
    expect(drawn[0].getAttribute('aria-pressed')).toBe('false');
    expect(drawn[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('emits the GoodBit that was pressed, so the handles can go to it', async () => {
    const selected: GoodBit[] = [];
    const goodBit = marked(7, 21, 24, 'the tank');

    const state = reactive({
      goodBits: [marked(1, 0, 5), goodBit],
      durationSec: 30,
      onSelect: (pressed: GoodBit) => selected.push(pressed),
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    mounted = createApp({ render: () => h(GoodBitBands, state) });
    mounted.mount(host);

    bands()[1].click();
    await nextTick();

    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe(7);
  });

  it('draws nothing before the duration has arrived', () => {
    // The strip is on screen before the probe answers, and a percentage of zero
    // seconds is not a position.
    mount(GoodBitBands, { goodBits: [marked(1, 0, 5)], durationSec: 0 });
    expect(bands()).toHaveLength(0);
  });

  it('draws nothing for a clip with nothing marked', () => {
    mount(GoodBitBands, { goodBits: [], durationSec: 30 });
    expect(bands()).toHaveLength(0);
  });
});

describe('the markers on a library card', () => {
  const pips = (): HTMLElement[] => [
    ...document.querySelectorAll<HTMLElement>('span[style*="left"]'),
  ];

  it('draws a band per GoodBit, at the length it actually is', () => {
    mount(ClipGoodBitPips, {
      ranges: [
        { startSec: 6, endSec: 8 },
        { startSec: 21, endSec: 24 },
      ],
      durationSec: 30,
    });

    const drawn = pips();
    expect(drawn).toHaveLength(2);
    expect(drawn[0].style.left).toBe('20%');
    expect(drawn[1].style.left).toBe('70%');
    // The length is in the band, which is the whole argument for a band rather
    // than a dot: three seconds of thirty is ten percent of the card.
    expect(drawn[1].style.width).toBe('10%');
  });

  it('counts them instead once there are more than four', () => {
    /*
     * The threshold the prototype landed on. Past four the bands stop being
     * countable at a glance and read as a dashed line, and a dashed line says
     * less than the number does. This is the test that would fail if somebody
     * decided a card should draw eight.
     */
    mount(ClipGoodBitPips, {
      ranges: [
        { startSec: 1, endSec: 3 },
        { startSec: 6, endSec: 8 },
        { startSec: 12, endSec: 14 },
        { startSec: 18, endSec: 20 },
        { startSec: 25, endSec: 27 },
      ],
      durationSec: 30,
    });

    expect(pips()).toHaveLength(0);
    expect(document.body.textContent).toContain('5 GoodBits');
  });

  it('says how many there are without drawing them, for a reader', () => {
    mount(ClipGoodBitPips, { ranges: [{ startSec: 6, endSec: 8 }], durationSec: 30 });
    const layer = document.querySelector('[aria-label]');
    expect(layer?.getAttribute('aria-label')).toBe('1 GoodBit marked on this clip');
  });

  it('draws nothing at all for a clip with nothing marked', () => {
    // Which is every clip today: `ClipDTO` carries no GoodBits, so the card is
    // unchanged until the list query selects them. See `clipGoodBitRanges`.
    mount(ClipGoodBitPips, { ranges: [], durationSec: 30 });
    expect(document.body.querySelector('[aria-label]')).toBeNull();
  });

  it('draws nothing for a clip whose length was never probed', () => {
    // `Clip.durationSec` is nullable: a row written before that column existed
    // has not been probed, and the next scan fills it in.
    mount(ClipGoodBitPips, { ranges: [{ startSec: 6, endSec: 8 }], durationSec: null });
    expect(document.body.querySelector('[aria-label]')).toBeNull();
  });
});

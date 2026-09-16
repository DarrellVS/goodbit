// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  enhanceMarkdownWithTimestamps,
  extractTimestamps,
  formatTimestamp,
  parseTimestamp,
} from '../../../src/renderer/src/utils/timestampParser';

/**
 * Timestamps in a note, which are the app's oldest annotation feature and the
 * one with the least behind it.
 *
 * `0:04` in a note becomes a chip that seeks the player. The parsing is pure
 * and the rewriting is not, and both are about to be rebuilt (2.6 in the 2.0
 * plan: a note gains a read mode, and a chip learns about marks). So these
 * tests exist for two reasons: to pin what is right before it moves, and to
 * state the two defects in writing, as `it.fails`, so that fixing either one
 * announces itself here rather than passing silently.
 */

describe('reading a timestamp', () => {
  it('takes M:SS', () => {
    expect(parseTimestamp('0:04')).toBe(4);
    expect(parseTimestamp('1:30')).toBe(90);
    expect(parseTimestamp('12:07')).toBe(727);
  });

  it('takes H:MM:SS', () => {
    expect(parseTimestamp('1:00:00')).toBe(3600);
    expect(parseTimestamp('2:15:30')).toBe(8130);
  });

  it('refuses what is not a timestamp', () => {
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('4')).toBeNull();
    expect(parseTimestamp('nonsense')).toBeNull();
    expect(parseTimestamp('1:2:3:4')).toBeNull();
    expect(parseTimestamp('a:bc')).toBeNull();
  });

  it('round-trips through formatting', () => {
    for (const seconds of [0, 4, 59, 60, 90, 727, 3600, 8130]) {
      expect(parseTimestamp(formatTimestamp(seconds))).toBe(seconds);
    }
  });
});

describe('writing a timestamp', () => {
  it('pads the seconds, so 1:05 is not 1:5', () => {
    expect(formatTimestamp(65)).toBe('1:05');
    expect(formatTimestamp(4)).toBe('0:04');
  });

  it('only shows the hour when there is one', () => {
    expect(formatTimestamp(3599)).toBe('59:59');
    expect(formatTimestamp(3600)).toBe('1:00:00');
  });

  it('drops a fraction of a second rather than rounding up past the end', () => {
    // A clip's own duration is fractional, and a chip reading 0:30 on a 29.97
    // second clip points past the last frame.
    expect(formatTimestamp(29.97)).toBe('0:29');
  });
});

describe('turning a timestamp into a chip', () => {
  const noop = (): void => {};

  it('wraps the timestamp and carries the seconds on the element', () => {
    // `data-seconds` is the contract with MarkdownPreview.vue, which attaches
    // the real click handler by reading it.
    const html = enhanceMarkdownWithTimestamps('<p>shit at 0:04 is hilarious</p>', noop);

    expect(html).toContain('class="timestamp-link"');
    expect(html).toContain('data-seconds="4"');
    expect(html).toContain('>0:04</a>');
  });

  it('leaves the sentence around it alone', () => {
    const html = enhanceMarkdownWithTimestamps('<p>shit at 0:04 is hilarious</p>', noop);

    expect(html).toContain('shit at ');
    expect(html).toContain(' is hilarious');
  });

  it('marks up every timestamp in a note, not just the first', () => {
    const html = enhanceMarkdownWithTimestamps('<p>0:04 and 0:19 and 1:02:00</p>', noop);

    expect(html.match(/timestamp-link/g)).toHaveLength(3);
    expect(html).toContain('data-seconds="3720"');
  });

  it('does nothing to a note without one', () => {
    const source = '<p>nothing timed in here</p>';

    expect(enhanceMarkdownWithTimestamps(source, noop)).toBe(source);
  });

  /**
   * Defect, recorded rather than fixed: the regex runs over the *rendered*
   * HTML, after `marked`, so anything that looks like a timestamp inside an
   * attribute gets an anchor opened in the middle of it. A note holding a link
   * to a video at a time, which is the most likely way for this to happen,
   * comes out as broken markup.
   *
   * 2.6 fixes this by matching before the markdown is parsed, or by walking
   * text nodes after. When it does, this test starts failing and should be
   * turned into a plain `it`.
   */
  it.fails('should not rewrite a timestamp inside an attribute', () => {
    const html = enhanceMarkdownWithTimestamps(
      '<p><a href="https://example.com/v/1:30">clip</a></p>',
      noop,
    );

    expect(html).toBe('<p><a href="https://example.com/v/1:30">clip</a></p>');
  });

  /**
   * Defect, recorded rather than fixed: the enhancement registers DOM
   * listeners from inside a Vue `computed`, with `setTimeout` and
   * `Math.random()` ids. A computed is a getter and this one mutates the
   * document, so merely rendering a preview twice schedules work twice.
   *
   * The listeners are also redundant, because `MarkdownPreview.vue` attaches
   * the real ones from `data-seconds`. 2.6 deletes the side effect, at which
   * point this test starts failing and should be turned into a plain `it`.
   */
  it.fails('should not schedule work just for asking what the html is', () => {
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    const before = scheduled.mock.calls.length;

    enhanceMarkdownWithTimestamps('<p>0:04</p>', noop);

    expect(scheduled.mock.calls.length).toBe(before);
    scheduled.mockRestore();
  });
});

describe('listing the timestamps in a note', () => {
  it('reports each one with the line it was written on', () => {
    const found = extractTimestamps('the fight starts at 0:12\nand he wins it at 0:21');

    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ timestamp: '0:12', seconds: 12 });
    expect(found[0]?.context).toBe('the fight starts at 0:12');
    expect(found[1]?.seconds).toBe(21);
  });

  it('finds several on one line', () => {
    // A regex with /g holds its own `lastIndex`, which is the classic way to
    // miss every second match when the same object is reused across lines.
    const found = extractTimestamps('0:04 then 0:09 then 0:14');

    expect(found.map((f) => f.seconds)).toEqual([4, 9, 14]);
  });

  it('is empty for a note with nothing timed in it', () => {
    expect(extractTimestamps('just a sentence')).toEqual([]);
    expect(extractTimestamps('')).toEqual([]);
  });
});

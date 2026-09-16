// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  enhanceMarkdownWithTimestamps,
  extractTimestamps,
  formatTimestamp,
  parseTimestamp,
  timestampTargetSeconds,
} from '../../../src/renderer/src/utils/timestampParser';

/**
 * Timestamps in a note, which are the app's oldest annotation feature and the
 * one with the least behind it.
 *
 * `0:04` in a note becomes a chip that seeks the player. The parsing is pure
 * and the rewriting is not, and both were rebuilt by 2.6, which gave a note a
 * read mode and so made the chip visible for the first time. The two defects
 * that were written down here as `it.fails`, an anchor opened inside an
 * attribute and a `computed` that mutated the document, are fixed and their
 * tests are plain `it`s again.
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
  it('wraps the timestamp and carries the seconds on the element', () => {
    // `data-seconds` is the contract with MarkdownPreview.vue, which attaches
    // the real click handler by reading it.
    const html = enhanceMarkdownWithTimestamps('<p>shit at 0:04 is hilarious</p>');

    expect(html).toContain('class="timestamp-link"');
    expect(html).toContain('data-seconds="4"');
    expect(html).toContain('>0:04</a>');
  });

  it('leaves the sentence around it alone', () => {
    const html = enhanceMarkdownWithTimestamps('<p>shit at 0:04 is hilarious</p>');

    expect(html).toContain('shit at ');
    expect(html).toContain(' is hilarious');
  });

  it('marks up every timestamp in a note, not just the first', () => {
    const html = enhanceMarkdownWithTimestamps('<p>0:04 and 0:19 and 1:02:00</p>');

    expect(html.match(/timestamp-link/g)).toHaveLength(3);
    expect(html).toContain('data-seconds="3720"');
  });

  it('does nothing to a note without one', () => {
    const source = '<p>nothing timed in here</p>';

    expect(enhanceMarkdownWithTimestamps(source)).toBe(source);
  });

  it('makes a chip pressable from the keyboard as well', () => {
    // No `href`, because the chip is not a link to anywhere. So it has to say
    // what it is and take a tab stop, or a keyboard cannot reach it at all.
    const html = enhanceMarkdownWithTimestamps('<p>0:04</p>');

    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain('href');
  });

  /**
   * Was a defect, recorded here as `it.fails` before 2.6: the regex ran over
   * the *rendered* HTML, after `marked`, so anything that looked like a
   * timestamp inside an attribute got an anchor opened in the middle of it. A
   * note holding a link to a video at a time, which is the most likely way for
   * this to happen, came out as broken markup.
   *
   * Fixed by walking text nodes instead of the string, so markup is not
   * something the matcher has to be careful about: it cannot see it.
   */
  it('does not rewrite a timestamp inside an attribute', () => {
    const html = enhanceMarkdownWithTimestamps('<p><a href="https://example.com/v/1:30">clip</a></p>');

    expect(html).toBe('<p><a href="https://example.com/v/1:30">clip</a></p>');
  });

  it('leaves a timestamp in a code span quoted rather than pressable', () => {
    // A code span is being shown, not read, and `0:04` in one is usually part
    // of a log line somebody pasted.
    const html = enhanceMarkdownWithTimestamps('<p><code>at 0:04</code></p>');

    expect(html).toBe('<p><code>at 0:04</code></p>');
  });

  it('can run over its own output without nesting chips', () => {
    // A chip's label is a timestamp, so a second pass over rendered html would
    // wrap the wrapper if anchors were not skipped. `renderedMarkdown` is a
    // computed and nothing promises how many times it is read.
    const once = enhanceMarkdownWithTimestamps('<p>shit at 0:04 is hilarious</p>');

    expect(enhanceMarkdownWithTimestamps(once)).toBe(once);
  });

  /**
   * Was a defect, recorded here as `it.fails` before 2.6: the enhancement
   * registered DOM listeners from inside a Vue `computed`, with `setTimeout`
   * and `Math.random()` ids. A computed is a getter and that one mutated the
   * document, so merely rendering a preview twice scheduled work twice.
   *
   * The listeners were also redundant, because `MarkdownPreview.vue` attaches
   * the real one from `data-seconds`. The fix was deletion.
   */
  it('does not schedule work just for asking what the html is', () => {
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    const before = scheduled.mock.calls.length;

    enhanceMarkdownWithTimestamps('<p>0:04</p>');

    expect(scheduled.mock.calls.length).toBe(before);
    scheduled.mockRestore();
  });
});

describe('reading a chip that was pressed', () => {
  function render(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = enhanceMarkdownWithTimestamps(html);
    return host;
  }

  it('takes the seconds off the chip', () => {
    const chip = render('<p>at 1:30</p>').querySelector('.timestamp-link');

    expect(timestampTargetSeconds(chip)).toBe(90);
  });

  it('finds the chip a press landed inside', () => {
    // The glyph is a `::before`, so a real click can still land on a child if
    // a note ever renders one inside a chip. Delegation has to walk up.
    const host = render('<p>at 1:30</p>');
    const chip = host.querySelector('.timestamp-link') as HTMLElement;
    chip.innerHTML = '<em>1:30</em>';

    expect(timestampTargetSeconds(chip.querySelector('em'))).toBe(90);
  });

  it('says nothing about a press that was not on a chip', () => {
    const host = render('<p>at 1:30</p>');

    expect(timestampTargetSeconds(host.querySelector('p'))).toBeNull();
    expect(timestampTargetSeconds(null)).toBeNull();
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

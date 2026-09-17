// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { useMarkdown } from '../../../src/renderer/src/composables/ui/useMarkdown';

/**
 * A note, from what was typed to what is read.
 *
 * `timestampParser.spec.ts` covers the rewriting on its own. This covers it
 * where it actually runs: over `marked`'s output, inside a `computed`. That is
 * the pairing the chip's oldest defect lived in, since a regex over rendered
 * HTML cannot tell a sentence from an `href`, and the only input that shows it
 * is a note with a markdown link in it.
 *
 * The composable is plain `ref` and `computed`, so it needs no component and no
 * mounting. It needs a window only because the rewriting walks text nodes.
 */
describe('a note, rendered', () => {
  function render(markdown: string): string {
    const { renderedMarkdown } = useMarkdown({
      initialValue: markdown,
      onTimestampClick: () => {},
    });

    return renderedMarkdown.value;
  }

  it('turns a timestamp in a sentence into a chip', () => {
    const html = render('shit at 0:04 is hilarious');

    expect(html).toContain('data-seconds="4"');
    expect(html).toContain('>0:04</a>');
  });

  it('leaves a markdown link that points at a time alone', () => {
    // The oldest defect in this path: the regex ran over the rendered HTML, so
    // this came back with an anchor opened inside the `href` of another one.
    const html = render('the [same fight](https://example.com/v/1:30) from his side');

    expect(html).toContain('href="https://example.com/v/1:30"');
    expect(html).not.toContain('timestamp-link');
  });

  it('leaves a pasted log line in a code block quoted', () => {
    const html = render('```\n[0:04] round over\n```');

    expect(html).not.toContain('timestamp-link');
  });

  it('is the same html however many times it is read', () => {
    // A `computed` is a getter and nothing promises how often it is read. This
    // used to schedule a listener registration per timestamp per read.
    const { renderedMarkdown } = useMarkdown({
      initialValue: 'at 0:04 and again at 0:19',
      onTimestampClick: () => {},
    });

    const first = renderedMarkdown.value;

    expect(renderedMarkdown.value).toBe(first);
    expect(first.match(/timestamp-link/g)).toHaveLength(2);
  });

  it('writes no chip where a press would go nowhere', () => {
    const { renderedMarkdown } = useMarkdown({ initialValue: 'at 0:04' });

    expect(renderedMarkdown.value).not.toContain('timestamp-link');
    expect(renderedMarkdown.value).toContain('0:04');
  });

  it('follows the content it is given', () => {
    const { renderedMarkdown, setContent } = useMarkdown({
      initialValue: 'nothing timed',
      onTimestampClick: () => {},
    });

    expect(renderedMarkdown.value).not.toContain('timestamp-link');

    setContent('now at 1:30');

    expect(renderedMarkdown.value).toContain('data-seconds="90"');
  });
});

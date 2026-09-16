/**
 * Timestamps in a note, both halves of them.
 *
 * A note is written as *"shit at 0:04 is hilarious"*, so `0:04` should be
 * something you can press. This file turns the text into a chip carrying the
 * number (`enhanceMarkdownWithTimestamps`) and reads the number back off the
 * element that was pressed (`timestampTargetSeconds`). Both live here on
 * purpose: `data-seconds` is a contract between a string and a DOM listener,
 * and splitting a contract across a util and a component is how one half
 * quietly stops matching the other.
 */

/**
 * `M:SS` or `H:MM:SS`, on word boundaries.
 *
 * A fresh matcher every call rather than one shared constant. A `/g` regex
 * carries its own `lastIndex`, so a shared one resumed mid string and missed
 * every second timestamp in a note.
 */
function timestampMatcher(): RegExp {
  return /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;
}

/**
 * Text that is not prose and must never be rewritten.
 *
 * A link's own text is already a link, a code span is being quoted rather than
 * read, and a chip's own label is a timestamp that has already been dealt with,
 * which is what makes running this twice over one string harmless.
 */
const NOT_PROSE = 'a, code, pre';

/**
 * Parse timestamp strings like "1:30", "0:45", "2:15:30" into seconds
 */
export function parseTimestamp(timestamp: string): number | null {
  const parts = timestamp.split(':').map((p) => parseInt(p, 10));

  if (parts.some(isNaN)) return null;

  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

/**
 * Convert seconds to timestamp string format
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Wrap every timestamp in rendered markdown in a chip that carries its seconds.
 *
 * **The text nodes are walked, the string is not.** This used to run the regex
 * over the whole of `marked`'s output, which cannot tell prose from markup: a
 * note holding a link to a video at a time (`href="…/v/1:30"`) had an anchor
 * opened in the middle of its own attribute, and the note came out as broken
 * markup. A `TreeWalker` can only see text, so a timestamp inside a tag or an
 * attribute is unreachable rather than merely unlikely.
 *
 * **Nothing here registers a listener.** It used to, from inside a Vue
 * `computed`, with `setTimeout` and a `Math.random()` id per hit: a getter that
 * mutated the document, so asking twice what the html was scheduled the work
 * twice. `MarkdownPreview.vue` attaches one delegated handler and reads
 * `data-seconds`, which is all that was ever needed.
 */
export function enhanceMarkdownWithTimestamps(html: string): string {
  // Nothing that even looks like a time: no parse, no walk, and the caller
  // gets its own string back rather than one that has been through a
  // serialiser.
  if (!timestampMatcher().test(html)) return html;

  const container = document.createElement('div');
  container.innerHTML = html;

  // Collected first, then replaced. Replacing a node while the walker is still
  // standing on it invalidates the walk.
  const prose: Text[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest(NOT_PROSE)) continue;
    prose.push(node);
  }

  let rewrote = false;
  for (const node of prose) {
    if (chipUpTimestamps(node)) rewrote = true;
  }

  // A timestamp that only ever appeared inside an attribute leaves the string
  // untouched, rather than returning a re-serialised copy of it.
  return rewrote ? container.innerHTML : html;
}

/**
 * Split one text node into text and chips. True if anything was replaced.
 */
function chipUpTimestamps(node: Text): boolean {
  const text = node.data;
  const matcher = timestampMatcher();
  const pieces = document.createDocumentFragment();

  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    const seconds = parseTimestamp(match[0]);
    if (seconds === null) continue;

    if (match.index > cursor) {
      pieces.appendChild(document.createTextNode(text.slice(cursor, match.index)));
    }

    /*
     * An anchor with no `href`, which is why it needs the pair below.
     *
     * It used to carry `href="#"` and have its default prevented, which is a
     * link that goes nowhere: it offers a middle click and a context menu that
     * both do the wrong thing. A role and a tab stop say what it really is, and
     * the preview handles Enter and Space, so the chip is pressable from the
     * keyboard as well as the mouse.
     */
    const chip = document.createElement('a');
    chip.className = 'timestamp-link';
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.dataset.seconds = String(seconds);

    /*
     * The label is the one thing 2.1 changes about a chip.
     *
     * A timestamp that lands inside a `Moment` should read as that moment's
     * name rather than as a number, since a hand typed `0:04` and a detected
     * moment are then the same kind of thing. That needs the clip's marks in
     * here, as an optional second argument threaded from `useMarkdown`'s
     * options, and a rule for a timestamp inside two overlapping ones.
     * `data-seconds` does not move: where a press goes is still the number.
     */
    chip.textContent = match[0];
    pieces.appendChild(chip);

    cursor = match.index + match[0].length;
  }

  if (cursor === 0) return false;

  if (cursor < text.length) {
    pieces.appendChild(document.createTextNode(text.slice(cursor)));
  }

  node.replaceWith(pieces);
  return true;
}

/**
 * The seconds behind something that was pressed, or nothing if it was not a
 * chip.
 *
 * The reading half of the `data-seconds` contract, and the reason one handler
 * on a container can serve a whole rendered note however many chips it holds.
 */
export function timestampTargetSeconds(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;

  const raw = target.closest('.timestamp-link')?.getAttribute('data-seconds');
  if (raw === null || raw === undefined) return null;

  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * Extract all timestamps from markdown
 */
export interface TimestampAnnotation {
  timestamp: string;
  seconds: number;
  context: string; // surrounding text
}

export function extractTimestamps(markdown: string): TimestampAnnotation[] {
  const timestampRegex = timestampMatcher();
  const annotations: TimestampAnnotation[] = [];
  const lines = markdown.split('\n');

  lines.forEach((line) => {
    let match;
    while ((match = timestampRegex.exec(line)) !== null) {
      const timestamp = match[0];
      const seconds = parseTimestamp(timestamp);

      if (seconds !== null) {
        // Get context (the line containing the timestamp)
        const context = line.trim();

        annotations.push({
          timestamp,
          seconds,
          context,
        });
      }
    }
  });

  return annotations;
}

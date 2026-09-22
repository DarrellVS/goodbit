/**
 * The marks on a clip, as this server is willing to store them.
 *
 * A copy of the desktop's `PublishedGoodBit` rather than an import of it: the
 * publisher is its own package, built and shipped separately, and it already
 * duplicates the site's CSS for the same reason. What it cannot duplicate is
 * trust. This shape arrives over the network, from a request that has passed a
 * bearer token and nothing else, and it is then written into a file that is
 * read back and injected into a page, so every field is checked here and
 * anything unrecognised is dropped rather than carried.
 */
export interface PublishedGoodBit {
  startSec: number;
  endSec: number;
  name: string | null;
  reason: string | null;
}

/** Names and reasons are shown, so they are bounded before they are stored. */
const TEXT_LIMIT = 200;

/** More bands than a scrubber has pixels is a bug at the other end. */
const COUNT_LIMIT = 200;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, TEXT_LIMIT);
}

/**
 * What the request said, reduced to marks that can be drawn.
 *
 * Returns `undefined` for input that was not sent at all, which the callers
 * read as "leave the sidecar's own list alone", and an array for input that
 * was: an empty one included, since removing every mark in the app has to be
 * able to remove every band from the page.
 *
 * A range with no length, or one that ends before it starts, is dropped rather
 * than repaired. Both would paint a zero-width band, which reads as a scratch
 * on the scrubber, and neither is a moment anybody marked on purpose.
 */
export function parseGoodBits(value: unknown): PublishedGoodBit[] | undefined {
  if (value === undefined || value === null) return undefined;

  /*
   * A multipart field is a string, and `POST /api/publish` is multipart
   * because it carries the video. The same list arrives as JSON on the PATCH
   * beside it, so both shapes are taken here rather than at two call sites.
   */
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  if (!Array.isArray(raw)) return undefined;

  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      startSec: Number(item.startSec),
      endSec: Number(item.endSec),
      name: text(item.name),
      reason: text(item.reason),
    }))
    .filter(
      (bit) =>
        Number.isFinite(bit.startSec) &&
        Number.isFinite(bit.endSec) &&
        bit.startSec >= 0 &&
        bit.endSec > bit.startSec,
    )
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec)
    .slice(0, COUNT_LIMIT);
}

/** Whether two lists would draw the same thing, for the PATCH's no-op check. */
export function sameGoodBits(a: PublishedGoodBit[], b: PublishedGoodBit[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What a mark is called wherever it is shown.
 *
 * The embed page used this inline, and the Discord embed needs the same answer.
 * Two copies of `name || reason || 'GoodBit n'` is how the chip under the
 * player and the line in the channel end up naming one moment two ways.
 */
export function goodBitLabel(bit: PublishedGoodBit, index: number): string {
  return bit.name || bit.reason || `GoodBit ${index + 1}`;
}

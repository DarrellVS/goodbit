/**
 * Parse clip ids out of a route query value.
 *
 * Accepts `?clip=1`, `?clips=1,2,3`, and repeated params (`?clips=1&clips=2`),
 * which is how vue-router hands back a duplicated key. Order is significant,
 * the editor appends to the timeline in the order given, so it is preserved,
 * with duplicates dropped so the same clip is not stacked twice.
 */
export function parseClipIds(raw: unknown): number[] {
  const values = Array.isArray(raw) ? raw : [raw];

  const ids = values
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(','))
    .map((value) => Number(value.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

  return Array.from(new Set(ids));
}

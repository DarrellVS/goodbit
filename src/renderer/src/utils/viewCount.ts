import { pluralize } from './pluralize';

/**
 * How often a published clip has been watched, as the figure on its card's
 * chip beside Published: `37`, `1,234`. Empty means the chip is not drawn.
 *
 * **Null says nothing.** It means nobody has counted: a publisher older than
 * the counter, or no sync yet. A number there would be invented.
 *
 * **Zero says nothing either, on a card.** The counter started at zero for
 * every clip on the day it shipped, so a card cannot tell "nobody opened it"
 * from "nothing was counting then", and a tile is no place to explain the
 * difference. The Publisher screen knows `countingSince` and says both.
 *
 * Grouped digits because a clip that went round a Discord can reach four.
 */
export function viewCountFigure(views: number | null | undefined): string {
  if (views == null || !Number.isFinite(views) || views <= 0) return '';
  return Math.floor(views).toLocaleString('en-US');
}

/** The same count in words, for a screen reader: the chip itself is an eye and a number. */
export function viewCountLabel(views: number | null | undefined): string {
  const figure = viewCountFigure(views);
  if (!figure) return '';
  return `${figure} ${pluralize(Math.floor(views as number), 'view')}`;
}

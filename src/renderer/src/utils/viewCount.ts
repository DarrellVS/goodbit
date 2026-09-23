import { pluralize } from './pluralize';

/**
 * What a library card says about how often a published clip has been watched.
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
export function viewCountLabel(views: number | null | undefined): string {
  if (views == null || !Number.isFinite(views) || views <= 0) return '';
  const whole = Math.floor(views);
  return `${whole.toLocaleString('en-US')} ${pluralize(whole, 'view')}`;
}

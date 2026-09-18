/**
 * What to say before a clip goes, and it is not "are you sure".
 *
 * A delete here is two different acts wearing one name. The **file** moves to
 * the Recycle Bin, which is reversible and which the sentence says out loud,
 * because a question that implies otherwise makes somebody hesitate over the
 * half that was never at risk. The **row** is not: the name, the tags, the
 * notes and the marks exist only in GoodBit, so dragging the recording back
 * out of the bin gets the footage and nothing that was ever written about it.
 * The next scan indexes it as a clip nobody has looked at.
 *
 * So the question names whichever of those this clip actually carries, and
 * only those. A warning about notes on a clip with no notes is noise, and
 * noise is what teaches somebody to press Confirm without reading.
 *
 * Pure, and here rather than in the panel, so `tests/unit` owns the wording
 * rules without a window: which clause appears, in what order, and the
 * singular and plural of each.
 */

import { pluralize } from './pluralize';

export interface ClipDeleteFacts {
  /** How many GoodBits are on the clip. */
  markCount?: number;
  /** The notes, as written. Whitespace alone does not count as notes. */
  notes?: string | null;
  /** How many tags the clip carries. */
  tagCount?: number;
  /** The name somebody gave it, which is a DB field and not the filename. */
  displayName?: string | null;
}

/**
 * `a`, `a and b`, `a, b and c`.
 *
 * Written here rather than reached for through `Intl.ListFormat`, which this
 * project's TypeScript lib does not declare: raising the whole `lib` for one
 * sentence is a larger change than the sentence.
 */
export function andList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The half of the answer that is always true, whatever the clip carries. */
const RECOVERABLE =
  'The file goes to the Recycle Bin, so you can still get it back from there.';

export function clipDeleteQuestion(facts: ClipDeleteFacts): string {
  const losses: string[] = [];

  const marks = facts.markCount ?? 0;
  if (marks > 0) losses.push(`${marks} ${pluralize(marks, 'mark')}`);

  if (facts.notes?.trim()) losses.push('your notes');

  const tags = facts.tagCount ?? 0;
  if (tags > 0) losses.push(`${tags} ${pluralize(tags, 'tag')}`);

  if (facts.displayName?.trim()) losses.push('the name you gave it');

  if (losses.length === 0) return RECOVERABLE;

  const them = losses.length === 1 ? 'it' : 'them';
  return (
    `${RECOVERABLE} ${andList(losses)} live only in GoodBit, ` +
    `and putting the file back does not bring ${them}.`
  );
}

/**
 * What to call this clip in a sentence.
 *
 * The name somebody gave it, because that is what they will recognise, and the
 * filename otherwise: clips are never renamed on disk, so the two are different
 * strings for the same recording and only one of them was chosen by a person.
 */
export function clipTitle(clip: { displayName?: string | null; filename?: string } | null): string {
  return clip?.displayName?.trim() || clip?.filename || 'this clip';
}

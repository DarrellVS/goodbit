/**
 * Turning what somebody typed into something FTS5 will answer.
 *
 * The library's search was four `LIKE '%q%'` clauses across `filename`,
 * `displayName` and a joined `tag.name`. Three things wrong with that, in
 * order of how often they bite:
 *
 * - **It never looked at notes**, which is the one place somebody wrote down
 *   what actually happened in a clip. The whole point of being able to write a
 *   note is being able to find it again.
 * - **A leading wildcard cannot use an index**, so every search read every row.
 *   Survivable at 278 clips and not the reason to change it.
 * - **It matched inside words.** Searching `cs` returned every clip whose path
 *   contains those two letters anywhere, which on a Windows library is most of
 *   them.
 *
 * `clip_search` is an FTS5 table over `filename`, `displayName`, `notes` and
 * `game`, external content so the text is not stored twice, maintained by
 * triggers. See the `ClipSearch` migration for why the triggers look the way
 * they do.
 *
 * **This file exists because user input cannot go into a MATCH expression.**
 * FTS5's query syntax has operators (`AND`, `OR`, `NOT`, `NEAR`, `*`, `^`,
 * `-`, `:`, `"`), and a bare apostrophe or an unbalanced quote is a syntax
 * error rather than zero results. Somebody typing `don't` would get a 500, and
 * somebody typing `NOT` would get a query that means something they did not
 * ask for. So the input is tokenised here and rebuilt into an expression this
 * module chose, and nothing the user types is ever an operator.
 */

import { trimChar } from '../utils/trimChar.js';

/**
 * A search that will not be run as a query.
 *
 * Returned rather than throwing: a search box with one character in it is a
 * normal thing on the way to a real search, and the caller wants "no filter"
 * rather than an error.
 */
export interface SearchPlan {
  /** The `MATCH` expression, or null when there is nothing worth searching. */
  match: string | null;
  /** The terms, for anything that wants to say what it searched for. */
  terms: string[];
}

/** Below this a term matches most of the library, so it is not a search yet. */
const MIN_TERM_LENGTH = 2;

/** Enough for a sentence out of a note; beyond it somebody has pasted something. */
const MAX_TERMS = 12;

/**
 * Build a MATCH expression from whatever is in the search box.
 *
 * **Every term is quoted**, which is what makes this safe: inside double quotes
 * FTS5 treats a token as a string rather than as syntax, so `AND`, `NEAR` and
 * `-` lose their meaning. Embedded double quotes are doubled, the same escape
 * SQL uses, so a quote cannot end the string early.
 *
 * **Terms are joined with AND**, because two words is a narrowing rather than a
 * widening: somebody typing `battlefield helicopter` wants the clip with both,
 * and returning everything with either is the behaviour that makes people stop
 * using a search box.
 *
 * **The last term gets a `*`**, so the results change as somebody is still
 * typing. `helico` finds the helicopter, which is the difference between a
 * search that feels alive and one you have to finish and submit. Only the last,
 * because prefixing an earlier term widens a query the user has already
 * narrowed.
 */
export function planSearch(raw: string | undefined | null): SearchPlan {
  const terms = termsOf(raw);
  if (terms.length === 0) return { match: null, terms: [] };

  /*
   * A date is one thing, so it is matched as one thing.
   *
   * A recording is called `Battlefield 6_25.09.2026_15-15-15.mp4`, which FTS5
   * tokenises to `battlefield 6 25 09 2026 15 15 15 mp4`. Typing the date off
   * a card, `25-09-2026`, used to become `"25" AND "09" AND "2026"*`, three
   * independent tokens that only have to appear *somewhere*. So it matched
   * `Ready Or Not_09.07.2026_11-25-25` too: `09` from the month, `2026` from
   * the year, `25` out of the seconds. Somebody typed a date and got clips
   * from a different month with nothing to explain it.
   *
   * A phrase matches those tokens adjacent and in order, which is exactly what
   * a date is, so the false positives go away and `25.09.2026`, `25-09-2026`
   * and `25/09/2026` all mean the one day they look like.
   */
  const asDate = datePhrase(raw);
  if (asDate) return { match: asDate, terms };

  const expression = terms
    .map((term, index) => {
      const quoted = `"${term.replace(/"/g, '""')}"`;
      return index === terms.length - 1 ? `${quoted}*` : quoted;
    })
    .join(' AND ');

  return { match: expression, terms };
}

/** Month names, long and short, in the order `Date` numbers them. */
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** `sep` and `september` both mean 9. Null for anything that is not a month. */
function monthNumber(term: string): number | null {
  const lower = term.toLowerCase();
  const at = MONTHS.findIndex((name) => name === lower || name.slice(0, 3) === lower);
  return at === -1 ? null : at + 1;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * A phrase for a query that is a date, or null for one that is not.
 *
 * The parts are emitted in the order the filename holds them, day then month
 * then year, because a phrase is positional and `"09 25 2026"` would match
 * nothing at all.
 *
 * What is accepted, and why each form is here:
 *
 * - `25.09.2026`, `25-09-2026`, `25/09/2026`, `25 09 2026`. The middle one is
 *   what a card prints, and it was the one returning clips from other months.
 * - `25 September` and `September 25`, in either order, because a month name
 *   is unambiguous and a person reading "Fri, Sep 25" off a heading will type
 *   what they read.
 * - `September 2026`, month and year, for a whole month.
 *
 * A bare month name is deliberately not a date. `may` is also a word, `march`
 * is a word, and turning either into a month filter would quietly stop them
 * finding a clip somebody actually named "March of the tanks".
 */
function datePhrase(raw: string | undefined | null): string | null {
  /*
   * Read from the raw string rather than from `terms`.
   *
   * `termsOf` drops anything shorter than two characters, which is right for
   * ordinary searching and fatal here: `5-9-2026` arrives as a single term,
   * `2026`, with the day and the month already thrown away. A date has to be
   * recognised before that filter runs.
   */
  const text = (raw ?? '').trim();
  if (!text) return null;

  const parts = text.split(/[\s,./-]+/u).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;

  const numberOf = (part: string): number | null =>
    /^\d{1,4}$/.test(part) ? Number(part) : null;

  const numbers = parts.map(numberOf);
  const months = parts.map(monthNumber);

  const isDay = (n: number | null): n is number => n !== null && n >= 1 && n <= 31;
  const isYear = (n: number | null): n is number => n !== null && n >= 1970 && n <= 2999;

  // All numeric: day, month, year.
  if (parts.length === 3) {
    if (numbers.some((n) => n === null)) return null;
    const [day, month, year] = numbers as number[];
    if (!isDay(day) || month < 1 || month > 12 || !isYear(year)) return null;
    return `"${pad(day)} ${pad(month)} ${year}"`;
  }

  // A month name with a number beside it, in either order.
  for (const [a, b] of [[0, 1], [1, 0]] as const) {
    const month = months[a];
    const other = numbers[b];
    if (month === null || other === null) continue;

    if (isYear(other)) return `"${pad(month)} ${other}"`;
    if (isDay(other)) return `"${pad(other)} ${pad(month)}"`;
  }

  // Two numbers: day and month.
  if (numbers.every((n) => n !== null)) {
    const [day, month] = numbers as number[];
    if (isDay(day) && month >= 1 && month <= 12) return `"${pad(day)} ${pad(month)}"`;
  }

  return null;
}

/**
 * The words, with everything FTS5 could read as syntax removed.
 *
 * Split on anything that is not a letter, a digit or an apostrophe. Keeping the
 * apostrophe matters: `don't` is one word, and splitting it produces `don` and
 * `t`, of which `t` is below the length floor and `don` is a different search.
 *
 * Accents are left alone. The table is tokenised with
 * `unicode61 remove_diacritics 2`, so FTS5 folds them itself and a game with an
 * accent in its folder name is findable by typing it plainly.
 */
function termsOf(raw: string | undefined | null): string[] {
  if (!raw) return [];

  return raw
    .split(/[^\p{L}\p{N}']+/u)
    .map((term) => trimChar(term, "'"))
    .filter((term) => term.length >= MIN_TERM_LENGTH)
    .slice(0, MAX_TERMS);
}

/**
 * Is a search worth running against the index at all?
 *
 * One character, or a string of punctuation, produces no terms. The caller then
 * applies no filter rather than an empty one, which is the difference between
 * "still typing" and "nothing matches".
 */
export function isSearchable(raw: string | undefined | null): boolean {
  return termsOf(raw).length > 0;
}

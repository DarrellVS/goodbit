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

  const expression = terms
    .map((term, index) => {
      const quoted = `"${term.replace(/"/g, '""')}"`;
      return index === terms.length - 1 ? `${quoted}*` : quoted;
    })
    .join(' AND ');

  return { match: expression, terms };
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
    .map((term) => term.replace(/^'+|'+$/g, ''))
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

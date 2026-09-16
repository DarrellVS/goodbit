import { describe, expect, it } from 'vitest';
import { isSearchable, planSearch } from '../../../src/main/services/clipSearch.js';

/**
 * What somebody types, turned into something FTS5 will answer.
 *
 * The reason this is a module with tests rather than a template string in a
 * route: **FTS5's match syntax has operators**, and user input cannot be one.
 * `AND`, `OR`, `NOT` and `NEAR` are keywords, `*` `^` `-` `:` are syntax, and a
 * bare apostrophe or an unbalanced quote is a **syntax error rather than zero
 * results**. So somebody typing `don't` would have got a 500 from the library
 * screen, and somebody typing `NOT` would have got a query nobody asked for.
 *
 * The rule the tests below enforce is that every term is quoted, so nothing the
 * user types is ever read as syntax.
 */

describe('nothing the user types is an operator', () => {
  it('quotes every term', () => {
    expect(planSearch('helicopter').match).toBe('"helicopter"*');
  });

  it('defuses FTS5 keywords by quoting them', () => {
    // Unquoted, each of these changes what the query means.
    for (const keyword of ['AND', 'OR', 'NOT', 'NEAR']) {
      const plan = planSearch(`clip ${keyword}`);
      expect(plan.match).toContain(`"${keyword}"`);
      // The joiner is ours and appears exactly once between two terms.
      expect(plan.match?.match(/ AND /g)).toHaveLength(1);
    }
  });

  it('survives an apostrophe, which used to be a syntax error', () => {
    const plan = planSearch("don't shoot");

    expect(plan.terms).toEqual(["don't", 'shoot']);
    expect(plan.match).toBe('"don\'t" AND "shoot"*');
  });

  it('cannot be escaped with a double quote', () => {
    // The injection shape: close the string, add an operator, reopen.
    const plan = planSearch('rocket" OR notes:"secret');

    /*
     * Two defences, and the outer one wins before the inner one is reached.
     *
     * The tokeniser splits on anything that is not a letter, a digit or an
     * apostrophe, so a double quote and a colon never survive to be quoted:
     * what comes out is four ordinary terms. `OR` is one of them, neutralised
     * by being inside quotes, and `notes:` cannot act as FTS5's column filter
     * because the colon is gone.
     *
     * `planSearch` also doubles any embedded quote, which is unreachable while
     * the tokeniser is this strict. It stays: it is one `replace`, and it is
     * what holds if the tokeniser is ever loosened to keep more punctuation.
     */
    expect(plan.match).toBe('"rocket" AND "OR" AND "notes" AND "secret"*');
    expect(plan.match).not.toMatch(/(^|\s)notes:/);
    expect(plan.match).not.toMatch(/(^|\s)OR(\s|$)/);
  });

  it('drops the characters FTS5 would read as syntax', () => {
    const plan = planSearch('^start -minus *star :colon');

    expect(plan.terms).toEqual(['start', 'minus', 'star', 'colon']);
    expect(plan.match).not.toContain('^');
    expect(plan.match).not.toContain('-');
    expect(plan.match).not.toContain(':');
    // The one `*` is the one this module adds, at the end.
    expect(plan.match?.match(/\*/g)).toHaveLength(1);
  });
});

describe('two words narrow rather than widen', () => {
  it('joins terms with AND', () => {
    // `battlefield helicopter` means the clip with both. Returning everything
    // with either is the behaviour that makes people stop using a search box.
    expect(planSearch('battlefield helicopter').match).toBe('"battlefield" AND "helicopter"*');
  });

  it('prefixes only the last term, so results change while typing', () => {
    const plan = planSearch('battlefield helico');

    expect(plan.match).toBe('"battlefield" AND "helico"*');
    // Prefixing an earlier term would widen a query the user already narrowed.
    expect(plan.match?.startsWith('"battlefield"*')).toBe(false);
  });

  it('stops at a sensible number of terms', () => {
    const plan = planSearch(Array.from({ length: 40 }, (_, i) => `word${i}`).join(' '));

    expect(plan.terms.length).toBeLessThanOrEqual(12);
  });
});

describe('when there is nothing to search for yet', () => {
  it('is null for empty, missing and whitespace', () => {
    for (const input of ['', '   ', undefined, null]) {
      expect(planSearch(input).match).toBeNull();
      expect(isSearchable(input)).toBe(false);
    }
  });

  it('is null for one character, which matches most of a library', () => {
    // A search box with one letter in it is on the way to a search, not a
    // search. The caller applies no filter rather than an empty one.
    expect(planSearch('a').match).toBeNull();
    expect(planSearch('b ').match).toBeNull();
  });

  it('is null for punctuation on its own', () => {
    expect(planSearch('---').match).toBeNull();
    expect(planSearch('"""').match).toBeNull();
    expect(planSearch('***').match).toBeNull();
  });

  it('takes two characters, which is a real search', () => {
    expect(planSearch('bf').match).toBe('"bf"*');
    expect(isSearchable('bf')).toBe(true);
  });
});

describe('what a real library gets typed into it', () => {
  it('keeps accents, because the index folds them itself', () => {
    // The table is tokenised `unicode61 remove_diacritics 2`, so FTS5 matches
    // a folded form. Stripping accents here would be doing it twice, and
    // wrongly: it would also stop an exact spelling matching.
    const plan = planSearch('Pokémon Café');

    expect(plan.terms).toEqual(['Pokémon', 'Café']);
  });

  it('handles a game name with punctuation in it', () => {
    expect(planSearch("Tom Clancy's Rainbow Six").terms).toEqual([
      'Tom',
      "Clancy's",
      'Rainbow',
      'Six',
    ]);
  });

  it('handles a date the way somebody would type one', () => {
    expect(planSearch('22.08.2026').terms).toEqual(['22', '08', '2026']);
  });

  it('is not confused by a pasted filename', () => {
    const plan = planSearch('Battlefield 6_22.08.2026_15-41.mp4');

    expect(plan.terms).toContain('Battlefield');
    expect(plan.terms).toContain('mp4');
    expect(plan.match).not.toContain('-');
  });
});

import { SETTINGS_CATALOG, type SettingEntry } from './settingsCatalog';
import { sectionLabel } from './settingsSections';

/**
 * What the settings search field matches, as values.
 *
 * Seven sections and no map, and nine times out of ten somebody opens Settings
 * looking for one named thing. This is the map: the whole catalogue is searched
 * at once, so which section a setting happens to live in stops mattering.
 *
 * The rules are the library search's, for the same reasons
 * (`src/main/services/clipSearch.ts`): terms are joined with AND because two
 * words narrow rather than widen, and nothing typed is ever syntax. There is no
 * FTS engine behind this one, so there is nothing to escape and a substring
 * match is honest at this size: thirty-odd rows, compared in the renderer, on
 * every keystroke.
 */

/**
 * Where a term was found, low to high. The sum over every term is the entry's
 * score, and the lowest sorts first, so "backup" puts **Library backups** above
 * the three other rows whose descriptions mention one.
 */
const LABEL_WORD = 0;
const LABEL_INSIDE = 1;
const KEYWORD = 2;
const SECTION = 3;
const DESCRIPTION = 4;
const MISSING = Number.POSITIVE_INFINITY;

/**
 * Lower case, and one kind of apostrophe.
 *
 * Both spellings are live in these strings: the templates were written by hand
 * and hold `don't` in one place and `app’s` in another. Somebody typing either
 * one has to find both.
 */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[‘’]/g, "'");
}

/** The words of a string, so a term can match the start of any of them. */
function words(value: string): string[] {
  return normalise(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A typed query as the terms it holds. Whitespace only is no terms at all. */
export function searchTerms(query: string): string[] {
  return normalise(query).split(/\s+/).filter(Boolean);
}

function termScore(term: string, entry: SettingEntry): number {
  if (words(entry.label).some((word) => word.startsWith(term))) return LABEL_WORD;
  if (normalise(entry.label).includes(term)) return LABEL_INSIDE;

  const keywords = entry.keywords ?? [];
  if (keywords.some((keyword) => normalise(keyword).includes(term))) return KEYWORD;

  if (normalise(sectionLabel(entry.section)).includes(term)) return SECTION;
  if (normalise(entry.description).includes(term)) return DESCRIPTION;

  return MISSING;
}

/**
 * Every setting the query names, best first.
 *
 * An empty query is not "everything": the field is empty when nobody is
 * searching, and the page behind it is already showing a section.
 */
export function searchSettings(
  query: string,
  catalog: readonly SettingEntry[] = SETTINGS_CATALOG,
): SettingEntry[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];

  const scored: { entry: SettingEntry; score: number; index: number }[] = [];

  catalog.forEach((entry, index) => {
    let score = 0;
    for (const term of terms) {
      const found = termScore(term, entry);
      // Every term has to land somewhere. One that does not is the whole
      // reason a second word narrows the list.
      if (found === MISSING) return;
      score += found;
    }
    scored.push({ entry, score, index });
  });

  // Catalogue order is section order and then the order on screen, so ties come
  // out grouped by section rather than shuffled.
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return scored.map((match) => match.entry);
}

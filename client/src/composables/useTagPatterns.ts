import { ref, onMounted } from 'vue';
import {
  listTagPatterns,
  saveTagPattern,
  deleteTagPattern,
  importTagPatterns,
} from '../services/tagPatterns';
import { getAllPatterns as getLocalPatterns } from '../services/tagPatternsDb';
import { TAG_PATTERNS, type TagPattern, type TagCategory } from '../utils/tagSuggestions';

/**
 * The rules that suggest tags from a filename.
 *
 * These moved out of browser IndexedDB and into the library database. The one
 * lift of whatever was already stored locally happens on first load — see
 * `migrateLocalPatterns` — because a desktop build gets its own profile and
 * would otherwise never see them again.
 */
export function useTagPatterns() {
  const patterns = ref<TagPattern[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  /** Set when the one-time lift out of IndexedDB actually moved something. */
  const migrated = ref<number | null>(null);

  /** Sources cross the wire as strings; matching always applies `i`. */
  function toRegExps(sources: string[]): RegExp[] {
    return sources.flatMap((source) => {
      try {
        return [new RegExp(source, 'i')];
      } catch {
        // A rule that cannot compile would throw on every clip it is matched
        // against; dropping it is better than breaking suggestions entirely.
        console.warn(`Ignoring an invalid tag pattern: ${source}`);
        return [];
      }
    });
  }

  /**
   * Move anything still sitting in IndexedDB into the library, once.
   *
   * Runs only when the server has no rules at all, so it cannot resurrect
   * something deliberately deleted later. Existing rules are never overwritten.
   */
  async function migrateLocalPatterns(): Promise<number> {
    let local: TagPattern[] = [];
    try {
      local = await getLocalPatterns();
    } catch {
      return 0;
    }
    if (local.length === 0) return 0;

    const result = await importTagPatterns(
      local.map((pattern) => ({
        tag: pattern.tag,
        patterns: pattern.patterns.map((expression) => expression.source),
        category: pattern.category,
      })),
    );

    return result.imported;
  }

  async function loadPatterns(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      let stored = await listTagPatterns();

      if (stored.length === 0) {
        // Nothing on the server yet: adopt whatever the browser holds, and
        // fall back to the built-in set if it holds nothing either.
        const moved = await migrateLocalPatterns();
        if (moved > 0) migrated.value = moved;

        stored = await listTagPatterns();

        if (stored.length === 0) {
          await importTagPatterns(
            TAG_PATTERNS.map((pattern) => ({
              tag: pattern.tag,
              patterns: pattern.patterns.map((expression) => expression.source),
              category: pattern.category,
            })),
          );
          stored = await listTagPatterns();
        }
      }

      patterns.value = stored.map((pattern) => ({
        tag: pattern.tag,
        patterns: toRegExps(pattern.patterns),
        category: pattern.category,
      }));
    } catch (err) {
      console.error('Failed to load tag patterns:', err);
      error.value = 'Failed to load tag patterns';
      // Suggestions still work off the built-in set rather than nothing.
      patterns.value = TAG_PATTERNS;
    } finally {
      loading.value = false;
    }
  }

  async function addPattern(
    tag: string,
    patternStrings: string[],
    category: TagCategory
  ): Promise<void> {
    try {
      await saveTagPattern({
        tag,
        patterns: patternStrings.map((p) => optimizedSource(p)),
        category,
      });
      await loadPatterns();
    } catch (err) {
      console.error('Failed to add pattern:', err);
      throw err;
    }
  }

  /**
   * What to actually store for a typed expression.
   *
   * A bare word gets word boundaries, so `ar` does not match "start" or "car".
   * Anything already carrying regex syntax is taken as written.
   */
  function optimizedSource(patternString: string): string {
    const hasRegexSyntax = /[\\^$*+?.()|[\]{}]/.test(patternString);
    return hasRegexSyntax ? patternString : `\\b${escapeRegex(patternString)}\\b`;
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async function updatePattern(
    tag: string,
    patternStrings: string[],
    category: TagCategory
  ): Promise<void> {
    await addPattern(tag, patternStrings, category);
  }

  async function removePattern(tag: string): Promise<void> {
    try {
      await deleteTagPattern(tag);
      await loadPatterns();
    } catch (err) {
      console.error('Failed to delete pattern:', err);
      throw err;
    }
  }

  onMounted(() => {
    void loadPatterns();
  });

  return {
    patterns,
    loading,
    error,
    migrated,
    loadPatterns,
    addPattern,
    updatePattern,
    removePattern,
  };
}

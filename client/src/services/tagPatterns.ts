import axios from '../axios';
import type { TagCategory } from '../utils/tagSuggestions';

/**
 * Filename-matching rules, now kept by the server.
 *
 * They lived in browser IndexedDB, where clearing site data lost them and a
 * desktop build — which gets its own profile — would not have seen them at all.
 *
 * Expressions cross the wire as regex **sources**; RegExp objects do not
 * survive JSON. They are rebuilt with the `i` flag on arrival, which is the
 * same contract the IndexedDB version used.
 */
export interface StoredTagPattern {
  tag: string;
  patterns: string[];
  category: TagCategory;
}

export async function listTagPatterns(): Promise<StoredTagPattern[]> {
  const { data } = await axios.get<StoredTagPattern[]>('/api/tag-patterns');
  return data;
}

export async function saveTagPattern(pattern: StoredTagPattern): Promise<StoredTagPattern> {
  const { data } = await axios.put<StoredTagPattern>(
    `/api/tag-patterns/${encodeURIComponent(pattern.tag)}`,
    { patterns: pattern.patterns, category: pattern.category },
  );
  return data;
}

export async function deleteTagPattern(tag: string): Promise<void> {
  await axios.delete(`/api/tag-patterns/${encodeURIComponent(tag)}`);
}

export interface ImportResult {
  imported: number;
  skipped: number;
  rejected: string[];
}

/**
 * Bulk import. Existing rules are kept unless `overwrite` is set, so running
 * this twice cannot clobber edits made in between.
 */
export async function importTagPatterns(
  patterns: StoredTagPattern[],
  overwrite = false,
): Promise<ImportResult> {
  const { data } = await axios.post<ImportResult>('/api/tag-patterns/import', {
    patterns,
    overwrite,
  });
  return data;
}

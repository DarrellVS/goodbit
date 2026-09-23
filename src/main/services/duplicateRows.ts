/**
 * Two rows for one file, and which of them may go.
 *
 * Before the scan learned that `D:/Clips/x.mp4` and `D:\Clips\x.mp4` are the
 * same file, a clip indexed by one path spelling and found again by the other
 * got a second row. The scan stops making new ones, but it never removed an
 * old one: the file exists, so neither row looks orphaned, and the library
 * showed the clip twice, once with its publish state and once without.
 *
 * **Only a row that carries nothing is removed.** A clip row is the only copy
 * of its tags, notes, name, stars, marks and collections, so a duplicate is
 * retired only when everything it holds is already on the row that stays.
 * Anything else is left, twice, and logged: a clip shown twice is an
 * annoyance, and a clip whose notes were thrown away is a loss.
 *
 * The row only. The file is the same file either way and is never touched.
 */
export interface DuplicateCandidate {
  id: number;
  filePath: string;
  displayName: string | null;
  notes: string | null;
  starred: boolean;
  published: boolean;
  openCount: number;
  tags: number;
  marks: number;
  collections: number;
}

export interface DuplicatePlan {
  /** Rows safe to delete, because their twin holds everything they do. */
  remove: number[];
  /** Groups left alone because more than one row carries something, for the log. */
  kept: Array<{ path: string; ids: number[] }>;
}

const BACKSLASH = String.fromCharCode(92);
const samePath = (value: string): string => value.split(BACKSLASH).join('/').toLowerCase();

/** How much a row holds that nothing else does. Higher stays. */
function weight(row: DuplicateCandidate): number {
  return (
    row.tags * 1000 +
    row.marks * 1000 +
    row.collections * 1000 +
    (row.notes?.trim() ? 1000 : 0) +
    (row.starred ? 100 : 0) +
    (row.published ? 100 : 0) +
    row.openCount
  );
}

/** Whether `extra` holds anything `keeper` does not. */
function carriesMore(extra: DuplicateCandidate, keeper: DuplicateCandidate): boolean {
  if (extra.tags > 0 || extra.marks > 0 || extra.collections > 0) return true;
  if (extra.notes?.trim() && extra.notes !== keeper.notes) return true;
  if (extra.starred && !keeper.starred) return true;
  if (extra.published && !keeper.published) return true;
  const name = extra.displayName?.trim();
  if (name && name !== keeper.displayName?.trim()) return true;
  return false;
}

export function planDuplicateRows(rows: readonly DuplicateCandidate[]): DuplicatePlan {
  const groups = new Map<string, DuplicateCandidate[]>();
  for (const row of rows) {
    const key = samePath(row.filePath);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const plan: DuplicatePlan = { remove: [], kept: [] };
  for (const [path, group] of groups) {
    if (group.length < 2) continue;
    // The richest row stays; the oldest breaks a tie, since it is the one
    // anything outside the database is most likely to know about.
    const ordered = [...group].sort((a, b) => weight(b) - weight(a) || a.id - b.id);
    const [keeper, ...rest] = ordered;
    const removable = rest.filter((row) => !carriesMore(row, keeper));
    plan.remove.push(...removable.map((row) => row.id));
    if (removable.length < rest.length) plan.kept.push({ path, ids: ordered.map((row) => row.id) });
  }
  return plan;
}

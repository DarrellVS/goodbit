import { AppDataSource } from '../data-source.js';

/**
 * Is the search index really there, and answering?
 *
 * The index is created by a migration and kept in step by triggers, so on any
 * library the app has opened it exists. Three ways it might not, and none of
 * them should stop the library loading:
 *
 * - **A SQLite without FTS5.** The bundled build has it, verified, but the
 *   driver moves in wave 6 and `better-sqlite3` ships its own SQLite. A
 *   compile flag is exactly the kind of thing that changes underneath a
 *   dependency bump and is invisible until somebody searches.
 * - **A migration that has not run yet**, on a database opened by something
 *   other than the app, such as one of the bench scripts.
 * - **A restored backup taken before the index existed**, in the window
 *   between the restore and the relaunch that migrates it.
 *
 * Asked once per process and remembered. A `MATCH` against a missing virtual
 * table is a SQL error, not an empty result, so this cannot be left to a
 * try/catch around the real query: by then it has already been built into a
 * paged query with a count.
 *
 * The probe runs the same kind of statement the real query does, rather than
 * looking for the table in `sqlite_master`. A virtual table whose module is
 * missing still has a row there and fails the moment it is read, which is the
 * case worth catching.
 */
let usable: boolean | null = null;

export async function searchIndexUsable(): Promise<boolean> {
  if (usable !== null) return usable;

  try {
    await AppDataSource.query(
      `SELECT rowid FROM clip_search WHERE clip_search MATCH '"goodbit"*' LIMIT 1`,
    );
    usable = true;
  } catch (error) {
    usable = false;
    console.warn(
      '[search] the full text index is not answering, falling back to a slower search:',
      error instanceof Error ? error.message : error,
    );
  }

  return usable;
}

/**
 * Forget the answer.
 *
 * For a restore, which swaps the database file underneath a running process,
 * and for tests that build a library without migrating it.
 */
export function forgetSearchIndexState(): void {
  usable = null;
}

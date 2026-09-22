import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Whether a clip is something the editor rendered rather than something OBS
 * recorded.
 *
 * A timeline export now lands in its own game's folder,
 * `<videosRoot>/<Game>/Exports/`, instead of a top level `Exports/` directory
 * which, because a top level folder name *is* a game name in this app, was a
 * pseudo-game in the sidebar beside the real ones. Under its game it is in the
 * right place and it is also, in every other respect, a clip: it scans, it
 * gets a thumbnail, it can be trimmed and tagged and published. So the one
 * thing that is left to say is what it is, which is this column.
 *
 * **Not nullable, and false is a real answer.** Every row that predates this
 * is a recording, and saying so is correct rather than a guess. The scan
 * infers it from the path as well, so an export that arrived before its row,
 * or after a library restore, is still labelled.
 *
 * **Deliberately not in the FTS5 index.** `clip_search` covers `filename`,
 * `displayName`, `notes` and `game`, which is prose somebody wrote. A flag is
 * a filter, and indexing it would mean rewriting the triggers in
 * `1789563600003-ClipSearch.ts` for a column nobody will ever type.
 *
 * **Nothing on disk moves.** Old exports stay in the top level `Exports/`
 * folder and that pseudo-game does not disappear. Files are the source of
 * truth for content, and a release that rearranges somebody's library breaks
 * every shortcut and external link they have made.
 */
export class ClipIsExport1789563600005 implements MigrationInterface {
  name = 'ClipIsExport1789563600005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clip" ADD COLUMN "isExport" boolean NOT NULL DEFAULT (0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite has dropped columns since 3.35 and the bundled build is 3.44.
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "isExport"`);
  }
}

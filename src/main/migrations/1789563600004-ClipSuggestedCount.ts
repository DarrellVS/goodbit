import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * How many moments the analysis is confident about, so a card can say so.
 *
 * The sweep that runs when a game closes warms the measurement cache and
 * writes nothing else: the files land under `.goodbit-cache/analysis`, keyed by
 * the clip's own mtime, and the verdict is recomputed from them every time it
 * is asked for. That is the right shape for the measurement and it leaves the
 * library with no way to know: the grid is one query over `clip`, and asking
 * the cache would mean opening a JSON file per tile.
 *
 * So the count comes back with the sweep. One integer, and the column is the
 * whole feature: the library reads it with the row it already fetches, and the
 * grid can mark the clips worth opening without touching a cache directory.
 *
 * **Nullable, and that is the point.** Zero means the clip was read and nothing
 * stood out. Null means nobody has read it yet, which is every row that
 * predates this column and every clip recorded while the feature is off. A
 * marker that cannot tell those apart would put "nothing here" on a library
 * that has simply never been swept.
 *
 * Deliberately not an index. It is read for the rows a page already selected,
 * never sorted or filtered on, and an index on a column with three or four
 * distinct values earns nothing.
 */
export class ClipSuggestedCount1789563600004 implements MigrationInterface {
  name = 'ClipSuggestedCount1789563600004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clip" ADD COLUMN "suggestedCount" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite has dropped columns since 3.35 and the bundled build is 3.44.
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "suggestedCount"`);
  }
}

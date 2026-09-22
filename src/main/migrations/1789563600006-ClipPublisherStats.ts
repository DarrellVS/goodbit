import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * How often a published clip's page has been opened, and when it last was.
 *
 * Mirrored from the publisher rather than owned here, the same way
 * `suggestedCount` mirrors a cache: the library is one query per page and
 * cannot ask a remote server per tile, so the numbers come back with a sync
 * and sit on the row.
 *
 * **Nullable, and that is the whole design.** Null means nobody has ever
 * counted: either the clip is not published, or the publisher predates the
 * counter, or no sync has run yet. Zero means it is published, counting was
 * happening, and nobody opened it. Those are completely different claims, and
 * anything that suggests deleting clips has to be able to tell them apart or
 * it will recommend deleting the entire library the first time it is opened.
 *
 * Deliberately not in the FTS5 index: numbers, not prose. Deliberately not
 * indexed either: they are read for the rows a page has already selected.
 */
export class ClipPublisherStats1789563600006 implements MigrationInterface {
  name = 'ClipPublisherStats1789563600006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clip" ADD COLUMN "publisherViews" integer`);
    await queryRunner.query(`ALTER TABLE "clip" ADD COLUMN "publisherLastViewedAt" datetime`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite has dropped columns since 3.35 and the bundled build is 3.44.
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "publisherLastViewedAt"`);
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "publisherViews"`);
  }
}

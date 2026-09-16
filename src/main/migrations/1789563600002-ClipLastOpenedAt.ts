import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * When a clip was last opened, and how often, so retention can be honest.
 *
 * A library of 280 recordings at 3440x1440 is on the order of 50 to 80 GB and
 * it grows every session. Nothing in the app is about disk space, and the
 * retention screen 2.0 wants would say something like *"74 GB across 280 clips.
 * 190 have never been opened, never starred, never tagged, and have no
 * confident suggestion."*
 *
 * **"Never opened" is the most useful signal that screen could have and the app
 * has never recorded it.** Which is the whole reason these two columns land
 * now, in the release that is already moving the schema, rather than with the
 * screen that needs them. A retention screen shipped today could only go on
 * "untagged and unstarred", and would confidently recommend deleting clips that
 * had been watched twenty times.
 *
 * So: the columns start collecting in 2.0 and the screen ships once there are a
 * few months of them. Nothing reads these yet, on purpose.
 *
 * Null rather than zero for `lastOpenedAt`, because "never opened" and "opened
 * at the epoch" are different claims and the first one is what every row starts
 * as. `openCount` defaults to 0, which is the same statement in a column where
 * null would mean "we were not counting".
 */
export class ClipLastOpenedAt1789563600002 implements MigrationInterface {
  name = 'ClipLastOpenedAt1789563600002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clip" ADD COLUMN "lastOpenedAt" datetime`);
    await queryRunner.query(
      `ALTER TABLE "clip" ADD COLUMN "openCount" integer NOT NULL DEFAULT (0)`,
    );

    // The retention screen's one query is "least recently opened first", with
    // the nulls, which are the never-opened ones, wanted first of all.
    await queryRunner.query(`CREATE INDEX "IDX_clip_last_opened" ON "clip" ("lastOpenedAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clip_last_opened"`);
    // SQLite has dropped columns since 3.35 and the bundled build is 3.44.
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "openCount"`);
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "lastOpenedAt"`);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A clip can hold more than one moment.
 *
 * A trim replaces the file: `TrimAndSwapClipAction` writes the cut, renames the
 * original aside and swaps. Thirty seconds with two kills fifteen seconds apart
 * is one clip and you get to keep one of them; the other goes with the file.
 *
 * A mark is a named in and out range, stored as metadata. The recording stays
 * whole. This is consistent with the rule that files on disk are the source of
 * truth for content and the database is the source of truth for metadata: a
 * mark is metadata about content that is already there, the same argument that
 * makes `displayName` a database field.
 *
 * **The measurement changed what this is for.** `scripts/hud-check.mjs` over
 * 174 real recordings found 7, or 4%, holding two or more detected moments
 * above the confidence floor, against the 15% that would have made it a
 * headline feature. So the detector is not the reason this table exists. The
 * reason is **manual** marks: a person watching a clip knows it has two good
 * bits whether or not a kill banner appeared, and that needs no detector at
 * all. `source` exists to tell those apart, and the default is the manual one
 * because that is now the common case.
 *
 * `reason` is the sentence a detector wrote about why it marked something,
 * shown to the user. Null for a mark somebody made themselves, which needs no
 * justification.
 *
 * Deleting a clip takes its marks with it, by foreign key. `DELETE /clips/:id`
 * already unpublishes, purges caches, trashes the file and removes the row, and
 * a mark pointing at a clip that is gone is not a thing to keep.
 */
export class Moments1789563600001 implements MigrationInterface {
  name = 'Moments1789563600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "moment" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "clipId" integer NOT NULL,
        "startSec" real NOT NULL,
        "endSec" real NOT NULL,
        "name" text,
        "source" text NOT NULL DEFAULT ('manual'),
        "reason" text,
        "confidence" real,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_moment_clip" FOREIGN KEY ("clipId") REFERENCES "clip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CHK_moment_range" CHECK ("endSec" > "startSec")
      )
    `);

    // Every read of this table is "the marks on this clip", in order.
    await queryRunner.query(
      `CREATE INDEX "IDX_moment_clip" ON "moment" ("clipId", "startSec")`,
    );

    // For "show me what the detector found and nobody has looked at".
    await queryRunner.query(`CREATE INDEX "IDX_moment_source" ON "moment" ("source")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_moment_source"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_moment_clip"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "moment"`);
  }
}

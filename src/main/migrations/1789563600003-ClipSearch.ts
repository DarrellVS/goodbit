import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Search that can find a clip you remember, rather than one you can spell.
 *
 * What exists today is four `LIKE '%q%'` clauses in `GET /clips` across
 * `filename`, `displayName` and a joined `tag.name`. `LIKE` with a leading
 * wildcard cannot use an index, it matches inside words so "cs" finds every
 * clip with "cs" anywhere in a path, and **it does not look at notes at all**,
 * which is where somebody actually wrote what happened.
 *
 * FTS5, verified present in the bundled SQLite (3.44.2, `ENABLE_FTS5`, and
 * both plain and prefix matching checked against a real table before this was
 * written).
 *
 * **An external content table**, `content='clip'`, so the text is not stored
 * twice. FTS5 keeps only its index and reads the columns back out of `clip`
 * when it needs them, which for a library whose notes could be paragraphs is
 * the difference between an index and a second copy of the library.
 *
 * **The triggers are the whole correctness story.** With external content,
 * FTS5 has no idea when the underlying table changes, and an index that has
 * drifted is worse than no index: it returns clips that no longer match and
 * misses ones that do, silently. So every write to `clip` maintains it, and the
 * `delete` half has to be given **the old values**, which is why each update
 * and delete trigger inserts a `'delete'` row built from `old` before writing
 * the new one. Get that wrong and rows accumulate in the index for ever.
 *
 * **Tags are deliberately not in here.** They live in a join table, so keeping
 * them indexed needs triggers on `clip_tags_tag` as well, and a tag is about to
 * stop being a text-search concern: 3.10 gives the library a real multi-select
 * tag filter, which is a better answer to "show me the funny ones" than typing
 * the word and hoping. Searching prose and filtering by label are two different
 * actions and they were conflated because `LIKE` was all there was.
 *
 * Nothing queries this yet. 2.3 writes the query; this lands the schema in the
 * one release that is allowed to move it.
 */
export class ClipSearch1789563600003 implements MigrationInterface {
  name = 'ClipSearch1789563600003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * `game` is indexed as well as the names and the notes. It is already a
     * filter, but somebody typing "battlefield helicopter" means both, and
     * making them type into two controls to say one thing is the sort of
     * search that gets abandoned.
     *
     * `unicode61` with `remove_diacritics 2` is the default tokeniser with
     * accents folded, so a game with a trademark or an accent in its folder
     * name is still findable by typing it plainly.
     */
    await queryRunner.query(`
      CREATE VIRTUAL TABLE "clip_search" USING fts5(
        filename,
        displayName,
        notes,
        game,
        content='clip',
        content_rowid='id',
        tokenize="unicode61 remove_diacritics 2"
      )
    `);

    await queryRunner.query(`
      CREATE TRIGGER "clip_search_insert" AFTER INSERT ON "clip" BEGIN
        INSERT INTO "clip_search"(rowid, filename, displayName, notes, game)
        VALUES (new."id", new."filename", new."displayName", new."notes", new."game");
      END
    `);

    // The old row has to be retired with the values it was indexed under, not
    // the new ones, or its terms stay in the index for ever.
    await queryRunner.query(`
      CREATE TRIGGER "clip_search_delete" AFTER DELETE ON "clip" BEGIN
        INSERT INTO "clip_search"("clip_search", rowid, filename, displayName, notes, game)
        VALUES ('delete', old."id", old."filename", old."displayName", old."notes", old."game");
      END
    `);

    await queryRunner.query(`
      CREATE TRIGGER "clip_search_update" AFTER UPDATE ON "clip" BEGIN
        INSERT INTO "clip_search"("clip_search", rowid, filename, displayName, notes, game)
        VALUES ('delete', old."id", old."filename", old."displayName", old."notes", old."game");
        INSERT INTO "clip_search"(rowid, filename, displayName, notes, game)
        VALUES (new."id", new."filename", new."displayName", new."notes", new."game");
      END
    `);

    /*
     * And then the rows that are already there.
     *
     * The triggers only see writes from here on, so an existing library would
     * have an empty index and a search that finds nothing, which reads as a
     * broken search rather than as a missing backfill. `rebuild` is FTS5's own
     * command for reading an external content table in full.
     */
    await queryRunner.query(
      `INSERT INTO "clip_search"("clip_search") VALUES ('rebuild')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "clip_search_update"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "clip_search_delete"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "clip_search_insert"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clip_search"`);
  }
}

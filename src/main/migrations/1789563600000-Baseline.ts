import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The schema as it stood at the end of 1.10, written down.
 *
 * Every library in existence was built by `synchronize: true`, which compares
 * the entities to the tables on every boot and changes the tables to match.
 * There is therefore no migration history to continue from, and the first
 * migration cannot simply create the schema: on a real library the tables are
 * already there.
 *
 * So this one is **idempotent**. Every statement carries `IF NOT EXISTS`, which
 * makes it a no-op against a database `synchronize` already built, and the full
 * creation on a fresh one. Either way it lands in the `migrations` table and
 * everything after it can be a normal, ordered, one-way change.
 *
 * The alternative was to insert a row into `migrations` by hand for existing
 * databases and have this create tables unconditionally. That works until
 * somebody's database is *almost* current, which is exactly the case
 * `synchronize` produces when a boot half-finished, and then the pretend
 * history is a lie and the next migration runs against a schema that does not
 * match it.
 *
 * **The SQL is not hand-written.** It was read out of `sqlite_master` on a real
 * 278 clip library built by `synchronize` from the 1.10 entities, so a fresh
 * database gets byte-identical DDL to the one every existing library already
 * has, down to TypeORM's own generated constraint and index names. Those names
 * look like noise and they matter: TypeORM derives them from a hash of the
 * table and columns, and a later migration that drops a constraint has to name
 * the one that is really there.
 *
 * `sqlite_sequence` is deliberately absent. SQLite creates it itself for the
 * first `AUTOINCREMENT` table and refuses to let anyone else make it.
 *
 * There is no `down`. This is the floor; going below it means having no
 * database, which is what deleting the file is for.
 */
export class Baseline1789563600000 implements MigrationInterface {
  name = 'Baseline1789563600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of TABLES) await queryRunner.query(statement);
    for (const statement of INDEXES) await queryRunner.query(statement);
  }

  public async down(): Promise<void> {
    // Intentionally empty. See the note above.
  }
}

const TABLES = [
  `CREATE TABLE IF NOT EXISTS "clip" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "filePath" text NOT NULL,
    "relPath" text NOT NULL,
    "game" text NOT NULL,
    "filename" text NOT NULL,
    "displayName" text,
    "extension" text NOT NULL DEFAULT (''),
    "sizeBytes" integer NOT NULL,
    "fileModifiedAt" datetime NOT NULL,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
    "published" boolean NOT NULL DEFAULT (0),
    "publishedUrl" text,
    "starred" boolean NOT NULL DEFAULT (0),
    "notes" text,
    "durationSec" float,
    "recordedAt" datetime
  )`,

  `CREATE TABLE IF NOT EXISTS "tag" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "name" text NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS "collection" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "name" text NOT NULL,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS "game" (
    "name" text PRIMARY KEY NOT NULL,
    "displayName" text,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
    "hidden" boolean NOT NULL DEFAULT (0),
    "steamAppId" text,
    "steamAppIdLocked" boolean NOT NULL DEFAULT (0)
  )`,

  `CREATE TABLE IF NOT EXISTS "project" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "name" text NOT NULL,
    "timeline" text NOT NULL,
    "format" text NOT NULL DEFAULT ('original'),
    "framePos" real NOT NULL DEFAULT (0.5),
    "normalizeLoudness" boolean NOT NULL DEFAULT (0),
    "archived" boolean NOT NULL DEFAULT (0),
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS "tag_pattern" (
    "tag" text PRIMARY KEY NOT NULL,
    "patterns" text NOT NULL,
    "category" text NOT NULL DEFAULT ('General'),
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS "highlight_label" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "clipId" integer NOT NULL,
    "game" text NOT NULL,
    "durationSec" real NOT NULL,
    "source" text NOT NULL,
    "chosenStartSec" real,
    "chosenEndSec" real,
    "suggestedStartSec" real,
    "suggestedEndSec" real,
    "peakZ" real,
    "spreadLu" real,
    "eventSec" real,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,

  // The two join tables. Their constraint names are TypeORM's own; see the note
  // at the top about why they are reproduced rather than regenerated.
  `CREATE TABLE IF NOT EXISTS "clip_tags_tag" (
    "clipId" integer NOT NULL,
    "tagId" integer NOT NULL,
    CONSTRAINT "FK_1cb3cedb1e797a53c18a6d2944c" FOREIGN KEY ("clipId") REFERENCES "clip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FK_66a85e8c02c6790bb850e77c067" FOREIGN KEY ("tagId") REFERENCES "tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("clipId", "tagId")
  )`,

  `CREATE TABLE IF NOT EXISTS "collection_clips_clip" (
    "collectionId" integer NOT NULL,
    "clipId" integer NOT NULL,
    CONSTRAINT "FK_0860177fdf458055a1a15f9f293" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FK_e11304f8a021ac1550b5548fb5b" FOREIGN KEY ("clipId") REFERENCES "clip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("collectionId", "clipId")
  )`,
];

const INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_2c8316fc093222efb0b72e8d70" ON "clip" ("filePath")`,
  `CREATE INDEX IF NOT EXISTS "IDX_229ad06ef59afc10662d1a9b6d" ON "clip" ("relPath")`,
  `CREATE INDEX IF NOT EXISTS "IDX_c8c2352221449507319d5fca6d" ON "clip" ("game")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_6a9775008add570dc3e5a0bab7" ON "tag" ("name")`,
  `CREATE INDEX IF NOT EXISTS "IDX_971ae26d49a3a5aab3858abc56" ON "game" ("displayName")`,
  `CREATE INDEX IF NOT EXISTS "IDX_c0bafd542e04c1e7e1c9119fce" ON "game" ("hidden")`,
  `CREATE INDEX IF NOT EXISTS "IDX_2d92cf3b3945c4deb2fa0ee474" ON "highlight_label" ("clipId")`,
  `CREATE INDEX IF NOT EXISTS "IDX_addc5bcbba311ce9965b062f02" ON "highlight_label" ("game")`,
  `CREATE INDEX IF NOT EXISTS "IDX_1f3f84473c60c4e532c787169d" ON "highlight_label" ("source")`,
  `CREATE INDEX IF NOT EXISTS "IDX_1cb3cedb1e797a53c18a6d2944" ON "clip_tags_tag" ("clipId")`,
  `CREATE INDEX IF NOT EXISTS "IDX_66a85e8c02c6790bb850e77c06" ON "clip_tags_tag" ("tagId")`,
  `CREATE INDEX IF NOT EXISTS "IDX_0860177fdf458055a1a15f9f29" ON "collection_clips_clip" ("collectionId")`,
  `CREATE INDEX IF NOT EXISTS "IDX_e11304f8a021ac1550b5548fb5" ON "collection_clips_clip" ("clipId")`,
];

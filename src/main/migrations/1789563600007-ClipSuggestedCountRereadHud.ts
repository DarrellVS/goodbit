import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Forget the moment counts the Battlefield HUD reader wrote before it could
 * read a banner over bright ground.
 *
 * `suggestedCount` mirrors a cache. The cache itself moved on by itself, since
 * `HUD_VERSION` is in its key, but this column is written only by the sweep
 * that runs when a game closes, so a clip read by the old reader would keep
 * saying "nothing here" on its card long after opening it found a kill.
 *
 * **Null, not zero**, because null already means "nobody has looked", which is
 * now the truth. Only Battlefield: no other game has a HUD module, so no other
 * game's count could have changed, and clearing those would take a marker off
 * a library for nothing. The names are the module's own `games`, lower-cased,
 * because the registry matches folder names case-insensitively.
 *
 * Nothing to put back on the way down: the old counts were the stale ones.
 */
export class ClipSuggestedCountRereadHud1789563600007 implements MigrationInterface {
  name = 'ClipSuggestedCountRereadHud1789563600007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "clip" SET "suggestedCount" = NULL WHERE lower("game") IN ('battlefield 6', 'bf6')`,
    );
  }

  public async down(): Promise<void> {
    // The counts this cleared were wrong; there is nothing worth restoring.
  }
}

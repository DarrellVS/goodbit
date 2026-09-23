import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Which version of a clip's file its detected GoodBits were written for.
 *
 * The analysis writes a GoodBit for every moment it is sure of
 * (`services/detectedGoodBits.ts`), and it runs again whenever the trimmer
 * opens a clip. Without a note of what was already done, deleting a detected
 * GoodBit you did not want would bring it straight back the next time.
 *
 * Holds the file's own `fileModifiedAt` at the time, so a clip whose file
 * really changed is read afresh. Null is "never written", which is every row
 * there is when this runs, and the next read or the boot pass fills it in.
 */
export class ClipDetectedMarkedFor1789563600008 implements MigrationInterface {
  name = 'ClipDetectedMarkedFor1789563600008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clip" ADD COLUMN "detectedMarkedFor" datetime`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clip" DROP COLUMN "detectedMarkedFor"`);
  }
}

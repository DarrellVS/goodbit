import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Clip } from './Clip.js';

/**
 * Where a GoodBit came from: `manual`, `hud` or `audio`.
 *
 * `manual` is somebody marking a range themselves, which after the measurement
 * is the common case. `hud` is a range a game module read off the screen, and
 * `audio` one the loudness analysis pointed at. The two detected kinds carry a
 * `reason` and a `confidence`; a person marking their own clip owes nobody an
 * explanation.
 */
export type GoodBitSource = 'manual' | 'hud' | 'audio';

/**
 * A named range inside a clip, which does not change the clip.
 *
 * A trim replaces the file, so a thirty second recording with two good bits in
 * it is one clip and you get to keep one of them. A GoodBit leaves the
 * recording whole and can be played, named, put on the editor timeline, or
 * rendered out into the library as a clip of its own. Destructive trim stays,
 * as "cut the recording down", for getting the disk back.
 *
 * Metadata about content that is already on disk, which is the same footing as
 * `displayName`: the file is the truth about what was recorded, the database is
 * the truth about what anyone thinks of it.
 */
@Entity()
@Index(['clipId', 'startSec'])
export class GoodBit {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  clipId!: number;

  /**
   * Deleting the clip deletes its GoodBits, in the database rather than in
   * code.
   *
   * `DELETE /clips/:id` already unpublishes, purges caches, trashes the file
   * and removes the row. A GoodBit pointing at a clip that no longer exists is
   * not a thing worth keeping, and a cascade means the delete path does not
   * have to remember this table exists. TypeORM's sqlite driver opens every
   * connection with `PRAGMA foreign_keys = ON`, so the cascade is live rather
   * than decorative, which on SQLite is not a given.
   */
  @ManyToOne(() => Clip, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'clipId' })
  clip?: Clip;

  /** Seconds from the start of the recording. */
  @Column({ type: 'real' })
  startSec!: number;

  @Column({ type: 'real' })
  endSec!: number;

  /** What somebody called it, if they called it anything. */
  @Column('text', { nullable: true })
  name!: string | null;

  @Index()
  @Column('text', { default: 'manual' })
  source!: GoodBitSource;

  /**
   * One line explaining why a detector marked this, in the app's voice.
   *
   * The same sentence a `GameEvent` carries, and it is shown to the user, which
   * is why it is stored rather than regenerated: the rule that produced it may
   * have moved by the time anyone reads it.
   */
  @Column('text', { nullable: true })
  reason!: string | null;

  /** 0 to 1, for a detected GoodBit. Null for one somebody made. */
  @Column({ type: 'real', nullable: true })
  confidence!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

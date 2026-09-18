import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, ManyToMany, JoinTable } from 'typeorm';
import { Tag } from './Tag.js';

@Entity()
export class Clip {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column('text')
  filePath!: string; // absolute path on disk

  @Index()
  @Column('text')
  relPath!: string; // path relative to VIDEOS_ROOT, uses OS separators

  @Index()
  @Column('text')
  game!: string; // derived from top-level folder name

  @Column('text')
  filename!: string; // basename of file

  @Column('text', { nullable: true })
  displayName!: string | null; // user-defined name; do not rename file

  @Column('text', { default: '' })
  extension!: string;

  @Column({ type: 'integer' })
  sizeBytes!: number;

  /**
   * How long the recording is, in seconds.
   *
   * Stored rather than probed on demand because the library needs it on every
   * tile at once, and it is the first thing anyone wants when deciding what to
   * cut. Nullable: it is filled in by the scan, so rows that predate this
   * column simply have not been probed yet.
   */
  @Column({ type: 'float', nullable: true })
  durationSec?: number | null;

  /**
   * When the file on disk last changed. Tracks the file, always.
   *
   * Every derived thing is invalidated by comparing against this: the analysis
   * cache, and the `?v=` on a media URL that stops the browser showing a
   * picture it has already decoded. So it has to move whenever the bytes move.
   */
  @Column({ type: 'datetime' })
  fileModifiedAt!: Date;

  /**
   * When the moment was recorded, which is a different question.
   *
   * Taken from the file's date the first time it is indexed and never touched
   * again. Trimming rewrites the file, so its date becomes the moment you
   * pressed save, and using that everywhere sent an August recording into
   * today's group. Keeping the recording date *in the file's own mtime* was
   * the first attempt and was worse: it made the mtime lie, so a trimmed clip
   * kept its old analysis and the browser kept playing the video it had
   * already cached.
   */
  @Column({ type: 'datetime', nullable: true })
  recordedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'boolean', default: false })
  published!: boolean;

  @Column('text', { nullable: true })
  publishedUrl!: string | null;

  @Column({ type: 'boolean', default: false })
  starred!: boolean;

  @Column('text', { nullable: true })
  notes!: string | null;

  /**
   * When this clip was last opened, and how many times.
   *
   * Collected from 2.0 and read by nothing yet, on purpose. The retention
   * screen wants to say "190 of these have never been opened", and "never
   * opened" is the most useful signal it could have and the one the app had
   * never recorded. A screen shipped before the column has been collecting
   * would have only "untagged and unstarred" to go on, and would confidently
   * recommend deleting clips that had been watched twenty times.
   *
   * Null rather than zero, because "never opened" and "opened at the epoch"
   * are different claims.
   */
  @Index()
  @Column({ type: 'datetime', nullable: true })
  lastOpenedAt?: Date | null;

  @Column({ type: 'integer', default: 0 })
  openCount!: number;

  /**
   * How many moments the analysis is confident about in this clip.
   *
   * Written by the sweep that runs when a game closes, which otherwise leaves
   * nothing behind: the measurement lives in `.goodbit-cache/analysis`, keyed
   * by mtime, and the verdict is recomputed from it every time. The library is
   * one query over this table and cannot open a cache file per tile, so the
   * count comes back with the sweep and the grid reads it for free.
   *
   * Null is "nobody has looked", which is not the same as zero. Every row
   * predating the column is null, and so is every clip recorded while the
   * sweep is switched off.
   */
  @Column({ type: 'integer', nullable: true })
  suggestedCount?: number | null;

  @ManyToMany(() => Tag, { cascade: ['insert'] })
  @JoinTable()
  tags!: Tag[];
}



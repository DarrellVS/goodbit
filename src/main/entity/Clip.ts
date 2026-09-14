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

  @Column({ type: 'datetime' })
  fileModifiedAt!: Date;

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

  @ManyToMany(() => Tag, { cascade: ['insert'] })
  @JoinTable()
  tags!: Tag[];
}



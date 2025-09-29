import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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
}



import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class Game {
  @PrimaryColumn('text')
  name!: string; // The actual folder name (never changes)

  @Index()
  @Column('text', { nullable: true })
  displayName!: string | null; // User-defined display name (optional)

  // Hidden games stay on disk and stay indexed — they are only kept out of the
  // browsing surfaces (library list, games list, stats, today, latest). Reaching
  // a clip explicitly (by id, by game filter, through a collection) still works.
  @Index()
  @Column('boolean', { default: false })
  hidden!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

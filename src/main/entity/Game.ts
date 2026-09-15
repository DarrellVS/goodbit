import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class Game {
  @PrimaryColumn('text')
  name!: string; // The actual folder name (never changes)

  @Index()
  @Column('text', { nullable: true })
  displayName!: string | null; // User-defined display name (optional)

  // Hidden games stay on disk and stay indexed. They are only kept out of the
  // browsing surfaces (library list, games list, stats, today, latest). Reaching
  // a clip explicitly (by id, by game filter, through a collection) still works.
  @Index()
  @Column('boolean', { default: false })
  hidden!: boolean;

  /**
   * The Steam appid, when this game is one.
   *
   * Kept so the artwork keeps working after a game is uninstalled, and so the
   * match is made once rather than on every render. Null is an ordinary value:
   * most libraries hold folders that are a browser, a drone camera, or a game
   * from somewhere else entirely.
   *
   * `steamAppIdLocked` means a person said which game this is, so the matcher
   * must not overwrite it. That is the only repair available for a folder
   * named after an executable, which is the whole of the miss list.
   */
  @Column('text', { nullable: true })
  steamAppId!: string | null;

  @Column('boolean', { default: false })
  steamAppIdLocked!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

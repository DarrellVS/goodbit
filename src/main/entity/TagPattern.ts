import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * A rule that suggests a tag from a clip's filename.
 *
 * These lived in browser IndexedDB, which meant clearing site data lost them,
 * the server could not apply them, and — the reason they moved — a desktop app
 * gets its own profile, so they would not have survived the migration at all.
 *
 * The tag is the primary key: one rule per tag, which is what the editing UI
 * already assumed.
 */
@Entity()
export class TagPattern {
  /** The tag this rule suggests, e.g. `headshot`. */
  @PrimaryColumn('text')
  tag!: string;

  /**
   * The regex sources, JSON-encoded, without flags or delimiters —
   * `["headshot","\\bhs\\b"]`. Stored as source strings because that is what
   * survives serialisation; matching always applies the `i` flag, exactly as
   * the browser version did.
   */
  @Column('text')
  patterns!: string;

  /** Gameplay, Weapons, Maps, Modes, Quality, General. */
  @Column('text', { default: 'General' })
  category!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

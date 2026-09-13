import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * A saved editor timeline.
 *
 * Drafts used to live only in the browser's IndexedDB, which meant clearing
 * site data lost every one of them and a timeline built at the desk was
 * invisible from the couch. The same payload lives here instead, so a draft
 * belongs to the library rather than to one browser profile.
 *
 * `timeline` is the draft JSON as the editor already stores it: clip ids, track
 * filenames and the edits. Media URLs stay out — they carry an expiring token
 * and a LAN host — and are rebuilt on restore, exactly as the local drafts do.
 * Kept as a JSON column rather than rows because nothing ever queries inside it.
 */
@Entity()
export class Project {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('text')
  name!: string;

  /** The serialised timeline: `{ clips: [...], audio: [...] }`. */
  @Column('text')
  timeline!: string;

  /** Shape the movie was last framed in, so reopening a project keeps it. */
  @Column('text', { default: 'original' })
  format!: string;

  /** 0..1 crop position, stored alongside the format it belongs to. */
  @Column('real', { default: 0.5 })
  framePos!: number;

  @Column('boolean', { default: false })
  normalizeLoudness!: boolean;

  /** Out of the way without being gone. */
  @Column('boolean', { default: false })
  archived!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * What a person decided about where the good bit is.
 *
 * Every trim is a human answering exactly the question the analysis is trying
 * to answer — out of these thirty seconds, these six are the ones worth
 * keeping — and until now that answer was thrown away the moment the file was
 * swapped. So was every time someone looked at a suggestion and ignored it.
 *
 * These rows are the only supervision this problem will ever have, and they
 * cost nothing to keep. A model trained on them is the point of collecting
 * them, but even unread they make it possible to ask "how often is the
 * suggestion taken" rather than guess.
 *
 * Nothing here identifies anything beyond a clip in this library.
 */
@Entity()
export class HighlightLabel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'integer' })
  clipId!: number;

  /** Kept separately, because the clip may be renamed, moved or deleted later. */
  @Index()
  @Column('text')
  game!: string;

  @Column('real')
  durationSec!: number;

  /**
   * How the label came about.
   *
   * `trim` — the strongest signal: someone cut the clip themselves.
   * `accepted` — they took the suggestion as offered.
   * `rejected` — they were shown a suggestion and said it was wrong.
   */
  @Index()
  @Column('text')
  source!: 'trim' | 'accepted' | 'rejected';

  /** Where the person actually cut, when they cut. Null for a plain rejection. */
  @Column('real', { nullable: true })
  chosenStartSec!: number | null;

  @Column('real', { nullable: true })
  chosenEndSec!: number | null;

  /** What the analysis had offered at the time, if anything. */
  @Column('real', { nullable: true })
  suggestedStartSec!: number | null;

  @Column('real', { nullable: true })
  suggestedEndSec!: number | null;

  /** The analysis's own numbers, so a model can be fitted without re-measuring. */
  @Column('real', { nullable: true })
  peakZ!: number | null;

  @Column('real', { nullable: true })
  spreadLu!: number | null;

  @Column('real', { nullable: true })
  eventSec!: number | null;

  @CreateDateColumn()
  createdAt!: Date;
}

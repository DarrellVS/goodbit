import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class Game {
  @PrimaryColumn('text')
  name!: string; // The actual folder name (never changes)

  @Index()
  @Column('text', { nullable: true })
  displayName!: string | null; // User-defined display name (optional)

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}


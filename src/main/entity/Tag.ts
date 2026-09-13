import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
export class Tag {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column('text')
  name!: string;

  // Inverse side omitted to avoid circular imports; relation is owned by Clip
}



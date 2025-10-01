import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToMany, JoinTable } from 'typeorm';
import { Clip } from './Clip.js';

@Entity()
export class Collection {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('text')
  name!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToMany(() => Clip)
  @JoinTable()
  clips!: Clip[];
}


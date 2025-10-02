import 'reflect-metadata';
import { DataSource } from 'typeorm';
import path from 'node:path';
import fs from 'node:fs';
import { Clip } from './entity/Clip.js';
import { Tag } from './entity/Tag.js';
import { Collection } from './entity/Collection.js';

const DEFAULT_VIDEOS_ROOT = 'C:\\Users\\darre\\Videos';
export const VIDEOS_ROOT = process.env.VIDEOS_ROOT || DEFAULT_VIDEOS_ROOT;

const DEFAULT_AUDIO_ROOT = 'C:\\Users\\darre\\Music';
export const AUDIO_ROOT = process.env.AUDIO_ROOT || DEFAULT_AUDIO_ROOT;

// Ensure the videos root exists
if (!fs.existsSync(VIDEOS_ROOT)) {
  throw new Error(`VIDEOS_ROOT does not exist: ${VIDEOS_ROOT}`);
}

const dbPath = process.env.DB_PATH || path.join(VIDEOS_ROOT, 'filmpje.db');

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: dbPath,
  entities: [Clip, Tag, Collection],
  synchronize: true,
  logging: false,
});



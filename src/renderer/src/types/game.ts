// Re-export types from shared module, as plain data (see ./plain).
import type { GameDTO } from '@shared/index';
import type { PlainData } from './plain';

export type Game = PlainData<GameDTO>;

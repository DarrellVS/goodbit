// Re-export types from shared module, as plain data (see ./plain).
import type { TagDTO } from '../../../shared';
import type { PlainData } from './plain';

export type Tag = PlainData<TagDTO>;

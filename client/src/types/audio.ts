// Re-export types from shared module, as plain data (see ./plain).
import type { AudioTrackDTO } from '../../../shared';
import type { PlainData } from './plain';

export type AudioTrack = PlainData<AudioTrackDTO>;

// Re-export types from shared module, as plain data (see ./plain).
import type { ClipDTO, UpdateClipRequestDTO as UpdateClipRequestDTOClass } from '../../../shared';
import type { PlainData } from './plain';

export type Clip = PlainData<ClipDTO>;
export type UpdateClipRequestDTO = PlainData<UpdateClipRequestDTOClass>;

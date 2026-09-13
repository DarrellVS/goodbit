// Re-export types from shared module, as plain data (see ./plain).
import type {
  CollectionDTO,
  CollectionWithClipsDTO as CollectionWithClipsDTOClass,
  CreateCollectionRequestDTO as CreateCollectionRequestDTOClass,
  UpdateCollectionRequestDTO as UpdateCollectionRequestDTOClass,
} from '@shared/index';
import type { PlainData } from './plain';

export type Collection = PlainData<CollectionDTO>;
export type CollectionWithClipsDTO = PlainData<CollectionWithClipsDTOClass>;
export type CreateCollectionRequestDTO = PlainData<CreateCollectionRequestDTOClass>;
export type UpdateCollectionRequestDTO = PlainData<UpdateCollectionRequestDTOClass>;

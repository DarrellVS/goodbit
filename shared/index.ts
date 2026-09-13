/**
 * Shared module for Filmpje
 * Exports DTOs, types, and utilities used across client, server, and publisher
 */

// Base DTO
export * from './dtos/BaseDTO.js';

// Clip DTOs
export * from './dtos/clip/ClipDTO.js';
export * from './dtos/clip/UpdateClipRequestDTO.js';

// Tag DTOs
export * from './dtos/tag/TagDTO.js';

// Collection DTOs
export * from './dtos/collection/CollectionDTO.js';
export * from './dtos/collection/CollectionWithClipsDTO.js';
export * from './dtos/collection/CreateCollectionRequestDTO.js';
export * from './dtos/collection/UpdateCollectionRequestDTO.js';

// Game DTOs
export * from './dtos/game/GameDTO.js';

// Audio DTOs
export * from './dtos/audio/AudioTrackDTO.js';


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
export * from './dtos/tag/TagPatternDTO.js';

// Collection DTOs
export * from './dtos/collection/CollectionDTO.js';
export * from './dtos/collection/CollectionWithClipsDTO.js';
export * from './dtos/collection/CreateCollectionRequestDTO.js';
export * from './dtos/collection/UpdateCollectionRequestDTO.js';

// Game DTOs
export * from './dtos/game/GameDTO.js';

// Audio DTOs
export * from './dtos/audio/AudioTrackDTO.js';

// Sizes shared between the drawn title bar and the native overlay
export * from './constants/ui.js';

// Export formats and crop maths, shared so the crop frame and the ffmpeg
// filter cannot drift apart
export * from './constants/exportFormats.js';

// Saved editor timelines
export * from './dtos/project/ProjectDTO.js';

// Highlight suggestions
export * from './dtos/clip/ClipSuggestionsDTO.js';


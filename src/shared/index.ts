/**
 * Shared module for GoodBit
 * Exports DTOs, types, and utilities used across client, server, and publisher
 */

// Base DTO
export * from './dtos/BaseDTO.js';

// Clip DTOs
export * from './dtos/clip/ClipDTO.js';
export * from './dtos/clip/UpdateClipRequestDTO.js';
export * from './dtos/clip/ClipAudioDTO.js';

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

// Which files are clips, so the scan and the watcher cannot disagree again
export * from './constants/videoFiles.js';

// Where a window opens and closes around a moment, so the analysis and a
// GoodBit made from one cannot disagree about the same reading
export * from './constants/suggestionWindow.js';

// Export formats and crop maths, shared so the crop frame and the ffmpeg
// filter cannot drift apart
export * from './constants/exportFormats.js';

// Saved editor timelines
export * from './dtos/project/ProjectDTO.js';

// Highlight suggestions
export * from './dtos/clip/ClipSuggestionsDTO.js';

// The bits of a clip worth watching, which do not change the clip
export * from './dtos/goodbit/GoodBitDTO.js';

// The same marks, cut down to what a published clip's embed page can use
export * from './dtos/goodbit/PublishedGoodBitDTO.js';

// What an OBS setup looks like, agreed once rather than written out in both
// processes and allowed to drift
export * from './dtos/obs/ObsDTO.js';

// Which sound lands on which OBS track, agreed once so the preview in the
// window and the bitmask written into the scene collection cannot disagree
export * from './constants/obsAudioTracks.js';

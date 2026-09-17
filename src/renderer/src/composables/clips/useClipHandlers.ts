import type { Clip } from '@renderer/types/clip';
import { videoUrl as videoUrlFor, thumbUrl as thumbUrlFor } from '@renderer/utils/mediaUrl';

export function useClipHandlers() {
  function getVideoUrl(clip: Clip): string {
    return videoUrlFor(clip.id, clip.fileModifiedAt);
  }

  function getThumbUrl(clip: Clip): string {
    return thumbUrlFor(clip.id, clip.fileModifiedAt);
  }

  return {
    getVideoUrl,
    getThumbUrl,
  };
}


import { EDITOR_CONSTANTS } from '../constants/editor';

const videoCache = new Map<string, number>();

export async function loadVideoMetadata(videoUrl: string): Promise<number> {
  const cached = videoCache.get(videoUrl);
  if (cached) return cached;

  const video = document.createElement('video');
  video.preload = 'metadata';
  video.src = videoUrl;
  
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error('Video metadata load timeout')), 
      EDITOR_CONSTANTS.VIDEO_LOAD_TIMEOUT_MS
    );
    
    const cleanup = () => {
      clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', onLoad);
      video.removeEventListener('error', onError);
    };

    const onLoad = () => {
      cleanup();
      videoCache.set(videoUrl, video.duration);
      resolve(video.duration);
    };

    const onError = () => {
      cleanup();
      reject(new Error('Failed to load video metadata'));
    };

    video.addEventListener('loadedmetadata', onLoad);
    video.addEventListener('error', onError);
  });
}

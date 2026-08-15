import { withAuthToken } from './withAuthToken';
import { currentMediaBase } from '../composables/useLocalMode';

/**
 * All media URLs go through here so they can be pointed at the LAN address of
 * the server when it is reachable, keeping video off the internet. The base is
 * an empty string when media should come from the page's own origin.
 */
function mediaUrl(path: string): string {
  return withAuthToken(`${currentMediaBase()}${path}`);
}

export function mediaVersion(ts: string | Date): number {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.getTime();
}

export function videoUrl(clipId: number, ts: string | Date): string {
  const v = mediaVersion(ts);
  return mediaUrl(`/api/clips/${clipId}/stream?v=${v}`);
}

export function thumbUrl(clipId: number, ts: string | Date): string {
  const v = mediaVersion(ts);
  return mediaUrl(`/api/clips/${clipId}/thumbnail?v=${v}`);
}

export function streamUrl(clipId: number): string {
  return mediaUrl(`/api/clips/${clipId}/stream`);
}

export function thumbnailUrl(clipId: number): string {
  return mediaUrl(`/api/clips/${clipId}/thumbnail`);
}

export function frameStripUrl(clipId: number): string {
  return mediaUrl(`/api/clips/${clipId}/frame-strip`);
}

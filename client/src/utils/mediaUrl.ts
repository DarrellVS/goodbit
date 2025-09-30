import { withAuthToken } from './withAuthToken';

export function mediaVersion(ts: string | Date): number {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.getTime();
}

export function videoUrl(clipId: number, ts: string | Date): string {
  const v = mediaVersion(ts);
  return withAuthToken(`/api/clips/${clipId}/stream?v=${v}`);
}

export function thumbUrl(clipId: number, ts: string | Date): string {
  const v = mediaVersion(ts);
  return withAuthToken(`/api/clips/${clipId}/thumbnail?v=${v}`);
}



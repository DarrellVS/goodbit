/**
 * Every media URL is built here.
 *
 * These are `goodbit://` URLs served by the main process straight off disk, so
 * nothing about media touches HTTP any more. Three things that used to live
 * here are gone with it: the `?token=` appended because `<video>` and `<img>`
 * cannot send an Authorization header, the LAN probe that kept video off the
 * internet, and the origin juggling both of those needed.
 */
const MEDIA = 'goodbit://media';

/**
 * A cache-buster from the file's own timestamp.
 *
 * Trimming rewrites a clip in place, so the URL has to change or the picture
 * already decoded keeps being shown.
 */
export function mediaVersion(ts: string | Date): number {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.getTime();
}

export function videoUrl(clipId: number, ts: string | Date): string {
  return `${MEDIA}/clip/${clipId}?v=${mediaVersion(ts)}`;
}

export function thumbUrl(clipId: number, ts: string | Date): string {
  return `${MEDIA}/thumb/${clipId}?v=${mediaVersion(ts)}`;
}

export function streamUrl(clipId: number): string {
  return `${MEDIA}/clip/${clipId}`;
}

export function thumbnailUrl(clipId: number): string {
  return `${MEDIA}/thumb/${clipId}`;
}

export function audioUrl(trackId: string, ts?: string | Date): string {
  const suffix = ts ? `?v=${mediaVersion(ts)}` : '';
  return `${MEDIA}/audio/${encodeURIComponent(trackId)}${suffix}`;
}

/**
 * A game's own artwork, out of Steam's local cache.
 *
 * Addressed by game name rather than by appid: the client never learns which
 * Steam game a folder is, main decides that once and a game with no match is
 * simply a 404 the caller falls back from.
 */
export type GameArt = 'header' | 'hero' | 'portrait' | 'logo' | 'icon';

export function gameArtUrl(game: string, kind: GameArt = 'header'): string {
  return `${MEDIA}/art/${encodeURIComponent(game)}/${kind}`;
}

export function frameStripUrl(clipId: number): string {
  return `${MEDIA}/strip/${clipId}`;
}

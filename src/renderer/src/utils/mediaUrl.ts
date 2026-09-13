/**
 * Every media URL is built here.
 *
 * Two things this used to do are gone. It appended a `?token=` because `<video>`
 * and `<img>` cannot send an Authorization header — there is no auth now. And
 * it probed for a LAN address so video would not round-trip the internet, which
 * an app reading files off the local disk has no need to do.
 *
 * What remains points at the loopback API, and will become a `goodbit://`
 * protocol URL when the HTTP layer goes.
 */
function apiBase(): string {
  const port = window.goodbit?.apiPort ?? 0;
  return port > 0 ? `http://127.0.0.1:${port}` : '';
}

function mediaUrl(path: string): string {
  return `${apiBase()}${path}`;
}

/**
 * A cache-buster from the file's own timestamp.
 *
 * Trimming rewrites a clip in place, so the URL has to change or the browser
 * keeps showing the old picture.
 */
export function mediaVersion(ts: string | Date): number {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.getTime();
}

export function videoUrl(clipId: number, ts: string | Date): string {
  return mediaUrl(`/api/clips/${clipId}/stream?v=${mediaVersion(ts)}`);
}

export function thumbUrl(clipId: number, ts: string | Date): string {
  return mediaUrl(`/api/clips/${clipId}/thumbnail?v=${mediaVersion(ts)}`);
}

export function streamUrl(clipId: number): string {
  return mediaUrl(`/api/clips/${clipId}/stream`);
}

export function thumbnailUrl(clipId: number): string {
  return mediaUrl(`/api/clips/${clipId}/thumbnail`);
}

export function audioUrl(trackId: string, ts?: string | Date): string {
  const suffix = ts ? `?v=${mediaVersion(ts)}` : '';
  return mediaUrl(`/api/audio/${encodeURIComponent(trackId)}/stream${suffix}`);
}

export function frameStripUrl(clipId: number): string {
  return mediaUrl(`/api/clips/${clipId}/frame-strip`);
}

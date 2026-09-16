import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { posterPathFor, posterUrlFor } from '../../../publisher/src/utils/posterPath.js';

/**
 * Where the embed page's poster frame lives.
 *
 * The publisher used to derive this picture itself, with an ffmpeg and an
 * ffprobe in the container for one JPEG per upload. It arrives with the clip
 * now, from the desktop's own thumbnail cache, which leaves the name as the
 * only part of the arrangement that has to keep working: every clip published
 * before the change has a `<clip>.thumb.jpg` already sitting in the upload
 * directory, and they must not lose their posters.
 *
 * So this is a test about a string, and each case is something that has either
 * broken or would break silently.
 */
describe('the name a poster frame is stored under', () => {
  it('is the clip name with .thumb.jpg on the end', () => {
    // Not a stem. `2026-09-16 21-04-11.mp4.thumb.jpg`, extension and all,
    // because that is what is on disk for every clip published so far and
    // what `UnpublishClipAction` has always deleted.
    expect(posterPathFor('/data/public', '2026-09-16 21-04-11.mp4')).toBe(
      path.join('/data/public', '2026-09-16 21-04-11.mp4.thumb.jpg'),
    );
  });

  it('cannot be talked out of the upload directory', () => {
    // The filename arrives off the network, in a route parameter, and lands
    // in a `path.join`.
    expect(posterPathFor('/data/public', '../../etc/passwd')).toBe(
      path.join('/data/public', 'passwd.thumb.jpg'),
    );
    expect(posterPathFor('/data/public', '/etc/passwd')).toBe(
      path.join('/data/public', 'passwd.thumb.jpg'),
    );
  });
});

describe('the address a poster frame is served from', () => {
  it('is under /media, which is the route that serves that directory', () => {
    // `/thumb/<clip>` is what the unpublish purge asked Cloudflare for, and
    // it is a route this server has never had, so the purge came back
    // successful and the edge kept the poster of a deleted clip.
    expect(posterUrlFor('https://clips.example.com', 'a clip.mp4')).toBe(
      'https://clips.example.com/media/a%20clip.mp4.thumb.jpg',
    );
  });

  it('keeps the .jpg outside the encoding', () => {
    // A CDN files a response by what the URL ends in, and this one has to end
    // in an image extension.
    expect(posterUrlFor('https://clips.example.com', 'clip.mp4')).toMatch(/\.thumb\.jpg$/);
  });

  it('does not double the slash when the base URL ends in one', () => {
    // `PUBLIC_BASE_URL` is typed by a person into a compose file, so it
    // sometimes does. A purge of the wrong URL fails silently: Cloudflare
    // answers 200 for a file it has never heard of.
    expect(posterUrlFor('https://clips.example.com/', 'clip.mp4')).toBe(
      'https://clips.example.com/media/clip.mp4.thumb.jpg',
    );
  });
});

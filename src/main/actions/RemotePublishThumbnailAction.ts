import fsPromises from 'node:fs/promises';
import axios from 'axios';
import { BaseAction } from './BaseAction.js';
import { publisherBaseUrl, publisherAuthHeaders, NO_PUBLISHER } from '../services/publisherConfig.js';

export interface RemotePublishThumbnailInput {
  /** The name the publisher stored the clip under, as it reported it back. */
  filename: string;
  /** A JPEG on disk, normally the library's own cached thumbnail. */
  posterPath: string;
}

export interface RemotePublishThumbnailOutput {
  stored: boolean;
}

/**
 * Send the poster frame for a clip that is already published.
 *
 * The publisher used to cut its own with ffmpeg, which meant an ffmpeg, an
 * ffprobe and a wrapper in a container that otherwise serves files, and two
 * per-architecture binaries downloaded under emulation to build the image.
 * GoodBit made that exact picture before anybody pressed Publish, for the card
 * in the library, so it sends that.
 *
 * A request of its own rather than a second part of the upload: the app and the
 * publisher are versioned and shipped separately, so a publisher older than
 * this endpoint answers 404 and the caller treats that as "no poster this
 * time". An extra file on `POST /api/publish` would instead be an unexpected
 * part, which multer refuses the whole upload over, and publishing would stop
 * working for everybody who updated GoodBit and not their container.
 */
export class RemotePublishThumbnailAction extends BaseAction<
  RemotePublishThumbnailInput,
  RemotePublishThumbnailOutput
> {
  async execute(input: RemotePublishThumbnailInput): Promise<RemotePublishThumbnailOutput> {
    const baseUrl = publisherBaseUrl();
    if (!baseUrl) throw new Error(NO_PUBLISHER);

    // Read rather than streamed. It is a few hundred kilobytes, and a stream
    // that cannot be replayed is no use to axios if the request is retried.
    const jpeg = await fsPromises.readFile(input.posterPath);
    const url = `${baseUrl}/api/publish/${encodeURIComponent(input.filename)}/thumbnail`;
    const res = await axios.put(url, jpeg, {
      headers: {
        ...publisherAuthHeaders(),
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpeg.byteLength),
      },
      /*
       * A bound, which the upload beside this deliberately does not have.
       *
       * That one is hundreds of megabytes over somebody's home connection and
       * has to be allowed to take minutes. This is a few hundred kilobytes and
       * it runs after the publish has already succeeded, so a publisher that
       * accepts the request and then says nothing must not hold the publish
       * open behind it.
       */
      timeout: 30_000,
    });
    return res.data as RemotePublishThumbnailOutput;
  }
}

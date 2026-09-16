GoodBit Publisher Server

Purpose: Receives clip uploads from the PC server, serves them publicly, and supports unpublishing with Cloudflare cache purge.

Directory structure mirrors the PC server: actions, services, routes, middlewares, utils.

Environment variables, with a commented copy to start from in `.env.example`:
- PUBLISH_TOKEN (**required**; every write is refused without it)
- PORT (default 5000; the image sets 5555)
- UPLOAD_DIR (default ./public)
- PUBLIC_BASE_URL (e.g. https://cdn.example.com)
- CLOUDFLARE_ZONE_ID
- CLOUDFLARE_API_TOKEN

`cp .env.example .env` and fill it in to run from source. The Docker image
takes the same names as environment variables; the setup guide at
`site/publisher.html` writes them into a compose file for you.

Serving media is public by design. Writing is not: `/api/publish` needs
`Authorization: Bearer <PUBLISH_TOKEN>` or an `X-Publish-Token` header on every
request, compared in constant time, and refuses everything when the variable is
unset rather than allowing it. Without that the address is an open file drop
under whatever domain it is served from.

A publisher started without a token says so at boot, in a block naming the
variable and what to set it to, and says the one-line opposite when it has one.
It still starts and still serves: a missing write credential is no reason to
take down clips that are already published. It was one grey warning line under
"Publisher listening", which is a log that reads like a successful start, so the
first real sign of the problem was a publish failing weeks later.

**No ffmpeg.** The poster frame for the embed page arrives with the clip, at
`PUT /api/publish/:filename/thumbnail`, because GoodBit has already made that
exact picture for its own library card. This server used to cut its own, which
put `ffmpeg-static`, `ffprobe-static` and `fluent-ffmpeg` in the image and an
emulated per-architecture install in the build. A clip whose poster never
arrives, from a GoodBit older than that endpoint or a request that failed after
the upload, is served with no poster rather than with a link to one that is not
there. Clips published before the change keep the `.thumb.jpg` already on disk.

Image: `darrellvs/goodbit-publisher:latest`, built for linux/amd64 and linux/arm64 by
`.github/workflows/publisher-image.yml` on every release tag. Building from this
folder gives the same thing.

Scripts:
- dev: tsx watch src/index.ts
- build: tsc -p tsconfig.json
- start: node dist/index.js

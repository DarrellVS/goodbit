GoodBit Publisher Server

Purpose: Receives clip uploads from the PC server, serves them publicly, and supports unpublishing with Cloudflare cache purge.

Directory structure mirrors the PC server: actions, services, routes, middlewares, utils.

Environment variables:
- PORT (default 5000; the image sets 5555)
- PUBLIC_BASE_URL (e.g. https://cdn.example.com)
- UPLOAD_DIR (default ./public)
- PUBLISH_TOKEN (**required**; every write is refused without it)
- CLOUDFLARE_ZONE_ID
- CLOUDFLARE_API_TOKEN

Serving media is public by design. Writing is not: `/api/publish` needs
`Authorization: Bearer <PUBLISH_TOKEN>` or an `X-Publish-Token` header on every
request, compared in constant time, and refuses everything when the variable is
unset rather than allowing it. Without that the address is an open file drop
under whatever domain it is served from.

Image: `darrellvs/goodbit-publisher:latest`, built for linux/amd64 and linux/arm64 by
`.github/workflows/publisher-image.yml` on every release tag. Building from this
folder gives the same thing.

Scripts:
- dev: tsx watch src/index.ts
- build: tsc -p tsconfig.json
- start: node dist/index.js



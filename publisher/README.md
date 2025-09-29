Filmpje Publisher Server

Purpose: Receives clip uploads from the PC server, serves them publicly, and supports unpublishing with Cloudflare cache purge.

Directory structure mirrors the PC server: actions, services, routes, middlewares, utils.

Environment variables:
- PORT (default 5000)
- PUBLIC_BASE_URL (e.g. https://cdn.example.com)
- UPLOAD_DIR (default ./public)
- CLOUDFLARE_ZONE_ID
- CLOUDFLARE_API_TOKEN

Scripts:
- dev: tsx watch src/index.ts
- build: tsc -p tsconfig.json
- start: node dist/index.js



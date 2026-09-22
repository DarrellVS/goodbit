# The publisher, for amd64 and arm64.
#
# Built by `.github/workflows/publisher-image.yml`. The arm64 half runs under
# emulation on the build machine, where every command is several times slower
# than native, so the only question that matters here is what genuinely has to
# run twice.
#
# Nothing does, any more. `tsc` emits JavaScript, which is the same bytes
# whatever processor is going to run it, and every remaining dependency is
# plain JavaScript too, so both `npm ci` runs are pinned to the build
# machine's own architecture. What is left to emulate is the runtime stage: a
# `mkdir` and three copies.
#
# The deps stage used to run once per target, and the whole reason was
# `ffmpeg-static` and `ffprobe-static`, which fetch a binary for their platform
# while installing. They were here to cut one poster frame per upload; the
# desktop app has already made that picture for its own library card and now
# sends it with the clip, so this server stores a JPEG instead of decoding a
# video. Keeping `tsc` off the emulated side was already the difference between
# a rebuild that takes minutes and one that takes most of an hour, at 35
# minutes against a four minute baseline, and this takes the install off it
# too.
#
# **If a dependency with a native binary or a per-platform download comes back,
# the `--platform=$BUILDPLATFORM` on the deps stage has to come off**, or the
# arm64 image ships an amd64 binary and the failure is at runtime, on somebody
# else's NAS.

# ---- Compile, always on the build machine's own architecture ----
FROM --platform=$BUILDPLATFORM node:20-alpine AS compile
WORKDIR /app

# Copied on their own so a change to the source does not invalidate the install
# layer. `--ignore-scripts` on both installs because nothing in this tree has
# an install script to run, and keeping the flag means a dependency that
# arrives with one cannot start running it here unnoticed.
COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Dependencies, without the compiler ----
#
# A second install rather than `npm prune`, so the runtime image is built from
# a layer that is only invalidated by `package-lock.json`.
FROM --platform=$BUILDPLATFORM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---- Runtime ----
FROM node:20-alpine
WORKDIR /app

# `VIEWS_FILE` is outside `UPLOAD_DIR` on purpose: everything in that directory
# is served at /media, so a counters file beside the clips would be public and
# would be listed by the API. One level up, inside the same volume.
ENV NODE_ENV=production \
    PORT=5555 \
    UPLOAD_DIR=/data/public \
    VIEWS_FILE=/data/views.json

# `package.json` is not optional here: it carries `"type": "module"`, and
# without it Node reads `dist/index.js` as CommonJS and refuses the imports.
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=compile /app/dist ./dist

# The data volume is /data, not /data/public.
#
# The clips are in /data/public and the view counts are at /data/views.json,
# deliberately not inside the served directory. Declaring only the inner one
# would leave the counts in the container layer, so they would start again at
# zero every time the container is recreated.
#
# An existing deployment that binds a host folder to /data/public keeps working
# exactly as it did; it just does not persist its counts until that mount is
# moved up one level.
RUN mkdir -p /data/public
VOLUME ["/data"]

EXPOSE 5555
CMD ["node", "dist/index.js"]

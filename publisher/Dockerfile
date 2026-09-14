# The publisher, for amd64 and arm64.
#
# Built by `.github/workflows/publisher-image.yml`. The arm64 half runs under
# emulation on the build machine, where every command is several times slower
# than native, so the only question that matters here is what genuinely has to
# run twice.
#
# Almost nothing does. `tsc` emits JavaScript, which is the same bytes whatever
# processor is going to run it, so it compiles once on the build machine's own
# architecture. What is actually per-target is `ffmpeg-static` and
# `ffprobe-static`, which fetch a binary for their platform while installing.
#
# That split is the difference between a rebuild that takes minutes and one
# that takes most of an hour: compiling and pruning under emulation once cost
# 35 minutes against a four minute baseline, and both were avoidable.

# ---- Compile, always on the build machine's own architecture ----
FROM --platform=$BUILDPLATFORM node:20-alpine AS compile
WORKDIR /app

# Copied on their own so a change to the source does not invalidate the install
# layer. `--ignore-scripts` skips the ffmpeg downloads: the compiler needs the
# type definitions, not the binaries, and the ones fetched here would be for
# the wrong processor anyway.
COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Dependencies, once per target architecture ----
#
# The only stage that is genuinely emulated, and it is skipped entirely when
# `package-lock.json` has not moved, which is most rebuilds.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Runtime ----
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5555 \
    UPLOAD_DIR=/data/public

COPY --from=deps /app/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=compile /app/dist ./dist

# Data volume for uploads
RUN mkdir -p /data/public
VOLUME ["/data/public"]

EXPOSE 5555
CMD ["node", "dist/index.js"]

# The publisher, for amd64 and arm64.
#
# Built by `.github/workflows/publisher-image.yml`. The arm64 half runs under
# emulation on the build machine, where every command is several times slower
# than native, so the order here is about doing as little as possible twice:
# dependencies are installed once and then pruned, rather than installed in
# full and installed again without the dev ones.
#
# `ffmpeg-static` downloads a binary for the target platform during install,
# which is why this cannot be a single amd64 build with the output copied
# across.

# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copied on their own so a change to the source does not invalidate the
# install layer, which is the expensive one.
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop the dev dependencies from the tree that is already here, rather than
# resolving and downloading the whole thing a second time in the next stage.
RUN npm prune --omit=dev

# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5555 \
    UPLOAD_DIR=/data/public

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Data volume for uploads
RUN mkdir -p /data/public
VOLUME ["/data/public"]

EXPOSE 5555
CMD ["node", "dist/index.js"]

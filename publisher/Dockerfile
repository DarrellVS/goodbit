# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5555 \
    UPLOAD_DIR=/data/public

# Install production deps only
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

# Copy built app
COPY --from=builder /app/dist ./dist

# Data volume for uploads
RUN mkdir -p /data/public
VOLUME ["/data/public"]

EXPOSE 5555
CMD ["node", "dist/index.js"]



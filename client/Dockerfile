# Install dependencies only when needed
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat
WORKDIR /app/filmpje

COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

# Rebuild the source code only when needed
FROM node:20-alpine AS builder

WORKDIR /app/filmpje

COPY --from=deps /app/filmpje/node_modules ./node_modules

COPY . .

RUN npm run build

# Production image, copy all the files and run next
FROM node:20-alpine AS runner
WORKDIR /app/filmpje

RUN npm install -g http-server

ENV NODE_ENV=production

COPY --from=builder /app/filmpje/package.json ./package.json

COPY --from=builder /app/filmpje/dist ./dist

EXPOSE 3002
ENV PORT=3002

CMD ["http-server", "dist", "-p", "3002", "--proxy", "http://localhost:3002?"]
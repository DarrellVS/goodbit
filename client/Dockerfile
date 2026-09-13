FROM node:20-alpine
WORKDIR /app/filmpje

RUN npm install -g http-server

ENV NODE_ENV=production

COPY dist ./dist

EXPOSE 3002
ENV PORT=3002

# -c-1 disables http-server's default `Cache-Control: max-age=3600`, which it
# sends on *everything* — index.html and sw.js included. That let the browser
# answer a reload from its own HTTP cache for up to an hour after a deploy, so
# the new service worker was never even fetched. Asset filenames are content
# hashed and the service worker precaches them anyway, so nothing is lost.
CMD ["http-server", "dist", "-p", "3002", "-c-1", "--proxy", "http://localhost:3002?"]

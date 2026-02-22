FROM node:20-alpine
WORKDIR /app/filmpje

RUN npm install -g http-server

ENV NODE_ENV=production

COPY dist ./dist

EXPOSE 3002
ENV PORT=3002

CMD ["http-server", "dist", "-p", "3002", "--proxy", "http://localhost:3002?"]

# syntax=docker/dockerfile:1.7
# Node 24 runs the TypeScript sources directly (type stripping); there is no build step and no
# runtime dependency, so the image is just Node + src.
FROM node:24-alpine
ENV NODE_ENV=production \
    DATA_DIR=/data \
    TZ=Europe/Warsaw
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json ./
COPY src ./src
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
HEALTHCHECK --interval=60s --timeout=10s --start-period=120s --retries=3 \
  CMD ["node", "src/healthcheck.ts"]
CMD ["node", "src/index.ts"]

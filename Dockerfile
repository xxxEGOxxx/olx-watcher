# syntax=docker/dockerfile:1.7
# Node 24 runs the TypeScript sources directly (type stripping); there is no build step.
# The only runtime dependency is Playwright with its headless Chromium shell, used for OLX.
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    DATA_DIR=/data \
    TZ=Europe/Warsaw \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HOME=/tmp
WORKDIR /app
COPY package.json package-lock.json ./
# --only-shell: the headless shell is ~3x smaller than full Chromium and is all headless needs.
RUN npm ci --omit=dev --ignore-scripts \
 && npx playwright install --with-deps --only-shell chromium \
 && rm -rf /root/.npm /tmp/* /var/lib/apt/lists/*
COPY src ./src
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
HEALTHCHECK --interval=60s --timeout=10s --start-period=180s --retries=3 \
  CMD ["node", "src/healthcheck.ts"]
CMD ["node", "src/index.ts"]

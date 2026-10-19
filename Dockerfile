# syntax=docker/dockerfile:1
#
# The Lost Footing image: the browser client (web/), the simulation modules it
# imports (src/) and the static server (server/serve.js), on the Node version
# .node-version names. No build step and no third-party packages.
# Build:  docker build -t lost-footing .
# Run:    docker run --rm -p 127.0.0.1:8080:8080 -e LOST_FOOTING_BIND=0.0.0.0 lost-footing

FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66
LABEL org.opencontainers.image.title="Lost Footing" \
      org.opencontainers.image.description="Keyboard survival fighter: the web client and its static server" \
      org.opencontainers.image.source="https://github.com/scshafe/lost-footing"
WORKDIR /app
COPY server server
COPY src src
COPY web web
ENV LOST_FOOTING_BIND=127.0.0.1 \
    LOST_FOOTING_PORT=8080 \
    NODE_ENV=production
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["node", "/app/server/serve.js"]

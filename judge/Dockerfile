# Judge worker container. NOTE: in production the judge is usually run
# directly on the VPS (systemd unit in deploy/) because it needs the Docker
# socket to spawn sibling sandbox containers. This image exists for
# docker-compose local development.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends docker.io curl && rm -rf /var/lib/apt/lists/* \
  && addgroup --system app && adduser --system --ingroup app app
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The app user needs to talk to the mounted docker socket.
USER root
CMD ["node", "dist/worker.js"]

# syntax=docker/dockerfile:1.7
# Один образ на всё: Fastify отдаёт и API, и собранный клиент.

ARG NODE_IMAGE=node:22-bookworm-slim

# ── base: pnpm через corepack ────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ── deps: зависимости отдельно от исходников ради кеша слоёв ─────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# better-sqlite3 и argon2 тянут готовые бинарники под node 22 — компилятор не нужен.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── build: собираем shared, сервер и клиент ──────────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter shared build \
 && pnpm --filter server build \
 && pnpm --filter client build

# ── runtime: только то, что нужно на запуске ─────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/score.db
ENV STATIC_ROOT=/app/public

# Сервер собран в один файл, но нативные модули остаются внешними —
# их надо принести вместе с манифестами.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./public

# База лежит на томе: перезапуск контейнера не должен стирать историю.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/server.js"]

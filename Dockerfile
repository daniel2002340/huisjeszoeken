# syntax=docker/dockerfile:1
# Slim Node image: all adapters use plain fetch (Funda blocks headless
# browsers, so the Playwright base image was dead weight). Playwright lives in
# devDependencies for local diagnostics (scripts/funda-explore.ts) only.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build && pnpm web:build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# SQL migrations are applied programmatically at startup (src/db/migrate.ts).
COPY src/db/migrations ./src/db/migrations
# Built dashboard SPA, served by Fastify (PLAN.md §6).
COPY --from=build /app/src/web/dist ./src/web/dist
COPY package.json ./
RUN mkdir -p data
CMD ["node", "dist/index.js"]

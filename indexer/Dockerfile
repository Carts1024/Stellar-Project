# syntax=docker/dockerfile:1.6

FROM node:20-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build

COPY --from=deps /app/node_modules /app/node_modules
COPY . .

ARG INDEXER_DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/talambag?sslmode=disable
RUN INDEXER_DATABASE_URL=$INDEXER_DATABASE_URL pnpm run db:generate && pnpm run build

FROM base AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/dist /app/dist
COPY --from=build /app/prisma /app/prisma
COPY --from=build /app/prisma.config.ts /app/prisma.config.ts
COPY --from=build /app/src/load-env.ts /app/src/load-env.ts

EXPOSE 8080

CMD ["sh", "-c", "pnpm run db:migrate:deploy && pnpm run start"]

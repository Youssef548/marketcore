# The built worker, for the behavioural harness. Same shape as apps/api/Dockerfile
# and for the same reasons: the context is the repository root because the worker
# depends on workspace packages, and openssl is installed before `pnpm install`
# so `prisma generate` picks an engine that loads on this image.
FROM node:22-slim AS build
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@9.15.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# `worker...` builds the worker and its workspace dependencies.
RUN pnpm --filter "worker..." run build

FROM node:22-slim AS runtime
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
USER node
CMD ["node", "apps/worker/dist/main.js"]

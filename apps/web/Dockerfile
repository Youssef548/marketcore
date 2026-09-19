# The built web app, for the behavioural harness — the artifact a deployment would
# run, not a source-mode dev server. The suite asserts cookie flags over TLS, and a
# dev server is not what a browser would meet.
#
# The context is the repository root, for the same reason as the API's image: the web
# app depends on workspace packages (@app/contracts, @app/ui, @app/api-client) that
# must be built alongside it, and a context limited to apps/web cannot see them. See
# .dockerignore, which is therefore at the root too.
#
# Everything is copied in a single layer rather than the usual manifest-then-source
# split: packages/database's postinstall (`prisma generate`) needs prisma/schema
# present before it runs, and splitting the copy makes the install fail. This image
# is for tests; a production image would be worth the extra stages.

FROM node:22-slim AS build

# Pinned to the version in the root packageManager field, so the image resolves the
# dependency graph the lockfile was written against.
RUN npm install --global pnpm@9.15.0

WORKDIR /repo
COPY . .

# --frozen-lockfile on purpose: an image built from a drifted lockfile is not the
# artifact the tests claim to be testing.
RUN pnpm install --frozen-lockfile

# `web...` selects the package *and* its workspace dependencies, so @app/contracts is
# compiled too. Nothing here needs openssl — that is the API's image, for Prisma's
# query engine.
RUN pnpm --filter "web..." run build

FROM node:22-slim AS runtime

ENV NODE_ENV=production

WORKDIR /repo

# pnpm is needed at run time as well as build time, because the start command goes
# through it — exactly as the API's image needs it for the migrate service.
RUN npm install --global pnpm@9.15.0

# The whole workspace, not just .next: node_modules is a pnpm tree of symlinks into
# packages/*, and @app/contracts resolves from its dist at runtime.
#
# --chown because the container runs as the unprivileged `node` user the base image
# already defines; a root-owned tree leaves that user unable to write the Next cache.
COPY --from=build --chown=node:node /repo /repo

EXPOSE 3000

USER node

# Configuration comes from the environment: API_BASE_URL is read per request rather
# than at build time, which is what lets one image run against any API origin.
CMD ["pnpm", "--filter", "web", "start"]

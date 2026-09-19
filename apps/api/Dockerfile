# The built API, for the behavioural harness — the real artifact rather than a
# source-mode dev server, so the suite exercises what a deployment would run.
#
# The context is the repository root, not this directory: the API depends on
# workspace packages (@app/contracts, @app/database, @app/domain, @app/runtime)
# that must be built alongside it, and a context limited to apps/api cannot see
# them. See .dockerignore, which is therefore at the root too.
#
# Everything is copied in a single layer instead of the usual manifest-then-source
# split. Splitting it would install before packages/database's postinstall
# (`prisma generate`) can see prisma/schema, and that build fails. This image is
# for tests; a production image would be worth the extra stages.

FROM node:22-slim AS build

# Prisma's query engine links against libssl and has to recognise the version. On
# this image it warned "failed to detect the libssl/openssl version … defaulting to
# openssl-1.1.x", which produces a client whose engine cannot load against the
# image's actual OpenSSL — a runtime failure, not a build one. Installing openssl
# *before* the install is what lets `prisma generate` choose the right engine.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Pinned to the version in the root packageManager field, so the image resolves the
# dependency graph the lockfile was written against.
RUN npm install --global pnpm@9.15.0

WORKDIR /repo
COPY . .

# --frozen-lockfile on purpose: an image built from a drifted lockfile is not the
# artifact the tests claim to be testing.
RUN pnpm install --frozen-lockfile

# `api...` selects the package *and* its workspace dependencies, so contracts,
# domain, database and runtime are compiled too. The API's compiled output imports
# them by name and resolves them to their dist, so skipping this stage produces an
# image that starts and immediately fails to require @app/runtime.
RUN pnpm --filter "api..." run build

FROM node:22-slim AS runtime

# The engine generated in the build stage needs libssl at run time too, not just at
# generate time.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /repo

# pnpm is needed at run time as well as build time: the migrate service runs
# `pnpm --filter @app/database db:deploy` in this image, and without it the
# container starts and immediately exits 127.
RUN npm install --global pnpm@9.15.0

# The whole workspace, not just dist: node_modules is a pnpm tree of symlinks into
# packages/*, and those packages' compiled dist is what the API requires at
# runtime. Copying only apps/api would resolve nothing.
#
# --chown because the container runs as the unprivileged `node` user the base image
# already defines; a root-owned tree would leave the migrate service unable to write
# anywhere it might need to.
COPY --from=build --chown=node:node /repo /repo

EXPOSE 3001

USER node

# Configuration comes from the environment and is validated at boot, so a
# misconfigured stack fails immediately with a list of what is wrong rather than
# deep inside the first request.
CMD ["node", "apps/api/dist/main.js"]

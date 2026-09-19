import { defineConfig } from '@playwright/test';

/**
 * The behavioural suite talks to the containerised API through Caddy, so it is the
 * only layer in this repository that crosses a socket, terminates TLS and passes
 * through a real reverse proxy.
 *
 * It expects the stack to be running already:
 *
 *   docker compose -f docker-compose.e2e.yml up -d --build --wait
 *   pnpm --filter e2e test:behavioural
 *   docker compose -f docker-compose.e2e.yml down -v
 *
 * The script is `test:behavioural` rather than `test` on purpose: Turborepo's `test`
 * task runs on every push, and this suite cannot run without a live stack.
 */
export default defineConfig({
  testDir: './tests',

  // One worker, like the API's integration suite and for the same reason: the
  // suites share a database, and two of the assertions below read the container's
  // log stream, which parallelism would interleave.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    // `localhost` over the port the proxy publishes. The Caddyfile also answers to
    // the public name this stack pretends to have, but DNS for that name is
    // deliberately not arranged on the host — so the public-host assertion sets the
    // header rather than relying on a resolver.
    baseURL: process.env.E2E_BASE_URL ?? 'https://localhost:8443',

    // Caddy serves a certificate from its own CA. Trusting it here is the trade for
    // not shipping a real certificate into a test run; the TLS handshake itself is
    // still real, which is what the forwarded-scheme assertion depends on.
    ignoreHTTPSErrors: true,

    extraHTTPHeaders: { accept: 'application/json' },
    trace: 'retain-on-failure',
  },
});

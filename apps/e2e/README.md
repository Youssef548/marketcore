# Behavioural end-to-end suite

The only layer in this repository that crosses a process and a network boundary. It
runs the **built** API in a container, behind a real reverse proxy, over real TLS,
against a real Postgres, and drives it with Playwright.

Everything else — unit, property, integration and the API's own e2e suite — runs in
one Node process on localhost. `request(app.getHttpServer())` never binds a port, so
behaviour that depends on the host, the scheme, a proxy or a certificate cannot fail
in those layers. This suite is where it can.

## Running it

```bash
# from the repository root
pnpm --filter e2e exec playwright install --with-deps chromium   # once; the web journey drives a browser
docker compose -f docker-compose.e2e.yml up -d --build --wait
pnpm --filter e2e test:behavioural
docker compose -f docker-compose.e2e.yml down -v
```

`--wait` blocks until Postgres accepts connections, migrations and the seed have run
to completion, and the API's readiness probe answers. `down -v` discards the volume so
the next run starts from a migrated, seeded database rather than inheriting state.

The proxy publishes **8443** on the host; the suite talks to `https://localhost:8443` for the API
assertions and `https://web.marketcore.test:8443` for the browser journey. One port, two hosts:
Caddy picks the site from the TLS SNI and the `Host` header, which is why the web app is a second
site rather than a path on the same one — the BFF's route handlers and the API both serve paths
under `/api`, so one host cannot carry both. A browser cannot be handed a `Host` header the way an
API request context can, so `playwright.config.ts` maps that one name to the host with
`--host-resolver-rules`; DNS for it is deliberately not arranged.

`ignoreHTTPSErrors` is set in `playwright.config.ts` because the certificate comes from
Caddy's internal CA — the handshake is still real, which is what the
`X-Forwarded-Proto` assertion depends on, and what makes a `Secure` cookie storable at all.

## What only this suite can catch

| Failure | Why the other layers cannot see it |
|---|---|
| The image does not build, or starts with bad configuration | Nothing else runs the artifact |
| Migrations or the seed fail against a network database | Integration tests use a socket to a local Postgres |
| TLS is not terminated, or the app is not told about it | No TLS exists in-process |
| `X-Forwarded-*` is dropped or forged in the chain | The headers are invented by tests in-process |
| The public `Host` never reaches the app | Every in-process request is `127.0.0.1` |
| CORS behaves differently across a proxy | In-process CORS never crosses a hop |
| The request id or error envelope is lost in transit | Nothing rewrites headers in-process |
| A session cookie is never stored at all | A `Secure` cookie sent over plain http is discarded by the browser in silence, so the flag can only be observed where there is real TLS — and its failure mode elsewhere is "signed out at random" |
| The session tokens are readable by script | `document.cookie` is the browser's answer, not a header a test set. `web-journey.spec.ts` asserts the tokens are absent from it, and that both cookies arrived `httpOnly` |
| The web app is a usable journey | Register, sign in, choose an organization, sign out — driven through real pages, so a route that renders but does not work is a failure |

## Reading the log

Two assertions read the API container's structured request log rather than a
response. That is deliberate and it is the point: behind a proxy the process sees only
a connection from the proxy, so the client's scheme and hostname exist *only* as
headers. The log line is the single place they can be observed, which is why
`RequestLogFields` carries `host`, `forwardedProto` and `forwardedFor`.

`support/compose.ts` shells out to `docker compose logs` for this. It is the least
invasive way to observe the application from outside, and it keeps the test honest —
nothing in the application was added to a response purely to make a test possible.

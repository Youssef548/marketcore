# Testing strategy

How MarketCore proves behaviour — which layer answers which question, where the current suite is
blind, and what to build next.

The short version: the suite is stronger than it looks at the unit and in-process e2e level, and
**structurally blind** at the environmental level. Every layer runs in one Node process on localhost,
so host, scheme, TLS, proxy, cookie and CORS behaviour cannot fail a test today.

---

## The ladder

Each layer crosses a different boundary, so each can only falsify certain claims. Choosing a layer
that cannot reach the claim produces a green test that proves nothing.

| # | Layer | Where | Runner | Command | Crosses |
|---|---|---|---|---|---|
| 1 | Unit | `apps/api/src/**/*.spec.ts`, `packages/*/{src,test}` | Jest 30 / Vitest 2.1 | `pnpm --filter api exec jest` | nothing |
| 2 | Property | `packages/*/**/*.property.spec.ts` | Vitest + fast-check | same as its package | nothing (generates inputs) |
| 3 | Integration | `apps/api/test/integration/*.integration-spec.ts` | Jest + real Postgres | `pnpm --filter api test:integration` | the database |
| 4 | E2E (in-process) | `apps/api/test/*.e2e-spec.ts` | Jest + Supertest | `pnpm --filter api test:e2e` | the Nest pipeline — **no socket** |
| 5 | Behavioural (out of process) | `apps/e2e/tests/*.spec.ts` | Playwright | `docker compose -f docker-compose.e2e.yml up -d --build --wait && pnpm --filter e2e test` | process, socket, TLS, proxy, container |
| — | Everything | — | Turborepo | `pnpm turbo run lint typecheck test build` | — |

`pnpm --filter api test` runs 1, 3 and 4 in sequence. Layers 3 and 4 share one database, which is why
they run `--runInBand` and why every fixture is suffixed by `unique()`.

**Which layer for which claim**

| Claim | Lowest layer that can falsify it |
|---|---|
| "this rule rejects X" | 1, or 2 if X is a class of values |
| "this invariant holds for all inputs" | 2 |
| "the DB constraint is actually installed" | 3 |
| "two concurrent writers cannot both win" | 3 |
| "this endpoint returns this status and envelope" | 4 |
| "the response satisfies the shared wire contract" | 4, re-parsed with `@app/contracts` |
| "Host / scheme / TLS / `X-Forwarded-*` is handled" | 5 |
| "cookie flags (`Secure`, `SameSite`) are correct" | 5 |
| "the assertions are real, not decorative" | mutation |

---

## Confirmed gaps

- **CORS is registered in `apps/api/src/main.ts`, not in `configureApp()`.** The e2e harness calls
  `configureApp()` only, so CORS is invisible to every test — the exact failure mode the comment in
  `app.setup.ts` warns about.
- **No coverage gate.** `collectCoverageFrom` exists in `apps/api/package.json` but `--coverage` is in
  no script and CI has no coverage step. Vitest configs set no coverage options.
- **No property-based testing.** "Covers all cases" is approximated by hand-picked examples.
- **No out-of-process test.** `request(app.getHttpServer())` never binds a port: no TLS, no DNS, no
  proxy, no real `Host`. `X-Forwarded-Proto` / `X-Forwarded-For` / `trust proxy` are dead branches
  because nothing sets them.
- **Contracts are asserted one-directionally.** `enum-drift.integration-spec.ts` covers DB↔wire enums,
  but e2e suites assert literals rather than re-parsing responses with the `@app/contracts` schemas.
  `packages/api-client` is tested against **MSW mocks**, so client↔server drift is invisible.
- **No mutation testing**, so "the suite is green" is unproven as "the assertions are real".

---

## Phase 0 — Foundation

**0.1 CORS into `configureApp()`.** Register CORS where `main.ts` and the e2e harness both install it,
and extract the origin parsing rather than splitting an inline literal.
New: `apps/api/src/constants.ts`, `apps/api/src/http/cors-origins.ts` (`parseAllowedOrigins`,
`corsOptions`), `apps/api/test/cors.e2e-spec.ts` — allowed origin, disallowed origin, `OPTIONS`
preflight, and a control case with no `Origin` at all.

**0.2 Coverage gates that ratchet.** Jest `coverageThreshold` for the API, `test.coverage` for each
Vitest config, `--coverage` in a `test:coverage` script, and a CI step. Set thresholds from the
**measured baseline minus 5**, not from aspiration, so the gate blocks regressions without failing on
day one.

**0.3 Re-parse every e2e response with its contract.** `apps/api/test/support/contracts.ts` exporting
`expectContract(schema, value)`, used alongside the existing literal assertions — one proves the
shape, the other the value.

---

## Phase 1 — Property-based testing

`fast-check` in `packages/{domain,contracts,runtime}`, with `*.property.spec.ts` beside the code.

| Module | Invariant |
|---|---|
| `domain/slug` | schema-accepted values round-trip; out-of-set characters are rejected; min−1 / min / max / max+1 hold for every length |
| `domain/password` | anything shorter than the minimum is rejected **before** the hasher is called; valid passwords hash then verify |
| `domain/refresh-token` | tokens are unique across N draws; hashing is deterministic; entropy length is exact |
| `domain/product` | `priceMinor` rejects floats and non-finite values |
| `contracts` | `parse(serialize(parse(x))) === parse(x)`; the error envelope's `code` is closed |
| `runtime` request-id | accept/reject classification matches a hand-rolled oracle for arbitrary unicode and length |

The password property matters most: it proves the "refuse before spending CPU on argon2" rule for a
whole input class rather than one example.

---

## Phase 2 — Contract tests in both directions

Extend 0.3 over every e2e response body, then drive the booted app with the real `createApiClient`
from `packages/api-client` so a client↔server mismatch fails a test instead of shipping. Keep the MSW
tests for transport edge cases (non-JSON body, empty 204) — they are valuable — but stop treating
them as proof the client works with the server.

---

## Phase 3 — Behavioural E2E (out of process)

The layer that answers the environmental question.

- `apps/api/Dockerfile` — multi-stage pnpm monorepo build, non-root runtime, `HEALTHCHECK` on
  `/api/v1/health/ready`; plus `.dockerignore`.
- `infra/caddy/Caddyfile` — `api.marketcore.test` with `tls internal` and `reverse_proxy api:3001`.
  Caddy sets `Host`, `X-Forwarded-For` and `X-Forwarded-Proto` itself, so the app is genuinely reached
  at a non-localhost hostname over real TLS.
- `docker-compose.e2e.yml` — `db`, `api`, `caddy`, with `depends_on: condition: service_healthy` on
  both edges; `up -d --build --wait` to bring up, `down -v` to tear down.
- `apps/e2e` — Playwright, `ignoreHTTPSErrors: true` for the internal CA, `baseURL:
  https://api.marketcore.test`. Tests: a business journey (register → login → org → product → publish
  → list), a host/scheme assertion (the app observes the non-localhost `Host` and
  `X-Forwarded-Proto: https`), CORS through the proxy, and request-id/envelope survival across it.
- CI job `behavioural`: build, `up --wait`, run Playwright, upload traces on failure, `down -v`.

**Optional, and a feature decision rather than a test one.** The harness only has teeth for host and
scheme behaviour once such behaviour exists. Two candidates, each needing its own ADR:
`TRUST_PROXY` (hop count) plus `app.set('trust proxy', …)` — the prerequisite for any
`X-Forwarded-Proto`-aware code — and a **Host-header allowlist** as a DNS-rebinding defence. Do not
smuggle these in as "test improvements".

---

## Phase 4 — Mutation testing

StrykerJS, scoped tight: `apps/api` on `src/security/**` and `src/auth/**` (highest consequence),
plus `packages/domain` and `packages/contracts`. `thresholds: { high: 80, low: 60, break: null }`
initially — report, do not block. Runs nightly, never on the PR critical path. Survivors are read as
"assertions that failed to detect a behaviour change".

---

## Phase 5 — Reusable skills and agents (delivered)

Committed under `.commandcode/`:

| Artifact | Purpose |
|---|---|
| `skills/marketcore-testing-ladder` | which layer for which claim; the commands; the anti-patterns |
| `skills/host-sensitive-http-testing` | the localhost trap: Host, scheme, TLS, proxy, cookies, CORS |
| `skills/property-based-testing` | fast-check patterns and invariants for this repo |
| `agents/test-author` | optional subagent that adds tests at the right layer |
| `agents/test-auditor` | optional read-only subagent that hunts fake-green tests |

Project skills and agents are discovered by walking **up** from the session working directory, so a
session must start inside `marketcore/` for these to load.

---

## Verification

Never accept "the suite is green" as evidence. Each phase has a gate that must be able to fail.

```bash
cd marketcore && pnpm install
pnpm turbo run lint typecheck test build     # the existing gate stays green
```

- **Phase 0** — `pnpm --filter api test:coverage` (thresholds enforced, not just printed). Then remove
  CORS from `configureApp()` and confirm `cors.e2e-spec.ts` goes red.
- **Phase 1** — loosen a boundary in `packages/domain/src/password.ts` and confirm the property spec
  fails with a shrunk counterexample.
- **Phase 3** — bring the stack up, run Playwright, then stop Caddy and confirm the suite fails; send
  `X-Forwarded-Proto: http` and confirm the assertion expecting `https` fails.
- **Phase 4** — read the surviving mutants; they are the fake-green tests.

---

## Order of work

Phase 0 → 1 → 2 ship together (no new infrastructure). Phase 3 is the large one and gets its own PR.
Phase 4 is CI-only.

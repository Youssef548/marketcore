# Testing strategy

Five layers, what each one can falsify, and what is deliberately left uncovered.

The short version: unit, property, integration and in-process e2e all run in **one Node
process on localhost**. That is enough for logic, contracts and tenant isolation, and it
is structurally blind to anything environmental — host, scheme, TLS, proxy, cookies. The
behavioural layer (`apps/e2e`) exists for that gap, and the two runners (`test:coverage`,
`test:mutation`) exist so a green suite can be interrogated rather than trusted.

---

## The ladder

| # | Layer | Where | Runner | Command |
|---|---|---|---|---|
| 1 | Unit | `apps/api/src/**/*.spec.ts`, `packages/*/{src,test}` | Jest / Vitest | `pnpm --filter api exec jest` |
| 2 | Property | `**/*.property.spec.ts` | Vitest + fast-check | same as its package |
| 3 | Integration | `apps/api/test/integration/*.integration-spec.ts` | Jest + real Postgres | `pnpm --filter api test:integration` |
| 4 | E2E (in-process) | `apps/api/test/*.e2e-spec.ts` | Jest + Supertest | `pnpm --filter api test:e2e` |
| 4b | Contract | `apps/api/test/client-contract.e2e-spec.ts` | Jest + the real `@app/api-client` | `pnpm --filter api test:e2e` |
| 5 | Behavioural | `apps/e2e/tests/*.spec.ts` | Playwright + Docker + Caddy | see below |
| — | Coverage gate | — | Jest / Vitest thresholds | `pnpm turbo run test:coverage` |
| — | Mutation | — | StrykerJS | `pnpm turbo run test:mutation` |

`pnpm --filter api test` runs 1, 3 and 4 in sequence. Layers 3 and 4 share one database,
which is why they run `--runInBand` and why every fixture is suffixed by `unique()`.

**Which layer for which claim**

| Claim | Lowest layer that can falsify it |
|---|---|
| "this rule rejects X" | 1, or 2 if X is a class of values |
| "this invariant holds for all inputs" | 2 |
| "the DB constraint is actually installed" | 3 |
| "two concurrent writers cannot both win" | 3 |
| "this endpoint returns this status and envelope" | 4 |
| "the response satisfies the shared wire contract" | 4, re-parsed with `@app/contracts` |
| "the client works against the real server" | 4b |
| "Host / scheme / TLS / `X-Forwarded-*` survives the hop" | 5 |
| "the image builds and starts with valid configuration" | 5 |
| "cookie flags are correct over TLS" | 5 |
| "the assertions are real, not decorative" | mutation |

---

## Rules

**The wire is a contract, and the contract is `@app/contracts`.** An e2e assertion written
as a literal is a copy of the contract that goes stale silently — `toMatchObject` still
passes when a field is renamed. Every e2e suite re-parses its response bodies with the same
schema `packages/api-client` validates with, via `expectContract` in
`apps/api/test/support/contracts.ts`. The literal assertion stays alongside it: one proves
the value, the other proves the shape.

**Global HTTP behaviour lives only in `configureApp()`.** `apps/api/src/app.setup.ts` is
shared by `main.ts` and the e2e harness so tests install what production installs. A global
registered in `main.ts` alone is invisible to every test — CORS was exactly that until the
cors suite caught it.

**An in-process test cannot prove environmental behaviour.** `request(app.getHttpServer())`
never binds a port: no TLS, no DNS, no proxy, no real `Host`. Anything keyed on those is
dead code under that harness. See the `host-sensitive-http-testing` skill.

**Make it observable before calling it testable.** Behind a proxy the process sees only a
connection from the proxy, so the client's scheme and hostname exist *only* as headers.
`RequestLogFields` therefore carries `host`, `forwardedProto` and `forwardedFor`, and the
behavioural suite asserts on those log lines. An unobservable header is an untestable one.

**Measure boundaries; do not hope a generator finds them.** `fc.string()` will never produce
a 49-character alphanumeric run or two dates that are exactly equal. The cases that matter
are constructed (`nameAtTruncationBoundary`, the explicit `now` in the refresh-token suite).

---

## What these layers have already caught

This is the argument that the suite is real rather than decorative. Every item below was
found by a test that can fail, not by review.

| Found by | What it was |
|---|---|
| Property test (fast-check shrink) | `slugify` truncated **before** stripping separators, so a name whose 50th character is a separator produced `aaa…a-` — a slug the project's own `SLUG_PATTERN` rejects. Counterexample: 49 `a`s + `-b`. Fixed by moving the strip after the slice. |
| Mutation testing | Two `Regex` mutants in `slugify`, two `<` in `decideRefreshTokenUse`, one `<` in `planProductTransition`, and the refine message/path in `ReadinessSchema` could all change without a single test failing. Ten boundary tests added; the remaining survivors are documented equivalent mutants. |
| Mutation testing | Nothing pinned the wire values: replacing `'x-request-id'` with `''` kept the whole suite green, because every test imports the constant. `packages/contracts/test/constants.spec.ts` now asserts them by value. |
| CORS suite + `configureApp` | CORS was registered in `main.ts`, so no test could see it. |
| Behavioural suite | The runtime image had no `pnpm` (migrate exited 127) and a root-owned tree; and Prisma defaulted to the wrong OpenSSL engine. None of that is visible to any other layer. |

## Mutation baseline

`break` is `null` in every Stryker config: these runs report, they do not gate a pull
request. A first baseline nobody has seen should not be able to block work.

| Package | Score | Survivors | Notes |
|---|---|---|---|
| `@app/domain` | **96.97%** | 2 | Both equivalent: `^-+`/`-+$` cannot differ from `^-`/`-$` because the preceding replace collapses separator runs. Documented in `slug.ts`. |
| `@app/contracts` | **94.44%** | 2 | One equivalent (`.every` vs `.some` over a single-key `ReadinessChecks`), one type-level. |
| `apps/api` | **67.21%** (82% of covered) | 27 | Scoped to the guards, tokens, sessions and password hashing — what the unit config reaches. 33 mutants are "no coverage": the controller, repository and DTOs are covered by the e2e suite, and mutating them costs a full app boot per mutant. A deliberate trade, recorded in `stryker.conf.json`. |

`pnpm --filter api test:mutation` reports the survivors with their source locations. A
surviving mutant is a test that did not test, which is why this run exists.

---

## The behavioural layer

```bash
docker compose -f docker-compose.e2e.yml up -d --build --wait
pnpm --filter e2e test:behavioural
docker compose -f docker-compose.e2e.yml down -v
```

A real image, a real reverse proxy (Caddy, `tls internal`), a real database reached over the
compose network, driven by Playwright over a real socket. `apps/e2e/README.md` lists the
failures only this layer can see.

It is deliberately **not** wired into `turbo run test`: it needs a live stack, and a suite
that fails on every push because nothing is running is a suite people learn to ignore. CI
runs it in its own job after `ci` passes.

---

## Deliberately not covered

- **Host-based behaviour does not exist yet.** The API reads no `Host`, no
  `X-Forwarded-Proto` and sets no `trust proxy`, so there is nothing to verify. The harness
  is ready for it: `TRUST_PROXY` and a Host-header allowlist are the two features worth
  adding, and each needs its own ADR rather than being smuggled in as test work.
- **Cookies.** Auth is a bearer token in a body today. When a refresh cookie lands, the
  behavioural suite is where its `Secure`/`SameSite` flags belong — an in-process assertion
  cannot see them, because without TLS the `Secure` branch is never taken.
- **`apps/web`.** A shell with one render test. It has no behavioural coverage because it
  has no user journey yet.
- **No consumer-driven contract testing (Pact).** `client-contract.e2e-spec.ts` drives the
  real client against the real server, which catches drift; a Pact broker would add
  versioned expectations that this single-repo project does not need yet.

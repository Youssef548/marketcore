---
name: marketcore-testing-ladder
description: Use when writing, adding or reviewing tests in MarketCore — choosing between unit, property, e2e, integration, contract and behavioural layers, or when a test is green but the behaviour it claims to prove is unverified.
---

# MarketCore testing ladder

MarketCore has five test layers. Each crosses a different boundary, so each can only falsify certain
claims. Picking the wrong layer produces a green test that proves nothing — the most expensive
failure mode in this repo.

**Core principle:** name the claim first, then pick the lowest layer that can actually falsify it.

---

## When to use

- Adding a test and unsure where it belongs.
- A test passes and you do not believe the behaviour.
- Reviewing a suite, or a PR that adds/edits tests.
- Asked to "improve coverage" or "add more tests".

---

## The ladder

| # | Layer | Location | Runner | Command | Crosses |
|---|---|---|---|---|---|
| 1 | Unit | `apps/api/src/**/*.spec.ts`, `packages/*/{src,test}` | Jest / Vitest | `pnpm --filter api exec jest` · `pnpm --filter @app/domain test` | nothing |
| 2 | Property | `packages/*/**/*.property.spec.ts` | Vitest + fast-check | same as unit for that package | nothing (generates inputs) |
| 3 | Integration | `apps/api/test/integration/*.integration-spec.ts` | Jest + real Postgres | `pnpm --filter api test:integration` | the database |
| 4 | E2E (in-process) | `apps/api/test/*.e2e-spec.ts` | Jest + Supertest | `pnpm --filter api test:e2e` | the Nest HTTP pipeline — **no socket** |
| 5 | Behavioural (out of process) | `apps/e2e/tests/*.spec.ts` | Playwright | `docker compose -f docker-compose.e2e.yml up -d --build --wait && pnpm --filter e2e test` | process, socket, TLS, reverse proxy, container |
| — | Everything | — | Turborepo | `pnpm turbo run lint typecheck test build` | — |

`pnpm --filter api test` runs layers 1, 3 and 4 in sequence. Layers 3 and 4 share one database, which
is why they run `--runInBand` and why every fixture is suffixed by `unique()`.

**Status.** All five layers and both runners are wired. Layer 5 needs the stack running
first — see `apps/e2e/README.md` for the up/test/down sequence.

---

## Which layer for which claim

| Claim | Lowest layer that can falsify it |
|---|---|
| "this rule rejects X" | 1, or 2 if X is a class of values |
| "this invariant holds for all inputs" | **2** (a single example cannot) |
| "the DB constraint is actually installed" | 3 |
| "two concurrent writers cannot both win" | 3 |
| "this endpoint returns this status and envelope" | 4 |
| "the guard chain rejects a forged token" | 4 |
| "the response satisfies the shared wire contract" | 4 (re-parse with `@app/contracts`) |
| "a real client can talk to a real server" | **5** |
| "Host / scheme / TLS / `X-Forwarded-*` is handled" | **5** (see `host-sensitive-http-testing`) |
| "CORS allows/denies this browser origin" | 4 for the decision, 5 for the real exchange |
| "cookie flags (`Secure`, `SameSite`) are correct" | **5** |
| "the assertions are real, not decorative" | mutation (`pnpm --filter api test:mutation`) |

If a claim has no row, it is probably not testable yet — say so rather than writing a test that
merely touches the code.

---

## Rules

**The wire is a contract, and the contract is `@app/contracts`.** An e2e assertion written as a
literal (`expect(body).toEqual({ id: expect.any(String) })`) is a copy of the contract that goes stale
silently. Re-parse the response with the same zod schema the client validates with:
`expectContract(OrganizationSchema, res.body)` from `apps/api/test/support/contracts.ts`. Keep the
literal assertion as well — one proves the specific value, the other proves the shape.

**`toMatchObject` permits extra and renamed fields; `toEqual` does not.** Use `toMatchObject` only
when you deliberately want a subset.

**An in-process test cannot prove environmental behaviour.** `request(app.getHttpServer())` does not
bind a port: there is no TLS, no DNS, no proxy, no real `Host`. Anything keyed on host, scheme or
forwarded headers is dead code under this harness. See `host-sensitive-http-testing`.

**Global HTTP behaviour lives only in `configureApp()`.** `apps/api/src/app.setup.ts` is shared by
`main.ts` and the e2e harness precisely so tests install what production installs. A global
registered in `main.ts` alone is invisible to every test — CORS currently sits there.

**Fixtures live in `test/support/fixtures.ts` and are built from shared enums.** A hand-written
payload is a copy of the contract. When a fixture must be invalid on purpose, say so in a comment and
cast deliberately instead of routing it through the valid path.

**No literals in tests either.** Header names, status codes and enum values come from
`@app/contracts` or a `constants.ts`. House rules: see `nestjs-code-conventions`.

---

## Anti-patterns

| Anti-pattern | Why it is a defect |
|---|---|
| Deleting or loosening an assertion to get green | You removed the only thing that was working. Fix the code or report the failure. |
| Adding a mock so a failing test passes | The mock now asserts your assumption, not the system. |
| `expect(true).toBe(true)` / asserting on a mock's return | Cannot fail. Delete it. |
| Unit-testing a guard's HTTP rejection | Unit layer cannot see status codes; use layer 4. |
| Claiming a behaviour is covered by an in-process e2e | It is not, if the behaviour depends on the environment. |
| One giant e2e spec per feature | Slow, order-dependent, and the first failure hides the rest. |
| Testing the framework | `ZodValidationPipe` rejecting a bad body is already covered by `validation.e2e-spec.ts`. |

---

## Red flags — STOP

- You are about to weaken an assertion.
- You are about to mock the thing you are trying to verify.
- The test passes before you implement the feature.
- You cannot name the claim the test proves.
- The test would still pass if you deleted the implementation.
- You are writing an in-process test for TLS, cookies, proxy headers or `Host`.

**All of these mean: you have not written a test yet.**

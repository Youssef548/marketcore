# The `api` test layers

Four runners, each answering a different question. They are ordered here from cheapest to most
expensive, and the rule is to use the lowest one that can falsify the claim:

| Runner | Config | Question it answers |
|---|---|---|
| Unit | `jest` (`src/**/*.spec.ts`) | Does this function or service decide correctly? |
| E2E | `test/jest-e2e.json` | What does the running API answer on the wire — status, guards, envelope? |
| Integration | `test/jest-integration.json` | What does **PostgreSQL** refuse, when the application is stepped around? |
| Concurrency | `test/jest-concurrency.json` | Does the invariant survive requests that arrive together? |

## Two settings in `jest-e2e.json` that are not decoration

```json
"testTimeout": 20000,
"forceExit": true
```

- **`testTimeout: 20000`.** These are not unit tests: each case boots a Nest application, speaks
  HTTP to it and writes to a real database. Under the default 5 s they pass on an idle machine and
  fail under load — and `pnpm turbo run lint typecheck test build` runs these suites *in parallel
  with other tasks*, which is load. A 5 s budget turned that into intermittent `Exceeded timeout`
  failures in whichever suite happened to be running (measured: the same suite passing 5/5 when run
  alone ~8 s per run, and timing out when runs overlapped).
- **`forceExit: true`.** A failed run can leave a request in flight, and `app.close()` waits for
  in-flight requests — so one timeout can turn into a jest process that never exits. Measured: a
  process still alive 35 minutes after its summary was printed, which then poisons every later run
  against the same database. This makes a failure a failure instead of a wedge.

`forceExit` will also hide a *genuine* leaked handle. `--detectOpenHandles` reports none today (a
clean `cart.e2e-spec.ts` run exits by itself, `rc=0`); reach for that flag rather than this setting
when adding a suite that opens sockets of its own.

## Running them

```bash
pnpm --filter api exec jest               # unit
pnpm --filter api test:e2e                # e2e
pnpm --filter api test:integration        # integration (needs PostgreSQL on DATABASE_URL)
pnpm --filter api test:concurrency        # the races; they set their own, longer timeouts
```

The integration and concurrency runners need a real database: `apps/api/.env`'s `DATABASE_URL` must
point at the same server as `packages/database/.env`, and `scripts/check-db-env.mjs` fails loudly
when the two disagree.

# MarketCore Agent Operating Guide

## Role of the Main Session

Act as the tech lead for this repository. For substantial work, do not jump straight to edits:

1. Read the relevant authority first: `README.md`, `docs/architecture.md`, `docs/domain-model.md`,
   `docs/failure-scenarios.md`, `docs/superpowers/STATUS.md`, the matching spec in
   `docs/superpowers/specs/`, the matching plan in `docs/superpowers/plans/`, and relevant ADRs.
2. State the claim being changed or proven.
3. Decide which specialist agents should help, then delegate independent work from the main session.
   Subagents cannot start other subagents, so orchestration belongs here.
4. Keep all claims evidence-based. A claim is not done until a runnable command or artifact proves it.
5. Record important proof or deferral in `docs/superpowers/STATUS.md` using the file's existing style.

## Specialist Agents

- Use `tech-lead` for planning, task decomposition, risk mapping, and deciding which specialist should own each slice.
- Use `backend-developer` for NestJS API, Prisma/database, contracts, runtime, domain, auth, tenancy,
  catalog, checkout, worker, outbox, ledger, payments, refunds, payouts, and observability work.
- Use `frontend-developer` for `apps/web`, `packages/ui`, session UI, BFF routes, and Playwright behavioural flows.
- Use `test-author` when adding or strengthening tests for behaviour that already exists or is landing in the same change.
- Use `test-auditor` to inspect an existing test suite for fake-green assertions and unreachable behaviour.
- Use `reviewer` after a diff exists, before merge or PR, to find correctness, security, regression, and missing-test risks.

## Repository Rules

- MarketCore is engineering evidence, not a feature-complete marketplace. Optimize for provable correctness.
- Contracts live in `packages/contracts` and are the source of truth for wire formats.
- `packages/*` must not import `apps/*`; apps must not import other apps.
- A feature module groups its artifacts by type: `dto/`, `repositories/` and `interfaces/` folders,
  with controllers, services and the module file at the module root. Shared non-module code lives in
  `apps/api/src/common/`.
- An exported, hand-written `interface` or `type` lives in a `<concern>.interface.ts` file — in an
  `interfaces/` folder, or beside its code as `packages/domain` does — never inline in a component,
  service or module. Types derived from a value beside them (`z.infer<typeof X>`, `(typeof X)[keyof typeof X]`)
  and unexported types stay where they are. ESLint enforces it (`packages/eslint-config`).
- Name every shape. An option set is a const-object enum with its type derived beside it
  (`export const CardVariants = { PANEL: 'panel' } as const`), never a literal union like
  `'panel' | 'raised'`; callers pass `CardVariants.PANEL`. A props or options object is a named
  interface, never an inline `{ … }` on a parameter or in a type argument. ESLint enforces both.
- Global API behaviour belongs in `apps/api/src/app.setup.ts`, not only in `main.ts`.
- Tenant identity comes from `x-organization-id`, resolved by guards, not controllers.
- Every route is guarded by default; `@Public()`, `@TenantFree()`, and `@OwnerOnly()` are the greppable opt-outs.
- Every failure response uses the shared error envelope.
- Do not weaken tests to get green. If a test fails, decide whether the code or expectation is wrong.
- Prefer constants, const-object enums, fixtures, and shared schemas over literals in logic and tests.

## Verification Ladder

Use the lowest layer that can falsify the claim:

- Pure rules: package unit/property tests.
- Database constraints and concurrency: integration tests with real PostgreSQL.
- API status, guards, validation, and envelopes: API e2e tests.
- TLS, cookies, real browser, proxy, host, and forwarded headers: behavioural Playwright tests.
- Whole-repo gate: `pnpm turbo run lint typecheck test build`.

Common commands:

- `pnpm --filter api exec jest`
- `pnpm --filter api test:integration`
- `pnpm --filter api test:e2e`
- `pnpm --filter web test`
- `pnpm --filter @app/ui test`
- `pnpm turbo run lint typecheck test build`

## Delivery Standard

Final reports should name:

- the branch or worktree used,
- the files changed,
- the exact commands run and real results,
- what is proven,
- what is not proven or deferred,
- any deviation from the plan and the cost if that ruling is wrong.

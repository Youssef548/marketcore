# MarketCore Week 2 — Tenancy and Catalog — Design

- **Date:** 2026-09-19
- **Status:** Draft — awaiting design review
- **Path:** Week 2 of 12, phases 2 and 3
- **Builds on:** `docs/superpowers/specs/2026-09-19-marketcore-platform-design.md` — retained, not
  superseded. That document decides the shape of the platform; this one decides what phase 2 and
  phase 3 actually build on top of it.
- **Continues:** the platform spec's `D<n>` sequence. Its decisions are D1–D17; this document's are
  D18 onward. A code comment citing `D19` must resolve to a decision, and the platform spec's header
  now points here for the continuation.

## 1. Context

Week 1 closed on the gate *"one command starts the API and every check passes"*, tagged
`w01-foundation`. The tree carries `packages/runtime` (validated env, Prisma module, request ids,
JSON logger), the error envelope with a required `requestId`, a liveness/readiness split, an
idempotent seed, and one model — `User` — pulled forward so the readiness probe could round-trip a
real query through Prisma's builder rather than raw SQL.

Week 2's gate is the first one the project is genuinely *about*:

> **Cross-tenant tests pass: one organization cannot read another's product.**

Three things make this week larger than its gate. The roadmap lands `packages/domain` and the tenant
query pattern here, so the week establishes the access pattern every later module inherits. The
architecture assigns the Auth and Organizations modules to phase 2, so a complete identity subsystem
lands with it. And `docs/domain-model.md`'s entity table has **no session or token model at all** —
so "refresh" and "revoke", which `docs/architecture.md` lists as phase-2 responsibilities, cannot be
built without first deciding what server-side state they need and recording it in the domain model.

**What the docs did not agree on, and how it was resolved.** The roadmap's "lands" line for week 2
omits auth entirely; `docs/architecture.md` and `docs/superpowers/STATUS.md` both put it here. The
resolution is recorded in §14 (Q1): auth lands, at the level `architecture.md` describes.

## 2. Decisions

| # | Decision | Choice | Alternatives considered | Rationale |
|---|----------|--------|------------------------|-----------|
| D18 | Tenant isolation enforcement | **A `TenantContext` value object built by a guard, plus one shared `tenantScope()` helper that every tenant repository composes its `where` from.** Enforced by evidence: a cross-tenant test per tenant-owned model and a unit test on the scope helper | Prisma Client Extension injecting the filter; PostgreSQL row-level security | The registry-based extension relocates the same hazard — an unregistered model fails silently — and adds a second way to reach the database. RLS is the strongest guarantee but needs an interactive transaction per request, hand-written policy SQL in migrations, and policies written against a schema that is still moving this week. **Recorded as ADR 010**, with week 11 (the hardening week, whose job is justified hardening against real query shapes) as the review trigger |
| D19 | Session state | **Stateless access token + rotating refresh tokens with reuse detection.** New `Session` and `RefreshToken` models. Presenting an already-used token revokes the whole session | Plain opaque refresh token with revoke but no rotation; access token only | A replayed refresh token is silently accepted under the no-rotation option, so nothing proves replay safety. Rotation with family revocation is a reply-safety claim, which is the same class of guarantee the rest of this repository exists to prove |
| D20 | Tenant selection | **An `x-organization-id` request header**, validated by a membership guard | Organization in the path; active organization as a JWT claim | INV-9 is worded as a fetch *by identifier*, so the filter must live in the query regardless. The header keeps routes flat, which matters because buyer-side routes later do not nest under the seller's organization — a buyer is not a member of it. A token claim would pin the caller to one tenant for the token's lifetime |
| D21 | Roles | **`owner` and `member` only**, with membership-based authorization and `@OwnerOnly` on organization administration | A three- or four-role vocabulary | The architecture's goals include demonstrating role-based access, so a single role would be dishonest. But no week-2 or near-term operation distinguishes a second administrative tier, so inventing one would be a role no code branches on |
| D22 | Hashing | **argon2id for passwords; SHA-256 for refresh tokens.** Both behind ports | bcrypt; scrypt from `node:crypto`; argon2id for both | A refresh token is 256 bits of randomness, so there is nothing to brute-force and a slow KDF buys latency rather than security. A password is low-entropy and guessable, so it gets the memory-hard function. The asymmetry is the point and is documented where the code is |
| D23 | Guard posture | **Deny by default:** `AccessTokenGuard`, `OrganizationGuard` and `RolesGuard` are global, with `@Public()`, `@TenantFree()` and `@OwnerOnly()` as visible opt-outs | Per-controller `@UseGuards` | Opt-in guards let a new tenant controller be silently unscoped. With opt-outs, every route outside the tenant boundary says so in code, and `grep '@TenantFree'` is a complete audit of them — the same posture as the boundary rules' `default: 'disallow'` |
| D24 | Error codes | **No new codes.** The existing six cover every phase-2 failure | Extending `ErrorCodes` as D11 anticipated | D11 permits extension per phase; it does not require it. A closed set that grows only when a client genuinely needs to branch on a new value is worth more than one that grows by habit |
| D25 | Shared value sets | **Enum values live in `packages/contracts`** (they are wire-level); `packages/domain` imports them and owns the rules over them. A drift test asserts the const-object values equal the Prisma-generated enums | Values in domain with contracts importing them; values duplicated per layer | This is the conventions' own Rule 1. It also leaves the template's stated invariant intact — contracts still depends on zod alone, and the new edge is domain → contracts, which no stated rule forbids. The drift test is what makes three copies (DB, wire, rules) safe rather than hopeful |
| D26 | Domain package scope | **Rules only.** Roles, tenant context and scope, password policy, refresh usability, slug, product publish eligibility | Shipping state-machine machinery for all four aggregates now | Only `Product` has a state machine this week. The other three arrive in phases 6, 9 and 11 with the operations that exercise them |
| D27 | Catalog scope | **Product CRUD plus readable inventory, with business rules enforced as database constraints.** No reservations, movements or row locking | Read-only catalog; catalog plus adjustments and reservations | The roadmap lands the `Inventory` model here with its constraints, and the gate needs a real read path. Reservations and locking are phase 4's mechanism, and building them a week before the race that justifies their design exists is precisely what phase-gating (platform spec D1) forbids |
| D28 | Schema constraints | **`CHECK` constraints ship as hand-edited migration SQL** (`migrate dev --create-only`, then edit, then apply) | Expressing them only in application validation | The roadmap's wording is "business rules enforced by constraints". Prisma cannot express a `CHECK`, so if the constraint is to be real the migration must carry it. A test writes around the application to prove the database refuses |

## 3. Data model

Six new models in `packages/database/prisma/schema/`, one file per model. Four are the roadmap's;
two close the session gap §1 records.

| Model | Fields (essential) | Constraints | Phase |
|---|---|---|---|
| `Organization` | id, name, slug, status, createdAt, updatedAt | unique `slug`; `OrganizationStatus` = ACTIVE \| DISABLED | 2 |
| `OrganizationMember` | id, organizationId, userId, role, createdAt | unique `(organizationId, userId)`; FKs cascade | 2 |
| `Session` | id, userId, createdAt, lastUsedAt, expiresAt, revokedAt, revokedReason | `SessionRevocationReason` = LOGOUT \| REUSE_DETECTED | 2 (new) |
| `RefreshToken` | id, sessionId, tokenHash, createdAt, expiresAt, usedAt | unique `tokenHash`; FK to `Session` cascades | 2 (new) |
| `Product` | id, organizationId, name, priceMinor, currency, status, createdAt, updatedAt | `ProductStatus` = DRAFT \| PUBLISHED; `priceMinor` Int | 3 |
| `Inventory` | productId, available, reserved, version, createdAt, updatedAt | unique `productId`; `CHECK (available >= 0 AND reserved >= 0)`; FK cascades | 3 |

**Names follow the existing convention.** `OrganizationStatus` uses ACTIVE/DISABLED to match
`UserStatus` rather than inventing SUSPENDED as a second vocabulary for the same idea.

**`User.prisma` changes.** `OrganizationMember` and `Session` both reference `User`, and Prisma
requires both sides of a relation, so the existing model gains relation fields and an accompanying
migration. This is the first edit to a shipped model and is called out rather than left to be
discovered in a diff.

**What is a constraint, and what is not.** Enforced by the database: the unique keys above, the
non-negative inventory check, and the foreign keys. **Not** enforced by the database: "an
organization retains at least one owner". No simple `CHECK` expresses a count over sibling rows, so
it is a transactional rule with its own test (409 `CONFLICT`). It is labelled a rule here so the
design does not imply a stronger guarantee than exists.

**Seeding uses deterministic ids.** Products carry no business-level unique key, and inventing
"unique name per organization" purely so the seed can `upsert` would distort the domain to serve the
seed. Instead: organizations upsert on `slug`, memberships on `(organizationId, userId)`, and
products and inventory on fixed UUIDs from a `SEED_IDS` constant. The seed grows to two organizations
with an owner and a member each, and a product per organization — enough for the cross-tenant suite
to be readable and for the manual walkthrough to work.

## 4. Auth subsystem

| Route | Body | Effect |
|---|---|---|
| `POST /api/v1/auth/register` | email, password | creates the **user only**; 201. No tokens |
| `POST /api/v1/auth/login` | email, password | verifies argon2id, creates `Session` + first `RefreshToken` in one transaction; returns the pair |
| `POST /api/v1/auth/refresh` | refreshToken | rotates; returns a new pair |
| `POST /api/v1/auth/logout` | refreshToken | revokes that session with reason LOGOUT |

**Registration deliberately issues no session.** Registration is user creation; a session is a
separate concern, and keeping them apart means the register path carries no token logic to get wrong.
A client that wants to be logged in after registering calls login, which is one extra request and one
fewer code path.

**Access token.** JWT, HS256, `sub` = user id, ~15 minutes. **No organization claim** — this is what
makes D20 work: membership can change without reissuing a token.

**Refresh token.** 256 bits from `randomBytes(32)`, returned exactly once, stored as its SHA-256 hash.
~30 days.

**Rotation and reuse detection.** A refresh presents a token; the repository looks it up by hash and
the domain's usability rule decides:

| State of the presented token | Decision |
|---|---|
| No row for the hash | reject — 401 `UNAUTHORIZED` |
| `expiresAt` in the past | reject — 401 `UNAUTHORIZED` |
| Session revoked | reject — 401 `UNAUTHORIZED` |
| `usedAt` is set (already rotated) | **replay.** Revoke the session with reason REUSE_DETECTED, reject — 401 |
| Otherwise | rotate: set `usedAt`, issue a new token in the same session, return the pair |

This is a decision table in `packages/domain` rather than a chain of conditionals in a service, per
the conventions' Rule 5. The rotation itself — marking used, inserting the new token, and either
branch of the revoke — runs inside one `$transaction` in the repository.

**A `$transaction` alone does not make that safe, and pretending otherwise would be the exact bug
this project exists to avoid.** Postgres runs at READ COMMITTED, so two concurrent refreshes of the
same token can both read `usedAt IS NULL` and both rotate, issuing two live tokens and defeating
reuse detection. The claim is therefore marked with a **conditional update guarded on the row still
being unused** — `updateMany({ where: { id, usedAt: null }, data: { usedAt: now } })` — and the
rotation proceeds only when it reports exactly one affected row; otherwise the caller lost the race
and the replay branch applies. A `SELECT … FOR UPDATE` on the token row would be the alternative and
is the pattern phase 4 reuses for inventory.

**Stated limitation.** Access tokens are not revocable: revocation applies to sessions and refresh
tokens, so a stolen access token remains valid until it expires. That is inherent to a stateless
access token, and it is the reason the TTL is short. It goes in the README's honest-limitations
section rather than being omitted.

**Ports and adapters.** `PasswordHasher` (interface in its own file, argon2id adapter beside it) and
`TokenService` (signing and verifying access tokens; hashing refresh tokens). No passport: it would
split the guard's logic between a strategy and a guard, and add dependencies, for no gain here.

**Configuration.** `JWT_SECRET` joins `EnvSchema` (required, minimum length 32) and both
`.env.example` files. Token lifetimes are implementation constants in the auth module, not env
values — nothing outside the module branches on them, and the conventions' Rule 1 places
implementation values beside the code that owns them.

## 5. Tenant resolution and the guard chain

```
request
  → requestIdMiddleware
  → requestLoggerMiddleware
  → AccessTokenGuard        (global)  @Public()      opts out — auth routes, health
  → OrganizationGuard       (global)  @TenantFree()  opts out — org creation, org listing
        ├ ORGANIZATION_ID_HEADER present and well-formed   (else 400)
        ├ load OrganizationMember by (organizationId, userId)
        ├ require the membership exists and organization.status === ACTIVE   (else 403)
        └ request.tenant = buildTenantContext(organizationId, role)
  → RolesGuard              (global)  @OwnerOnly()   requires role === OWNER   (else 403)
  → ZodValidationPipe
  → controller → service → repository → Prisma
```

NestJS runs guards before pipes, so an unauthorized request never reaches validation, and the
exception filter maps a guard's `HttpException` into the envelope — with the request id, because the
id middleware ran first.

**Repositories take a `TenantContext`, never a bare id.**

```ts
// every tenant-scoped query composes its where from one helper
findById(tenant: TenantContext, id: string) {
  return this.prisma.product.findFirst({ where: { id, ...tenantScope(tenant) } });
}
```

The signature is the enforcement: a tenant-scoped query cannot be written without a tenant, and the
filter's shape has exactly one definition. `buildTenantContext` refuses to construct an empty tenant,
so the invalid state is unrepresentable at construction rather than validated afterwards.

## 6. API surface

**Organizations and membership.** These exist to prove the owner/member distinction and to let the
cross-tenant fixture be built through the API rather than only the seed.

| Route | Access | Effect |
|---|---|---|
| `POST /organizations` | authenticated | creates the organization **and its OWNER membership in one transaction** |
| `GET /organizations` | authenticated | the caller's organizations with their role — how a client learns the header value |
| `GET /organizations/members` | member or owner | tenant header required |
| `POST /organizations/members` | `@OwnerOnly` | adds an existing user by email; 404 no such user, 409 already a member |
| `DELETE /organizations/members/:userId` | `@OwnerOnly` | 409 if it would remove the last owner |

**Products**, all tenant-scoped:

`POST /products` (creates the product **and its inventory row in one transaction**), `GET /products`,
`GET /products/:id`, `PATCH /products/:id`, `POST /products/:id/publish`,
`POST /products/:id/unpublish`, `GET /products/:id/inventory`.

Publish and unpublish are **explicit transitions rather than `PATCH { status }`**, per the domain
model's state-machine discipline. Their legal and illegal transitions are transcribed into
`domain-model.md`, and an illegal transition is a tested 409 rather than a comment:

| Legal | Illegal |
|---|---|
| DRAFT → PUBLISHED (`publish`) | PUBLISHED → PUBLISHED |
| PUBLISHED → DRAFT (`unpublish`) | DRAFT → DRAFT |

A third state, `ARCHIVED`, was considered and dropped: no operation this week needs it, and a state
no endpoint can reach is the kind of scaffolding platform D1 forbids. It arrives with the operation
that requires it rather than being declared now.

## 7. Error semantics

| Case | Status | Code |
|---|---|---|
| Bad credentials; expired, unknown or replayed refresh token | 401 | `UNAUTHORIZED` |
| Missing or malformed `x-organization-id` | 400 | `VALIDATION_ERROR` |
| Header names an organization the caller is not a member of, or one that is not ACTIVE | 403 | `FORBIDDEN` |
| Member hitting an `@OwnerOnly` route | 403 | `FORBIDDEN` |
| Resource id not visible within the caller's tenant (INV-9) | 404 | `NOT_FOUND` |
| Duplicate email; duplicate organization slug; removing the last owner | 409 | `CONFLICT` |
| Illegal product transition | 409 | `CONFLICT` |

The 403/404 split is deliberate. **The header is an explicit claim**, so refusing it is not a
disclosure. **A resource id is a probe**, so a cross-tenant fetch answers 404 and reveals nothing
about whether another tenant's row exists — which is what INV-9's "never returns data" requires.

## 8. Money and vocabulary

Product prices are integer minor units in an `Int`, per the domain model's money rules; no floating
point appears anywhere. `CurrencyCode` is a closed const-object enum in `contracts` seeded with a
small set, and adding a member is a deliberate, tested change in the same way extending `ErrorCodes`
is — which is how the "prevent cross-currency balancing" rule stays enforceable later.

`ORGANIZATION_ID_HEADER` and the `MemberRoles` value set join `packages/contracts/src/constants.ts`
beside the existing `REQUEST_ID_HEADER`, because the API and any future client have to agree on both.
That is the conventions' Rule 1, and it is also what keeps the header name out of two codebases.

## 9. Testing and evidence

| Layer | Location | Runs as | Covers |
|---|---|---|---|
| Domain unit | `packages/domain/test/` | `vitest` via `turbo run test` | roles, password policy, refresh usability table, tenant context and scope, slug, publish transitions |
| API unit | `apps/api/src/**/*.spec.ts` | `jest` | each guard's failure branch, hasher port, token service, product service |
| API end to end | `apps/api/test/*.e2e-spec.ts` | `jest-e2e.json` | auth including rotation and replay-revokes-the-family, the guard chain, catalog CRUD, **and the tenancy suite that is the gate** |
| Integration | `apps/api/test/integration/` | **new `jest-integration.json` + `test:integration`** | constraints written around the application (negative inventory, duplicate slug, duplicate membership, duplicate token hash); enum drift between the const objects and the Prisma enums |

**The gate, concretely:** an owner in organization A creates product P. Under organization B's header,
`GET /products/P`, `PATCH /products/P`, `POST /products/P/publish` and `GET /products/P/inventory`
each answer **404**; `GET /products` under B never contains P; a header naming an organization the
caller does not belong to answers **403**. That output is committed as evidence.

**One concurrency test, deliberately scoped.** Two parallel refreshes of the same token must produce
exactly one usable pair, because §4's conditional update is the only thing standing between reuse
detection and a silent double-issue. It is a single test against real Postgres inside the integration
suite. It is **not** the concurrency suite: that is still phase 4's
(`apps/api/test/concurrency/`, its own database name, per platform D7/D8) and still owns the
last-item race. Adding this test does not move that boundary — it just refuses to ship a
concurrency-sensitive claim with no test behind it.

**A gap this closes.** `README.md`'s flagship table already advertises
`pnpm --filter api test:integration` — a script that does not exist. It becomes real this week, and
its row moves from "phase 8" to phase 2. The template's own precedent applies: a command a reviewer
cannot run is not evidence.

**`turbo.json`.** The `test` task's `env` list gains `JWT_SECRET`, or turbo serves a stale cached
green for a suite that now depends on a secret the cache does not know about. This is the same class
of scheduled consequence ADR 001 recorded for `REDIS_URL`.

## 10. Documentation and delivery

- `docs/domain-model.md` — gains `Session` and `RefreshToken`; the `owner`/`member` vocabulary; the
  `Product` transition table; the inventory `CHECK` constraints; the currency set; and a note that
  `User` gained relations.
- `docs/architecture.md` — one line recording that the tenant access pattern lives in
  `packages/domain`; the module table's Auth and Organizations rows move to "delivered in phase 2".
- `docs/adr/010-*.md` — **decision 010: enforce tenant isolation in the application query layer**,
  recording application-level scoping over Prisma extensions and RLS, with a week-11 review date.
  The remaining decisions (D19, D22, D23) stay in this spec: they are reversible mechanism choices,
  and the ADR index's own rule keeps the set meaningful rather than exhaustive.
- `docs/adr/README.md` — ADR 010 added to the index table. The `D`-sequence pointer already covers
  both specs, so it needs no further change.
- `README.md` — roadmap moves phases 2–3 to completed; the tenant header and auth flow join
  Conventions; the flagship table gains the tenant-isolation row with its real output; and the
  **"Only one table exists"** limitation is rewritten, because it stops being true on day one.
- `docs/superpowers/STATUS.md` — the week 2 entry: gate, evidence, what is proven, what is deferred.
- **Delivery:** branch `week-02-tenancy-catalog`, one pull request into `main`, tag
  `w02-tenancy-catalog` after merge, per `.agents/skills/git-delivery-workflow`.

## 11. Deviations from the platform spec

1. **The entity table gains two entities.** `Session` and `RefreshToken` are not in the platform
   spec's phase table. They are forced by `architecture.md`'s phase-2 scope and were absent by
   omission, not by decision. Recorded rather than added silently.
2. **`packages/domain` gains a dependency on `packages/contracts`.** The platform spec's D13 says the
   domain package is pure TypeScript with no Nest, no Prisma and no IO; it says nothing about other
   packages. Importing the wire value sets keeps the conventions' Rule 1 and leaves the template's
   "contracts depends on zod alone" invariant intact. Domain still holds no IO.
3. **`packages/domain` lands with rules only.** D26 defers the state machinery for orders, payments,
   refunds and payouts to the phases that exercise them.
4. **The first edit to a shipped model.** `User` gains relation fields, so the migration is not purely
   additive at the schema level even though the columns are.
5. **The integration suite gets its own jest config and script**, where platform D8 said the e2e
   config would run it. `README.md` already advertises `test:integration` as a distinct command, and a
   separate `testRegex` keeps the constraint and drift tests from being silently double-run inside the
   e2e pass.

## 12. Risks

| Risk | Warning sign | Control |
|---|---|---|
| A tenant query written without the scope helper | A repository method taking `organizationId: string` instead of a `TenantContext` | The signature makes it awkward and the cross-tenant suite makes it fail; §9's per-model tests are the net |
| The auth week crowds out the gate | Cross-tenant tests written last, or thin | The gate is the acceptance condition for the week; §9 names it, and `STATUS.md` has to carry its output |
| Enum drift across three copies | Prisma enum and const object disagree | §9's drift test, which fails rather than warns |
| A constraint assumed to exist but not migrated | Negative inventory accepted by a test that bypasses validation | §9's integration suite writes around the application deliberately |
| Scope creep into phase 4 | Reservation or row-locking code appears | D27; week 3's race is the justification for that mechanism and it does not exist yet |
| A stale README claim surviving the week | "Only one table exists" left in place | §10 makes rewriting it part of the week |

## 13. Non-goals

- No reservations, stock movements, release, or row locking — phase 4.
- No concurrency suite, separate test database, or load harness. The single refresh-race test in §9 is
  the entire concurrency claim this week makes; the suite proper is phase 4's.
- No refresh-token reuse *metrics* or alerting; the revocation is recorded, not yet reported on.
- No invitations flow, no email delivery, no password reset.
- No organization deletion, ownership transfer, or billing.
- No buyer-side catalog browse; the product routes are seller-scoped.
- No changes to `apps/web`, which remains parked.
- No passport, no OAuth, no social login, no MFA.

## 14. Resolved questions

**Q1 — The docs disagree on whether auth lands in week 2.** `roadmap.html`'s "lands" line omits it;
`docs/architecture.md` and `STATUS.md` both place it in phase 2. **Resolution: auth lands**, at the
level `architecture.md` describes (register, login, refresh, revoke, password policy, guards). The
roadmap's line lists the models the week introduces and was never an exhaustive scope statement; the
gate cannot be tested against an authenticated actor without it.

**Q2 — How is the tenant established?** An `x-organization-id` header validated by a membership
guard (D20). Path-scoped and token-claim alternatives are recorded in the decision table.

**Q3 — What replaces the missing session model?** `Session` plus `RefreshToken`, with rotation and
reuse detection (D19), added to the entity table in this spec rather than left absent.

**Q4 — What roles exist?** `owner` and `member`, with `@OwnerOnly` on organization administration
(D21).

**Q5 — How much catalog lands?** Product CRUD and readable inventory with database constraints; no
reservations or locking (D27).

**Q6 — Where do the decisions live, given ADRs 001–009 are the plan's nine?** Tenant isolation
becomes ADR 010; the rest are spec decisions D19–D28 (§10).

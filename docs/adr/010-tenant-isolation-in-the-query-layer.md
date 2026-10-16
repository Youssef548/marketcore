# 010 Enforce tenant isolation in the application query layer

- **Date:** 2026-09-19
- **Status:** Accepted
- **Phase:** 2 — gates tenancy and every module that reads tenant-owned rows
- **Implements:** `docs/superpowers/plans/2026-09-19-marketcore-week-02-tenancy-catalog.md`, Tasks 1, 11, 13, 14

## Context

INV-9: *a user may not access a private resource owned by another organization*, observed as a
cross-tenant fetch by identifier returning 404 or 403 and never data. Every later module — orders,
payments, ledger, refunds, payouts — reads tenant-owned rows, so the enforcement point chosen here
becomes the correctness floor for the whole system.

Three genuine options existed, and the decision was not obvious.

## Decision

**The tenant is resolved once into a `TenantContext` value object, and every tenant-scoped query
composes its filter from one shared helper.**

- The `OrganizationGuard` reads the `x-organization-id` header, loads the membership row for
  `(organizationId, userId)`, refuses if it is missing or the organization is not active, and calls
  `buildTenantContext(organizationId, role)`. The value object cannot be constructed without an
  organization id, so a request that reached a controller always acts inside a tenant.
- Every tenant-scoped **resource** repository method takes that `TenantContext` — never a bare
  organization id — and composes its `where` from `tenantScope(tenant)`. One definition of the
  filter's shape. Writes use `updateMany` with the tenant in the `where`, never `update`: `update`
  accepts only a unique predicate, so it could not carry the tenant filter and the row would be
  written before anyone noticed the tenant did not match.
- **The Organizations repositories are the deliberate exception**, and the reason is structural
  rather than an oversight. `MembershipRepository` is the code that *resolves* a tenant, and
  `OrganizationRepository.existsActive` is what verifies it, so both take a bare id — a
  `TenantContext` cannot be an input to the lookup that produces it. They are reachable only from the
  guard, and from services holding a context the guard already produced. An earlier draft of this
  ADR claimed the rule was uniform, which was not true of the code; the claim is narrowed here rather
  than the code contorted to match it.
- Enforcement is evidence rather than magic: a cross-tenant test for the tenant-owned **resource**
  models — Product and Inventory, asserted by identifier, by update, by publish and by listing — plus
  a control assertion that the owner can still read their own row, without which every negative
  assertion would also pass against a system that 404s everything. Organization, OrganizationMember,
  Session and RefreshToken are covered by the guard's own refusal test rather than by a per-model
  cross-tenant case, because they are reached through a resolved tenant rather than by identifier.

## Alternatives considered

- **A Prisma Client Extension injecting the filter** for a registry of tenant-owned models.
  Rejected: the registry is runtime metadata that can drift from the schema, so an unregistered model
  fails *silently* — the same hazard relocated, with harder typing and a second way to reach the
  database. The helper approach fails visibly instead.
- **PostgreSQL row-level security**, with `SET LOCAL app.current_organization` per transaction.
  Rejected for now, not in principle: it is the strongest guarantee available, and it is the natural
  week-11 hardening. It needs an interactive transaction per request (Prisma's pooled connections
  make a session-level `SET` unsafe), hand-written policy SQL carried through migrations, and policies
  written against a schema that was still moving during this phase. Writing policies for tables whose
  own shape was not settled would have been guessing with extra steps.
- **Reading the header in each controller or service.** Rejected outright: it makes tenancy a
  convention repeated at every call site, which is the failure mode the template's boundary rules
  exist to prevent.

## Trade-offs

- **A forgotten filter is caught by tests and review, not by the compiler.** The signature discourages
  it and the cross-tenant suite fails when it happens, but nothing makes it impossible. This is a real
  cost, accepted in exchange for failing visibly rather than silently.
- **Every tenant repository carries an extra parameter**, and `TenantContext` threads through the
  service layer. Verbose, and deliberately so — the verbosity is the enforcement.
- **The header can be spoofed by the caller, and that is fine.** It is a *claim*; the membership lookup
  is what makes it true. What the caller cannot do is claim a tenant they do not belong to.

## Consequences

- `buildTenantContext` throws on an empty id, so the invalid state is unrepresentable rather than
  validated later.
- A cross-tenant miss answers **404**, because a resource identifier is a probe and 403 would confirm
  that the row exists elsewhere. A header naming a tenant the caller does not belong to answers **403**,
  because the header is an explicit claim and refusing it discloses nothing new. Two codes, two
  reasons, recorded so neither drifts into the other.
- The worker inherits this pattern unchanged in phase 10, which is why `TenantContext` and
  `tenantScope` live in `packages/domain` rather than in `apps/api`: `packages/*` is the only thing
  both processes can import.
- Any later module that stores tenant-owned rows is expected to add its own cross-tenant test. The
  pattern is not considered adopted for a module until that test exists.

## Amendment — 2026-10-16 (CR-001)

The storefront adds two read paths that are not tenant reads, and each gets its own rule rather than
a hole in this one.

- **Public catalog.** `GET /storefront/products[/:id]` reads `PUBLISHED` products across every active
  organization. It is the one repository method allowed to read products without a `TenantContext`,
  and its output is parsed through the `.strict()` `PublicProduct` contract schema — the schema is the
  allowlist, so a private field cannot leave by accident. INV-9 is narrowed to say so: published
  product fields and stock are public; drafts, orders, members and the ledger are not.
- **Buyer scope.** Buyer routes are `@TenantFree()`. A guard builds a `BuyerContext` from the
  authenticated user id, and buyer-scoped repositories (cart, checkout, buyer orders) take it and
  compose their `where` from `buyerScope(buyer)` in `packages/domain` — the same shape as
  `tenantScope`, for the same reason. An order is reachable two ways: by the seller through
  `tenantScope`, and by the buyer through `buyerScope`; never by a bare id.
- **Evidence, as before.** INV-12 gets a cross-buyer test per buyer route with a control case, and
  the public read gets a draft-is-404 test. The pattern is not adopted for a buyer route until its
  test exists.
- **A cross-buyer miss answers 404**, for the reason a cross-tenant miss does.

## Review date

2026-12-19, or at phase 11 — whichever comes first. The trigger is query shapes being settled enough
to write RLS policies against, at which point this decision is revisited rather than assumed.

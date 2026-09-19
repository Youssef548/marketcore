# MarketCore Week 2 — Tenancy and Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. `superpowers:test-driven-development` applies to every task
> that writes code.

**Goal:** Deliver the plan's phase 2 and phase 3 — a complete identity subsystem and a tenant-scoped
catalog, with the tenant access pattern established as the one every later module inherits and the
week's gate proven by committed output.

**Architecture:** Tenant identity arrives as an `x-organization-id` request header and is resolved
into a `TenantContext` value object by a global guard; every repository takes that context and
composes its query filter from one shared `tenantScope()` helper, so a tenant-scoped query cannot be
written without a tenant. Access tokens are stateless; refresh tokens rotate with reuse detection
backed by a conditional update, not a bare transaction. Pure rules — roles, tenant scope, password
policy, refresh usability, slug, product transitions — live in a new dependency-light
`packages/domain`.

**Tech Stack:** pnpm 9.15.0 workspaces + Turborepo 2; NestJS 11; Prisma 6 + PostgreSQL 16; zod 4;
Node 22; jest 30 (apps) + vitest 2 (packages); argon2 (argon2id); `@nestjs/jwt`.

**Spec:** `docs/superpowers/specs/2026-09-19-marketcore-week-02-tenancy-catalog-design.md`
**Parent spec:** `docs/superpowers/specs/2026-09-19-marketcore-platform-design.md` (decisions D1–D17;
this week's are D18–D28 and an executor should read both)

---

## Global Constraints

Copied verbatim from the week-2 spec and the platform spec. Every task's requirements implicitly
include this section.

- Node 22 (`.node-version`), pnpm 9.15.0 via Corepack. The workspace scope is the fixed `@app/*`.
- **Money is integer minor units. No floating point anywhere, ever** (platform D9).
- **`@app/database` never imports `@nestjs/*`.** It stays framework-agnostic (platform D6).
- **`packages/domain` holds pure rules only** — no Nest, no Prisma, no IO (platform D13, week-2 D26).
  It may import `@app/contracts` for wire value sets (week-2 D25).
- `apps/*` never imports `apps/*`. `packages/*` never imports an app or a tooling package. Every new
  package declares exactly one `exports` entry and its own `lint` script (platform D5, D13).
- `@app/config` and `@app/eslint-config` are tooling: importable by nothing.
- No code generation. OpenAPI is documentation only.
- Error envelope is fixed: `{ error: { code, message, requestId, details? } }`. `code` is stable and
  machine-readable; clients branch on it, never on `message`.
- **No new `ErrorCode` values this phase** (week-2 D24). The six existing codes cover every failure.
- Anything touching the database is verified against real PostgreSQL. No mocks in integration, e2e, or
  concurrency tests.
- **No literals in logic.** Wire values live in `packages/contracts/src/constants.ts`; implementation
  values live in a `constants.ts` beside the code that owns them. Const-object enums with derived
  types, never bare unions (conventions Rules 1–2).
- **Interfaces and types live in their own `<subject>.interface.ts` file**, never beside logic
  (conventions Rule 3). One name is exported from exactly one place.
- **Layering is `controller → service → repository → Prisma`.** A service that imports `PrismaService`
  is a defect (conventions Rule 4).
- Every task ends green: `pnpm turbo run lint typecheck test build`.

## File Structure

**`packages/domain`** (new) — pure rules, one public entry, its own lint script.

| File | Responsibility |
|---|---|
| `src/tenant.interface.ts` | `TenantContext` and the scope shape it produces |
| `src/tenant.ts` | `buildTenantContext`, `tenantScope` |
| `src/password.interface.ts` | `PasswordPolicyViolation` |
| `src/password.ts` | `PASSWORD_MIN_LENGTH`, `checkPasswordPolicy` |
| `src/refresh-token.interface.ts` | `RefreshTokenState`, `RefreshTokenVerdict` |
| `src/refresh-token.ts` | `decideRefreshTokenUse` — the decision table |
| `src/roles.ts` | `canManageMembership`, `canReadTenant` |
| `src/slug.ts` | `slugify`, `isValidSlug` |
| `src/product.interface.ts` | `ProductTransitionOutcome` |
| `src/product.ts` | `planProductTransition` and its transition table |
| `src/index.ts` | the single public entry |

**`packages/contracts`** — gains `constants.ts` values and three schema files (`auth.ts`,
`organization.ts`, `product.ts`).

**`packages/database`** — one `.prisma` file per model; the migration carries hand-written `CHECK`
SQL; `seed.ts` gains real rows.

**`apps/api/src`** — `auth/` (controller, service, repository, hasher port + adapter, token service,
constants), `organizations/` (controller, service, repositories), `catalog/` (controller, service,
repository), `security/` (guards, decorators, request context), `modules/health/` unchanged except a
decorator.

**`apps/api/test`** — `support/fixtures.ts`, three e2e suites, `integration/` with its own config.

---

### Task 1: `packages/domain` scaffold and the tenant boundary

**Files:**
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`,
  `packages/domain/tsconfig.build.json`, `packages/domain/eslint.config.mjs`,
  `packages/domain/vitest.config.ts`, `packages/domain/src/index.ts`,
  `packages/domain/src/tenant.interface.ts`, `packages/domain/src/tenant.ts`,
  `packages/domain/test/tenant.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TenantContext` (`{ organizationId: string; role: MemberRole }`),
  `buildTenantContext(organizationId: string, role: MemberRole): TenantContext` (throws on an empty
  id), and `tenantScope(tenant: TenantContext): { organizationId: string }`.

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "@app/domain",
  "version": "0.1.0",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "lint": "eslint .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@app/contracts": "workspace:*"
  },
  "devDependencies": {
    "@app/config": "workspace:*",
    "@app/eslint-config": "workspace:*",
    "eslint": "^9.18.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.20.0",
    "vitest": "^2.1.0"
  }
}
```

`@app/contracts` is the dependency and it is deliberate (D25): value sets stay in one place, and the
template's "contracts depends on zod alone" invariant stays intact because the edge points this way.

- [ ] **Step 2: Add the config files**

`tsconfig.json`:

```json
{
  "extends": "@app/config/tsconfig/base.json",
  "include": ["src", "test"]
}
```

`tsconfig.build.json`:

```json
{
  "extends": "@app/config/tsconfig/base.json",
  "compilerOptions": { "composite": false },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test"]
}
```

`eslint.config.mjs`:

```js
import tseslint from 'typescript-eslint';
import { defineConfig } from '@app/eslint-config';

export default tseslint.config(
  { ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  ...defineConfig({ type: 'package' }),
);
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 3: Write the failing test**

Create `packages/domain/test/tenant.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MemberRoles } from '@app/contracts';
import { buildTenantContext, tenantScope } from '../src/tenant';

describe('buildTenantContext', () => {
  it('carries the organization and the role the guard resolved', () => {
    const tenant = buildTenantContext('org_1', MemberRoles.OWNER);

    expect(tenant).toEqual({ organizationId: 'org_1', role: MemberRoles.OWNER });
  });

  it('refuses to build without an organization id', () => {
    // The invalid state is unrepresentable rather than validated later: a
    // TenantContext that exists always names a tenant.
    expect(() => buildTenantContext('', MemberRoles.MEMBER)).toThrow(/organizationId/);
  });
});

describe('tenantScope', () => {
  it('produces the filter every tenant query composes from', () => {
    const tenant = buildTenantContext('org_2', MemberRoles.MEMBER);

    expect(tenantScope(tenant)).toEqual({ organizationId: 'org_2' });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @app/domain test`
Expected: FAIL — cannot resolve `../src/tenant`.

- [ ] **Step 5: Implement**

`packages/domain/src/tenant.interface.ts`:

```ts
import type { MemberRole } from '@app/contracts';

/**
 * The tenant a request is acting within. Built by the guard from a validated
 * membership, never assembled by hand at a call site.
 */
export interface TenantContext {
  organizationId: string;
  role: MemberRole;
}

/** The filter shape every tenant-scoped query composes its `where` from. */
export interface TenantScope {
  organizationId: string;
}
```

`packages/domain/src/tenant.ts`:

```ts
import type { MemberRole } from '@app/contracts';
import type { TenantContext, TenantScope } from './tenant.interface';

/**
 * The only sanctioned way to construct a TenantContext. An empty id throws here
 * rather than silently producing a filter that matches nothing or everything.
 */
export function buildTenantContext(organizationId: string, role: MemberRole): TenantContext {
  if (organizationId.length === 0) {
    throw new Error('buildTenantContext requires an organizationId');
  }
  return { organizationId, role };
}

/**
 * The single definition of the tenant filter. Every repository composes its
 * `where` from this, so the shape cannot drift between call sites.
 */
export function tenantScope(tenant: TenantContext): TenantScope {
  return { organizationId: tenant.organizationId };
}
```

`packages/domain/src/index.ts`:

```ts
// Pure rules shared by the API and, from phase 10, the worker. No Nest, no
// Prisma, no IO (platform spec D13). Wire value sets come from @app/contracts so
// that one value has one definition (D25).
export * from './tenant';
export * from './tenant.interface';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @app/domain test`
Expected: 3 passed.

- [ ] **Step 7: Verify the package lints and typechecks itself**

Run: `pnpm --filter @app/domain lint && pnpm --filter @app/domain typecheck`
Expected: both exit 0. A package with TypeScript source that does not lint itself is a gap the
template already closed once.

- [ ] **Step 8: Commit**

```bash
git add packages/domain && git commit -m "feat(domain): tenant context value object and the shared scope helper"
```

---

### Task 2: `packages/domain` — password policy and the refresh decision table

**Files:**
- Create: `packages/domain/src/password.interface.ts`, `packages/domain/src/password.ts`,
  `packages/domain/src/refresh-token.interface.ts`, `packages/domain/src/refresh-token.ts`,
  `packages/domain/test/password.spec.ts`, `packages/domain/test/refresh-token.spec.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PASSWORD_MIN_LENGTH` (12), `PasswordPolicyViolation`, `checkPasswordPolicy(password: string): PasswordPolicyViolation | null`
  - `RefreshTokenVerdicts` (`USABLE` | `REJECTED` | `REPLAYED`), `RefreshTokenState`,
    `decideRefreshTokenUse(state: RefreshTokenState, now: Date): RefreshTokenVerdict`

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/password.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, PasswordPolicyViolations, checkPasswordPolicy } from '../src/password';

describe('checkPasswordPolicy', () => {
  it('accepts a password at the minimum length', () => {
    expect(checkPasswordPolicy('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it('reports the specific violation rather than a boolean', () => {
    // A boolean would force every caller to invent its own message.
    expect(checkPasswordPolicy('short')).toBe(PasswordPolicyViolations.TOO_SHORT);
    expect(checkPasswordPolicy('a'.repeat(500))).toBe(PasswordPolicyViolations.TOO_LONG);
  });
});
```

`packages/domain/test/refresh-token.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RefreshTokenVerdicts, decideRefreshTokenUse } from '../src/refresh-token';

const now = new Date('2026-09-19T12:00:00.000Z');
const future = new Date('2026-10-19T12:00:00.000Z');
const past = new Date('2026-09-18T12:00:00.000Z');

const state = (overrides: Partial<Parameters<typeof decideRefreshTokenUse>[0]> = {}) => ({
  exists: true,
  expiresAt: future,
  usedAt: null,
  sessionRevokedAt: null,
  ...overrides,
});

describe('decideRefreshTokenUse', () => {
  it('accepts a live, unused token in a live session', () => {
    expect(decideRefreshTokenUse(state(), now)).toBe(RefreshTokenVerdicts.USABLE);
  });

  it('rejects a token that does not exist', () => {
    expect(decideRefreshTokenUse(state({ exists: false }), now)).toBe(RefreshTokenVerdicts.REJECTED);
  });

  it('rejects a token in a revoked session', () => {
    expect(decideRefreshTokenUse(state({ sessionRevokedAt: past }), now)).toBe(
      RefreshTokenVerdicts.REJECTED,
    );
  });

  it('rejects an expired token', () => {
    expect(decideRefreshTokenUse(state({ expiresAt: past }), now)).toBe(RefreshTokenVerdicts.REJECTED);
  });

  it('reports a replay when an already-used token is presented', () => {
    expect(decideRefreshTokenUse(state({ usedAt: past }), now)).toBe(RefreshTokenVerdicts.REPLAYED);
  });

  it('prefers the replay verdict over expiry, because a replay is the actionable signal', () => {
    // An attacker replaying a long-dead token is still an event worth revoking
    // for; reporting only "rejected" would discard that.
    expect(decideRefreshTokenUse(state({ usedAt: past, expiresAt: past }), now)).toBe(
      RefreshTokenVerdicts.REPLAYED,
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @app/domain test`
Expected: FAIL — cannot resolve `../src/password` and `../src/refresh-token`.

- [ ] **Step 3: Implement**

`packages/domain/src/password.interface.ts`:

```ts
export const PasswordPolicyViolations = {
  TOO_SHORT: 'TOO_SHORT',
  TOO_LONG: 'TOO_LONG',
} as const;
export type PasswordPolicyViolation =
  (typeof PasswordPolicyViolations)[keyof typeof PasswordPolicyViolations];
```

`packages/domain/src/password.ts`:

```ts
import { PasswordPolicyViolations, type PasswordPolicyViolation } from './password.interface';

/** A minimum, not a character-class rule: length beats composition for guessing resistance. */
export const PASSWORD_MIN_LENGTH = 12;

/** Bounded so a hostile request cannot hand argon2 an unbounded input. */
export const PASSWORD_MAX_LENGTH = 200;

/** Returns the violation, or null when the password satisfies the policy. */
export function checkPasswordPolicy(password: string): PasswordPolicyViolation | null {
  if (password.length < PASSWORD_MIN_LENGTH) return PasswordPolicyViolations.TOO_SHORT;
  if (password.length > PASSWORD_MAX_LENGTH) return PasswordPolicyViolations.TOO_LONG;
  return null;
}
```

`packages/domain/src/refresh-token.interface.ts`:

```ts
export const RefreshTokenVerdicts = {
  USABLE: 'USABLE',
  REJECTED: 'REJECTED',
  REPLAYED: 'REPLAYED',
} as const;
export type RefreshTokenVerdict = (typeof RefreshTokenVerdicts)[keyof typeof RefreshTokenVerdicts];

/** Everything the decision needs about a presented token, read in one query. */
export interface RefreshTokenState {
  exists: boolean;
  expiresAt: Date;
  usedAt: Date | null;
  sessionRevokedAt: Date | null;
}
```

`packages/domain/src/refresh-token.ts`:

```ts
import { RefreshTokenVerdicts, type RefreshTokenState, type RefreshTokenVerdict } from './refresh-token.interface';

/**
 * The refresh decision, as a table rather than a chain of conditionals in a
 * service (conventions Rule 5).
 *
 * Replay is checked before expiry on purpose: a replayed token is the one
 * outcome that requires the session to be revoked, and reporting only
 * "rejected" for a long-dead replay would discard the actionable signal.
 */
export function decideRefreshTokenUse(state: RefreshTokenState, now: Date): RefreshTokenVerdict {
  if (!state.exists) return RefreshTokenVerdicts.REJECTED;
  if (state.sessionRevokedAt !== null) return RefreshTokenVerdicts.REJECTED;
  if (state.usedAt !== null) return RefreshTokenVerdicts.REPLAYED;
  if (state.expiresAt.getTime() <= now.getTime()) return RefreshTokenVerdicts.REJECTED;
  return RefreshTokenVerdicts.USABLE;
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './password';
export * from './password.interface';
export * from './refresh-token';
export * from './refresh-token.interface';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @app/domain test`
Expected: 11 passed (3 tenant + 2 password + 6 refresh).

- [ ] **Step 5: Commit**

```bash
git add packages/domain && git commit -m "feat(domain): password policy and the refresh-token decision table"
```

---

### Task 3: `packages/domain` — roles, slug and product transitions

**Files:**
- Create: `packages/domain/src/roles.ts`, `packages/domain/src/slug.ts`,
  `packages/domain/src/product.interface.ts`, `packages/domain/src/product.ts`,
  `packages/domain/test/roles.spec.ts`, `packages/domain/test/slug.spec.ts`,
  `packages/domain/test/product.spec.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: `MemberRoles`, `MemberRole`, `ProductStatuses`, `ProductStatus`, `SLUG_PATTERN` from
  `@app/contracts` — **these do not exist yet**; Task 4 adds them. Run Task 4 first if the import
  does not resolve.
- Produces:
  - `canManageMembership(role: MemberRole): boolean`, `canReadTenant(role: MemberRole): boolean`
  - `slugify(name: string): string`, `isValidSlug(slug: string): boolean`
  - `ProductTransitionOutcomes`, `planProductTransition(from, to, priceMinor): ProductTransitionOutcome`

- [ ] **Step 1: Add the three value sets and the slug pattern to contracts**

In `packages/contracts/src/constants.ts`, append:

```ts
/** Header naming the organization a request acts within. Shared with any client. */
export const ORGANIZATION_ID_HEADER = 'x-organization-id';

export const MemberRoles = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const;
export type MemberRole = (typeof MemberRoles)[keyof typeof MemberRoles];

export const OrganizationStatuses = { ACTIVE: 'ACTIVE', DISABLED: 'DISABLED' } as const;
export type OrganizationStatus = (typeof OrganizationStatuses)[keyof typeof OrganizationStatuses];

export const ProductStatuses = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' } as const;
export type ProductStatus = (typeof ProductStatuses)[keyof typeof ProductStatuses];

/**
 * A closed set. Adding a member is a deliberate, tested change — cross-currency
 * balancing is a rule the ledger depends on from phase 8.
 */
export const CurrencyCodes = { USD: 'USD', EUR: 'EUR', EGP: 'EGP' } as const;
export type CurrencyCode = (typeof CurrencyCodes)[keyof typeof CurrencyCodes];

export const SessionRevocationReasons = {
  LOGOUT: 'LOGOUT',
  REUSE_DETECTED: 'REUSE_DETECTED',
} as const;
export type SessionRevocationReason =
  (typeof SessionRevocationReasons)[keyof typeof SessionRevocationReasons];

/** A slug is the organization's public handle, so its shape is wire-level. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 50;
```

- [ ] **Step 2: Write the failing tests**

`packages/domain/test/roles.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MemberRoles } from '@app/contracts';
import { canManageMembership, canReadTenant } from '../src/roles';

describe('role rules', () => {
  it('lets only an owner manage membership', () => {
    expect(canManageMembership(MemberRoles.OWNER)).toBe(true);
    expect(canManageMembership(MemberRoles.MEMBER)).toBe(false);
  });

  it('lets both roles read tenant data', () => {
    expect(canReadTenant(MemberRoles.OWNER)).toBe(true);
    expect(canReadTenant(MemberRoles.MEMBER)).toBe(true);
  });
});
```

`packages/domain/test/slug.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isValidSlug, slugify } from '../src/slug';

describe('slugify', () => {
  it('turns a name into the pattern the contract accepts', () => {
    expect(slugify('  Youssef Retail Co.  ')).toBe('youssef-retail-co');
    expect(isValidSlug(slugify('Nile Traders'))).toBe(true);
  });

  it('collapses runs of separators rather than emitting them', () => {
    expect(slugify('A -- B')).toBe('a-b');
  });
});

describe('isValidSlug', () => {
  it('rejects an uppercase or over-long slug', () => {
    expect(isValidSlug('NotASlug')).toBe(false);
    expect(isValidSlug('a'.repeat(51))).toBe(false);
  });
});
```

`packages/domain/test/product.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ProductStatuses } from '@app/contracts';
import { ProductTransitionOutcomes, planProductTransition } from '../src/product';

describe('planProductTransition', () => {
  it('allows publishing a priced draft', () => {
    expect(planProductTransition(ProductStatuses.DRAFT, ProductStatuses.PUBLISHED, 100)).toBe(
      ProductTransitionOutcomes.ALLOWED,
    );
  });

  it('refuses to publish an unpriced product', () => {
    expect(planProductTransition(ProductStatuses.DRAFT, ProductStatuses.PUBLISHED, 0)).toBe(
      ProductTransitionOutcomes.UNPUBLISHABLE,
    );
  });

  it('refuses a transition to the state it is already in', () => {
    expect(planProductTransition(ProductStatuses.PUBLISHED, ProductStatuses.PUBLISHED, 100)).toBe(
      ProductTransitionOutcomes.ILLEGAL_TRANSITION,
    );
  });

  it('allows unpublishing a published product regardless of price', () => {
    expect(planProductTransition(ProductStatuses.PUBLISHED, ProductStatuses.DRAFT, 0)).toBe(
      ProductTransitionOutcomes.ALLOWED,
    );
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @app/domain test`
Expected: FAIL — cannot resolve `../src/roles`, `../src/slug`, `../src/product`.

- [ ] **Step 4: Implement**

`packages/domain/src/roles.ts`:

```ts
import { MemberRoles, type MemberRole } from '@app/contracts';

/** Organization administration — adding and removing members. */
export function canManageMembership(role: MemberRole): boolean {
  return role === MemberRoles.OWNER;
}

/** Reading tenant data. Named rather than inlined so adding a role is one change. */
export function canReadTenant(role: MemberRole): boolean {
  return role === MemberRoles.OWNER || role === MemberRoles.MEMBER;
}
```

`packages/domain/src/slug.ts`:

```ts
import {
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
} from '@app/contracts';

/** Derives a candidate slug from a display name. Uniqueness is the database's job. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN_LENGTH && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug)
  );
}
```

`packages/domain/src/product.interface.ts`:

```ts
export const ProductTransitionOutcomes = {
  ALLOWED: 'ALLOWED',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  UNPUBLISHABLE: 'UNPUBLISHABLE',
} as const;
export type ProductTransitionOutcome =
  (typeof ProductTransitionOutcomes)[keyof typeof ProductTransitionOutcomes];
```

`packages/domain/src/product.ts`:

```ts
import { ProductStatuses, type ProductStatus } from '@app/contracts';
import { ProductTransitionOutcomes, type ProductTransitionOutcome } from './product.interface';

/**
 * The legal transitions, as a table. The domain model's illegal-transition table
 * is the negative space of this one, and a rejected transition is a test case
 * rather than a comment.
 */
const LEGAL_TRANSITIONS: Record<ProductStatus, readonly ProductStatus[]> = {
  [ProductStatuses.DRAFT]: [ProductStatuses.PUBLISHED],
  [ProductStatuses.PUBLISHED]: [ProductStatuses.DRAFT],
};

export function planProductTransition(
  from: ProductStatus,
  to: ProductStatus,
  priceMinor: number,
): ProductTransitionOutcome {
  if (!LEGAL_TRANSITIONS[from].includes(to)) {
    return ProductTransitionOutcomes.ILLEGAL_TRANSITION;
  }
  // Nothing is sold at zero, so a zero price is not a publishable product.
  if (to === ProductStatuses.PUBLISHED && priceMinor <= 0) {
    return ProductTransitionOutcomes.UNPUBLISHABLE;
  }
  return ProductTransitionOutcomes.ALLOWED;
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './product';
export * from './product.interface';
export * from './roles';
export * from './slug';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @app/domain test`
Expected: 19 passed.

- [ ] **Step 6: Verify the whole workspace is still green**

Run: `pnpm turbo run lint typecheck test build`
Expected: all tasks pass, including `@app/domain:lint`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(domain): role, slug and product-transition rules"
```

---

### Task 4: `packages/contracts` — the wire schemas

**Files:**
- Create: `packages/contracts/src/auth.ts`, `packages/contracts/src/organization.ts`,
  `packages/contracts/src/product.ts`, `packages/contracts/test/auth.spec.ts`,
  `packages/contracts/test/organization.spec.ts`, `packages/contracts/test/product.spec.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: the constants added in Task 3.
- Produces:
  - `RegisterRequestSchema`, `LoginRequestSchema`, `RefreshRequestSchema`, `LogoutRequestSchema`,
    `TokenPairSchema`, `UserSummarySchema` and their inferred types
  - `CreateOrganizationRequestSchema`, `OrganizationSchema`, `AddMemberRequestSchema`,
    `OrganizationMemberSchema`
  - `CreateProductRequestSchema`, `UpdateProductRequestSchema`, `ProductSchema`, `InventorySchema`
  - A shared `unwrap` helper in `packages/contracts/src/parse.ts` for tests and clients that want a
    typed value from a parse result

- [ ] **Step 1: Write the failing tests**

`packages/contracts/test/organization.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../src/constants';
import { CreateOrganizationRequestSchema } from '../src/organization';

describe('CreateOrganizationRequestSchema', () => {
  it('accepts a name and a well-formed slug', () => {
    const parsed = CreateOrganizationRequestSchema.safeParse({ name: 'Nile Traders', slug: 'nile-traders' });

    expect(parsed.success).toBe(true);
  });

  it('rejects a slug the contract disagrees with', () => {
    // The pattern has one definition and this asserts the schema actually uses it,
    // rather than carrying a second copy that can drift from it.
    const parsed = CreateOrganizationRequestSchema.safeParse({ name: 'Nile Traders', slug: 'Nile_Traders' });

    expect(parsed.success).toBe(false);
    expect(SLUG_PATTERN.test('Nile_Traders')).toBe(false);
    expect(SLUG_MAX_LENGTH).toBe(50);
  });
});
```

`packages/contracts/test/product.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CreateProductRequestSchema } from '../src/product';

describe('CreateProductRequestSchema', () => {
  it('accepts integer minor units and a known currency', () => {
    const parsed = CreateProductRequestSchema.safeParse({
      name: 'Dates',
      priceMinor: 1250,
      currency: 'EGP',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects a fractional price, because money is never a float', () => {
    const parsed = CreateProductRequestSchema.safeParse({
      name: 'Dates',
      priceMinor: 12.5,
      currency: 'EGP',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown currency', () => {
    const parsed = CreateProductRequestSchema.safeParse({
      name: 'Dates',
      priceMinor: 1250,
      currency: 'XYZ',
    });

    expect(parsed.success).toBe(false);
  });
});
```

`packages/contracts/test/auth.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LoginRequestSchema, RegisterRequestSchema } from '../src/auth';

describe('auth request schemas', () => {
  it('accepts an email and a non-empty password', () => {
    expect(RegisterRequestSchema.safeParse({ email: 'a@b.test', password: 'x' }).success).toBe(true);
    expect(LoginRequestSchema.safeParse({ email: 'a@b.test', password: 'x' }).success).toBe(true);
  });

  it('rejects a password that is empty, leaving the policy to the domain', () => {
    // Length is a business rule and lives in @app/domain; the contract only
    // insists the field was supplied at all.
    expect(RegisterRequestSchema.safeParse({ email: 'a@b.test', password: '' }).success).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(RegisterRequestSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @app/contracts test`
Expected: FAIL — cannot resolve `../src/auth`, `../src/organization`, `../src/product`.

- [ ] **Step 3: Implement**

`packages/contracts/src/auth.ts`:

```ts
import { z } from 'zod';

export const RegisterRequestSchema = z.object({
  email: z.email(),
  // Deliberately only "present". Length is a business rule in @app/domain, so the
  // policy has one home and the contract does not carry a second copy of it.
  password: z.string().min(1),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const LogoutRequestSchema = z.object({ refreshToken: z.string().min(1) });
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const UserSummarySchema = z.object({ id: z.string(), email: z.string() });
export type UserSummary = z.infer<typeof UserSummarySchema>;
```

`packages/contracts/src/organization.ts`:

```ts
import { z } from 'zod';
import {
  MemberRoles,
  OrganizationStatuses,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
  wireValues,
} from './constants';

export const CreateOrganizationRequestSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(SLUG_MIN_LENGTH).max(SLUG_MAX_LENGTH).regex(SLUG_PATTERN),
});
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(wireValues(OrganizationStatuses)),
  role: z.enum(wireValues(MemberRoles)),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const AddMemberRequestSchema = z.object({ email: z.email() });
export type AddMemberRequest = z.infer<typeof AddMemberRequestSchema>;

export const OrganizationMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  role: z.enum(wireValues(MemberRoles)),
});
export type OrganizationMember = z.infer<typeof OrganizationMemberSchema>;
```

`packages/contracts/src/product.ts`:

```ts
import { z } from 'zod';
import {
  CurrencyCodes,
  ProductStatuses,
  wireValues,
} from './constants';

export const CreateProductRequestSchema = z.object({
  name: z.string().min(1),
  // Integer minor units. A float here would be the money bug the domain model
  // forbids, so the contract refuses it at the boundary.
  priceMinor: z.int(),
  currency: z.enum(wireValues(CurrencyCodes)),
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const UpdateProductRequestSchema = z
  .object({
    name: z.string().min(1),
    priceMinor: z.int(),
  })
  .partial();
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceMinor: z.number().int(),
  currency: z.enum(wireValues(CurrencyCodes)),
  status: z.enum(wireValues(ProductStatuses)),
});
export type Product = z.infer<typeof ProductSchema>;

export const InventorySchema = z.object({
  productId: z.string(),
  available: z.number().int(),
  reserved: z.number().int(),
});
export type Inventory = z.infer<typeof InventorySchema>;
```

Append to `packages/contracts/src/index.ts`:

```ts
export * from './auth';
export * from './organization';
export * from './product';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @app/contracts test`
Expected: all pass, including the pre-existing envelope and health suites.

- [ ] **Step 5: Prove the contracts package is still the wire source of truth**

Run: `pnpm --filter @app/contracts test && pnpm --filter @app/contracts lint`
Expected: exit 0. Then confirm the existing "the code set is exactly the six known codes" test still
passes — D24 means `ErrorCodes` does not change this phase.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts && git commit -m "feat(contracts): auth, organization and product wire schemas"
```

---

### Task 5: The six models, the migration, and the integration harness

**Files:**
- Create: `packages/database/prisma/schema/Organization.prisma`,
  `OrganizationMember.prisma`, `Session.prisma`, `RefreshToken.prisma`, `Product.prisma`,
  `Inventory.prisma`
- Modify: `packages/database/prisma/schema/User.prisma` (relations),
  `packages/database/prisma/seed.constants.ts` (typed against the new enums — see Task 6),
  `apps/api/package.json` (scripts), `apps/api/test/jest-integration.json`
- Create: `apps/api/test/support/db.ts`, `apps/api/test/integration/constraints.integration-spec.ts`,
  `apps/api/test/integration/enum-drift.integration-spec.ts`
- Generated, then hand-edited: `packages/database/prisma/migrations/<timestamp>_add_tenancy_and_catalog/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: the Prisma delegates `organization`, `organizationMember`, `session`, `refreshToken`,
  `product`, `inventory`; the enums `MemberRole`, `OrganizationStatus`, `ProductStatus`,
  `CurrencyCode`, `SessionRevocationReason`; and a `test:integration` script.

- [ ] **Step 1: Write the model files**

`packages/database/prisma/schema/Organization.prisma`:

```prisma
enum OrganizationStatus {
  ACTIVE
  DISABLED
}

model Organization {
  id        String             @id @default(uuid())
  name      String
  slug      String             @unique
  status    OrganizationStatus @default(ACTIVE)
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt

  members  OrganizationMember[]
  products Product[]

  @@map("organizations")
}
```

`packages/database/prisma/schema/OrganizationMember.prisma`:

```prisma
enum MemberRole {
  OWNER
  MEMBER
}

model OrganizationMember {
  id             String     @id @default(uuid())
  organizationId String
  userId         String
  role           MemberRole
  createdAt      DateTime   @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@map("organization_members")
}
```

`packages/database/prisma/schema/Session.prisma`:

```prisma
enum SessionRevocationReason {
  LOGOUT
  REUSE_DETECTED
}

model Session {
  id            String                   @id @default(uuid())
  userId        String
  createdAt     DateTime                 @default(now())
  lastUsedAt    DateTime                 @default(now())
  expiresAt     DateTime
  revokedAt     DateTime?
  revokedReason SessionRevocationReason?

  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshTokens RefreshToken[]

  @@map("sessions")
}
```

`packages/database/prisma/schema/RefreshToken.prisma`:

```prisma
model RefreshToken {
  id        String    @id @default(uuid())
  sessionId String
  tokenHash String    @unique
  createdAt DateTime  @default(now())
  expiresAt DateTime
  usedAt    DateTime?

  session Session @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}
```

`packages/database/prisma/schema/Product.prisma`:

```prisma
enum ProductStatus {
  DRAFT
  PUBLISHED
}

enum CurrencyCode {
  USD
  EUR
  EGP
}

model Product {
  id             String        @id @default(uuid())
  organizationId String
  name           String
  priceMinor     Int
  currency       CurrencyCode
  status         ProductStatus @default(DRAFT)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  inventory    Inventory?

  @@map("products")
}
```

`packages/database/prisma/schema/Inventory.prisma`:

```prisma
model Inventory {
  productId String   @id
  available Int      @default(0)
  reserved  Int      @default(0)
  version   Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@map("inventory")
}
```

- [ ] **Step 2: Add the relation fields to the shipped `User` model**

Append inside the existing `model User { ... }` block in
`packages/database/prisma/schema/User.prisma`, above the `@@map` line:

```prisma
  memberships OrganizationMember[]
  sessions    Session[]
```

Prisma requires both sides of a relation, so this is the first edit to a shipped model. The columns
are additive; the schema is not. Phase 2 continues from `User` rather than rebuilding it.

- [ ] **Step 3: Generate the migration without applying it**

Run:
```bash
pnpm --filter @app/database db:generate
cd packages/database && pnpm exec prisma migrate dev --create-only --name add_tenancy_and_catalog
```
Expected: a new directory under `prisma/migrations/` containing `migration.sql`, and **nothing
applied** — that is what `--create-only` is for.

- [ ] **Step 4: Hand-edit the migration to add the CHECK constraint**

Append to the generated `migration.sql`:

```sql
-- Business rules enforced by the database rather than by application validation.
-- The roadmap's wording for this week is "business rules enforced by constraints",
-- and Prisma cannot express a CHECK — so if the constraint is to be real, the
-- migration has to carry it. A test writes around the application to prove this
-- holds.
ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_quantities_non_negative"
  CHECK ("available" >= 0 AND "reserved" >= 0);
```

- [ ] **Step 5: Apply it and verify the constraint exists**

Run:
```bash
pnpm --filter @app/database db:migrate
cd packages/database && pnpm exec prisma db execute --stdin <<'SQL'
SELECT conname FROM pg_constraint WHERE conname = 'inventory_quantities_non_negative';
SQL
```
Expected: the migration applies; the query reports the constraint name.

- [ ] **Step 6: Add the integration harness**

Create `apps/api/test/jest-integration.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testEnvironment": "node",
  "testRegex": ".integration-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "setupFiles": ["dotenv/config"],
  "moduleNameMapper": {
    "^@app/(.*)$": "<rootDir>/../../packages/$1/src/index.ts"
  }
}
```

Add to `apps/api/package.json` `"scripts"`:

```json
"test:integration": "jest --config ./test/jest-integration.json --runInBand"
```

A separate `testRegex` is what keeps these from silently double-running inside the e2e pass. The
README already advertises `test:integration`; until now the script did not exist.

Create `apps/api/test/support/db.ts`:

```ts
import { PrismaClient } from '@prisma/client';

/**
 * A client of its own, used by tests that deliberately write *around* the
 * application. Going through a repository to prove a database constraint would
 * prove the repository instead, which is the opposite of the question.
 *
 * PrismaService is not reused because it is request-scoped wiring; these tests are
 * not requests.
 */
export const testPrisma = new PrismaClient();
```

- [ ] **Step 7: Write the failing constraint tests**

Create `apps/api/test/integration/constraints.integration-spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from '@jest/globals';
import { testPrisma } from '../support/db';

const suffix = () => randomUUID().slice(0, 8);

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('database constraints', () => {
  it('the non-negative inventory check is actually installed, not merely intended', async () => {
    const rows = await testPrisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = 'inventory_quantities_non_negative'
    `;

    expect(rows).toHaveLength(1);
  });

  it('refuses to make available quantity negative', async () => {
    const org = await testPrisma.organization.create({
      data: { name: 'C', slug: `c-${suffix()}` },
    });
    const product = await testPrisma.product.create({
      data: { organizationId: org.id, name: 'P', priceMinor: 100, currency: 'USD' },
    });
    await testPrisma.inventory.create({ data: { productId: product.id, available: 1 } });

    await expect(
      testPrisma.inventory.update({ where: { productId: product.id }, data: { available: -1 } }),
    ).rejects.toThrow(/inventory_quantities_non_negative/);
  });

  it('refuses a duplicate organization slug', async () => {
    const slug = `dup-${suffix()}`;
    await testPrisma.organization.create({ data: { name: 'One', slug } });

    await expect(
      testPrisma.organization.create({ data: { name: 'Two', slug } }),
    ).rejects.toThrow();
  });

  it('refuses the same user joining one organization twice', async () => {
    const org = await testPrisma.organization.create({
      data: { name: 'M', slug: `m-${suffix()}` },
    });
    const user = await testPrisma.user.create({
      data: { email: `m-${suffix()}@marketcore.test`, passwordHash: 'x' },
    });
    await testPrisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });

    await expect(
      testPrisma.organizationMember.create({
        data: { organizationId: org.id, userId: user.id, role: 'MEMBER' },
      }),
    ).rejects.toThrow();
  });

  it('refuses a duplicate refresh token hash', async () => {
    const user = await testPrisma.user.create({
      data: { email: `r-${suffix()}@marketcore.test`, passwordHash: 'x' },
    });
    const session = await testPrisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 1000) },
    });
    const tokenHash = `hash-${suffix()}`;
    await testPrisma.refreshToken.create({
      data: { sessionId: session.id, tokenHash, expiresAt: new Date(Date.now() + 1000) },
    });

    await expect(
      testPrisma.refreshToken.create({
        data: { sessionId: session.id, tokenHash, expiresAt: new Date(Date.now() + 1000) },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 8: Write the enum-drift test**

Create `apps/api/test/integration/enum-drift.integration-spec.ts`:

```ts
import { $Enums } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import {
  CurrencyCodes,
  MemberRoles,
  OrganizationStatuses,
  ProductStatuses,
  SessionRevocationReasons,
} from '@app/contracts';

/**
 * The same value set exists in three places: the Prisma schema (the database), the
 * contracts package (the wire) and — for roles and statuses — the rules in
 * @app/domain that branch on them. Rather than pretend they cannot diverge, this
 * asserts they have not. It fails, not warns.
 *
 * If `$Enums` is not the export in this Prisma version, `Prisma.MemberRole` is.
 */
const values = (source: Record<string, string>) => Object.values(source).sort();

describe('enum drift', () => {
  it('roles agree between the database and the wire', () => {
    expect(values($Enums.MemberRole)).toEqual(values(MemberRoles));
  });

  it('organization statuses agree', () => {
    expect(values($Enums.OrganizationStatus)).toEqual(values(OrganizationStatuses));
  });

  it('product statuses agree', () => {
    expect(values($Enums.ProductStatus)).toEqual(values(ProductStatuses));
  });

  it('currency codes agree', () => {
    expect(values($Enums.CurrencyCode)).toEqual(values(CurrencyCodes));
  });

  it('session revocation reasons agree', () => {
    expect(values($Enums.SessionRevocationReason)).toEqual(values(SessionRevocationReasons));
  });
});
```

- [ ] **Step 9: Run them to verify they fail, then pass**

Run: `pnpm --filter api test:integration`
Expected: first FAIL — `../support/db` does not exist before Step 6, and Task 3's constants do not
exist before Task 4. With those in place, PASS.

Both integration files import from `@jest/globals`, because this suite runs under jest with
`ts-jest`, not vitest. The packages under `packages/*` use vitest; `apps/api` does not.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(database): tenancy and catalog models, with constraints the database enforces"
```

---

### Task 6: Deterministic seed rows for two organizations

**Files:**
- Modify: `packages/database/prisma/seed.constants.ts`, `packages/database/prisma/seed.ts`

**Interfaces:**
- Consumes: the models and enums from Task 5.
- Produces: a seed that is idempotent across repeated runs and leaves two organizations, each with
  an owner and a member, and one product with inventory.

- [ ] **Step 1: Extend the seed constants**

Replace the body of `packages/database/prisma/seed.constants.ts` with:

```ts
import { CurrencyCode, MemberRole, ProductStatus, UserStatus, type Prisma } from '@prisma/client';

/**
 * Not credentials. These values are not argon2id hashes, so they cannot
 * authenticate against anything; they exist so the seed has real rows to write.
 * Nothing in the API accepts them. The auth module hashes with argon2id.
 */
const SEED_PASSWORD_HASH = 'not-a-credential-seed-placeholder';

/**
 * Fixed identifiers, because products carry no business-level unique key and
 * inventing one purely so the seed can upsert would distort the domain to serve
 * the seed. Deterministic ids make the seed idempotent without inventing a rule.
 */
export const SEED_IDS = {
  ORG_NILE: '11111111-1111-4111-8111-111111111111',
  ORG_DELTA: '22222222-2222-4222-8222-222222222222',
  USER_OWNER: '33333333-3333-4333-8333-333333333333',
  USER_MEMBER: '44444444-4444-4444-8444-444444444444',
  USER_OUTSIDER: '55555555-5555-4555-8555-555555555555',
  PRODUCT_NILE: '66666666-6666-4666-8666-666666666666',
  PRODUCT_DELTA: '77777777-7777-4777-8777-777777777777',
} as const;

export const SEED_ORGANIZATIONS = [
  { id: SEED_IDS.ORG_NILE, name: 'Nile Traders', slug: 'nile-traders' },
  { id: SEED_IDS.ORG_DELTA, name: 'Delta Goods', slug: 'delta-goods' },
] as const;

export const SEED_USERS: readonly Prisma.UserCreateInput[] = [
  {
    id: SEED_IDS.USER_OWNER,
    email: 'owner@marketcore.test',
    passwordHash: SEED_PASSWORD_HASH,
    status: UserStatus.ACTIVE,
  },
  {
    id: SEED_IDS.USER_MEMBER,
    email: 'member@marketcore.test',
    passwordHash: SEED_PASSWORD_HASH,
    status: UserStatus.ACTIVE,
  },
  {
    id: SEED_IDS.USER_OUTSIDER,
    email: 'outsider@marketcore.test',
    passwordHash: SEED_PASSWORD_HASH,
    status: UserStatus.ACTIVE,
  },
];

export const SEED_MEMBERSHIPS = [
  { organizationId: SEED_IDS.ORG_NILE, userId: SEED_IDS.USER_OWNER, role: MemberRole.OWNER },
  { organizationId: SEED_IDS.ORG_NILE, userId: SEED_IDS.USER_MEMBER, role: MemberRole.MEMBER },
  // The outsider belongs to Delta only, which is what makes a cross-tenant check
  // readable by hand: this user must never see Nile's product.
  { organizationId: SEED_IDS.ORG_DELTA, userId: SEED_IDS.USER_OUTSIDER, role: MemberRole.OWNER },
] as const;

export const SEED_PRODUCTS = [
  {
    id: SEED_IDS.PRODUCT_NILE,
    organizationId: SEED_IDS.ORG_NILE,
    name: 'Nile Cotton Shirt',
    priceMinor: 24900,
    currency: CurrencyCode.EGP,
    status: ProductStatus.PUBLISHED,
  },
  {
    id: SEED_IDS.PRODUCT_DELTA,
    organizationId: SEED_IDS.ORG_DELTA,
    name: 'Delta Olive Oil',
    priceMinor: 18900,
    currency: CurrencyCode.EGP,
    status: ProductStatus.PUBLISHED,
  },
] as const;
```

- [ ] **Step 2: Extend the seed script**

Replace `main()` in `packages/database/prisma/seed.ts` with:

```ts
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    for (const organization of SEED_ORGANIZATIONS) {
      await prisma.organization.upsert({
        where: { slug: organization.slug },
        update: {},
        create: organization,
      });
    }

    for (const user of SEED_USERS) {
      await prisma.user.upsert({ where: { email: user.email }, update: {}, create: user });
    }

    for (const membership of SEED_MEMBERSHIPS) {
      await prisma.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: membership.organizationId,
            userId: membership.userId,
          },
        },
        update: {},
        create: membership,
      });
    }

    for (const product of SEED_PRODUCTS) {
      await prisma.product.upsert({ where: { id: product.id }, update: {}, create: product });
      await prisma.inventory.upsert({
        where: { productId: product.id },
        update: {},
        create: { productId: product.id, available: 10, reserved: 0 },
      });
    }

    const [organizations, members, products] = await Promise.all([
      prisma.organization.count(),
      prisma.organizationMember.count(),
      prisma.product.count(),
    ]);
    console.log(
      `seed: ${organizations} organization(s), ${members} membership(s), ${products} product(s)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
```

Add `SEED_MEMBERSHIPS`, `SEED_ORGANIZATIONS`, `SEED_PRODUCTS` to the existing import from
`./seed.constants`.

- [ ] **Step 3: Verify the seed is idempotent from clean**

Run:
```bash
pnpm --filter @app/database db:reset && pnpm --filter @app/database db:seed
```
Expected: both exit 0; the second run reports the same counts as the first, proving `upsert` on the
natural keys rather than accumulation.

- [ ] **Step 4: Confirm the counts by hand**

Run:
```bash
psql "${DATABASE_URL:-postgresql://app:app@localhost:5432/app}" -c 'SELECT count(*) FROM products;'
```
Expected: `2`. Run the seed again and expect `2` still.

- [ ] **Step 5: Commit**

```bash
git add packages/database && git commit -m "feat(database): deterministic seed rows for two organizations"
```

---

### Task 7: Secrets plumbing, password hashing and access tokens

**Files:**
- Modify: `packages/runtime/src/config/env.ts`, `apps/api/.env.example`, `turbo.json`,
  `.github/workflows/ci.yml`, `apps/api/package.json`
- Create: `apps/api/src/auth/auth.constants.ts`, `apps/api/src/auth/password/password-hasher.interface.ts`,
  `apps/api/src/auth/password/argon2-password-hasher.ts`,
  `apps/api/src/auth/password/argon2-password-hasher.spec.ts`,
  `apps/api/src/auth/tokens/token.service.ts`, `apps/api/src/auth/tokens/token.service.spec.ts`

**Interfaces:**
- Consumes: `validateEnv` from `@app/runtime`.
- Produces: `Env` gains `JWT_SECRET`; `PasswordHasher` interface with `hash(plain): Promise<string>`
  and `verify(hash, plain): Promise<boolean>`; `TokenService` with
  `signAccessToken(userId: string): Promise<string>`, `verifyAccessToken(token: string): Promise<{ sub: string }>`,
  `generateRefreshToken(): string`, `hashRefreshToken(token: string): string`.

- [ ] **Step 1: Add the secret to the env schema**

In `packages/runtime/src/config/env.ts`, add to `EnvSchema`:

```ts
  // Signs access tokens. A minimum length is enforced here because a short secret
  // is a forgery risk that no downstream check can repair.
  JWT_SECRET: z.string().min(32),
```

- [ ] **Step 2: Add it everywhere the suite runs**

Append to `apps/api/.env.example`:

```
# Signs access tokens. Must be at least 32 characters.
JWT_SECRET=replace-me-with-at-least-32-characters
```

Add to the `env:` block of `.github/workflows/ci.yml`:

```yaml
      JWT_SECRET: ci-secret-that-is-at-least-32-characters
```

Add to `turbo.json`'s `test` task:

```json
    "test": { "dependsOn": ["^build"], "env": ["DATABASE_URL", "JWT_SECRET"] },
```

`JWT_SECRET` joins the test task's env list for the same reason ADR 001 recorded for `REDIS_URL`:
without it, turbo serves a cached green for a suite that now depends on a secret it does not know
about.

- [ ] **Step 3: Copy it into your local env file**

Run: `grep -q JWT_SECRET apps/api/.env || echo 'JWT_SECRET=local-development-secret-at-least-32-chars' >> apps/api/.env`
Expected: `apps/api/.env` carries the secret. The e2e harness loads it via `dotenv/config`, so
without this the suite fails at boot with a message naming the field.

- [ ] **Step 4: Add the dependencies**

Run: `pnpm --filter api add argon2 @nestjs/jwt`
Expected: both appear in `apps/api/package.json` dependencies. Note: the root `pnpm-workspace.yaml`
needs `onlyBuiltDependencies` to include `argon2` if pnpm reports an ignored build script — approve
it, because an unbuilt argon2 loads but cannot hash.

- [ ] **Step 5: Write the failing tests**

`apps/api/src/auth/password/argon2-password-hasher.spec.ts`:

```ts
import { Argon2PasswordHasher } from './argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('produces a hash that is not the password', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).not.toContain('correct horse');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    await expect(hasher.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'wrong horse battery staple')).resolves.toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [first, second] = await Promise.all([hasher.hash('same'), hasher.hash('same')]);

    expect(first).not.toBe(second);
  });
});
```

`apps/api/src/auth/tokens/token.service.spec.ts`:

```ts
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

const service = new TokenService(new JwtService({ secret: 'a'.repeat(32) }));

describe('TokenService', () => {
  it('signs an access token carrying the user id', async () => {
    const token = await service.signAccessToken('user_1');

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({ sub: 'user_1' });
  });

  it('rejects a token signed with a different secret', async () => {
    const other = new TokenService(new JwtService({ secret: 'b'.repeat(32) }));
    const token = await other.signAccessToken('user_1');

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('generates a high-entropy refresh token, never the same one twice', () => {
    const first = service.generateRefreshToken();
    const second = service.generateRefreshToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(43);
  });

  it('hashes a refresh token deterministically, so a lookup can find it', () => {
    const token = service.generateRefreshToken();

    expect(service.hashRefreshToken(token)).toBe(service.hashRefreshToken(token));
    expect(service.hashRefreshToken(token)).not.toBe(token);
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `pnpm --filter api test`
Expected: FAIL — cannot resolve `./argon2-password-hasher`, `./token.service`.

- [ ] **Step 7: Implement**

`apps/api/src/auth/auth.constants.ts`:

```ts
/** Lifetime of an access token. Short because an access token cannot be revoked. */
export const ACCESS_TOKEN_TTL = '15m';

/** Lifetime of a refresh token, in milliseconds. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 32 bytes of randomness. Entropy is what makes a fast hash sufficient. */
export const REFRESH_TOKEN_BYTES = 32;

export const PasswordPolicyMessages = {
  TOO_SHORT: 'Password is shorter than the minimum length',
  TOO_LONG: 'Password is longer than the maximum length',
} as const;
```

`apps/api/src/auth/password/password-hasher.interface.ts`:

```ts
/**
 * A port, so the hashing algorithm is a detail the service does not depend on.
 * Named here rather than beside the adapter because a second implementation —
 * a faster one for tests, or a migration to a different cost — is foreseeable in
 * a way the conventions' Rule 3 anticipates.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}
```

`apps/api/src/auth/password/argon2-password-hasher.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { hash, verify, argon2id } from 'argon2';
import type { PasswordHasher } from './password-hasher.interface';

/**
 * argon2id, which is the current recommendation for password storage: memory-hard,
 * so a GPU farm does not get the attacker the advantage a bare SHA would.
 *
 * Refresh tokens deliberately do NOT come through here — they are 256 bits of
 * randomness, so there is nothing to brute-force and a slow KDF would only add
 * latency to every refresh. See TokenService.
 */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain, { type: argon2id });
  }

  verify(digest: string, plain: string): Promise<boolean> {
    return verify(digest, plain);
  }
}
```

`apps/api/src/auth/tokens/token.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_BYTES } from '../auth.constants';

export interface AccessTokenPayload {
  sub: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  signAccessToken(userId: string): Promise<string> {
    return this.jwtService.signAsync({ sub: userId }, { expiresIn: ACCESS_TOKEN_TTL });
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwtService.verifyAsync<AccessTokenPayload>(token);
  }

  /**
   * Opaque rather than a JWT: the only thing that reads it is this service, and a
   * random string carries no claims to leak or to trust.
   */
  generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  /**
   * SHA-256, not argon2id, and that is a decision rather than a shortcut. The
   * input is 256 bits of randomness, so it is not guessable and a slow KDF buys
   * nothing; meanwhile this runs on every refresh. Passwords are the opposite
   * case, which is why they use argon2id.
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Constant-time compare, so a mismatch cannot be timed to reveal a prefix. */
  refreshTokenMatches(candidate: string, storedHash: string): boolean {
    const candidateHash = Buffer.from(this.hashRefreshToken(candidate));
    const stored = Buffer.from(storedHash);
    return candidateHash.length === stored.length && timingSafeEqual(candidateHash, stored);
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter api test`
Expected: all pass, including the pre-existing health suites.

- [ ] **Step 9: Verify a bad secret fails the boot**

Run: `JWT_SECRET=too-short pnpm --filter api start` (then stop it)
Expected: it refuses to boot and names `JWT_SECRET` — the env schema runs before bootstrap, so a
misconfigured deploy fails loudly rather than signing tokens with a weak secret.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(auth): secret plumbing, argon2id hashing and token services"
```

---

### Task 8: Auth module — register and login

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.service.ts`,
  `apps/api/src/auth/auth.repository.ts`, `apps/api/src/auth/auth.dto.ts`,
  `apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/auth.service.spec.ts`,
  `apps/api/test/auth.e2e-spec.ts`, `apps/api/test/support/fixtures.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PasswordHasher`, `TokenService`, `checkPasswordPolicy`, `PasswordPolicyViolations`,
  the auth contracts.
- Produces:
  - `POST /api/v1/auth/register` → 201 `{ id, email }`
  - `POST /api/v1/auth/login` → 200 `{ accessToken, refreshToken }`
  - `AuthRepository.createUser(email, passwordHash): Promise<UserSummary>`,
    `findByEmail(email)`, `createSessionWithToken(userId, tokenHash, expiresAt): Promise<void>`
  - `test/support/fixtures.ts` exporting `registerAndLogin(app, options)`

- [ ] **Step 1: Write the failing service test**

`apps/api/src/auth/auth.service.spec.ts`:

```ts
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PasswordPolicyViolations } from '@app/domain';
import type { PasswordHasher } from './password/password-hasher.interface';
import type { TokenService } from './tokens/token.service';
import type { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

const build = (overrides: {
  findByEmail?: jest.Mock;
  createUser?: jest.Mock;
  createSessionWithToken?: jest.Mock;
}) => {
  const repository = {
    findByEmail: overrides.findByEmail ?? jest.fn().mockResolvedValue(null),
    createUser: overrides.createUser ?? jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.test' }),
    createSessionWithToken:
      overrides.createSessionWithToken ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthRepository;
  const hasher = {
    hash: jest.fn().mockResolvedValue('$argon2id$hash'),
    verify: jest.fn().mockResolvedValue(true),
  } as unknown as PasswordHasher;
  const tokens = {
    signAccessToken: jest.fn().mockResolvedValue('access'),
    generateRefreshToken: jest.fn().mockReturnValue('refresh'),
    hashRefreshToken: jest.fn().mockReturnValue('refresh-hash'),
  } as unknown as TokenService;

  return { service: new AuthService(repository, hasher, tokens), repository, hasher, tokens };
};

describe('AuthService', () => {
  it('rejects a password below the policy before hashing it', async () => {
    const { service, hasher } = build({});

    await expect(service.register({ email: 'a@b.test', password: 'short' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it('refuses a duplicate email', async () => {
    const email = 'taken@b.test';
    const { service } = build({ findByEmail: jest.fn().mockResolvedValue({ id: 'u1', email }) });

    await expect(
      service.register({ email, password: 'a'.repeat(12) }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a user and never returns the hash', async () => {
    const { service } = build({});

    const user = await service.register({ email: 'new@b.test', password: 'a'.repeat(12) });

    expect(user).toEqual({ id: 'u1', email: 'a@b.test' });
    expect(JSON.stringify(user)).not.toContain('argon2');
  });

  it('opens a session on login and returns a pair', async () => {
    const { service, repository } = build({
      findByEmail: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.test',
        passwordHash: '$argon2id$hash',
      }),
    });

    await expect(service.login({ email: 'a@b.test', password: 'a'.repeat(12) })).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    expect(repository.createSessionWithToken).toHaveBeenCalledWith(
      'u1',
      'refresh-hash',
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('answers the same way for an unknown email and a wrong password', async () => {
    // Distinguishing them would turn login into an account-enumeration oracle.
    const wrongPassword = build({
      findByEmail: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.test', passwordHash: 'h' }),
    });
    (wrongPassword.hasher.verify as jest.Mock).mockResolvedValue(false);

    await expect(
      wrongPassword.service.login({ email: 'a@b.test', password: 'a'.repeat(12) }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      build({}).service.login({ email: 'nobody@b.test', password: 'a'.repeat(12) }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — cannot resolve `./auth.service`.

- [ ] **Step 3: Implement the service, repository and DTOs**

`apps/api/src/auth/auth.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  TokenPairSchema,
  UserSummarySchema,
} from '@app/contracts';

// DTOs exist to give Swagger named components. The schemas themselves live in
// @app/contracts, which is the source of truth — and per the health module's
// finding, a schema used as a DTO source carries no `.meta({ id })`.
export class RegisterRequestDto extends createZodDto(RegisterRequestSchema) {}
export class LoginRequestDto extends createZodDto(LoginRequestSchema) {}
export class UserSummaryDto extends createZodDto(UserSummarySchema) {}
export class TokenPairDto extends createZodDto(TokenPairSchema) {}
```

`apps/api/src/auth/auth.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import type { UserSummary } from '@app/contracts';

interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
}

/**
 * Every Prisma call the auth module makes. The service depends on this and never
 * on PrismaService (conventions Rule 4).
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
  }

  async createUser(email: string, passwordHash: string): Promise<UserSummary> {
    return this.prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    });
  }

  /**
   * One transaction, because a session without its first refresh token is a
   * session nobody can use and nobody will clean up.
   */
  async createSessionWithToken(
    userId: string,
    refreshTokenHash: string,
    sessionExpiresAt: Date,
    tokenExpiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: { userId, expiresAt: sessionExpiresAt },
        select: { id: true },
      });
      await tx.refreshToken.create({
        data: { sessionId: session.id, tokenHash: refreshTokenHash, expiresAt: tokenExpiresAt },
      });
    });
  }
}
```

Note the repository takes **both** expiry instants. The service computes them from
`REFRESH_TOKEN_TTL_MS`, so the repository holds no policy of its own.

`apps/api/src/auth/auth.service.ts`:

```ts
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  PasswordPolicyMessages,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants';
import { checkPasswordPolicy } from '@app/domain';
import type { LoginRequest, RegisterRequest, TokenPair, UserSummary } from '@app/contracts';
import { AuthRepository } from './auth.repository';
import { PasswordHasher } from './password/password-hasher.interface';
import { TokenService } from './tokens/token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Creates the user only. Registration is user creation; a session is a
   * separate concern, so this path carries no token logic to get wrong.
   */
  async register(request: RegisterRequest): Promise<UserSummary> {
    const violation = checkPasswordPolicy(request.password);
    if (violation !== null) {
      throw new BadRequestException(PasswordPolicyMessages[violation]);
    }

    const existing = await this.authRepository.findByEmail(request.email);
    if (existing !== null) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.passwordHasher.hash(request.password);
    return this.authRepository.createUser(request.email, passwordHash);
  }

  async login(request: LoginRequest): Promise<TokenPair> {
    const user = await this.authRepository.findByEmail(request.email);
    // One answer for an unknown email and a wrong password: distinguishing them
    // would make this endpoint an account-enumeration oracle.
    if (user === null || !(await this.passwordHasher.verify(user.passwordHash, request.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issuePair(user.id);
  }

  private async issuePair(userId: string): Promise<TokenPair> {
    const refreshToken = this.tokenService.generateRefreshToken();
    const now = Date.now();

    await this.authRepository.createSessionWithToken(
      userId,
      this.tokenService.hashRefreshToken(refreshToken),
      new Date(now + REFRESH_TOKEN_TTL_MS),
      new Date(now + REFRESH_TOKEN_TTL_MS),
    );

    return { accessToken: await this.tokenService.signAccessToken(userId), refreshToken };
  }
}
```

- [ ] **Step 4: Implement the controller and module**

`apps/api/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import type { TokenPair, UserSummary } from '@app/contracts';
import { AuthService } from './auth.service';
import { LoginRequestDto, RegisterRequestDto, TokenPairDto, UserSummaryDto } from './auth.dto';

/**
 * Public: registration and login are how a caller obtains a token, so they cannot
 * require one. The `@Public()` marker arrives with the security module (Task 11);
 * until then these routes are simply unguarded.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiCreatedResponse({ type: UserSummaryDto })
  register(@Body() body: RegisterRequestDto): Promise<UserSummary> {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenPairDto })
  login(@Body() body: LoginRequestDto): Promise<TokenPair> {
    return this.authService.login(body);
  }
}
```

`apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { validateEnv } from '@app/runtime';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { Argon2PasswordHasher } from './password/argon2-password-hasher';
import { PasswordHasher } from './password/password-hasher.interface';
import { TokenService } from './tokens/token.service';

@Module({
  imports: [JwtModule.register({ secret: validateEnv().JWT_SECRET })],
  controllers: [AuthController],
  // Repositories before services: the service depends on the repository.
  providers: [
    AuthRepository,
    Argon2PasswordHasher,
    { provide: PasswordHasher, useExisting: Argon2PasswordHasher },
    TokenService,
    AuthService,
  ],
  // TokenService is exported because the global guard needs it (Task 11).
  exports: [TokenService],
})
export class AuthModule {}
```

`PasswordHasher` is used as an injection token. Because it is an `interface`, this requires the
provider to be declared as above and the constructor parameter to be `private readonly passwordHasher: PasswordHasher`
with `emitDecoratorMetadata` — which `@app/config/tsconfig/nest.json` enables. If Nest cannot resolve
the interface token at runtime, declare a string token constant `PASSWORD_HASHER` in
`auth.constants.ts` and use `@Inject(PASSWORD_HASHER)` at both ends.

- [ ] **Step 5: Register the module and write the e2e test**

In `apps/api/src/app.module.ts`, add `AuthModule` to `imports`.

Create `apps/api/test/support/fixtures.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { REQUEST_ID_HEADER } from '@app/contracts';

export const unique = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`;

/**
 * Shared fixtures, built from the shared value sets rather than hand-written in
 * each suite (conventions Rule 7): a payload written by hand is a copy of the
 * contract that goes stale silently.
 */
export async function registerAndLogin(
  app: INestApplication,
  email: string,
  password = 'correct-horse-battery',
): Promise<string> {
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password }).expect(201);
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return login.body.accessToken as string;
}
```

Create `apps/api/test/auth.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { unique } from './support/fixtures';

describe('auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user and never echoes the password or its hash', async () => {
    const email = `${unique('reg')}@marketcore.test`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse-battery' })
      .expect(201);

    expect(res.body).toEqual({ id: expect.any(String), email });
  });

  it('rejects a password below the domain policy with the envelope', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `${unique('short')}@marketcore.test`, password: 'short' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/minimum length/);
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('refuses a duplicate email', async () => {
    const email = `${unique('dup')}@marketcore.test`;
    const payload = { email, password: 'correct-horse-battery' };
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(payload).expect(201);

    const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send(payload).expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('logs in and returns an access token and a refresh token', async () => {
    const email = `${unique('login')}@marketcore.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse-battery' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'correct-horse-battery' })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it('answers an unknown email and a wrong password identically', async () => {
    const email = `${unique('enum')}@marketcore.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse-battery' })
      .expect(201);

    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-horse-battery' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `${unique('ghost')}@marketcore.test`, password: 'correct-horse-battery' })
      .expect(401);

    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    expect(wrongPassword.body.error.code).toBe('UNAUTHORIZED');
  });
});
```

- [ ] **Step 6: Run the suites**

Run: `pnpm --filter api test && pnpm --filter api test:e2e`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(auth): registration and login"
```

---

### Task 9: Auth module — refresh rotation with reuse detection, and logout

**Files:**
- Create: `apps/api/src/auth/sessions.repository.ts`,
  `apps/api/src/auth/sessions.repository.spec.ts`, `apps/api/test/refresh.e2e-spec.ts`
- Modify: `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`,
  `apps/api/src/auth/auth.dto.ts`, `apps/api/src/auth/auth.module.ts`,
  `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `decideRefreshTokenUse`, `RefreshTokenVerdicts`, `SessionRevocationReasons`.
- Produces:
  - `POST /api/v1/auth/refresh` → 200 `{ accessToken, refreshToken }`
  - `POST /api/v1/auth/logout` → 204
  - `SessionsRepository.loadByTokenHash(tokenHash)`, `SessionsRepository.claimAndRotate(...)`,
    `SessionsRepository.revokeSession(sessionId, reason)`

- [ ] **Step 1: Write the failing repository test — the race**

`apps/api/src/auth/sessions.repository.spec.ts`:

```ts
import { SessionsRepository } from './sessions.repository';

/**
 * The conditional update is the whole reason rotation is safe, so it is asserted
 * directly rather than inferred from an e2e pass that may not interleave.
 */
describe('SessionsRepository.claimAndRotate', () => {
  const tx = {
    refreshToken: { updateMany: jest.fn(), create: jest.fn() },
    session: { update: jest.fn() },
  };
  const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } as never;

  beforeEach(() => jest.clearAllMocks());

  it('reports that it lost the race when the token was already claimed', async () => {
    // count 0 means another request set usedAt between our read and our write.
    tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    const repository = new SessionsRepository(prisma);
    await expect(
      repository.claimAndRotate('tok-1', 'session-1', 'new-hash', new Date()),
    ).resolves.toBe(false);
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rotates when it wins the claim', async () => {
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tx.refreshToken.create.mockResolvedValue({});
    tx.session.update.mockResolvedValue({});

    const repository = new SessionsRepository(prisma);
    await expect(
      repository.claimAndRotate('tok-1', 'session-1', 'new-hash', new Date()),
    ).resolves.toBe(true);
    expect(tx.refreshToken.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — cannot resolve `./sessions.repository`.

- [ ] **Step 3: Implement the sessions repository**

`apps/api/src/auth/sessions.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import type { SessionRevocationReason } from '@app/contracts';
import type { RefreshTokenState } from '@app/domain';

export interface RefreshTokenRecord extends RefreshTokenState {
  id: string;
  sessionId: string;
}

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** One query, because the decision needs the token and its session together. */
  async loadByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        sessionId: true,
        expiresAt: true,
        usedAt: true,
        session: { select: { revokedAt: true } },
      },
    });

    if (token === null) {
      return { id: '', sessionId: '', exists: false, expiresAt: new Date(0), usedAt: null, sessionRevokedAt: null };
    }

    return {
      id: token.id,
      sessionId: token.sessionId,
      exists: true,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
      sessionRevokedAt: token.session.revokedAt,
    };
  }

  /**
   * Claims the presented token and issues its replacement in one transaction.
   *
   * The transaction alone would NOT be enough: Postgres runs at READ COMMITTED, so
   * two concurrent refreshes can both read `usedAt IS NULL` and both rotate. The
   * guard is the `usedAt: null` predicate — `count === 0` means this caller lost
   * the race, and the answer is `false` so the replay branch applies instead.
   *
   * Returns true only when this call performed the rotation.
   */
  async claimAndRotate(
    tokenId: string,
    sessionId: string,
    newTokenHash: string,
    newExpiresAt: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: tokenId, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return false;

      await tx.refreshToken.create({
        data: { sessionId, tokenHash: newTokenHash, expiresAt: newExpiresAt },
      });
      await tx.session.update({ where: { id: sessionId }, data: { lastUsedAt: new Date() } });
      return true;
    });
  }

  async revokeSession(sessionId: string, reason: SessionRevocationReason): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** The subject for the access token a rotation issues. */
  async findUserIdBySession(sessionId: string): Promise<string | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    return session?.userId ?? null;
  }
}
```

- [ ] **Step 4: Wire it into the service and controller**

Add to `AuthService`:

```ts
  async refresh(refreshToken: string): Promise<TokenPair> {
    const record = await this.sessionsRepository.loadByTokenHash(
      this.tokenService.hashRefreshToken(refreshToken),
    );
    const verdict = decideRefreshTokenUse(record, new Date());

    if (verdict === RefreshTokenVerdicts.REPLAYED) {
      // The whole session dies, not just this token: a replay means the token
      // leaked, and any descendant of it is untrustworthy.
      await this.sessionsRepository.revokeSession(
        record.sessionId,
        SessionRevocationReasons.REUSE_DETECTED,
      );
      throw new UnauthorizedException('Refresh token was already used');
    }

    if (verdict === RefreshTokenVerdicts.REJECTED) {
      throw new UnauthorizedException('Refresh token is not usable');
    }

    const nextToken = this.tokenService.generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const rotated = await this.sessionsRepository.claimAndRotate(
      record.id,
      record.sessionId,
      this.tokenService.hashRefreshToken(nextToken),
      expiresAt,
    );

    if (!rotated) {
      // Lost the race between the decision and the claim: another request already
      // used this token, which is the same signal as a replay.
      await this.sessionsRepository.revokeSession(
        record.sessionId,
        SessionRevocationReasons.REUSE_DETECTED,
      );
      throw new UnauthorizedException('Refresh token was already used');
    }

    // The access token is signed from the user id, which the session holds — not
    // from the session id, and never from anything the caller supplied.
    const userId = await this.sessionsRepository.findUserIdBySession(record.sessionId);
    if (userId === null) throw new UnauthorizedException('Session no longer exists');

    return { accessToken: await this.tokenService.signAccessToken(userId), refreshToken: nextToken };
  }

  async logout(refreshToken: string): Promise<void> {
    const record = await this.sessionsRepository.loadByTokenHash(
      this.tokenService.hashRefreshToken(refreshToken),
    );
    if (!record.exists) return; // already gone is not an error to report
    await this.sessionsRepository.revokeSession(record.sessionId, SessionRevocationReasons.LOGOUT);
  }
```

Add `RefreshRequestDto` and `LogoutRequestDto` to `auth.dto.ts`, and the routes:

```ts
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenPairDto })
  refresh(@Body() body: RefreshRequestDto): Promise<TokenPair> {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() body: LogoutRequestDto): Promise<void> {
    return this.authService.logout(body.refreshToken);
  }
```

Constructor gains `private readonly sessionsRepository: SessionsRepository`; add it to
`auth.module.ts` providers, and add the two service tests from the spec's §4 decision table to
`auth.service.spec.ts` (replay revokes the session with `REUSE_DETECTED`; a rejected token does not).

- [ ] **Step 5: Write the failing e2e tests**

Create `apps/api/test/refresh.e2e-spec.ts` covering, at minimum:

```ts
  it('rotates on refresh and refuses the token it replaced', async () => { /* login, refresh, reuse old → 401 */ });
  it('revokes the whole session when a rotated token is replayed', async () => { /* replay old → 401, then the newest token → 401 too */ });
  it('rejects an unknown refresh token', async () => { /* → 401 UNAUTHORIZED */ });
  it('logout revokes the session, so refresh afterwards fails', async () => { /* → 401 */ });
```

Each assertion checks `res.body.error.code === 'UNAUTHORIZED'` as well as the status, because the code
is what a client branches on.

- [ ] **Step 6: Run the suites**

Run: `pnpm --filter api test && pnpm --filter api test:e2e`
Expected: pass, including the new refresh suite.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(auth): rotating refresh tokens with reuse detection"
```

---

### Task 10: Organizations — repositories and service

**Files:**
- Create: `apps/api/src/organizations/organization.repository.ts`,
  `apps/api/src/organizations/membership.repository.ts`,
  `apps/api/src/organizations/organization.service.ts`,
  `apps/api/src/organizations/organization.service.spec.ts`
- Modify: `apps/api/package.json` (add the `@app/domain` workspace dependency)

**Interfaces:**
- Consumes: `slugify`, `TenantContext`, the organization contracts.
- Produces:
  - `OrganizationRepository.createWithOwner(name, slug, userId): Promise<Organization>`,
    `listForUser(userId): Promise<Organization[]>`
  - `MembershipRepository.findByOrgAndUser(organizationId, userId)` (used by the guard),
    `countOwners(organizationId)`, `add(organizationId, userId, role)`,
    `remove(organizationId, userId)`, `listByOrg(organizationId)`
  - `OrganizationService.create`, `.listForUser`, `.listMembers`, `.addMember`, `.removeMember`

- [ ] **Step 0: Add the workspace dependency**

Run: `pnpm --filter api add @app/domain`
Expected: `"@app/domain": "workspace:*"` joins `apps/api`'s dependencies.

This is the first task whose code imports `@app/domain`. `import/no-extraneous-dependencies` is
enabled for apps, so without this step lint fails — and a dependency added in the task that needs it
is the rule this repository already follows.

- [ ] **Step 1: Write the failing service test**

`apps/api/src/organizations/organization.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { MemberRoles } from '@app/contracts';
import { buildTenantContext } from '@app/domain';
import type { MembershipRepository } from './membership.repository';
import type { OrganizationRepository } from './organization.repository';
import { OrganizationService } from './organization.service';

const tenant = buildTenantContext('org_1', MemberRoles.OWNER);

const build = (overrides: {
  countOwners?: jest.Mock;
  findByEmail?: jest.Mock;
  remove?: jest.Mock;
}) =>
  new OrganizationService(
    { createWithOwner: jest.fn(), listForUser: jest.fn() } as unknown as OrganizationRepository,
    {
      countOwners: overrides.countOwners ?? jest.fn().mockResolvedValue(2),
      findByEmail: overrides.findByEmail ?? jest.fn().mockResolvedValue({ id: 'u2' }),
      add: jest.fn(),
      remove: overrides.remove ?? jest.fn(),
      listByOrg: jest.fn(),
      findByOrgAndUser: jest.fn(),
    } as unknown as MembershipRepository,
  );

describe('OrganizationService', () => {
  it('refuses to remove the last owner, which is a rule and not a constraint', async () => {
    const service = build({ countOwners: jest.fn().mockResolvedValue(1) });

    await expect(service.removeMember(tenant, 'u2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('removes a member when another owner remains', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const service = build({ countOwners: jest.fn().mockResolvedValue(2), remove });

    await service.removeMember(tenant, 'u2');

    expect(remove).toHaveBeenCalledWith('org_1', 'u2');
  });

  it('reports an unknown email rather than creating a phantom membership', async () => {
    const service = build({ findByEmail: jest.fn().mockResolvedValue(null) });

    await expect(service.addMember(tenant, 'ghost@b.test')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — cannot resolve `./organization.service`.

- [ ] **Step 3: Implement the repositories**

`apps/api/src/organizations/organization.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import { MemberRoles, OrganizationStatuses, type Organization } from '@app/contracts';

@Injectable()
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The organization and its first owner commit together. An organization with no
   * owner is a tenant nobody can administer, and no later request could repair it.
   */
  async createWithOwner(name: string, slug: string, userId: string): Promise<Organization> {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name, slug },
        select: { id: true, name: true, slug: true, status: true },
      });
      await tx.organizationMember.create({
        data: { organizationId: organization.id, userId, role: MemberRoles.OWNER },
      });
      return { ...organization, role: MemberRoles.OWNER };
    });
  }

  /**
   * A user's organizations, with their role in each. This is how a client learns
   * the value to send in the organization header.
   */
  async listForUser(userId: string): Promise<Organization[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: {
        role: true,
        organization: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({ ...membership.organization, role: membership.role }));
  }

  async existsActive(organizationId: string): Promise<boolean> {
    const found = await this.prisma.organization.findFirst({
      where: { id: organizationId, status: OrganizationStatuses.ACTIVE },
      select: { id: true },
    });
    return found !== null;
  }
}
```

`apps/api/src/organizations/membership.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import { MemberRoles, type MemberRole, type OrganizationMember } from '@app/contracts';

export interface MembershipRecord {
  organizationId: string;
  userId: string;
  role: MemberRole;
}

@Injectable()
export class MembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** What the organization guard resolves a request's tenant from. */
  async findByOrgAndUser(organizationId: string, userId: string): Promise<MembershipRecord | null> {
    return this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true, userId: true, role: true },
    });
  }

  /** Counted, not stored: "there is always an owner" is a rule over sibling rows. */
  async countOwners(organizationId: string): Promise<number> {
    return this.prisma.organizationMember.count({
      where: { organizationId, role: MemberRoles.OWNER },
    });
  }

  async findByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({ where: { email }, select: { id: true } });
  }

  async add(organizationId: string, userId: string, role: MemberRole): Promise<void> {
    await this.prisma.organizationMember.create({ data: { organizationId, userId, role } });
  }

  async remove(organizationId: string, userId: string): Promise<void> {
    await this.prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId, userId } },
    });
  }

  async listByOrg(organizationId: string): Promise<OrganizationMember[]> {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      select: { userId: true, role: true, user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((member) => ({
      userId: member.userId,
      email: member.user.email,
      role: member.role,
    }));
  }
}
```

- [ ] **Step 4: Implement the service**

`apps/api/src/organizations/organization.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRoles, type Organization, type OrganizationMember } from '@app/contracts';
import { slugify, type TenantContext } from '@app/domain';
import { OrganizationRepository } from './organization.repository';
import { MembershipRepository } from './membership.repository';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  async create(name: string, slug: string, userId: string): Promise<Organization> {
    return this.organizationRepository.createWithOwner(name, slug ?? slugify(name), userId);
  }

  async listForUser(userId: string): Promise<Organization[]> {
    return this.organizationRepository.listForUser(userId);
  }

  async listMembers(tenant: TenantContext): Promise<OrganizationMember[]> {
    return this.membershipRepository.listByOrg(tenant.organizationId);
  }

  async addMember(tenant: TenantContext, email: string): Promise<void> {
    // No role check here on purpose. The RolesGuard is the single enforcement
    // point for @OwnerOnly, and a second check inside the service would be a
    // second answer to the same question — the spec's error table says 403, so
    // the guard's verdict is the one the contract describes.
    const user = await this.membershipRepository.findByEmail(email);
    if (user === null) throw new NotFoundException('No user with that email');

    const existing = await this.membershipRepository.findByOrgAndUser(tenant.organizationId, user.id);
    if (existing !== null) throw new ConflictException('Already a member');

    await this.membershipRepository.add(tenant.organizationId, user.id, MemberRoles.MEMBER);
  }

  /**
   * "An organization retains at least one owner" is a rule over sibling rows, which
   * no CHECK can express — so it is enforced here and labelled a rule rather than
   * implying the database guarantees it.
   */
  async removeMember(tenant: TenantContext, userId: string): Promise<void> {
    const owners = await this.membershipRepository.countOwners(tenant.organizationId);
    const target = await this.membershipRepository.findByOrgAndUser(tenant.organizationId, userId);

    if (target?.role === MemberRoles.OWNER && owners <= 1) {
      throw new ConflictException('An organization must retain at least one owner');
    }

    await this.membershipRepository.remove(tenant.organizationId, userId);
  }
}
```

Note `create` takes `slug` first and falls back to `slugify(name)` — the controller passes the
schema's slug, which is required by the contract, so the fallback exists for programmatic callers
and is covered by `packages/domain`'s slug tests.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter api test`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(organizations): repositories and service"
```

---

### Task 11: The security module — three global guards and their decorators

**Files:**
- Create: `apps/api/src/security/security.constants.ts`,
  `apps/api/src/security/request-context.interface.ts`,
  `apps/api/src/security/decorators/public.decorator.ts`,
  `apps/api/src/security/decorators/tenant-free.decorator.ts`,
  `apps/api/src/security/decorators/owner-only.decorator.ts`,
  `apps/api/src/security/decorators/current-user.decorator.ts`,
  `apps/api/src/security/decorators/tenant.decorator.ts`,
  `apps/api/src/security/guards/access-token.guard.ts`,
  `apps/api/src/security/guards/organization.guard.ts`,
  `apps/api/src/security/guards/roles.guard.ts`, `apps/api/src/security/security.module.ts`,
  `apps/api/src/security/guards/organization.guard.spec.ts`,
  `apps/api/test/guards.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/auth/auth.controller.ts`,
  `apps/api/src/modules/health/health.controller.ts`

**Interfaces:**
- Consumes: `TokenService`, `MembershipRepository`, `OrganizationRepository`,
  `buildTenantContext`, `canManageMembership`, `ORGANIZATION_ID_HEADER`.
- Produces: `@Public()`, `@TenantFree()`, `@OwnerOnly()`, `@CurrentUser()`, `@Tenant()`, and
  `AuthenticatedRequest` (`{ requestId?, user, tenant? }`).

- [ ] **Step 1: Write the failing guard test**

`apps/api/src/security/guards/organization.guard.spec.ts`:

```ts
import { ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';
import { MemberRoles, ORGANIZATION_ID_HEADER } from '@app/contracts';
import { OrganizationGuard } from './organization.guard';

const contextFor = (headers: Record<string, string>, user: { id: string } | undefined) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers, user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

const guardWith = (membership: unknown, active = true) =>
  new OrganizationGuard(
    { findByOrgAndUser: jest.fn().mockResolvedValue(membership) } as never,
    { existsActive: jest.fn().mockResolvedValue(active) } as never,
    { getAllAndOverride: jest.fn().mockReturnValue(false) } as never,
  );

describe('OrganizationGuard', () => {
  it('refuses a request that names no organization', async () => {
    await expect(guardWith(null).canActivate(contextFor({}, { id: 'u1' }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses an organization the caller is not a member of', async () => {
    const guard = guardWith(null);

    await expect(
      guard.canActivate(contextFor({ [ORGANIZATION_ID_HEADER]: 'org_9' }, { id: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an inactive organization even for a member', async () => {
    const guard = guardWith({ organizationId: 'org_1', userId: 'u1', role: MemberRoles.OWNER }, false);

    await expect(
      guard.canActivate(contextFor({ [ORGANIZATION_ID_HEADER]: 'org_1' }, { id: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('attaches a tenant context on success', async () => {
    const request = { headers: { [ORGANIZATION_ID_HEADER]: 'org_1' }, user: { id: 'u1' } } as {
      headers: Record<string, string>;
      user: { id: string };
      tenant?: unknown;
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    const guard = guardWith({ organizationId: 'org_1', userId: 'u1', role: MemberRoles.MEMBER });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.tenant).toEqual({ organizationId: 'org_1', role: MemberRoles.MEMBER });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — cannot resolve `./organization.guard`.

- [ ] **Step 3: Implement the constants, request context and decorators**

`apps/api/src/security/security.constants.ts`:

```ts
import { ORGANIZATION_ID_HEADER } from '@app/contracts';

/** Metadata keys the guards read. Named so no guard writes a string literal. */
export const SecurityMetadata = {
  PUBLIC: 'security:public',
  TENANT_FREE: 'security:tenant-free',
  OWNER_ONLY: 'security:owner-only',
} as const;

export const SecurityMessages = {
  MISSING_TENANT: `Missing or malformed ${ORGANIZATION_ID_HEADER} header`,
  NOT_A_MEMBER: 'Not a member of that organization',
  ORGANIZATION_INACTIVE: 'That organization is not active',
  OWNER_ONLY: 'This action requires the owner role',
  MISSING_TOKEN: 'Missing access token',
} as const;
```

`apps/api/src/security/request-context.interface.ts`:

```ts
import type { RequestWithId } from '@app/runtime';
import type { TenantContext } from '@app/domain';

export interface AuthenticatedUser {
  id: string;
}

/**
 * Express's request, carrying what the guard chain attached.
 *
 * Declared as an interface rather than augmented onto Express's global namespace
 * for the reason @app/runtime already records: a hand-written `declare global` in
 * a .d.ts is not emitted into dist, so it would reach this package and silently
 * not reach its consumers.
 */
export interface AuthenticatedRequest extends RequestWithId {
  user?: AuthenticatedUser;
  tenant?: TenantContext;
}
```

`apps/api/src/security/decorators/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import { SecurityMetadata } from '../security.constants';

/**
 * Opts a route out of the whole guard chain. Deny-by-default only works if being
 * outside the boundary is something the code says out loud — `grep '@Public'`
 * is then the complete list.
 */
export const Public = () => SetMetadata(SecurityMetadata.PUBLIC, true);
```

`apps/api/src/security/decorators/tenant-free.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import { SecurityMetadata } from '../security.constants';

/** Authenticated, but not acting within a tenant — organization creation, listing. */
export const TenantFree = () => SetMetadata(SecurityMetadata.TENANT_FREE, true);
```

`apps/api/src/security/decorators/owner-only.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import { SecurityMetadata } from '../security.constants';

export const OwnerOnly = () => SetMetadata(SecurityMetadata.OWNER_ONLY, true);
```

`apps/api/src/security/decorators/current-user.decorator.ts`:

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from '../request-context.interface';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (request.user === undefined) {
    throw new Error('CurrentUser used on a route the AccessTokenGuard did not run for');
  }
  return request.user;
});
```

`apps/api/src/security/decorators/tenant.decorator.ts`:

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '@app/domain';
import type { AuthenticatedRequest } from '../request-context.interface';

/** Reads what the OrganizationGuard resolved. Never reads the raw header. */
export const Tenant = createParamDecorator((_data: unknown, context: ExecutionContext): TenantContext => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (request.tenant === undefined) {
    throw new Error('Tenant used on a route the OrganizationGuard did not run for');
  }
  return request.tenant;
});
```

- [ ] **Step 4: Implement the guards**

`apps/api/src/security/guards/access-token.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TokenService } from '../../auth/tokens/token.service';
import { SecurityMessages, SecurityMetadata } from '../security.constants';
import type { AuthenticatedRequest } from '../request-context.interface';

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest & Request>();
    const header = request.headers.authorization;
    if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException(SecurityMessages.MISSING_TOKEN);
    }

    try {
      const payload = await this.tokenService.verifyAccessToken(header.slice(BEARER_PREFIX.length));
      request.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException(SecurityMessages.MISSING_TOKEN);
    }
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(SecurityMetadata.PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }
}
```

`apps/api/src/security/guards/organization.guard.ts`:

```ts
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ORGANIZATION_ID_HEADER } from '@app/contracts';
import { buildTenantContext } from '@app/domain';
import { OrganizationRepository } from '../../organizations/organization.repository';
import { MembershipRepository } from '../../organizations/membership.repository';
import { SecurityMessages, SecurityMetadata } from '../security.constants';
import type { AuthenticatedRequest } from '../request-context.interface';

@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.skipped(context)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers[ORGANIZATION_ID_HEADER];
    const organizationId = Array.isArray(header) ? header[0] : header;
    if (organizationId === undefined || organizationId.length === 0) {
      throw new BadRequestException(SecurityMessages.MISSING_TENANT);
    }

    const userId = request.user?.id;
    const membership =
      userId === undefined
        ? null
        : await this.membershipRepository.findByOrgAndUser(organizationId, userId);
    // Not a member and organization-does-not-exist answer the same way: the header
    // is an explicit claim, so refusing it discloses nothing a caller did not
    // already assert.
    if (membership === null) throw new ForbiddenException(SecurityMessages.NOT_A_MEMBER);

    if (!(await this.organizationRepository.existsActive(organizationId))) {
      throw new ForbiddenException(SecurityMessages.ORGANIZATION_INACTIVE);
    }

    request.tenant = buildTenantContext(membership.organizationId, membership.role);
    return true;
  }

  private skipped(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(SecurityMetadata.PUBLIC, targets) ?? false;
    const isTenantFree =
      this.reflector.getAllAndOverride<boolean>(SecurityMetadata.TENANT_FREE, targets) ?? false;
    return isPublic || isTenantFree;
  }
}
```

`apps/api/src/security/guards/roles.guard.ts`:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canManageMembership } from '@app/domain';
import { SecurityMessages, SecurityMetadata } from '../security.constants';
import type { AuthenticatedRequest } from '../request-context.interface';

/**
 * Reads the membership the OrganizationGuard already loaded, so it costs no query.
 * Runs last, which is why the tenant is guaranteed to exist when it does.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const ownerOnly =
      this.reflector.getAllAndOverride<boolean>(SecurityMetadata.OWNER_ONLY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;
    if (!ownerOnly) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.tenant === undefined || !canManageMembership(request.tenant.role)) {
      throw new ForbiddenException(SecurityMessages.OWNER_ONLY);
    }
    return true;
  }
}
```

`apps/api/src/security/security.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AccessTokenGuard } from './guards/access-token.guard';
import { OrganizationGuard } from './guards/organization.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Order is load-bearing: the access token establishes who is calling, the
 * organization guard establishes which tenant they may act in, and the roles guard
 * authorizes within it. Nest applies APP_GUARD providers in the order declared.
 */
@Global()
@Module({
  imports: [AuthModule, OrganizationsModule],
  providers: [
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: OrganizationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class SecurityModule {}
```

Create a minimal `apps/api/src/organizations/organizations.module.ts` now so the import resolves (it
gains its controller in Task 12):

```ts
import { Module } from '@nestjs/common';
import { OrganizationRepository } from './organization.repository';
import { MembershipRepository } from './membership.repository';
import { OrganizationService } from './organization.service';

@Module({
  providers: [
    OrganizationRepository,
    MembershipRepository,
    OrganizationService,
  ],
  exports: [OrganizationRepository, MembershipRepository, OrganizationService],
})
export class OrganizationsModule {}
```

- [ ] **Step 5: Mark the routes that are outside the tenant boundary**

Add `@Public()` to `AuthController` (class level) and to both methods' controller in
`apps/api/src/modules/health/health.controller.ts` (class level).

This step is not optional: a global `AccessTokenGuard` immediately closes `/api/v1/health`, and the
existing Week 1 health suite fails until these are marked. That failure is the guard proving it is
actually installed — do not weaken the guard to make the old test pass.

- [ ] **Step 6: Register the module**

In `apps/api/src/app.module.ts`, add `OrganizationsModule` and `SecurityModule` to `imports` —
`AuthModule` was already added in Task 8, so adding it again here would be a duplicate. `SecurityModule`
must come last so the guards are registered after the modules whose providers they use.

- [ ] **Step 7: Write the failing e2e tests for the guard chain**

Create `apps/api/test/guards.e2e-spec.ts` asserting:

```ts
  it('lets a public route through with no token', async () => { /* GET /api/v1/health → 200 */ });
  it('refuses a protected route with no token', async () => { /* 401 UNAUTHORIZED */ });
  it('refuses a malformed bearer token', async () => { /* 401 UNAUTHORIZED */ });
  it('refuses a valid token with no organization header', async () => { /* 400 VALIDATION_ERROR, names the header */ });
  it('refuses a header naming an organization the caller does not belong to', async () => { /* 403 FORBIDDEN */ });
```

- [ ] **Step 8: Run the suites**

Run: `pnpm --filter api test && pnpm --filter api test:e2e`
Expected: pass. If the health suite fails, Step 5 was skipped.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(security): deny-by-default guards with visible opt-outs"
```

---

### Task 12: Organizations controller

**Files:**
- Create: `apps/api/src/organizations/organization.controller.ts`,
  `apps/api/src/organizations/organization.dto.ts`, `apps/api/test/organizations.e2e-spec.ts`
- Modify: `apps/api/src/organizations/organizations.module.ts`

**Interfaces:**
- Consumes: `@Public`, `@TenantFree`, `@OwnerOnly`, `@CurrentUser`, `@Tenant`, `OrganizationService`.
- Produces: `POST /organizations`, `GET /organizations`, `GET /organizations/members`,
  `POST /organizations/members`, `DELETE /organizations/members/:userId`.

- [ ] **Step 1: Write the failing e2e tests**

`apps/api/test/organizations.e2e-spec.ts`:

```ts
  it('creates an organization and makes the creator its owner', async () => { /* POST → 201, role OWNER */ });
  it('refuses a duplicate slug with CONFLICT', async () => { /* → 409 */ });
  it('lists only the organizations the caller belongs to', async () => { /* outro user sees none of them */ });
  it('lets a member read the member list', async () => { /* member token + header → 200 */ });
  it('refuses a member adding another member', async () => { /* @OwnerOnly → 403 FORBIDDEN */ });
  it('refuses removing the last owner', async () => { /* → 409 CONFLICT */ });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter api test:e2e`
Expected: 404 for every route — the controller does not exist.

- [ ] **Step 3: Implement the DTOs and controller**

`apps/api/src/organizations/organization.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import {
  AddMemberRequestSchema,
  CreateOrganizationRequestSchema,
  OrganizationMemberSchema,
  OrganizationSchema,
} from '@app/contracts';

export class CreateOrganizationRequestDto extends createZodDto(CreateOrganizationRequestSchema) {}
export class OrganizationDto extends createZodDto(OrganizationSchema) {}
export class AddMemberRequestDto extends createZodDto(AddMemberRequestSchema) {}
export class OrganizationMemberDto extends createZodDto(OrganizationMemberSchema) {}
```

`apps/api/src/organizations/organization.controller.ts`:

```ts
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import type { Organization, OrganizationMember } from '@app/contracts';
import type { TenantContext } from '@app/domain';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { OwnerOnly } from '../security/decorators/owner-only.decorator';
import { Tenant } from '../security/decorators/tenant.decorator';
import { TenantFree } from '../security/decorators/tenant-free.decorator';
import type { AuthenticatedUser } from '../security/request-context.interface';
import {
  AddMemberRequestDto,
  CreateOrganizationRequestDto,
  OrganizationDto,
  OrganizationMemberDto,
} from './organization.dto';
import { OrganizationService } from './organization.service';

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  /** Tenant-free: creating an organization cannot require naming one. */
  @Post()
  @TenantFree()
  @ApiCreatedResponse({ type: OrganizationDto })
  create(
    @Body() body: CreateOrganizationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Organization> {
    return this.organizationService.create(body.name, body.slug, user.id);
  }

  /** Tenant-free: this is how a client discovers which header values are legal. */
  @Get()
  @TenantFree()
  @ApiOkResponse({ type: [OrganizationDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Organization[]> {
    return this.organizationService.listForUser(user.id);
  }

  @Get('members')
  @ApiOkResponse({ type: [OrganizationMemberDto] })
  listMembers(@Tenant() tenant: TenantContext): Promise<OrganizationMember[]> {
    return this.organizationService.listMembers(tenant);
  }

  @Post('members')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  addMember(@Tenant() tenant: TenantContext, @Body() body: AddMemberRequestDto): Promise<void> {
    return this.organizationService.addMember(tenant, body.email);
  }

  @Delete('members/:userId')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(@Tenant() tenant: TenantContext, @Param('userId') userId: string): Promise<void> {
    return this.organizationService.removeMember(tenant, userId);
  }
}
```

Add `OrganizationController` to `OrganizationsModule`'s `controllers`.

- [ ] **Step 4: Run the suites**

Run: `pnpm --filter api test:e2e`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(organizations): create, list and membership administration"
```

---

### Task 13: Catalog — products and inventory

**Files:**
- Create: `apps/api/src/catalog/catalog.repository.ts`, `apps/api/src/catalog/catalog.service.ts`,
  `apps/api/src/catalog/catalog.controller.ts`, `apps/api/src/catalog/catalog.dto.ts`,
  `apps/api/src/catalog/catalog.module.ts`, `apps/api/src/catalog/catalog.service.spec.ts`,
  `apps/api/test/catalog.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `tenantScope`, `planProductTransition`, `ProductTransitionOutcomes`, the product contracts.
- Produces: `POST /products`, `GET /products`, `GET /products/:id`, `PATCH /products/:id`,
  `POST /products/:id/publish`, `POST /products/:id/unpublish`, `GET /products/:id/inventory`.

- [ ] **Step 1: Write the failing service test**

`apps/api/src/catalog/catalog.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { MemberRoles, ProductStatuses } from '@app/contracts';
import { buildTenantContext } from '@app/domain';
import type { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';

const tenant = buildTenantContext('org_1', MemberRoles.OWNER);

const build = (findById: jest.Mock) =>
  new CatalogService({
    findById,
    create: jest.fn(),
    listByTenant: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    findInventory: jest.fn(),
  } as unknown as CatalogRepository);

describe('CatalogService', () => {
  it('answers NOT_FOUND for a product in another organization', async () => {
    // The repository returned null because the where clause carried the tenant.
    // The service must not turn that into a leak or a 500.
    await expect(build(jest.fn().mockResolvedValue(null)).findOne(tenant, 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to publish an unpriced product', async () => {
    const product = { id: 'p1', status: ProductStatuses.DRAFT, priceMinor: 0 };

    await expect(
      build(jest.fn().mockResolvedValue(product)).publish(tenant, 'p1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a transition to the state the product is already in', async () => {
    const product = { id: 'p1', status: ProductStatuses.PUBLISHED, priceMinor: 100 };

    await expect(
      build(jest.fn().mockResolvedValue(product)).publish(tenant, 'p1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — cannot resolve `./catalog.service`.

- [ ] **Step 3: Implement the repository**

`apps/api/src/catalog/catalog.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/runtime';
import { type CurrencyCode, type Inventory, type Product, type ProductStatus } from '@app/contracts';
import { tenantScope, type TenantContext } from '@app/domain';

export interface ProductRecord {
  id: string;
  name: string;
  priceMinor: number;
  currency: CurrencyCode;
  status: ProductStatus;
}

/**
 * Every method takes a TenantContext, never a bare organization id, and every
 * `where` composes `tenantScope(tenant)`. The signature is the enforcement: a
 * tenant-scoped query cannot be written without a tenant.
 */
@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Product and its inventory commit together: a product with no stock row cannot be ordered. */
  async create(
    tenant: TenantContext,
    input: { name: string; priceMinor: number; currency: string },
  ): Promise<Product> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          organizationId: tenant.organizationId,
          name: input.name,
          priceMinor: input.priceMinor,
          currency: input.currency as never,
        },
        select: { id: true, name: true, priceMinor: true, currency: true, status: true },
      });
      await tx.inventory.create({ data: { productId: product.id, available: 0, reserved: 0 } });
      return product;
    });
  }

  async listByTenant(tenant: TenantContext): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { ...tenantScope(tenant) },
      select: { id: true, name: true, priceMinor: true, currency: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(tenant: TenantContext, id: string): Promise<ProductRecord | null> {
    return this.prisma.product.findFirst({
      where: { id, ...tenantScope(tenant) },
      select: { id: true, name: true, priceMinor: true, currency: true, status: true },
    });
  }

  async update(
    tenant: TenantContext,
    id: string,
    input: { name?: string; priceMinor?: number },
  ): Promise<number> {
    const updated = await this.prisma.product.updateMany({
      where: { id, ...tenantScope(tenant) },
      data: input,
    });
    return updated.count;
  }

  async updateStatus(tenant: TenantContext, id: string, status: ProductStatus): Promise<void> {
    await this.prisma.product.updateMany({
      where: { id, ...tenantScope(tenant) },
      data: { status },
    });
  }

  async findInventory(tenant: TenantContext, productId: string): Promise<Inventory | null> {
    return this.prisma.inventory.findFirst({
      where: { productId, product: { ...tenantScope(tenant) } },
      select: { productId: true, available: true, reserved: true },
    });
  }
}
```

`updateMany` is used rather than `update` for a reason worth a comment: `update` takes only a unique
where, so it cannot carry the tenant filter, and the row would be updated before anyone noticed the
tenant did not match.

- [ ] **Step 4: Implement the service, DTOs, controller and module**

`apps/api/src/catalog/catalog.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ProductStatuses,
  type Inventory,
  type Product,
  type ProductStatus,
} from '@app/contracts';
import {
  ProductTransitionOutcomes,
  planProductTransition,
  type TenantContext,
} from '@app/domain';
import { CatalogRepository } from './catalog.repository';

const TransitionMessages = {
  [ProductTransitionOutcomes.ILLEGAL_TRANSITION]: 'That transition is not legal from the current state',
  [ProductTransitionOutcomes.UNPUBLISHABLE]: 'A product needs a price greater than zero to be published',
};

@Injectable()
export class CatalogService {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  create(
    tenant: TenantContext,
    input: { name: string; priceMinor: number; currency: string },
  ): Promise<Product> {
    return this.catalogRepository.create(tenant, input);
  }

  list(tenant: TenantContext): Promise<Product[]> {
    return this.catalogRepository.listByTenant(tenant);
  }

  /** 404, not 403: a resource id is a probe, so a miss must disclose nothing. */
  async findOne(tenant: TenantContext, id: string): Promise<Product> {
    const product = await this.catalogRepository.findById(tenant, id);
    if (product === null) throw new NotFoundException('Product not found');
    return product;
  }

  async update(
    tenant: TenantContext,
    id: string,
    input: { name?: string; priceMinor?: number },
  ): Promise<void> {
    const updated = await this.catalogRepository.update(tenant, id, input);
    if (updated === 0) throw new NotFoundException('Product not found');
  }

  publish(tenant: TenantContext, id: string): Promise<void> {
    return this.transition(tenant, id, ProductStatuses.PUBLISHED);
  }

  unpublish(tenant: TenantContext, id: string): Promise<void> {
    return this.transition(tenant, id, ProductStatuses.DRAFT);
  }

  async inventory(tenant: TenantContext, id: string): Promise<Inventory> {
    const inventory = await this.catalogRepository.findInventory(tenant, id);
    if (inventory === null) throw new NotFoundException('Product not found');
    return inventory;
  }

  private async transition(
    tenant: TenantContext,
    id: string,
    to: ProductStatus,
  ): Promise<void> {
    const product = await this.catalogRepository.findById(tenant, id);
    if (product === null) throw new NotFoundException('Product not found');

    const outcome = planProductTransition(product.status, to, product.priceMinor);
    if (outcome !== ProductTransitionOutcomes.ALLOWED) {
      throw new ConflictException(TransitionMessages[outcome]);
    }

    await this.catalogRepository.updateStatus(tenant, id, to);
  }
}
```

`apps/api/src/catalog/catalog.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import {
  CreateProductRequestSchema,
  InventorySchema,
  ProductSchema,
  UpdateProductRequestSchema,
} from '@app/contracts';

export class CreateProductRequestDto extends createZodDto(CreateProductRequestSchema) {}
export class UpdateProductRequestDto extends createZodDto(UpdateProductRequestSchema) {}
export class ProductDto extends createZodDto(ProductSchema) {}
export class InventoryDto extends createZodDto(InventorySchema) {}
```

`apps/api/src/catalog/catalog.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import type { Inventory, Product } from '@app/contracts';
import type { TenantContext } from '@app/domain';
import { Tenant } from '../security/decorators/tenant.decorator';
import {
  CreateProductRequestDto,
  InventoryDto,
  ProductDto,
  UpdateProductRequestDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

@Controller('products')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @ApiCreatedResponse({ type: ProductDto })
  create(@Tenant() tenant: TenantContext, @Body() body: CreateProductRequestDto): Promise<Product> {
    return this.catalogService.create(tenant, body);
  }

  @Get()
  @ApiOkResponse({ type: [ProductDto] })
  list(@Tenant() tenant: TenantContext): Promise<Product[]> {
    return this.catalogService.list(tenant);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductDto })
  findOne(@Tenant() tenant: TenantContext, @Param('id') id: string): Promise<Product> {
    return this.catalogService.findOne(tenant, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateProductRequestDto,
  ): Promise<void> {
    return this.catalogService.update(tenant, id, body);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  publish(@Tenant() tenant: TenantContext, @Param('id') id: string): Promise<void> {
    return this.catalogService.publish(tenant, id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.NO_CONTENT)
  unpublish(@Tenant() tenant: TenantContext, @Param('id') id: string): Promise<void> {
    return this.catalogService.unpublish(tenant, id);
  }

  @Get(':id/inventory')
  @ApiOkResponse({ type: InventoryDto })
  inventory(@Tenant() tenant: TenantContext, @Param('id') id: string): Promise<Inventory> {
    return this.catalogService.inventory(tenant, id);
  }
}
```

Create `apps/api/src/catalog/catalog.module.ts` mirroring `OrganizationsModule`
(`providers: [CatalogRepository, CatalogService]`, `controllers: [CatalogController]`) and add
`CatalogModule` to `AppModule.imports`.

- [ ] **Step 5: Write the e2e tests**

`apps/api/test/catalog.e2e-spec.ts` asserting: create returns DRAFT; the inventory row exists and is
0/0; publish a priced product → 204; publish an unpriced product → 409; a repeated publish → 409;
`GET /products` lists only the caller's tenant; an unknown id → 404.

- [ ] **Step 6: Run the suites**

Run: `pnpm --filter api test && pnpm --filter api test:e2e`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(catalog): tenant-scoped products with publish transitions"
```

---

### Task 14: The gate — cross-tenant suite, the refresh race, and pasted evidence

**Files:**
- Create: `apps/api/test/tenancy.e2e-spec.ts`, `apps/api/test/integration/refresh-race.integration-spec.ts`
- Modify: `README.md` (flagship row), `docs/superpowers/STATUS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the week's exit-gate evidence.

- [ ] **Step 1: Write the cross-tenant suite**

`apps/api/test/tenancy.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ORGANIZATION_ID_HEADER } from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { registerAndLogin, unique } from './support/fixtures';

/**
 * INV-9, the week's gate: a user may not access a private resource owned by
 * another organization, and a cross-tenant fetch by identifier returns 404 or 403
 * and never data.
 */
describe('tenant isolation (e2e)', () => {
  let app: INestApplication;
  let alice: { token: string; organizationId: string; productId: string };
  let bob: { token: string; organizationId: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const aliceToken = await registerAndLogin(app, `${unique('alice')}@marketcore.test`);
    const aliceOrg = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Alice Co', slug: unique('alice-co') })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${aliceToken}`)
      .set(ORGANIZATION_ID_HEADER, aliceOrg.body.id)
      .send({ name: 'Alice Widget', priceMinor: 500, currency: 'USD' })
      .expect(201);

    alice = { token: aliceToken, organizationId: aliceOrg.body.id, productId: product.body.id };

    const bobToken = await registerAndLogin(app, `${unique('bob')}@marketcore.test`);
    const bobOrg = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ name: 'Bob Co', slug: unique('bob-co') })
      .expect(201);
    bob = { token: bobToken, organizationId: bobOrg.body.id };
  });

  afterAll(async () => {
    await app.close();
  });

  const asBob = (method: 'get' | 'patch' | 'post', path: string) =>
    request(app.getHttpServer())[method](path)
      .set('Authorization', `Bearer ${bob.token}`)
      .set(ORGANIZATION_ID_HEADER, bob.organizationId);

  it("cannot read another organization's product by identifier", async () => {
    const res = await asBob('get', `/api/v1/products/${alice.productId}`).expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toContain('Alice Widget');
  });

  it("cannot update another organization's product", async () => {
    await asBob('patch', `/api/v1/products/${alice.productId}`).send({ name: 'Stolen' }).expect(404);
  });

  it("cannot publish another organization's product", async () => {
    await asBob('post', `/api/v1/products/${alice.productId}/publish`).expect(404);
  });

  it("cannot read another organization's inventory", async () => {
    await asBob('get', `/api/v1/products/${alice.productId}/inventory`).expect(404);
  });

  it('does not list another organization\'s products', async () => {
    const res = await asBob('get', '/api/v1/products').expect(200);

    expect(res.body).toEqual([]);
  });

  it('refuses a header naming an organization the caller does not belong to', async () => {
    // The header is an explicit claim, so refusing it is a 403 rather than a 404.
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${bob.token}`)
      .set(ORGANIZATION_ID_HEADER, alice.organizationId)
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('still lets the owner read their own product', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/${alice.productId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .set(ORGANIZATION_ID_HEADER, alice.organizationId)
      .expect(200);

    expect(res.body.name).toBe('Alice Widget');
  });
});
```

The last test is not filler: without it, every preceding assertion would also pass against a system
that returns 404 for everything, which is the failure mode a cross-tenant suite is most likely to
have.

- [ ] **Step 2: Write the refresh-race test**

`apps/api/test/integration/refresh-race.integration-spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from '@jest/globals';
import { SessionsRepository } from '../../src/auth/sessions.repository';
import { PrismaService } from '@app/runtime';
import { testPrisma } from '../support/db';

/**
 * Two concurrent refreshes of the same token must produce exactly one rotation.
 * A bare transaction does not give this: at READ COMMITTED both calls read
 * `usedAt IS NULL`. The conditional update is what makes it true, so it is
 * asserted rather than assumed.
 */
describe('refresh rotation under concurrency', () => {
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('lets exactly one of two concurrent claims rotate a token', async () => {
    const user = await testPrisma.user.create({
      data: { email: `race-${randomUUID()}@marketcore.test`, passwordHash: 'x' },
    });
    const session = await testPrisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 100000) },
    });
    const token = await testPrisma.refreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash: `race-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 100000),
      },
    });

    const repository = new SessionsRepository(testPrisma as unknown as PrismaService);
    const [first, second] = await Promise.all([
      repository.claimAndRotate(token.id, session.id, `next-a-${randomUUID()}`, new Date(Date.now() + 100000)),
      repository.claimAndRotate(token.id, session.id, `next-b-${randomUUID()}`, new Date(Date.now() + 100000)),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the gate and capture the output**

Run: `pnpm --filter api test:e2e 2>&1 | tee "$COMMANDCODE_SCRATCHPAD/week-02-gate.txt"`
Expected: every tenancy assertion passes.

Then: `pnpm --filter api test:integration 2>&1 | tee "$COMMANDCODE_SCRATCHPAD/week-02-integration.txt"`
Expected: constraints, enum drift and the race all pass.

- [ ] **Step 4: Paste the output into the evidence record**

Add the week 2 entry to `docs/superpowers/STATUS.md` with the gate, the command,
the pasted result lines, and an explicit **Not proven / deferred** list (reservations and locking;
the concurrency suite; refresh-token reuse metrics; invitations and password reset).

Update `README.md`:

- the flagship table's tenant-isolation row lands now, with its real command;
- the `test:integration` row moves from phase 8 to phase 2;
- **"Only one table exists"** under honest limitations is replaced with the real state;
- the tenant header and the auth flow join **Conventions**;
- `docs/architecture.md`, `docs/domain-model.md`, `docs/adr/010-*.md` and `docs/adr/README.md` are
  updated per the spec's §10.

- [ ] **Step 5: Full suite, then commit**

Run: `pnpm turbo run lint typecheck test build`
Expected: all tasks pass.

```bash
git add -A && git commit -m "test(tenancy): the cross-tenant gate, with the evidence committed"
```

---

### Task 15: Close the week — clean clone, PR, tag

**Files:**
- Modify: `README.md` if the clean-clone run surfaces anything.

**Interfaces:**
- Consumes: everything.
- Produces: the week-2 exit gate, and a pull request.

- [ ] **Step 1: Prove the quick start from a clean clone**

Run, in the session scratchpad:

```bash
git clone "$PWD" "$COMMANDCODE_SCRATCHPAD/mc-w2" && cd "$COMMANDCODE_SCRATCHPAD/mc-w2"
cp .env.example .env && cp apps/api/.env.example apps/api/.env && cp packages/database/.env.example packages/database/.env
docker compose up -d && corepack enable && pnpm install
pnpm --filter @app/database db:deploy && pnpm --filter @app/database db:seed
pnpm turbo run lint typecheck test build
```

Expected: every command succeeds with no edits. A README that has not been executed is a claim, not
evidence — the same bar Week 1 set.

- [ ] **Step 2: Prove the gate by hand once**

Run the API, then with the seeded owner's token read Nile's product under Delta's header and confirm
a 404. This is the week's claim in one command a reviewer can repeat.

- [ ] **Step 3: Prove the boundary rules still bite**

Temporarily add a `packages/domain` → `apps/api` import, run `pnpm turbo run lint`, confirm it fails
with `boundaries/element-types`, then revert.

- [ ] **Step 4: Push and open the pull request**

```bash
git fetch origin --prune
git push -u origin week-02-tenancy-catalog
gh pr create --base main --head week-02-tenancy-catalog \
  --title "Week 2 — tenancy and catalog" \
  --body-file "$COMMANDCODE_SCRATCHPAD/week-02-pr.md"
```

Expected: CI green on the pull request. Tag `w02-tenancy-catalog` on `main` after the merge, not
before — the tag records what shipped.

---

## Defects found during execution, and how each was resolved

Written after the fact, because every one of these was found by *running* the plan rather than
reading it. A later reader re-running a task should apply the correction here rather than the
snippet in the task body.

| # | Where | Defect | Resolution |
|---|---|---|---|
| 1 | Task 1 Step 2 | The `tsconfig.build.json` snippet omits `outDir`. `@app/config/tsconfig/base.json` sets none, so it emits `.js`/`.d.ts` beside the sources and never creates `dist/`, while `package.json` declares `main: ./dist/src/index.js`. | Use `packages/contracts/tsconfig.build.json` verbatim: `module: commonjs`, `moduleResolution: node`, `outDir: dist`, `rootDir: "."`, `composite: false`, `declaration: true`, `declarationMap: true`. |
| 2 | Tasks 1 and 3 | The plan schedules `MemberRoles`/`MemberRole` in Task 3, but Task 1's `TenantContext.role` is typed `MemberRole` — so Task 1 cannot compile, let alone pass, without them. | Pulled `MemberRoles`/`MemberRole` into Task 1. Task 3 adds only the remaining value sets, and must not re-add these. |
| 3 | Tasks 2 and 3 | The mandated tests import the const-object vocabulary (`PasswordPolicyViolations`, `RefreshTokenVerdicts`, `ProductTransitionOutcomes`) from the logic module, but the mandated implementations only import it. Typecheck fails with TS2724. | Each logic module re-exports its interface file (`export * from './<subject>.interface'`). The `src/index.ts` entry re-exports both, which is safe here because both paths resolve to the same declaration. |
| 4 | Task 10 | No task added `@app/domain` to `apps/api`'s dependencies, though Tasks 10, 11 and 13 import it. `import/no-extraneous-dependencies` is on for apps, so lint fails. | Task 10 gained a Step 0: `pnpm --filter api add @app/domain`. |
| 5 | Task 10 | `OrganizationService.addMember` checked `canManageMembership` and threw `ConflictException`, but the spec's error table says an owner-only action refused for a member is `403 FORBIDDEN` — and Task 11's `RolesGuard` already enforces it. | Removed. The `RolesGuard` is the single enforcement point; two answers to one authorization question drift. |
| 6 | Task 11 Step 6 | The step said to add `AuthModule` to `AppModule.imports`, which Task 8 Step 5 already did — a duplicate import. | Task 11 adds only `OrganizationsModule` and `SecurityModule`. |
| 7 | §7, error semantics | The table has no row for publishing an unpriced product, though Task 13 implements it. | `409 CONFLICT`, the same "current state does not permit this" class as an illegal transition. |
| 8 | Task 3 Step 4 | The brief expects `19 passed`; the specs it mandates contain 20 cases. | 20 is correct — the brief's arithmetic was wrong, not the tests. |

**A general lesson worth keeping.** Defects 1, 2, 3 and 8 were not design errors. They were the plan
being *internally inconsistent* — a snippet that does not run, a value set consumed a task before it
exists, a test that cannot import what it needs, a count that does not match its own list. A plan
containing complete code is checked for design and not re-checked for consistency, and that is
exactly where it breaks. Whoever writes Week 3's plan should run the same scan against it: for every
pair of tasks sharing a file or an interface, does each consume only what an earlier task produces,
and does each task's own text agree with itself?


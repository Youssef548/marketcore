---
name: nestjs-code-conventions
description: Organise TypeScript and NestJS code the way this codebase expects — literal values in a shared constants file, const-object enums with derived types, interfaces in their own files, a repository layer between services and Prisma, and builders instead of repeated conditionals. Use when writing, reviewing or refactoring any controller, service, repository, DTO, module, middleware, logger or test fixture.
---

# NestJS / TypeScript code conventions

These rules come from a review that rejected a first implementation for seven specific reasons. They
are not stylistic preferences — each one was raised as a defect. Apply all seven before opening a PR.

**The short version:** no literals in logic, values are enums, types live in their own files, a
feature module groups `dto/`, `repositories/` and `interfaces/` into folders, Prisma is behind a
repository, build objects instead of validating them, and share anything you can see being used
twice.

---

## Rule 1 — No literal values in logic

Every string or number that carries meaning gets a name and one definition. A value appearing
inline in logic is a defect even if it appears only once, because the second appearance is
invisible until it drifts.

**Wrong**

```ts
export const requestIdMiddleware: HttpMiddleware = (req, res, next) => {
  const incoming = req.headers['x-request-id'];              // literal header name
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId = candidate && candidate.length <= 64      // literal limit
    ? candidate
    : `req_${randomUUID()}`;
  ...
};
```

**Right**

```ts
// constants.ts
export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_ID_MAX_LENGTH = 64;
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

// the middleware imports them and holds logic only
const requestId = isAcceptable(candidate) ? candidate : `req_${randomUUID()}`;
```

**Where a constant lives.** Wire-level values that an API *and* a client must agree on
(header names, enum values) go in the contracts package — it is the single source of truth for the
wire format. Values only the implementation cares about (buffer limits, fallbacks, log event names)
go in a `constants.ts` beside that package's code.

---

## Rule 2 — Values are const-object enums with a derived type

Do not use bare union types or repeated string literals for a closed set. Use a `const` object `as
const` and derive the type from it, so the value and the type cannot drift.

```ts
export const DependencyStates = { UP: 'up', DOWN: 'down' } as const;
export type DependencyState = (typeof DependencyStates)[keyof typeof DependencyStates];

export const READINESS_HTTP_STATUS: Record<ReadinessStatus, number> = {
  [ReadinessStatuses.OK]: 200,
  [ReadinessStatuses.DEGRADED]: 503,
};
```

This repository already had the precedent — `ErrorCodes` in the contracts package — so follow that
shape rather than inventing a second one. Derive zod enums from the same object:

```ts
export const ReadinessChecksSchema = z.object({ database: z.enum(wireValues(DependencyStates)) });
```

...and keep the "turn a const object into the tuple `z.enum` needs" helper shared, once, rather than
casting at every schema.

---

## Rule 3 — Types live in their own file; a feature module groups artifacts into folders

A file named for a behaviour holds **only** that behaviour. Types defined next to logic make the
logic hard to find and make the type impossible to import without pulling in the implementation.

In a **feature module** (`apps/api/src/<module>/`) that goes further: artifacts are grouped by
**type** into `dto/`, `repositories/` and `interfaces/`. Controllers, services, guards, decorators,
the module file and `constants.ts` stay at the module root. A `.dto.ts`, `.repository.ts` or
`.interface.ts` lying loose in a module root is the defect this rule exists to prevent — a module
whose shape is only visible by reading every filename has no shape.

**Wrong** — every artifact flat in the module root:

```
organizations/
  organization.dto.ts
  organization.repository.ts
  membership.repository.ts
  organization-write.interface.ts
  membership.interface.ts
  organization.controller.ts
  organization.service.ts
  organization.constants.ts
  organizations.module.ts
```

**Right** — one folder per artifact type, logic at the root:

```
organizations/
  dto/
    organization.dto.ts
  repositories/
    organization.repository.ts
    membership.repository.ts
  interfaces/
    organization-write.interface.ts    ← one type per file
    membership.interface.ts
  organization.controller.ts
  organization.service.ts
  organization.constants.ts
  organizations.module.ts
```

- `interfaces/` holds every `*.interface.ts`, one type per file, named `<subject>.interface.ts`. A
  port and its adapter are not an exception: the port goes in `interfaces/`, the adapter at the root.
- A capability folder holding a single service is deleted, not nested — `auth/tokens/token.service.ts`
  becomes `auth/token.service.ts`, not `auth/tokens/token.service.ts`.
- Cross-cutting code that belongs to **no** module — shared request types, app-level constants —
  lives in `src/common/{interfaces,constants}/`, not in the module that happens to use it first. It is
  not a place to park a feature; a `common/` file that knows about one module's domain is misfiled.

In a **package** (`packages/*`) a type still lives in `<subject>.interface.ts` beside the logic it
serves and is re-exported from the package entry point — the folder layout above is a feature-module
rule, not a package rule.

**Careful:** if `constants.ts` and an interface file both export the same name and the package entry
does `export * from` both, TypeScript fails with a duplicate-export error. Export each name from
exactly one place.

---

## Rule 4 — Repository layer: services never touch Prisma

The layering is `controller → service → repository → Prisma`. A service that imports `PrismaService`
is a defect, even for one query.

**Wrong**

```ts
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}   // service reaching for the client

  async checkReadiness(): Promise<Readiness> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', checks: { database: 'up' } };
    } catch {
      return { status: 'degraded', checks: { database: 'down' } };
    }
  }
}
```

**Right**

```ts
// health.repository.ts — owns every Prisma call for this module
@Injectable()
export class HealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async databaseState(): Promise<DependencyState> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return DependencyStates.UP;
    } catch {
      return DependencyStates.DOWN;
    }
  }
}

// health.service.ts — orchestrates, never queries
@Injectable()
export class HealthService {
  constructor(private readonly healthRepository: HealthRepository) {}

  async checkReadiness(): Promise<Readiness> {
    return buildReadiness({ database: await this.healthRepository.databaseState() });
  }
}
```

Register repositories **before** services in the module's `providers`, and return domain values from
the repository rather than booleans or raw rows.

A repository returning a typed state (`DependencyState`) instead of `boolean` is what lets the
failure branch be tested with a stubbed client, which is the only way to reach it — you cannot stop
PostgreSQL mid-test.

---

## Rule 5 — Build objects, don't validate them into shape

If two fields must agree, derive one from the other at construction. A builder makes the invalid
state unrepresentable; a conditional or a `.refine()` only catches it afterwards.

**Wrong**

```ts
// status is passed in, then a conditional patches up the consequence
async ready(@Res({ passthrough: true }) res: Response) {
  const readiness = await this.healthService.checkReadiness();
  if (readiness.status !== 'ok') {
    res.status(503);          // will be repeated on every endpoint that reports a verdict
  }
  return readiness;
}
```

**Right**

```ts
// contracts — status is derived, so it cannot contradict the checks
export function buildReadiness(checks: ReadinessChecks): Readiness {
  return { status: allUp(checks) ? ReadinessStatuses.OK : ReadinessStatuses.DEGRADED, checks };
}

// contracts — one mapping, not a conditional per caller
export function httpStatusForReadiness(readiness: Readiness): number {
  return READINESS_HTTP_STATUS[readiness.status];
}

// controller — one code path
const readiness = await this.healthService.checkReadiness();
res.status(httpStatusForReadiness(readiness));
return readiness;
```

Setting the status unconditionally (including the success case) is what removes the branch. Keep the
schema's cross-field check as well — construction guarantees our payloads, the schema keeps the wire
contract honest for anything that parses one.

---

## Rule 6 — Extract duplication the moment you can see it coming

The review phrase to act on is *"this will be duplicated a lot"*. Extract at the second sighting, not
the third.

Signals to stop and extract:

- The same conditional, mapping or lookup appears in a second caller.
- A table of allowed values is written out twice.
- A cast or helper (`wireValues`, a status mapping) would be repeated per module.
- A test builds the same fixture object more than once.

---

## Rule 7 — Test fixtures are shared too

A test that hand-writes a payload is a copy of the contract that silently goes stale. Put fixtures
in `test/support/fixtures.ts` and build them from the shared enums.

```ts
// packages/api-client/test/support/fixtures.ts
export function errorEnvelope(overrides: Partial<ErrorEnvelope['error']> = {}): ErrorEnvelope {
  return { error: { ...NOT_FOUND, requestId: REQUEST_ID_FIXTURE, ...overrides } };
}

/** Deliberately invalid — the previous contract's shape, used to prove drift is rejected. */
export function errorEnvelopeWithoutRequestId(): ErrorEnvelope {
  return { error: { ...NOT_FOUND } } as ErrorEnvelope;
}
```

When a fixture must be invalid on purpose, say so in a comment and cast deliberately — do not build
it through the valid path.

---

## Before you commit

```bash
# 1. literals that should be named values
grep -rnE "'(ok|degraded|up|down|unknown|[a-z]+\.[a-z.]+)'" packages/*/src apps/*/src --include='*.ts' \
  | grep -v 'constants.ts' | grep -v '\.spec\.ts'

# 2. services touching Prisma directly
grep -rn "PrismaService" apps/*/src --include='*.service.ts'

# 3. a feature module's dto/repository/interface files must sit in their folder
for m in $(find apps/api/src -name '*.module.ts'); do
  find "$(dirname "$m")" -maxdepth 1 -type f \
    \( -name '*.dto.ts' -o -name '*.repository.ts' -o -name '*.interface.ts' \)
done

# 4. interfaces and types declared beside logic rather than in their own file
grep -rln "export interface\|export type" packages/*/src apps/*/src --include='*.ts' \
  | grep -vE '\.(interface|types|dto|schema)\.ts$' | grep -v 'constants.ts'

# 5. the suite and the architecture rules
pnpm turbo run lint typecheck test build
```

**Zero hits on 1–4**, or a written reason why each remaining hit is correct.

## Edge cases

- **A type used by exactly one file still gets its own file** if it is part of that module's public
  shape, because the second consumer is the one you cannot see.
- **Enums over union types even for one value.** `{ OK: 'ok' }` with no second member still gets a
  const object, so adding a member later is one line rather than a type change everywhere.
- **Do not move a framework type into its own file** (`Request`, `Response` from express). Rule 3 is
  about *our* types.
- **Constants used by one package only should not go in contracts.** Putting implementation details
  in the wire-format package makes the shared surface lie about what is shared.

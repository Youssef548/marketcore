---
name: nestjs-code-conventions
description: Structure NestJS feature modules the way this codebase expects — dto/, repositories/ and interfaces/ folders, and a repository between every service and Prisma. Use when adding or reviewing a NestJS module, controller, service, repository or DTO in apps/api.
---

# NestJS module conventions

Two rules that apply only to `apps/api`'s NestJS modules, each raised in review as a defect. The
rules for every TypeScript file — named values, const-object enums, named shapes, types in
`*.interface.ts`, shared code, builders, fixtures — are in `typescript-code-conventions`; apply both
skills to API work.

---

## Rule 1 — A feature module groups its artifacts into folders

In a **feature module** (`apps/api/src/<module>/`), artifacts are grouped by **type** into `dto/`, `repositories/` and `interfaces/`. Controllers, services, guards, decorators,
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

---

## Rule 2 — Repository layer: services never touch Prisma

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

---

## Before you commit

```bash
# services touching Prisma directly
grep -rn "PrismaService" apps/*/src --include='*.service.ts'

# a feature module's dto/repository/interface files must sit in their folder
for m in $(find apps/api/src -name '*.module.ts'); do
  find "$(dirname "$m")" -maxdepth 1 -type f \
    \( -name '*.dto.ts' -o -name '*.repository.ts' -o -name '*.interface.ts' \)
done
```

**Done when** both print nothing, and `typescript-code-conventions`' checks pass.

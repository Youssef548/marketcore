# Backlog

Work that is agreed but not scheduled into a phase. An item leaves this file when a plan picks it up;
the plan cites its ID.

---

## BL-001 — Shared types live in their own files, not in implementation files

**Raised:** 2026-10-16 · **Priority:** Should · **Size:** M · **Status:** done — the BL-001 PR stack

### Problem

`apps/api` already keeps a feature's types in an `interfaces/` folder (AGENTS.md, "Repository
Rules"). Nothing else does. In `apps/web`, `packages/ui` and `packages/api-client`, exported types
and interfaces are declared inline in the component or module that happens to use them first, for
example `packages/ui/src/input.tsx`:

```ts
export type InputSize = 'lg' | 'md' | 'sm';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  // …
}
```

A reader looking for a shape has to know which implementation file owns it, and every importer
reaches into that implementation file to get it. Separate type files make the shapes findable in one
place and keep implementation files about behaviour.

### Rule

An **exported, hand-written** `interface` or `type` lives in an `interfaces/` folder next to the code
that uses it, one concern per file, named `<concern>.interface.ts` — the `apps/api` convention,
extended to every app and package.

**Two exceptions, both deliberate:**

1. **A type derived from a value in the same file stays with that value**:
   `z.infer<typeof XSchema>`, `(typeof X)[keyof typeof X]`, `(typeof X)[number]`. Moving it splits a
   type from its single source, and in `packages/contracts` the schema *is* the source of truth for
   the wire format.
2. **A private type** (not exported, used in one file) stays in that file.

### Scope — found 2026-10-16

23 declarations move (tests excluded):

| Package | File | Declarations |
|---|---|---|
| `packages/ui` | `src/input.tsx` | `InputSize`, `InputProps` |
| | `src/button.tsx` | `ButtonVariant`, `ButtonSize`, `ButtonProps` |
| | `src/field.tsx` | `FieldProps` |
| | `src/alert.tsx` | `AlertVariant`, `AlertProps` |
| `apps/web` | `src/lib/session/session.ts` | `SessionStore`, `SessionApi`, `SessionDeps` |
| | `src/lib/session/client.tsx` | `SessionState`, `ReadySession` |
| | `src/lib/session/refresh.ts` | `ExchangeRefreshToken`, `RefreshCoordinator` |
| | `src/lib/session/cookies.ts` | `SessionCookieAttributes` |
| | `src/lib/session/routing.ts` | `RoutingDecision` |
| | `src/lib/http/envelope.ts` | `FailureResponse` |
| | `src/lib/http/body.ts` | `BodyResult` |
| `packages/api-client` | `src/client.ts` | `Schema`, `ApiClientOptions`, `RequestOptions`, `ApiClient` |

Stay where they are: 32 derived types (27 in `packages/contracts`, `Env` and `LogLevelName` in
`packages/runtime`, `SessionView`, `SelectOrganizationRequest` and `Theme` in `apps/web`) and 3 private
ones (`State` on the products page, `SessionContextValue`, `CookieJar`). `apps/api` and
`packages/domain` already comply.

Reproduce the list: grep `^(export )?(interface|type) [A-Z]` over `apps/*/src` and `packages/*/src`,
excluding tests, `interfaces/` and `*.interface.ts`, then drop `type X,` import lines.

### Done when

- The 23 declarations live in `interfaces/` files; package entry points (`packages/ui/src/index.ts`,
  `packages/api-client/src/index.ts`) still export the same names, so no importer outside the package
  changes.
- **Enforced, not remembered** — like the boundary rules: an ESLint `no-restricted-syntax` rule fails
  an exported `TSInterfaceDeclaration`, or an exported `TSTypeAliasDeclaration` whose annotation is a
  union, object literal or function type, in any file outside `interfaces/`. The rule has a fixture
  proving it fails, and a fixture proving a derived type passes.
- AGENTS.md and the README's Conventions state the rule for every app and package.
- `pnpm turbo run lint typecheck test build` green.

---

## BL-002 — Repeated UI goes to the design system, repeated logic to one helper

**Raised:** 2026-10-16 · **Priority:** Should · **Size:** M · **Status:** done — the BL-002 PR stack

### Problem

`packages/ui` (`@app/ui`, ADR 012) is the shared design system, but it exports five components —
`Alert`, `Button`, `Field`, `Input`, `Label`. Everything past them is rebuilt per page, so the same
classes and the same logic are copied between pages and drift apart.

### Found 2026-10-16 (on `split/07-web-reskin`)

| Repeated | Where | Moves to |
|---|---|---|
| Page heading — `text-2xl font-bold tracking-tight text-ink` | `(auth)/login/page.tsx`, `(auth)/register/page.tsx`, `(dash)/onboarding.tsx`, `(dash)/products/page.tsx` | `@app/ui`: `PageHeading` |
| Text link — `font-semibold text-action underline underline-offset-2` | login, register, onboarding | `@app/ui`: `TextLink` (framework-free; the app passes `next/link` in) |
| Card surface and the arrow icon — `AuthCard`, `ArrowIcon` | `apps/web/src/components/public-frame.tsx` | `@app/ui`: `Card`, an icon. `PublicFrame`, `CardBrand` and `BrandMark` name the app and stay in it. |
| First zod issue per field — `collectIssues` | defined in login, the same loop inlined in register | `apps/web/src/lib/forms/` — form logic, not design |
| Submit flow — `fetch`, `messageFrom`, "Could not reach the server" | login, register, `lib/session/client.tsx` | `apps/web/src/lib/forms/`: `postJson` and `SERVER_UNREACHABLE_MESSAGE` — a function, not the hook first proposed (see STATUS) |

### Rule

- **A visual pattern used by two pages is a `@app/ui` component**, with its tokens, its contrast pair in
  `tokens.spec.ts`, and its own test. `packages/ui` never imports `next` or `apps/*` (boundary rules).
- **Logic used by two pages is one helper in `apps/web/src/lib/`**, not a copy.
- Types for both follow BL-001.

### Done when

- No page repeats the heading or link classes; `git grep` for each finds only `packages/ui`.
- `collectIssues` and the submit flow exist once, with unit tests; login and register use them.
- `pnpm --filter @app/ui test`, `pnpm --filter web test`, the behavioural suite and
  `pnpm turbo run lint typecheck test build` are green, with no assertion weakened.

---

## BL-003 — Option sets are const-object enums; every shape has a name

**Raised:** 2026-10-16 · **Priority:** Should · **Size:** S · **Status:** done — the BL-003 PR stack

### Problem

Two ways a type was left unnamed, found reviewing `@app/ui`'s `Card`:

- **Option sets as literal unions.** `type CardVariant = 'panel' | 'raised'` exists only in the type
  checker: callers type `variant="raised"`, tests repeat the string, nothing at runtime can list the
  options. AGENTS.md already says to prefer const-object enums, and `@app/contracts` does
  (`ProductStatuses`). Seven in `@app/ui` and `apps/web`; `ButtonSize` and `InputSize` were the same
  three sizes declared twice.
- **Inline shapes.** `PolymorphicProps<E, { variant?: CardVariant; className?: string }>` and 13
  components typing their props inline (`Rail({ appName }: { appName: string })`).

### Rule

- An option set is `export const Xs = { A: 'a' } as const` with `type X = (typeof Xs)[keyof typeof Xs]`
  beside it. A union of keys as a type argument (`Omit<P, 'id' | 'invalid'>`) and a tagged union
  (`{ kind: 'ok' } | { kind: 'failed' }`) are not option sets and stay.
- A props or options object is a named interface. `{ children }` alone is React's `PropsWithChildren`.

### Done when

Lint fails a literal union and an inline object type, in implementation and interface files alike,
with fixtures proving each fires and each exception passes.


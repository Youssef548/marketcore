---
name: typescript-code-conventions
description: Write TypeScript the way this codebase expects — every value and every shape named, option sets as const-object enums, types in *.interface.ts files, UI shared through @app/ui and logic through one helper. Use when writing, reviewing or refactoring TypeScript in any app or package — a component, its props, a hook, a helper, a constant, a type, or a test.
---

# TypeScript code conventions

Every rule here was raised in review as a defect, not a preference. The leading word is **named**:
every value, option set and shape has one name and one definition, and everything used twice is
**shared**. Apply all seven before opening a PR. NestJS modules add two rules of their own in
`nestjs-code-conventions`.

---

## Rule 1 — Name every value

A string or number that carries meaning gets a name and one definition. A literal inline in logic
is a defect even used once, because the second use is invisible until it drifts.

```ts
// constants.ts
export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_ID_MAX_LENGTH = 64;
```

**Where it lives.** A wire-level value both the API and a client must agree on (a header, an enum
value) goes in `packages/contracts`. A value only one package uses goes in a `constants.ts` beside
that package's code.

## Rule 2 — Option sets are const-object enums

A closed set is a `const` object `as const`, its type derived beside it, and every caller passes the
member — `variant={CardVariants.RAISED}`, `size={ControlSizes.LG}`.

```ts
export const CardVariants = { PANEL: 'panel', RAISED: 'raised' } as const;
export type CardVariant = (typeof CardVariants)[keyof typeof CardVariants];

const variants: Record<CardVariant, string> = {
  [CardVariants.PANEL]: 'rounded-xl …',
  [CardVariants.RAISED]: 'rounded-[18px] … shadow-sm',
};
```

Precedent: `ProductStatuses` in `@app/contracts`, `ControlSizes` in `@app/ui`. One value still gets a
const object, so adding the second is one line. Two sets that must stay equal are one set —
`ControlSizes` serves Button and Input. Not option sets, and written as unions: the keys passed to
`Omit<P, 'id' | 'invalid'>`, and a tagged union (`{ kind: 'ok' } | { kind: 'failed' }`).

## Rule 3 — Name every shape

A props or options object is a named interface. `{ children }` alone is React's
`PropsWithChildren`.

```ts
// interfaces/rail.interface.ts
export interface RailProps {
  appName: string;
}

// rail.tsx
export function Rail({ appName }: RailProps) { … }
```

The same goes for a shape passed as a type argument: `PolymorphicProps<E, CardOwnProps>`, with
`CardOwnProps` declared beside it.

## Rule 4 — Types live in `*.interface.ts`

An exported, hand-written interface or type lives in a `<concern>.interface.ts` file, imported where
it is used — in an `interfaces/` folder beside the code in an app or `packages/ui`, or beside its code
as `packages/domain` and `packages/runtime` keep them. A package's entry point re-exports it.

Two shapes stay where they are: a type **derived** from a value beside it (`z.infer<typeof Schema>`,
`(typeof X)[keyof typeof X]`), so the type cannot drift from its source; and an **unexported** type,
which belongs to its file — still named (Rule 3).

If a `constants.ts` and an interface file both export one name and the entry point does
`export * from` both, TypeScript fails with a duplicate export: export each name from one place.

## Rule 5 — Shared at the second sighting

Extract the moment something is used twice — the review phrase is *"this will be duplicated a lot"*.

- **A visual pattern** — a class string, a surface, an icon — becomes an `@app/ui` component with its
  props in `interfaces/` and its own test. `@app/ui` imports neither `next` nor an app, so a link
  component takes the router's link as `as` (`<TextLink as={Link} href="/login">`).
- **Logic** — a request, a mapping, an error read — becomes one helper in `apps/web/src/lib/`
  (`lib/forms/post-json.ts`) or the owning package.
- **A test fixture** built twice moves to `test/support/fixtures.ts`, built from the shared enums. A
  fixture that is invalid on purpose says so in a comment and casts deliberately.

## Rule 6 — Build objects, don't validate them into shape

When two fields must agree, derive one from the other at construction, so the invalid state cannot
be built; a conditional or `.refine()` only catches it afterwards.

```ts
export function buildReadiness(checks: ReadinessChecks): Readiness {
  return { status: allUp(checks) ? ReadinessStatuses.OK : ReadinessStatuses.DEGRADED, checks };
}
```

Keep the schema's cross-field check too: construction guarantees our payloads, the schema guards
anything that parses one.

## Rule 7 — Our types, not the framework's

Rules 3 and 4 are about our shapes. `Request`, `Response`, `NextRequest`, React's own prop types stay
imported from where they live.

---

## Before you commit

```bash
# 1. lint enforces Rules 2–4: literal unions, inline shapes, exported types outside *.interface.ts
pnpm turbo run lint --force --continue

# 2. literals that should be named values (Rule 1) — PCRE, since git grep -E has no \s or \b
git ls-files 'apps/*/src/*' 'packages/*/src/*' | grep -vE '\.(test|spec)\.|constants\.ts$' \
  | xargs perl -ne "print \"\$ARGV:\$.: \$_\" if /=\s*'[a-z][\w-]*'/ && !/typeof/; close ARGV if eof"

# 3. the whole suite
pnpm turbo run lint typecheck test build
```

**Done when** checks 1 and 3 are green and every hit on check 2 *in the files you changed* is named or
carries a written reason. Older hits elsewhere are backlog BL-004, not yours to leave worse.

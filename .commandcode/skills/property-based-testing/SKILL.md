---
name: property-based-testing
description: Use when a rule must hold for an entire input class rather than one example — validation, parsing, round-trips, entropy, boundary conditions — or when asked to "cover all cases" and example-based tests cannot.
---

# Property-based testing

**Core principle:** an example test says "these three inputs worked". A property test says "for all
inputs satisfying this generator, this invariant holds" — and when it fails, it hands you a shrunken
counterexample you did not think of.

You cannot enumerate all cases. You can state an invariant and let the generator search.

---

## When to use

- Validation with a boundary (min/max length, allowed charset, numeric range).
- Round-trips and idempotence (parse/serialize, hash/verify).
- Uniqueness and entropy claims ("tokens never collide").
- A rule with a matching oracle you can express more simply than the implementation.
- Someone asks for "all cases" or "full coverage" of an input space.

**When not to use:** business flows with a fixed shape (use e2e), concurrency (use integration with a
real DB), or when you cannot state an invariant — if you can only list examples, you have an example
test.

---

## Setup in this repo

`fast-check` runs inside the existing Vitest suites. No new runner.

```bash
pnpm --filter @app/domain add -D fast-check
```

Name the file `*.property.spec.ts` so it is obvious which layer a failure came from, and keep it
beside the code it constrains (`packages/domain/src/slug.property.spec.ts`).

```ts
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

describe('slug (property)', () => {
  it('every generated slug round-trips through the schema', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/), (raw) => {
        expect(SlugSchema.parse(raw)).toBe(raw);
      }),
    );
  });
});
```

---

## The five patterns worth knowing

**1. Round-trip / idempotence.** `parse(serialize(parse(x))) === parse(x)` for every contract. This is
what catches a schema and its type drifting apart.

**2. Oracle comparison.** Express the rule twice — once as the implementation, once as a simple,
obviously-correct predicate — and assert they agree on arbitrary input:

```ts
const oracle = (s: string) =>
  s.length > 0 && s.length <= REQUEST_ID_MAX_LENGTH && REQUEST_ID_PATTERN.test(s);

it('accept/reject classification matches the oracle', () => {
  fc.assert(
    fc.property(fc.string(), (candidate) => {
      expect(isAcceptableRequestId(candidate)).toBe(oracle(candidate));
    }),
  );
});
```

**3. Boundary enumeration.** Do not hope the generator finds the edge — drive it:

```ts
fc.assert(
  fc.property(fc.integer({ min: 0, max: 200 }), (n) => {
    const candidate = 'a'.repeat(n);
    expect(PasswordSchema.safeParse(candidate).success).toBe(n >= PASSWORD_MIN_LENGTH);
  }),
);
```

**4. Invariant under transformation.** Shuffling a list, adding a member, re-ordering — the rule must
not change. Good for role and permission rules.

**5. No work before rejection.** The highest-value property in this codebase: prove a rejection
happens *before* an expensive operation.

```ts
it('rejects a short password without ever calling the hasher', () => {
  const hasher = { hash: vi.fn() };
  fc.assert(
    fc.property(fc.string({ maxLength: PASSWORD_MIN_LENGTH - 1 }), (tooShort) => {
      register({ password: tooShort }, hasher);
      expect(hasher.hash).not.toHaveBeenCalled();
    }),
  );
});
```

An example test can only show this for one short password; the property shows it for the whole class,
which is the actual security and CPU claim.

---

## Reading a failure

`fast-check` shrinks automatically. Read the counterexample it prints — that input *is* the bug, and
it belongs in the example suite afterwards as a regression test.

```text
Counterexample: ["aaaaaaaa"]
```

Do not "fix" a failure by tightening the generator. If the generator produced a legal input the code
rejects, the code is wrong.

---

## Pitfalls

| Pitfall | Fix |
|---|---|
| Generators so wide they never hit the interesting region | Constrain them (`fc.stringMatching`, `fc.integer({ min, max })`), or drive the boundary explicitly (pattern 3). |
| Asserting on the implementation's internals | Assert on the observable rule. Properties describe the contract, not the code. |
| Non-deterministic tests | Pin the seed (`fc.assert(..., { seed: 42 })`) while iterating; let it randomise in CI. |
| Property suite that is slow | Lower `numRuns` for wide generators, raise it for cheap pure functions. |
| Duplicating the example suite | Keep example tests for named, readable cases; properties for the input class. Both. |
| A property that cannot fail | Delete it — same rule as any other test. |

---

## Red flags — STOP

- The generator was narrowed to make the test pass.
- The property restates the implementation line by line.
- The test asserts a `mock` was called rather than that a rule held.
- You cannot say, in one sentence, what invariant the property proves.

**All of these mean: it is not a property test, it is a slow example test.**

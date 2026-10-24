# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/domain-model.md`**: the invariants (INV-n) with how each is observed, and the entity table the Prisma schema is transcribed from.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context: the apps and packages share one domain (a modular monolith, ADR-0001).

```
/
├── GLOSSARY.md
├── docs/
│   ├── domain-model.md
│   └── adr/
│       ├── 0001-modular-monolith-with-worker.md
│       └── 002-postgres-row-locking-for-inventory.md
├── apps/
└── packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md` and `docs/domain-model.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-002 (PostgreSQL row locks at checkout), but worth reopening because…_

# Security audit

How this repo runs a security review, and where the skill that does it comes from.

## The skill

`.agents/skills/security-audit` is [Cloudflare's `security-audit`](https://github.com/cloudflare/security-audit-skill), MIT
licensed. It is **not** committed — like every other installed skill, it stays machine-local (`.git/info/exclude` keeps
`.agents/skills/*/` out of the tree).

```
npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit
```

Reproduced runs today were recorded against upstream commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`. Record the commit
you installed here when it changes, because findings are only comparable when the prompts and validators match.

## Modes

- **Guidance mode** — a security question, a focused review, or triage of one finding. No output directory, no phase run.
- **Full audit mode** — an explicit request to audit or pen-test, or a request for report artifacts. Runs all six phases
  and writes `run-metadata.json`, `architecture.md`, `coverage-ledger.json`, `findings.json`, `REPORT.md`,
  `FINDINGS-DETAIL.md` and `NEEDS-VALIDATION.md`.

If the request could be either, ask once before creating files.

## Where artifacts go

Outside the repository, by default `~/security-audit-skill/<repo-name>/run-<N>`. Two reasons: the reports describe
unfixed defects and this repo is public, and a report inside the tree becomes a merge conflict on every later run.
The skill writes into the target only when the chosen directory is verifiably ignored.

## The evidence bar

A `confirmed` record needs all four: a full source trace to a sink, a bounded local reproduction, a stated crossing of a
real trust boundary, and a fresh verifier who tried to disprove it. Everything short of that is `needs_validation` with
its exact blocker and no severity. Deployment, proxy, provider and browser facts that are not in this repo are never
assumed in either direction — they are `needs_validation`.

This is the same rule as the verification ladder in `AGENTS.md`: use the lowest layer that can falsify the claim, and
do not promote a claim that no layer reached.

## Running it

```
security audit this codebase
```

Both validators must pass before any coverage claim is made:

```
node .agents/skills/security-audit/validate-findings.cjs <output-dir>/findings.json
node .agents/skills/security-audit/validate-coverage-ledger.cjs <output-dir>/coverage-ledger.json
```

## Runs

| Run | Profile | Scope | Result |
| --- | --- | --- | --- |
| 1 | `quick` | `apps/api`, `apps/web`, `apps/worker`, `packages/{contracts,domain,database}` | 8 confirmed (2 medium, 4 low, 2 informational), 3 needs-validation, 1 rejected. Artifacts outside the tree. |

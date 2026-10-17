---
name: phase-loop
description: The repeatable loop for delivering a MarketCore phase end to end with no human in the loop — slice the phase into ≤15-file PRs, TDD each slice at the lowest layer that can falsify its claim, gate the slice on its own branch, prove each new gate can actually fail, review the diff with the reviewer agent before opening the PR, then run the phase's exit gate and record the evidence in STATUS.md. Use when asked to execute a phase of the roadmap, work a backlog item task-by-task, "loop on the phases", or run a plan in docs/superpowers/plans/.
---

# The phase loop

**Core principle:** a phase is not done when the code is written. It is done when the phase's own exit
gate runs green, a reviewer who did not write the code has read the diff, and a person who was not in
the session can rerun every proof from the STATUS entry.

One turn of the loop = **one slice**. Never mix two topics in a slice, and never start the next slice
with an unreviewed Critical open.

## The loop

```
for each phase in order:
  0. Preflight        read the authority, name the claim, note the global constraints
  1. Slice            split the phase into ≤15-file PRs, ordered so each builds alone
  2. for each slice:
       a. RED         write the failing test at the lowest layer that can falsify the claim
       b. verify RED  watch it fail for the right reason (not a typo, not an import error you meant)
       c. GREEN       implement to the conventions; watch it pass
       d. GATE        pnpm turbo run lint typecheck test build — on the slice branch alone
       e. FALSIFY     prove the new gate can fail: break it, see red, restore
       f. COMMIT+PR   ≤15 files, proof table, "not proven / deferred", the exact commands
       g. REVIEW      dispatch the reviewer agent on the slice diff; act on Critical/Important
       h. MERGE       bottom-to-top, deleting the branch
  3. Phase gate       run the milestone's exit-gate command
  4. Mutation pass    stryker over the phase's domain band (fake-green, caught mechanically)
  5. Record           STATUS.md entry in the file's existing style
  6. Report           what is proven, what is not, every ruling and its cost if wrong
```

## 0. Preflight

Read, before any edit: `AGENTS.md`, the phase's plan in `docs/superpowers/plans/`, the spec it argues
from in `docs/superpowers/specs/`, its ADRs, and `docs/superpowers/STATUS.md`. Then write down, in one
sentence each: the **claim** (what becomes true), its exit-gate command, and its non-goals. If you
cannot name the exit-gate command, the phase has no gate and you are not ready to start.

A repo rule beats any rule in this skill. A change to scope after a baseline is a numbered change
request, never a silent addition.

## 1. Slice

Use `small-stacked-prs`: ≤15 files, one topic, each slice passes the repo's checks on its own. Order
shared code before its consumers, and enforcement (a lint rule, a gate) last, because it can only pass
once everything complies. Branch off an up-to-date `main`, or stack on the slice the work depends on.

## 2. Per slice

**a–c. Test first, at the right layer.** Name the claim, then open
`marketcore-testing-ladder` and pick the lowest layer that can *falsify* it. Unit and property for
pure rules (2 if the claim is about a class of inputs); integration against real Postgres for a
constraint or a race; in-process e2e for status codes, guards and envelopes; behavioural for
anything keyed on the process, socket, TLS, proxy or cookie flags. The Iron Law applies
(`test-driven-development`): no production code without a test you watched fail.

**d. Gate the slice alone.** `pnpm turbo run lint typecheck test build` → **33/33**, 0 failed. Run
it on the slice branch, not on the stack top: a slice that only passes with its neighbours is not a
slice. The database must be up (`docker compose -f docker-compose.yml up -d --wait`) or the API
suites fail for a reason that is not the code.

**e. Falsify the gate.** For a new lint rule, guard, constraint or assertion: break the thing it
protects, watch the test go red, restore, watch it go green. A test you have never seen fail is a
test you do not know. This is the single highest-value step in the loop — it is what caught two
"green" lint gates in this repo that were silent in every real package, and a colour assertion that
had been passing on garbage.

**f. Commit, push, open the PR.** Body in the `small-stacked-prs` shape: what changed and why, a
**Proof** table (command + real result), **Not proven / deferred**, and the merge order. Write the
claim in the reader's terms, not the code's.

**g. Review, before merge.** Dispatch the **`reviewer` agent** (`requesting-code-review`'s
`code-reviewer.md` is its template) with the slice's `BASE..HEAD`, the plan task, and the constraints
that bind it. Point it at correctness, security, behavioural regressions, **missing tests and
fake-green assertions**, and broken boundaries. It is read-only and does not dispatch subagents.

Handle its findings per `receiving-code-review`: verify each against the codebase before implementing,
fix Critical/Important, park Minor in the PR with a reason, and push back with technical reasoning
when it is wrong. **Never weaken a test to satisfy a reviewer, and never accept a finding you have
not understood.** A finding that conflicts with the plan's text is a ruling you make and record, not
a silent either-way.

**h. Merge bottom-to-top.** Deleting a merged branch retargets the next PR to `main`. Confirm with
`git merge-base --is-ancestor origin/<lower> origin/main` before closing a lower PR by hand.

## 3. The phase exit gate

Every phase's plan names it. Run it as **one command**, paste the real output, and do not call the
phase done on anything less. Phase 4's M1 gate, for example:

```bash
docker compose -f docker-compose.yml up -d --wait
pnpm turbo run lint typecheck test build
pnpm --filter api test:concurrency      # the stock-1 race, ×20
pnpm --filter worker test:integration   # auto-cancel restores exactly once
docker compose -f docker-compose.e2e.yml up -d --build --wait
pnpm --filter e2e test:behavioural
docker compose -f docker-compose.e2e.yml down -v
```

A gate that cannot be run is not a gate — say so and name what is missing rather than reporting the
phase green off the slices.

## 4. Mutation pass

`stryker` is configured for the phase's domain band (`pnpm --filter @app/<pkg> test:mutation`). A
surviving mutant is an assertion that cannot fail: the fake-green detector. Record the score and any
survivor worth a test rather than raising a threshold to hide it.

## 5. Record

Add the phase's entry to `docs/superpowers/STATUS.md` in the file's existing style: the claim, a
**Proven** table (check · command · result), **Delivered**, **Findings**, **Deviations**, **Not
proven / deferred**. The test of a good entry: someone who did not watch the work can rerun every
proof from it. Mark backlog items done; add new ones for what you found.

## What still needs a human — say so rather than pretending

- **Product intent.** Tests prove the code matches the spec; they cannot prove the spec is what was
  wanted. This is the D91 class of decision.
- **Visual judgement.** There is no visual-regression baseline (deliberately). Assertions cover
  computed styles, contrast and luminance; "this looks wrong" is still an eye.
- **Ruling on a flake.** Measure the rate, never retry it into silence, and ask which of code or
  expectation is wrong.
- **Irreversible or shared-state actions** — merging, deploying, publishing — unless explicitly
  delegated.

## Red flags — stop the loop

- A slice over 15 files, or two topics in one slice.
- A test that passed the first time you ran it.
- A gate reported green from a different branch than the one being merged.
- An assertion weakened, or a mock added, to make something pass.
- A phase called done while its exit gate has never been run.
- A reviewer's Critical parked without a recorded ruling.

---
name: ship-task
description: Take a task from request to merged-ready pull requests the way this user works — read the repo's authority first, settle the user's decisions with options, build test-first to the code conventions, prove every claim with a command, record the evidence, and open small stacked PRs. Use when asked to implement, build, fix, refactor or "take" a task, backlog item, plan task, issue or ticket.
---

# Ship a task

The deliverable is **proof**, not code: a change is done when a runnable command shows it, and the PRs
say what is proven and what is not. Work the steps in order; each ends on its completion criterion.

## 1. Read the authority

Read, before any edit: `AGENTS.md` / `CLAUDE.md`, the repo's own skills (`.agents/skills`,
`.claude/skills`), and whatever the task names or the repo keeps as its record — a STATUS or evidence
log, the backlog, the matching spec, plan and ADRs. A repo rule beats any rule in these global skills.

**Done when** you can write the **claim** in one sentence (what becomes true), its acceptance checks,
and its non-goals — each traced to a line you read, not inferred.

## 2. Settle what is the user's to decide

Product scope, security, money, data shape, URLs people see, anything hard to reverse: ask, offering
2–4 concrete options with the recommended one first and its cost stated. Ask in one batch, not drip by
drip. A change to scope after a plan or baseline was approved is a numbered change request, never a
silent addition.

Everything else, decide yourself and **record** it: a numbered decision (`D<n>`, continuing the repo's
sequence) where the repo keeps them, or a line in the PR. When a new answer contradicts an earlier
decision, quote the earlier one and ask which wins.

**Done when** no open question blocks the claim, and every decision taken has a recorded home.

## 3. Slice before you build

Plan the PRs first with `small-stacked-prs`: at most 15 files each, one topic each, ordered so every
slice builds and passes on its own — shared code before its consumers, enforcement (a lint rule, a
gate) last, because it only passes once everything complies. Branch from an up-to-date `main`, or
stack on the PR the work depends on (`git-delivery-workflow` for identity and branch safety).

**Done when** each slice has a name, its files, and the check that will prove it.

## 4. Build test-first, to the conventions

For each slice: a failing test at the lowest layer that can falsify the claim (pure rule → unit;
database constraint or race → integration against the real database; status, guard, envelope → API
e2e; browser, cookie, proxy → a real-browser test), then the code, then green. Write the code to
`typescript-code-conventions` (and `nestjs-code-conventions` for NestJS modules) as you go — named
values, const-object enums, named shapes, types in `*.interface.ts`, shared at the second sighting.

A failing test is a question: decide whether the code or the expectation is wrong. Fix the one that is.

**Done when** the slice's tests are green and the repo's lint, typecheck and test commands pass for
the packages it touches.

## 5. Prove it

Run the real commands and keep their output. Three proofs beyond "tests pass":

- **A new gate fires.** For a new lint rule, guard or check: plant a probe the gate must catch, in the
  real package (not only a fixture), and see it caught; then revert the fix and see its test go red.
- **Behaviour held.** A refactor leaves the existing tests untouched and green; run the browser suite
  when markup or routing moved.
- **The whole repo.** The repo's full gate (for example `pnpm turbo run lint typecheck test build
  --force`), forced past any cache.

A flaky test is recorded with its observed rate, never retried into silence. A finding outside the
task — more of the same debt, a rule that never fired — becomes a backlog item, not a wider PR.

**Done when** every acceptance check from step 1 has a command and its real result.

## 6. Record the evidence

Where the repo keeps a STATUS or evidence log, add the entry in its existing style: the claim, a
**Proven** table (check · command · result), what was delivered, **Findings**, and **Not proven /
deferred**. Mark backlog items done; add new ones for what you found.

**Done when** someone who did not watch the work could rerun every proof from the entry.

## 7. Open the PRs

Push and open the stack with `small-stacked-prs`, then verify each PR's file count and base on
GitHub.

**Done when** every PR exists, is at most 15 files, targets the right base, and carries its proof.

## 8. Report

Name: the branches, the PRs, the files changed, each command with its real result, what is proven,
what is not or is deferred, and every deviation from the plan with the cost if that ruling is wrong.
Close by naming the next step and asking whether to take it.

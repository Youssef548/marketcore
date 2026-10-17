---
name: small-stacked-prs
description: Split work into small stacked pull requests — at most 15 files each, one topic each, each passing on its own, with a proof table and a stated merge order. Use when opening, splitting, stacking, retargeting or merging pull requests, or when a PR is too big to review.
---

# Small stacked PRs

A reviewer reads one **slice** at a time. A slice is at most **15 files** (GitHub's `changedFiles`),
holds one topic, and passes the repo's checks on its own. Slices form a **stack**: each PR's base is
the branch below it, the bottom one targets `main`. Branch, identity and force-push safety are
`git-delivery-workflow`; this skill is the shape of the PRs.

## Slicing

Order slices so each one builds alone:

1. Decisions and docs that the code cites.
2. Shared code — a design-system component, a helper, a package — before the code that uses it.
3. Consumers, one area per slice.
4. Generated or bulk assets in chunks of at most 15, each chunk a coherent group.
5. Enforcement last: a lint rule or gate passes only once everything complies.

When a slice would exceed 15, split by concern (two interface areas, two pages), never by an
arbitrary file count inside one concern. A test file that only changes an import still counts.

## Building the stack

Commit per slice on its own branch, each created from the one below:

```bash
git switch -c <topic>/01-<slice> main
# … commit slice 1 …
git switch -c <topic>/02-<slice>
# … commit slice 2 …
```

When the work already exists on one branch, rebuild the stack from its final state — check out each
slice's paths from the finished branch onto the next branch, `git rm` the deletions — then prove the
stack equals the original:

```bash
git diff --stat <finished-branch> <top-slice-branch>    # must print nothing
```

Prove each slice that changes shared code passes **alone**: switch to its branch and run the affected
packages' lint, typecheck and tests before pushing.

## Opening

```bash
git push -u origin <every slice branch>
gh pr create --base <branch below, or main> --head <slice branch> --title "[<Topic> n/N] type(scope): summary" --body "…"
```

**GitHub account.** Run `gh auth status`. If the active account cannot write to the repo but another
logged-in account owns it, pass that account's token for the one command —
`GH_TOKEN=$(gh auth token --user <owner>) gh pr create …` — and leave the active account unchanged.

**Body**, in this order:

- What changed and why, in the reader's terms, a paragraph or a short list.
- **Proof**: each command and its real result (`pnpm --filter web test` — 83 passed).
- **Not proven / deferred**, and any deviation from the plan.
- The stack and its merge order: `Merge in order: [<Topic> 1/N] → … → [<Topic> N/N], deleting each
  branch on merge.`
- The attribution footer the environment asks for.

**Done when** `gh pr view <n> --json changedFiles,baseRefName` shows every PR at ≤ 15 files on the
intended base.

## Merging

Bottom to top. Deleting a merged branch makes GitHub retarget the next PR to `main`.

Merging a PR higher in the stack also merges every commit beneath it, so the lower PRs are left with
nothing to compare and cannot be retargeted. Confirm with
`git merge-base --is-ancestor origin/<lower-branch> origin/main`, then close each with a note naming
the PR that carried it.

Never force-push the base of an open PR — it closes the PR permanently (`git-delivery-workflow`,
Rule 4).

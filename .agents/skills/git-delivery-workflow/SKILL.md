---
name: git-delivery-workflow
description: Deliver code through a branch and a pull request instead of committing to main, after verifying the commit identity is the right account. Use when creating a repository, making the first commit in a repo, pushing, opening or updating a pull request, or when history has to be rewritten or force-pushed.
---

# Git delivery workflow

Three of these were violated in one session and all three cost real time. Follow the order: identity
first, branch second, remote check third, and treat history rewriting as a last resort with a
verified exit.

---

## Rule 1 — Verify the commit identity BEFORE the first commit

A repository inherits the machine's global git identity. On a machine that also holds a work
identity, a new personal repository silently authors every commit as the wrong account — and the fix
gets more expensive with every commit.

**Always, before the first commit in any repo:**

```bash
git config user.name && git config user.email      # what will this commit be authored as?
git config --show-origin user.email                # ...and where does that come from?
```

If the global identity is a work account and the remote is a personal one, set it **repo-locally** —
never change the global config, which would re-attribute every other repository on the machine:

```bash
git config --local user.name "Youssef548"
git config --local user.email "84735296+Youssef548@users.noreply.github.com"
```

Prefer the GitHub noreply address (`<id>+<login>@users.noreply.github.com`) when the account keeps
its email private — it attributes commits to the account without guessing at a real address, and it
works when no verified email is discoverable.

**To stop it recurring across projects**, scope the identity by directory in the global config
instead of relying on memory:

```ini
# ~/.gitconfig
[includeIf "gitdir:~/projects/2-side-projects/"]
    path = ~/.gitconfig-personal
```

## Rule 2 — Never commit to main; branch, then open a PR

`main` stays a clean base. One branch per unit of work, and the work arrives by pull request.

```bash
git switch -c <type>/<short-description>     # e.g. week-01-foundation
# ... commit on the branch ...
git push -u origin <branch>
gh pr create --base main --head <branch> --title "..." --body-file <file>
```

A pull request needs the base branch to exist on the remote, so the **first** push of `main` is
expected and is not a violation — but it carries the base commit only, never feature work.

## Rule 3 — Know the remote state before you push

```bash
git fetch origin --prune
git ls-remote origin            # the true remote SHAs
git status --short              # nothing uncommitted
```

Never push over a state you have not looked at, and prefer `--force-with-lease` with an **explicit
expected SHA** over a bare `--force`:

```bash
git push --force-with-lease=main:<expected-sha> origin main
```

## Rule 4 — Never force-push a pull request's base branch

**This closes the PR, and it cannot be reopened.** GitHub records the PR's head commit; when the base
history is rewritten the head no longer exists in the repo, `gh pr reopen` fails with
`Could not open the pull request`, and the PR is left in a permanently broken state.

If both branches must be rewritten, **push the feature branch first, and expect the PR to be lost
either way** — then open a fresh one that references the old number.

Order of operations when rewriting history while a PR is open:

1. Finish the rewrite on both branches.
2. Push the feature branch.
3. Push the base branch last.
4. Check the PR: `gh pr view <n> --json state,headRefOid`.
5. If it closed, open a new PR with a `> Supersedes #<n>.` note at the top explaining why.

## Rule 5 — Rewriting history: verify content, and fix the tagger

An authorship rewrite must change authorship **only**.

```bash
OLD_TREE=$(git rev-parse "main^{tree}")

FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --env-filter '
export GIT_AUTHOR_NAME="..."
export GIT_AUTHOR_EMAIL="..."
export GIT_COMMITTER_NAME="..."
export GIT_COMMITTER_EMAIL="..."
' --tag-name-filter cat -- --all

# content must be byte-identical, and commit dates preserved
git rev-parse "main^{tree}"        # must equal $OLD_TREE
```

Three traps:

- **`filter-branch` needs ref globs, not bare refs.** `-- refs/heads` fails with
  `ambiguous argument 'refs/heads'`; use `-- --all` or `refs/heads/*`.
- **An annotated tag has its own tagger identity**, and `--tag-name-filter` rewrites the tag's
  *target* while leaving the old tagger. Delete and re-create the tag afterwards, otherwise git log
  is clean and `git cat-file -p <tag>` still shows the wrong account.
- **`refs/original/` backups keep the old commits reachable**, so `git log --all` still lists the old
  identity and the rewrite looks like it failed. Drop them once verified:
  `git for-each-ref --format='%(refname)' refs/original/ | xargs -n1 git update-ref -d`.
- **`filter-branch` also rewrites `refs/remotes/*`**, making `--force-with-lease` meaningless. Run
  `git fetch origin --prune` afterwards to restore accurate tracking refs before pushing.

## Rule 6 — Never rewrite history someone else may have based work on

Rewriting is safe when the repository is yours, newly created, and has no other contributors or
consumers. Outside that, add a commit instead.

---

## Checklist

**Before the first commit**

- [ ] `git config user.name` / `user.email` are the identity this repo should carry
- [ ] Repo-local, not global, when the machine's global identity is for a different account

**Before every push**

- [ ] On a branch, not `main`
- [ ] `git fetch origin --prune` and `git ls-remote origin` reviewed
- [ ] `--force-with-lease=<ref>:<expected-sha>` if a force is genuinely needed

**After any history rewrite**

- [ ] Tree SHAs identical to before
- [ ] Annotated tags re-created, not just re-pointed
- [ ] `refs/original/` cleared, tracking refs re-fetched
- [ ] The open PR checked — and a replacement opened if it closed

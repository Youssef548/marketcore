# Agent factory

Label an issue `ready-for-agent` and this Mac builds it: within five minutes OpenCode implements
it in its own clone, the dispatcher proves the result, and a PR that closes the issue
appears for you to review. Merging is always yours.

```
launchd, every 5 min ─▶ dispatch.mjs (holds the Youssef548 token)
  1 PAUSE file or a live run? stop. Issues still labelled agent-working → ready-for-human
  2 pick the lowest-numbered issue that is: ready-for-agent · labelled by Youssef548
          · 0 open blockers · not agent-working / ready-for-human · no open PR closing it
  3 claim: agent-working, assign, comment
  4 clone on agent/<n>-<slug> from GitHub main · .env + ignored skills copied, DATABASE_URL → app_factory
  5 pnpm install · db:generate · db:reset (the factory's own database)
  6 opencode run --standalone --auto (no GitHub, no push), 45 min limit, issue + your comments only
  7 checks: your checkout untouched · commits made · ≤15 files · no protected path · nothing uncommitted
  8 proof: db:reset, then pnpm turbo run lint typecheck test build --affected
  9 pass → push, PR "Closes #n"            fail → ready-for-human + comment, clone kept
```

## Using it

| You want to…         | Do                                                                           |
| -------------------- | ---------------------------------------------------------------------------- |
| Queue work           | Add `ready-for-agent` (it must be you; a label from anyone else is ignored)  |
| Retry a parked issue | Fix the issue or code, then swap `ready-for-human` back to `ready-for-agent` |
| Reject a PR          | Close it; re-add `ready-for-agent` for another attempt                       |
| Pause everything     | `touch ~/.agent-factory/marketcore/PAUSE` (remove it to resume)              |
| See what it would do | `node scripts/agent-factory/dispatch.mjs --dry-run`                          |
| Build one issue now  | `node scripts/agent-factory/dispatch.mjs --issue <n>`                        |

Logs: `~/.agent-factory/marketcore/dispatch.log` for the loop, and `runs/<n>-<time>/` for each
build (`run.log`, the implementer's `agent.jsonl`, and the `issue.md` it was given).

## Install

Needs the dev PostgreSQL on `localhost:5432` (`docker compose up -d`), OpenCode signed in to
OpenCode Go, and `gh` holding a token for `Youssef548`.

```
scripts/agent-factory/install.sh          # copy the app to ~/.agent-factory, write the launchd job
scripts/agent-factory/install.sh --load   # ...and start it
scripts/agent-factory/install.sh --unload # stop it
```

launchd runs the installed copy, not this folder, so re-run `install.sh` after changing anything here.

## Guardrails

- **Who it obeys.** Only a `ready-for-agent` label added by `Youssef548`, re-checked on every
  issue. The implementer sees the issue body and only Youssef548's comments.
- **What the implementer can reach.** No `GH_TOKEN` and an empty `gh` config; no SSH agent; git
  credential helpers cleared; `git push`, `gh`, `docker`, `security` and other commands denied in
  `opencode.json`; files outside its clone and `.env` files denied. Its OpenCode config comes
  only from this folder (`XDG_CONFIG_HOME`), so your global MCP servers never load. Web access
  (fetch, search, curl) is allowed.
- **Why a clone, not a worktree.** In a git worktree OpenCode resolves the shared `.git` in your
  checkout, and the #148 canary edited and committed there. A clone (`git clone --no-local`,
  origin repointed at GitHub) has no link back. As a backstop, the dispatcher records your
  checkout's HEAD, branch and `git status` before the implementer runs and parks the issue if any
  of them changed, whoever changed it.
- **What it may change.** At most 15 files, none under `.github/`, `scripts/agent-factory/`,
  `.agents/`, `.claude/`, `.opencode/`, `docs/agents/`, nor `AGENTS.md`, `CLAUDE.md` or `.env`.
- **Proof is the dispatcher's, not the agent's.** It runs the gate itself; the browser suite and
  `test:coverage` run in CI on the PR. The PR lists the test files it changed, to review first.
- **Your dev database is never touched.** Every run uses `app_factory`.
- **Never stuck.** One run at a time; a run that dies leaves `agent-working`, which the next tick
  turns into `ready-for-human`. `caffeinate` keeps the Mac awake during a run.

Not covered: the deny list matches commands, it is not a sandbox. A determined implementer could
still reach the network through a script it writes. Your review of each PR is the last check.

## Model

`opencode-go/glm-5.3` (OpenCode Go Plus, $120/month allowance, 5-hour window 20%, week 50%).
Chosen 2026-10-24 as the best independently measured agentic coder in the plan (Vals.ai
Terminal-Bench 4.0, 38.9%). Override per run with `FACTORY_MODEL=<provider/model>`.

Tests: `node --test 'scripts/agent-factory/*.test.mjs'`.

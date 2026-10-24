// Every fixed value the agent factory uses, in one place. See README.md for the loop.
import { homedir } from 'node:os';
import { join } from 'node:path';

export const REPO = 'Youssef548/marketcore';
// The only account whose `ready-for-agent` label the factory obeys, and whose
// issue comments reach the implementer. The repo is public; labels are not.
export const OWNER_LOGIN = 'Youssef548';

export const LABELS = Object.freeze({
  READY: 'ready-for-agent',
  WORKING: 'agent-working',
  HUMAN: 'ready-for-human',
});

export const BRANCH_PREFIX = 'agent/';
export const MAX_CHANGED_FILES = 15;

// Paths the implementer may not change: its own guardrails, CI, agent guidance, secrets.
export const PROTECTED_PATHS = Object.freeze([
  '.github/',
  'scripts/agent-factory/',
  '.agents/',
  '.claude/',
  '.opencode/',
  'docs/agents/',
  'AGENTS.md',
  'CLAUDE.md',
  'opencode.json',
]);

// Pinned so two runs of one ticket behave alike: the best independently measured agentic
// coder in the OpenCode Go Plus plan (Vals Terminal-Bench 4.0, 2026-10-22). Override with FACTORY_MODEL.
export const MODEL = process.env.FACTORY_MODEL ?? 'opencode-go/glm-5.3';
export const AGENT_TIMEOUT_MS = 45 * 60 * 1000;
export const COMMAND_TIMEOUT_MS = 30 * 60 * 1000;
export const CLONE_RETENTION_DAYS = 7;

export const FACTORY_DATABASE = 'app_factory';
export const POSTGRES = Object.freeze({ host: '127.0.0.1', port: 5432 });

// Gitignored env files a fresh clone needs. DATABASE_URL in the ones that carry it
// is rewritten to FACTORY_DATABASE, so a run never touches your dev database.
export const ENV_FILES = Object.freeze([
  '.env',
  'apps/api/.env',
  'apps/web/.env',
  'apps/worker/.env',
  'packages/database/.env',
]);

// Installed skills are gitignored (.git/info/exclude), so a clone lacks the implement, tdd and
// code-review skills the prompt names. The missing ones are copied in, and the exclude file with them.
export const SKILLS_DIR = '.agents/skills';

export const HOME_DIR = process.env.FACTORY_HOME ?? join(homedir(), '.agent-factory', 'marketcore');
export const PATHS = Object.freeze({
  pause: join(HOME_DIR, 'PAUSE'),
  lock: join(HOME_DIR, 'dispatch.lock'),
  state: join(HOME_DIR, 'state.json'),
  // One full clone per run, never a git worktree: OpenCode resolved a worktree to your main
  // checkout and committed there (#148 canary). A clone has no link back to it.
  clones: join(HOME_DIR, 'clones'),
  runs: join(HOME_DIR, 'runs'),
  // The implementer's XDG config home: OpenCode reads only the factory config from here,
  // never ~/.config/opencode (and its MCP servers and keys).
  xdg: join(HOME_DIR, 'xdg'),
  // An empty gh config: the implementer has no GitHub credentials at all.
  ghEmpty: join(HOME_DIR, 'gh-empty'),
});

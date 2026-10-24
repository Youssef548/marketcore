// The factory's decisions, as pure functions: which issue to take, whether a finished
// diff may become a pull request, and what may leave this machine. dispatch.mjs does the I/O.
import { BRANCH_PREFIX, LABELS, MAX_CHANGED_FILES, OWNER_LOGIN, PROTECTED_PATHS, REPO } from './config.mjs';

export const SKIP = Object.freeze({
  CLAIMED: 'already claimed (agent-working)',
  NEEDS_HUMAN: 'parked as ready-for-human',
  BLOCKED: 'has open blockers',
  UNTRUSTED_LABEL: `ready-for-agent was not added by ${OWNER_LOGIN}`,
  HAS_PR: 'an open pull request already closes it',
});

const CLOSING_REF = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)\b/gi;

/** Issue numbers an open pull request will close, from its body. */
export function closingRefs(body) {
  return [...(body ?? '').matchAll(CLOSING_REF)].map((match) => Number(match[1]));
}

/** Issue numbers already covered: by a closing keyword, or by a factory branch name. */
export function coveredIssues(openPulls) {
  const covered = new Set();
  for (const pull of openPulls) {
    for (const number of closingRefs(pull.body)) covered.add(number);
    const fromBranch = pull.headRefName?.match(/^agent\/(\d+)-/);
    if (fromBranch) covered.add(Number(fromBranch[1]));
  }
  return covered;
}

/** The login that most recently added `label`, from an issue's events, or null. */
export function lastLabeler(events, label) {
  const added = events.filter((event) => event.event === 'labeled' && event.label?.name === label);
  return added.at(-1)?.actor?.login ?? null;
}

/**
 * Why an issue may not be taken, or null when it may. `facts` carries what the
 * GitHub API said: open blocker count and who last added the ready label.
 */
export function skipReason(issue, facts, covered) {
  const labels = new Set(issue.labels.map((label) => label.name));
  if (labels.has(LABELS.WORKING)) return SKIP.CLAIMED;
  if (labels.has(LABELS.HUMAN)) return SKIP.NEEDS_HUMAN;
  if (covered.has(issue.number)) return SKIP.HAS_PR;
  if (facts.openBlockers > 0) return SKIP.BLOCKED;
  if (facts.labeledBy !== OWNER_LOGIN) return SKIP.UNTRUSTED_LABEL;
  return null;
}

/** Reasons a finished branch may not be opened as a pull request; empty when it may. */
export function diffProblems({ commitsAhead, changedFiles, dirtyTracked }) {
  const problems = [];
  if (commitsAhead === 0) problems.push('the implementer made no commits');
  if (dirtyTracked.length > 0) problems.push(`uncommitted tracked changes: ${dirtyTracked.join(', ')}`);
  if (changedFiles.length > MAX_CHANGED_FILES) {
    problems.push(`${changedFiles.length} files changed; the limit is ${MAX_CHANGED_FILES}`);
  }
  const protectedHits = changedFiles.filter(isProtected);
  if (protectedHits.length > 0) problems.push(`protected paths changed: ${protectedHits.join(', ')}`);
  return problems;
}

/**
 * Reasons the branch would reach GitHub under the wrong account: a commit not authored and
 * committed as the repo's own identity, or an `origin` that is not this repo.
 */
export function identityProblems({ commits, expectedEmail, originUrl }) {
  const problems = commits
    .filter((commit) => commit.authorEmail !== expectedEmail || commit.committerEmail !== expectedEmail)
    .map((commit) => `commit ${commit.sha.slice(0, 7)} is by ${commit.authorEmail} / ${commit.committerEmail}, not ${expectedEmail}`);
  const [owner, name] = REPO.split('/');
  if (!new RegExp(`[:/]${owner}/${name}(?:\\.git)?$`).test(originUrl)) {
    problems.push(`origin is ${originUrl}, not ${REPO}`);
  }
  return problems;
}

/**
 * How your own checkout changed while the implementer ran in its clone; empty when it did not.
 * A snapshot is `{ head, branch, status }` (`git status --porcelain`). The canary run on #148
 * escaped a git worktree and committed here, so a run that moves this checkout is refused.
 */
export function checkoutDrift(before, after) {
  const problems = [];
  if (after.head !== before.head) problems.push(`HEAD moved from ${before.head.slice(0, 7)} to ${after.head.slice(0, 7)}`);
  if (after.branch !== before.branch) problems.push(`the branch changed from ${before.branch} to ${after.branch}`);
  if (after.status !== before.status) problems.push('files changed in the working tree');
  return problems;
}

export function isProtected(path) {
  const name = path.split('/').at(-1);
  if (name === '.env' || name.startsWith('.env.')) return !name.endsWith('.example');
  return PROTECTED_PATHS.some((protectedPath) =>
    protectedPath.endsWith('/') ? path.startsWith(protectedPath) : path === protectedPath,
  );
}

export function isTestFile(path) {
  return /\.(?:spec|test|e2e-spec|integration-spec|concurrency-spec)\.[cm]?[jt]sx?$/.test(path);
}

export function slugify(title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'issue';
}

/** A branch name for the issue that is not in `taken`. */
export function branchName(number, title, taken) {
  const base = `${BRANCH_PREFIX}${number}-${slugify(title)}`;
  if (!taken.has(base)) return base;
  for (let attempt = 2; ; attempt += 1) {
    const candidate = `${base}-${attempt}`;
    if (!taken.has(candidate)) return candidate;
  }
}

const SECRET_PATTERNS = [
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^:/\s]+:)[^@\s]+@/gi, '$1***@'],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,})/g, '***'],
  [/\b(github_pat_[A-Za-z0-9_]{20,})/g, '***'],
  [/\b(sk-[A-Za-z0-9_-]{16,})/g, '***'],
  [/\b(plk_[A-Za-z0-9]{16,})/g, '***'],
  [/\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*)\S+/g, '$1***'],
];

/** Text safe to post publicly: credentials in URLs, known token shapes and KEY=value secrets masked. */
export function redact(text) {
  return SECRET_PATTERNS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

/** The same connection URL pointed at another database on the same server. */
export function withDatabase(url, database) {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export function tail(text, lines) {
  return text.split('\n').slice(-lines).join('\n');
}

/** The prompt file the implementer gets: the issue and only the owner's comments. */
export function issueBrief(issue) {
  const comments = issue.comments
    .filter((comment) => comment.author?.login === OWNER_LOGIN)
    .map((comment) => `### Comment by ${OWNER_LOGIN}\n\n${comment.body}`);
  return [`# #${issue.number}: ${issue.title}`, issue.body ?? '', ...comments].join('\n\n') + '\n';
}

export function pullRequestBody({ issueNumber, model, changedFiles, gate, agentReport, logPath }) {
  const tests = changedFiles.filter(isTestFile);
  const list = (paths) => (paths.length ? paths.map((path) => `- \`${path}\``).join('\n') : '- none');
  return `> Built by the agent factory (OpenCode, \`${model}\`). Unreviewed: a human merges.

Closes #${issueNumber}

## Proof the factory ran

${gate.map((step) => `- \`${step.command}\` → ${step.ok ? 'pass' : 'FAIL'} (${step.seconds}s)`).join('\n')}

The browser (Playwright) suite and \`test:coverage\` run in CI on this PR.

## Test files changed — review these first

${list(tests)}

## All changed files (${changedFiles.length})

${list(changedFiles)}

<details><summary>Implementer's report</summary>

${redact(agentReport || '(no report captured)')}

</details>

Local log: \`${logPath}\`
`;
}

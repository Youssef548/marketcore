#!/usr/bin/env node
// One tick of the agent factory: take the next ready issue, have OpenCode implement it in
// its own clone, prove the result, and open a PR — or park it for a human.
// Usage: node dispatch.mjs [--dry-run] [--issue <n>]. README.md has the whole loop.
import { execFileSync, spawn } from 'node:child_process';
import {
  closeSync, copyFileSync, cpSync, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readdirSync,
  rmSync, statSync, writeFileSync, writeSync,
} from 'node:fs';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGENT_TIMEOUT_MS, CLONE_RETENTION_DAYS, COMMAND_TIMEOUT_MS, ENV_FILES, FACTORY_DATABASE, LABELS, MODEL, OWNER_LOGIN,
  PATHS, POSTGRES, SKILLS_DIR,
} from './config.mjs';
import * as github from './github.mjs';
import {
  branchName, checkoutDrift, coveredIssues, diffProblems, identityProblems, issueBrief, lastLabeler, pullRequestBody, redact,
  skipReason, tail, withDatabase,
} from './policy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = process.env.FACTORY_REPO_DIR ?? resolve(HERE, '../..');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_ISSUE = args.includes('--issue') ? Number(args[args.indexOf('--issue') + 1]) : null;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

const log = (message) => console.log(`${new Date().toISOString()} ${message}`);

// ------------------------------------------------------------------ processes

/** Runs a command in its own process group, so a timeout kills its whole tree. */
function run(command, commandArgs, { cwd, env, timeoutMs = COMMAND_TIMEOUT_MS, logFile, stdoutFile }) {
  return new Promise((done) => {
    const started = Date.now();
    const logStream = createWriteStream(logFile, { flags: 'a' });
    const outStream = stdoutFile ? createWriteStream(stdoutFile, { flags: 'a' }) : logStream;
    logStream.write(`\n$ ${command} ${commandArgs.join(' ')}\n`);
    let recent = '';
    const keep = (chunk) => { recent = (recent + chunk).slice(-64 * 1024); };
    const child = spawn(command, commandArgs, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => { outStream.write(chunk); keep(chunk); });
    child.stderr.on('data', (chunk) => { logStream.write(chunk); keep(chunk); });
    let timedOut = false;
    const killGroup = (signal) => { try { process.kill(-child.pid, signal); } catch { /* already gone */ } };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), 30_000).unref();
    }, timeoutMs);
    const finish = (code) => {
      clearTimeout(timer);
      const seconds = Math.round((Date.now() - started) / 1000);
      logStream.write(`[exit ${code}${timedOut ? ', timed out' : ''} after ${seconds}s]\n`);
      logStream.end();
      if (outStream !== logStream) outStream.end();
      done({ ok: code === 0 && !timedOut, code, timedOut, seconds, recent, command: `${command} ${commandArgs.join(' ')}` });
    };
    child.on('error', (error) => { keep(String(error)); finish(-1); });
    child.on('close', finish);
  });
}

const git = (gitArgs, cwd = REPO_DIR) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8' }).trim();

function notify(message) {
  try {
    execFileSync('osascript', ['-e', `display notification ${JSON.stringify(message)} with title "Agent factory"`]);
  } catch { /* notifications are best effort */ }
}

// ------------------------------------------------------------------ state, lock, pause

function readState() {
  try { return JSON.parse(readFileSync(PATHS.state, 'utf8')); } catch { return {}; }
}

function writeState(state) {
  writeFileSync(PATHS.state, JSON.stringify(state, null, 2));
}

/** True when this process now holds the lock. A lock left by a dead process is taken over. */
function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(PATHS.lock, 'wx');
      writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      closeSync(fd);
      return true;
    } catch {
      const holder = (() => { try { return JSON.parse(readFileSync(PATHS.lock, 'utf8')); } catch { return {}; } })();
      if (holder.pid && isAlive(holder.pid)) return false;
      rmSync(PATHS.lock, { force: true });
    }
  }
  return false;
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

const releaseLock = () => rmSync(PATHS.lock, { force: true });

// ------------------------------------------------------------------ environment

/** The DATABASE_URL every factory process uses: your dev URL with the database swapped. */
function databaseUrl() {
  const devEnv = readFileSync(join(REPO_DIR, 'apps/api/.env'), 'utf8');
  const match = devEnv.match(/^DATABASE_URL\s*=\s*["']?([^"'\n]+)/m);
  if (!match) throw new Error('apps/api/.env has no DATABASE_URL');
  return withDatabase(match[1].trim(), FACTORY_DATABASE);
}

function copyEnvFiles(clone, url) {
  for (const file of ENV_FILES) {
    const source = join(REPO_DIR, file);
    if (!existsSync(source)) continue;
    const text = readFileSync(source, 'utf8').replace(/^(DATABASE_URL\s*=\s*).*$/m, `$1${url}`);
    mkdirSync(dirname(join(clone, file)), { recursive: true });
    writeFileSync(join(clone, file), text);
  }
}

/**
 * A full clone on a new branch from GitHub's main. `--no-local` copies your checkout's objects
 * (no hardlinks, no alternates); origin is then repointed at GitHub and fetched, so nothing
 * links the clone back to your checkout.
 */
function createClone(clone, branch) {
  git(['clone', '--quiet', '--no-local', '--no-checkout', REPO_DIR, clone]);
  git(['remote', 'set-url', 'origin', git(['remote', 'get-url', 'origin'])], clone);
  git(['fetch', '--quiet', '--prune', 'origin'], clone);
  git(['switch', '--quiet', '-c', branch, 'origin/main'], clone);
  // The repo's identity is repo-local here; a clone would otherwise commit as the global (work) one.
  for (const key of ['user.name', 'user.email']) git(['config', key, git(['config', key])], clone);
  copyFileSync(resolve(REPO_DIR, git(['rev-parse', '--git-path', 'info/exclude'])), join(clone, '.git/info/exclude'));
  for (const skill of readdirSync(join(REPO_DIR, SKILLS_DIR))) {
    const target = join(clone, SKILLS_DIR, skill);
    if (!existsSync(target)) cpSync(join(REPO_DIR, SKILLS_DIR, skill), target, { recursive: true, dereference: true });
  }
}

/** Your own checkout's state, compared before and after the implementer runs. */
function checkoutSnapshot() {
  return {
    head: git(['rev-parse', 'HEAD']),
    branch: git(['branch', '--show-current']),
    status: git(['status', '--porcelain']),
  };
}

function toolEnv(url) {
  return { ...process.env, DATABASE_URL: url, TURBO_SCM_BASE: 'origin/main' };
}

/** The implementer's environment: no GitHub token or config, no SSH agent, no git credentials. */
function agentEnv(url) {
  const env = toolEnv(url);
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'SSH_AUTH_SOCK']) delete env[key];
  return {
    ...env,
    GH_CONFIG_DIR: PATHS.ghEmpty,
    XDG_CONFIG_HOME: PATHS.xdg,
    GIT_SSH_COMMAND: 'false',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'false',
    // An empty credential.helper clears osxkeychain and every helper configured before it.
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
  };
}

function prepareDirectories() {
  for (const dir of [PATHS.clones, PATHS.runs, PATHS.ghEmpty, join(PATHS.xdg, 'opencode')]) {
    mkdirSync(dir, { recursive: true });
  }
  // Re-synced every tick from this script's own copy, so the implementer cannot change it.
  copyFileSync(join(HERE, 'opencode.json'), join(PATHS.xdg, 'opencode', 'opencode.json'));
}

function postgresReachable() {
  return new Promise((done) => {
    const socket = connect(POSTGRES.port, POSTGRES.host);
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); done(true); });
    socket.once('timeout', () => { socket.destroy(); done(false); });
    socket.once('error', () => done(false));
  });
}

/** Notifies only when the precondition state changes, not on every tick. */
async function preflight(state) {
  const problems = [];
  if (!existsSync(join(REPO_DIR, 'pnpm-workspace.yaml'))) problems.push(`FACTORY_REPO_DIR is not the repo: ${REPO_DIR}`);
  if (!(await postgresReachable())) problems.push(`PostgreSQL is not reachable on ${POSTGRES.host}:${POSTGRES.port}`);
  try { execFileSync('opencode', ['--version'], { stdio: 'ignore' }); } catch { problems.push('opencode is not on PATH'); }
  const summary = problems.join('; ') || 'ok';
  if (summary !== state.preflight && !DRY_RUN) {
    if (problems.length) notify(`Paused: ${summary}`);
    else if (state.preflight) notify('Ready again');
  }
  state.preflight = summary;
  return problems;
}

// ------------------------------------------------------------------ housekeeping

/** With the lock held no run is active, so any issue still labelled agent-working was interrupted. */
function recoverInterrupted() {
  for (const issue of github.issuesLabelled(LABELS.WORKING)) {
    log(`#${issue.number} was interrupted`);
    if (DRY_RUN) continue;
    github.editLabels(issue.number, { add: [LABELS.HUMAN], remove: [LABELS.WORKING, LABELS.READY] });
    github.comment(issue.number, 'The agent factory run for this issue was interrupted (sleep, reboot or kill) '
      + 'and did not finish. Its clone and log are kept on the factory machine. '
      + `Re-add \`${LABELS.READY}\` to try again.`);
    notify(`#${issue.number} interrupted, needs you`);
  }
}

const cloneDir = (branch) => join(PATHS.clones, branch.replaceAll('/', '__'));
const cloneBranch = (dirName) => dirName.replaceAll('__', '/');

/** Removes clones whose PR is merged or closed, and stale ones that never got a PR. */
function cleanClones() {
  for (const dirName of readdirSync(PATHS.clones)) {
    const path = join(PATHS.clones, dirName);
    const pulls = github.pullsForBranch(cloneBranch(dirName));
    const settled = pulls.length > 0 && pulls.every((pull) => pull.state !== 'OPEN');
    const ageDays = (Date.now() - statSync(path).mtimeMs) / 86_400_000;
    const abandoned = pulls.length === 0 && ageDays > CLONE_RETENTION_DAYS;
    if (!settled && !abandoned) continue;
    log(`removing clone ${path}`);
    if (!DRY_RUN) rmSync(path, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ choosing

function pick() {
  const covered = coveredIssues(github.openPulls());
  const candidates = github.readyIssues().filter((issue) => ONLY_ISSUE === null || issue.number === ONLY_ISSUE);
  for (const issue of candidates) {
    const facts = {
      openBlockers: github.openBlockers(issue.number),
      labeledBy: lastLabeler(github.issueEvents(issue.number), LABELS.READY),
    };
    const reason = skipReason(issue, facts, covered);
    log(`#${issue.number} ${reason ? `skip: ${reason}` : 'eligible'} — ${issue.title}`);
    if (!reason) return issue;
  }
  return null;
}

// ------------------------------------------------------------------ one run

function agentReport(jsonlFile) {
  if (!existsSync(jsonlFile)) return '';
  const texts = [];
  for (const line of readFileSync(jsonlFile, 'utf8').split('\n')) {
    try {
      const event = JSON.parse(line);
      const text = event?.part?.type === 'text' ? event.part.text : event?.type === 'text' ? event.text : null;
      if (typeof text === 'string' && text.trim()) texts.push(text);
    } catch { /* not a JSON line */ }
  }
  return texts.at(-1) ?? '';
}

function inspectBranch(clone) {
  const commitsAhead = Number(git(['rev-list', '--count', 'origin/main..HEAD'], clone));
  const changedFiles = git(['diff', '--name-only', 'origin/main...HEAD'], clone).split('\n').filter(Boolean);
  const dirtyTracked = git(['status', '--porcelain'], clone).split('\n')
    .filter((line) => line && !line.startsWith('??')).map((line) => line.slice(3));
  return { commitsAhead, changedFiles, dirtyTracked };
}

function commitIdentities(clone) {
  return git(['log', '--format=%H%x09%ae%x09%ce', 'origin/main..HEAD'], clone).split('\n').filter(Boolean)
    .map((line) => {
      const [sha, authorEmail, committerEmail] = line.split('\t');
      return { sha, authorEmail, committerEmail };
    });
}

async function build(issue) {
  const runDir = join(PATHS.runs, `${issue.number}-${STAMP}`);
  mkdirSync(runDir, { recursive: true });
  const logFile = join(runDir, 'run.log');
  const agentFile = join(runDir, 'agent.jsonl');
  const url = databaseUrl();
  const env = toolEnv(url);
  let stage = 'claim';
  let clone = null;

  const fail = (reason, detail = '') => {
    log(`#${issue.number} failed at ${stage}: ${reason}`);
    github.editLabels(issue.number, { add: [LABELS.HUMAN], remove: [LABELS.WORKING, LABELS.READY] });
    github.comment(issue.number, `The agent factory could not finish this issue.

**Stage:** ${stage}
**Reason:** ${redact(reason)}
${detail ? `\n<details><summary>Last lines</summary>\n\n\`\`\`\n${redact(tail(detail, 30))}\n\`\`\`\n</details>\n` : ''}
The clone (\`${clone ?? 'not created'}\`) and the full log (\`${logFile}\`) are kept on the factory machine. Fix the issue or the code, then re-add \`${LABELS.READY}\` to try again.`);
    notify(`#${issue.number} needs you: ${stage}`);
  };

  try {
    github.editLabels(issue.number, { add: [LABELS.WORKING] });
    github.assignOwner(issue.number);
    writeFileSync(PATHS.lock, JSON.stringify({ pid: process.pid, issue: issue.number, startedAt: STAMP }));

    stage = 'clone';
    const taken = new Set([
      ...git(['ls-remote', '--heads', 'origin']).split('\n').map((line) => line.split('refs/heads/')[1]).filter(Boolean),
      ...readdirSync(PATHS.clones).map(cloneBranch),
    ]);
    const branch = branchName(issue.number, issue.title, taken);
    clone = cloneDir(branch);
    createClone(clone, branch);
    copyEnvFiles(clone, url);
    github.comment(issue.number, `The agent factory picked this up: OpenCode \`${MODEL}\` on branch \`${branch}\`. `
      + 'A PR follows if the result passes the checks; otherwise this issue moves to '
      + `\`${LABELS.HUMAN}\`.`);
    notify(`Building #${issue.number}`);

    stage = 'install';
    const install = await run('pnpm', ['install', '--frozen-lockfile'], { cwd: clone, env, logFile });
    if (!install.ok) return fail('pnpm install failed', install.recent);

    stage = 'database';
    for (const script of ['db:generate', 'db:reset']) {
      const step = await run('pnpm', ['--filter', '@app/database', script], { cwd: clone, env, logFile });
      if (!step.ok) return fail(`${script} failed`, step.recent);
    }

    stage = 'implement';
    const briefFile = join(runDir, 'issue.md');
    writeFileSync(briefFile, issueBrief(github.issueWithComments(issue.number)));
    const prompt = readFileSync(join(HERE, 'prompt.md'), 'utf8').replaceAll('{{ISSUE}}', String(issue.number));
    const checkoutBefore = checkoutSnapshot();
    const agent = await run('opencode', ['run', prompt, '--standalone', '--auto', '--model', MODEL,
      '--format', 'json', '--title', `factory #${issue.number}`, '--file', briefFile],
    { cwd: clone, env: agentEnv(url), timeoutMs: AGENT_TIMEOUT_MS, logFile, stdoutFile: agentFile });
    const report = agentReport(agentFile);

    stage = 'isolation';
    const drift = checkoutDrift(checkoutBefore, checkoutSnapshot());
    if (drift.length) {
      return fail(`your checkout ${REPO_DIR} changed while the implementer ran (by it, or by you): ${drift.join('; ')}. `
        + 'Check it before anything else.', report || agent.recent);
    }

    stage = 'implement';
    if (agent.timedOut) return fail(`the implementer ran past ${AGENT_TIMEOUT_MS / 60_000} minutes`, report || agent.recent);

    stage = 'diff';
    const branchState = inspectBranch(clone);
    const problems = diffProblems(branchState);
    if (problems.length) return fail(problems.join('; '), report || agent.recent);

    stage = 'proof';
    const gate = [];
    for (const [command, commandArgs] of [
      ['pnpm', ['--filter', '@app/database', 'db:reset']],
      ['pnpm', ['turbo', 'run', 'lint', 'typecheck', 'test', 'build', '--affected']],
    ]) {
      const step = await run(command, commandArgs, { cwd: clone, env, logFile });
      gate.push(step);
      if (!step.ok) return fail(`\`${step.command}\` failed`, step.recent);
    }

    stage = 'identity';
    const identity = identityProblems({
      commits: commitIdentities(clone),
      expectedEmail: git(['config', 'user.email']),
      originUrl: git(['remote', 'get-url', 'origin'], clone),
    });
    if (identity.length) return fail(identity.join('; '));

    stage = 'pull request';
    git(['push', '-u', 'origin', branch], clone);
    const pullUrl = github.createPull({
      branch,
      title: `${issue.title} (#${issue.number})`,
      body: pullRequestBody({ issueNumber: issue.number, model: MODEL, changedFiles: branchState.changedFiles, gate, agentReport: report, logPath: logFile }),
    });
    const author = github.pullAuthor(pullUrl);
    if (author !== OWNER_LOGIN) return fail(`${pullUrl} was opened as ${author}, not ${OWNER_LOGIN}`);
    github.editLabels(issue.number, { remove: [LABELS.WORKING, LABELS.READY] });
    github.comment(issue.number, `PR opened: ${pullUrl}`);
    notify(`#${issue.number} → PR ready for review`);
    log(`#${issue.number} opened ${pullUrl}`);
  } catch (error) {
    fail(error.message, String(error.stdout ?? error.stderr ?? ''));
  }
}

// ------------------------------------------------------------------ tick

async function main() {
  prepareDirectories();
  if (existsSync(PATHS.pause)) return log('paused (remove the PAUSE file to resume)');
  if (!acquireLock()) return log('another dispatch is running');
  const caffeinate = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
  try {
    const state = readState();
    const problems = await preflight(state);
    writeState(state);
    if (problems.length) return log(`not ready: ${problems.join('; ')}`);
    const login = github.tokenLogin();
    if (login !== OWNER_LOGIN) {
      notify(`Stopped: the GitHub token is ${login}, not ${OWNER_LOGIN}`);
      return log(`refusing to run: the GitHub token acts as ${login}, not ${OWNER_LOGIN}`);
    }
    if (!DRY_RUN) {
      github.ensureLabel(LABELS.WORKING, 'fbca04', 'The agent factory is building this issue');
      github.ensureLabel(LABELS.HUMAN, '1d76db', 'Requires human implementation');
    }
    recoverInterrupted();
    cleanClones();
    const issue = pick();
    if (!issue) return log('nothing to build');
    if (DRY_RUN) return log(`dry run: would build #${issue.number} with ${MODEL} as ${OWNER_LOGIN}`);
    await build(issue);
  } finally {
    caffeinate.kill();
    releaseLock();
  }
}

main().catch((error) => {
  log(`dispatch crashed: ${error.stack ?? error}`);
  notify('Dispatcher crashed: see dispatch.log');
  process.exitCode = 1;
});

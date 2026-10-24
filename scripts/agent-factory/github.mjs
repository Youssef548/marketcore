// The dispatcher's GitHub access: `gh` with the owner's token, which the implementer never sees.
import { execFileSync } from 'node:child_process';
import { LABELS, OWNER_LOGIN, REPO } from './config.mjs';

let token;

function ownerToken() {
  token ??= execFileSync('gh', ['auth', 'token', '-u', OWNER_LOGIN], { encoding: 'utf8' }).trim();
  return token;
}

export function gh(args, { input } = {}) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GH_TOKEN: ownerToken() },
  }).trim();
}

const json = (args) => JSON.parse(gh(args) || 'null');

/** The account the token acts as; the dispatcher refuses to write unless it is the owner. */
export function tokenLogin() {
  return gh(['api', 'user', '--jq', '.login']);
}

export function pullAuthor(url) {
  return gh(['pr', 'view', url, '-R', REPO, '--json', 'author', '--jq', '.author.login']);
}

export function readyIssues() {
  return json(['issue', 'list', '-R', REPO, '--state', 'open', '--label', LABELS.READY, '--limit', '100',
    '--json', 'number,title,labels']).sort((a, b) => a.number - b.number);
}

export function issuesLabelled(label) {
  return json(['issue', 'list', '-R', REPO, '--state', 'open', '--label', label, '--limit', '100', '--json', 'number,title']);
}

export function issueWithComments(number) {
  return json(['issue', 'view', String(number), '-R', REPO, '--json', 'number,title,body,comments']);
}

export function openPulls() {
  return json(['pr', 'list', '-R', REPO, '--state', 'open', '--limit', '200', '--json', 'number,body,headRefName']);
}

export function pullsForBranch(branch) {
  return json(['pr', 'list', '-R', REPO, '--state', 'all', '--head', branch, '--json', 'number,state']);
}

export function openBlockers(number) {
  return json(['api', `repos/${REPO}/issues/${number}`]).issue_dependencies_summary?.blocked_by ?? 0;
}

export function issueEvents(number) {
  return json(['api', '--paginate', '--slurp', `repos/${REPO}/issues/${number}/events`]).flat();
}

export function ensureLabel(name, color, description) {
  gh(['label', 'create', name, '-R', REPO, '--color', color, '--description', description, '--force']);
}

export function editLabels(number, { add = [], remove = [] }) {
  const args = ['issue', 'edit', String(number), '-R', REPO];
  for (const label of add) args.push('--add-label', label);
  for (const label of remove) args.push('--remove-label', label);
  gh(args);
}

export function assignOwner(number) {
  gh(['issue', 'edit', String(number), '-R', REPO, '--add-assignee', OWNER_LOGIN]);
}

export function comment(number, body) {
  gh(['issue', 'comment', String(number), '-R', REPO, '--body-file', '-'], { input: body });
}

export function createPull({ branch, title, body }) {
  return gh(['pr', 'create', '-R', REPO, '--base', 'main', '--head', branch, '--title', title,
    '--body-file', '-'], { input: body });
}

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The guard ADR 0001 obliges phase 4 to extend. Run as a real process against a
 * temporary tree, because what matters is its exit code.
 */
const SCRIPT = resolve(__dirname, '../../../scripts/check-db-env.mjs');
const URL_A = 'postgresql://app:app@localhost:5432/app';
const URL_B = 'postgresql://app:app@localhost:5432/other';

function tree(files: Partial<Record<'database' | 'api' | 'worker', string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'db-env-'));
  const paths = { database: 'packages/database', api: 'apps/api', worker: 'apps/worker' };
  for (const [key, url] of Object.entries(files)) {
    const directory = join(root, paths[key as keyof typeof paths]);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, '.env'), `DATABASE_URL=${url}\n`);
  }
  return root;
}

const run = (root: string) =>
  spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, DB_ENV_ROOT: root }, encoding: 'utf8' }).status;

describe('scripts/check-db-env.mjs', () => {
  it('passes when all three agree', () => {
    expect(run(tree({ database: URL_A, api: URL_A, worker: URL_A }))).toBe(0);
  });

  it("refuses when the worker's DATABASE_URL disagrees", () => {
    expect(run(tree({ database: URL_A, api: URL_A, worker: URL_B }))).toBe(1);
  });

  it('still compares the other two when the worker file is absent (finding 13)', () => {
    expect(run(tree({ database: URL_A, api: URL_B }))).toBe(1);
  });

  it('passes with fewer than two files: nothing to compare', () => {
    expect(run(tree({ api: URL_A }))).toBe(0);
  });
});

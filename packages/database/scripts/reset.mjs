#!/usr/bin/env node
// Clean-database reset, in the order a reviewer would run it by hand:
// drop everything, re-apply migrations, then seed.
//
// `prisma migrate reset` is used rather than a hand-rolled DROP SCHEMA: it also
// resets Prisma's own view of the migrations table, so the two cannot diverge.
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// --skip-seed because the seed runs as its own step below, so a failure there is
// attributable to the seed rather than reported as a failed reset.
run('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force', '--skip-seed']);
run('pnpm', ['exec', 'tsx', 'prisma/seed.ts']);

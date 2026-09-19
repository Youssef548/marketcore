// Shared runtime plumbing for the API and the worker.
//
// Both processes may import this package; neither may import the other, because
// `packages/eslint-config` declares `{ from: 'app', allow: ['package'] }` with
// `default: 'disallow'`. Anything both processes need therefore has to live
// here rather than in apps/api — see docs/adr/0001-modular-monolith-with-worker.md.
export * from './config/env';
export * from './prisma/prisma.module';
export * from './prisma/prisma.service';

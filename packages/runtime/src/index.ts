// Shared runtime plumbing for the API and the worker.
//
// Both processes may import this package; neither may import the other, because
// `packages/eslint-config` declares `{ from: 'app', allow: ['package'] }` with
// `default: 'disallow'`. Anything both processes need therefore has to live
// here rather than in apps/api — see docs/adr/0001-modular-monolith-with-worker.md.
//
// Every file here holds logic only. Interfaces and constants live beside the
// logic in files named for what they hold, so a reader looking for a type is not
// reading a middleware to find it.
export * from './config/env';
export * from './constants';
export * from './http/request-id.middleware';
export * from './http/request-logger.middleware';
export * from './http/request.interface';
export * from './logging/logger';
export * from './logging/logger.interface';
export * from './prisma/prisma.module';
export * from './prisma/prisma.service';

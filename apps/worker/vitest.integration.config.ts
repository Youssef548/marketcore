import { defineConfig } from 'vitest/config';
import { workspaceAliases } from './vitest.config';

/** Real PostgreSQL, one file at a time — the suites share the developer database. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.integration-spec.ts'],
    setupFiles: ['dotenv/config'],
    fileParallelism: false,
    testTimeout: 60_000,
  },
  resolve: { alias: workspaceAliases },
});

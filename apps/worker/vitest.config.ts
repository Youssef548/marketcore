import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (name: string) =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

export const workspaceAliases = {
  '@app/contracts': source('contracts'),
  '@app/database': source('database'),
  '@app/domain': source('domain'),
  '@app/runtime': source('runtime'),
};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    coverage: { provider: 'v8', reporter: ['text-summary', 'lcov'] },
  },
  resolve: { alias: workspaceAliases },
});

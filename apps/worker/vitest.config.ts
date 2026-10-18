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
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Measured 43.12/80/66.66/43.12 when the gate was introduced (unit run only;
      // the repository and main.ts are covered by the integration suite, which
      // CI runs right after, without coverage). The threshold sits five points
      // below the baseline, so it blocks a regression without failing on an
      // unrelated change.
      thresholds: { statements: 38, branches: 75, functions: 61, lines: 38 },
    },
  },
  resolve: { alias: workspaceAliases },
});

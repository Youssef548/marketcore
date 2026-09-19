import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Mirrors the `moduleNameMapper` apps/api's jest config uses: workspace packages
 * resolve to their TypeScript source, so this package's tests run without the
 * whole workspace having been built first.
 */
const contractsSource = fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Measured 100/100/75/100 when the gate was introduced. Functions are the
      // low figure because the client's per-method wrappers are one-liners that
      // only some tests reach; the threshold follows the baseline.
      thresholds: { statements: 95, branches: 95, functions: 70, lines: 95 },
    },
  },
  resolve: { alias: { '@app/contracts': contractsSource } },
});

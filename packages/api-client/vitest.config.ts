import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Mirrors the `moduleNameMapper` apps/api's jest config uses: workspace packages
 * resolve to their TypeScript source, so this package's tests run without the
 * whole workspace having been built first.
 */
const contractsSource = fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url));

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '@app/contracts': contractsSource } },
});

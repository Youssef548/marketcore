import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Mirrors the `moduleNameMapper` that apps/api's jest config already uses:
 * workspace packages resolve to their TypeScript source rather than to `dist`.
 * Without it, running this package's tests on their own fails until every
 * dependency has been built, which is a confusing failure for a one-line change.
 */
const contractsSource = fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url));

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '@app/contracts': contractsSource } },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Measured 100% when the gate was introduced. Five points of headroom, so a
      // new schema without a test is the thing that trips it, not an unrelated edit.
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});

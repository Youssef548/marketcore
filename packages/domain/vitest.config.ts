import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Measured 86.58/96/88.88/86.58 when the gate was introduced. The threshold
      // sits five points below the baseline, so it blocks a regression without
      // failing on an unrelated change.
      thresholds: { statements: 81, branches: 91, functions: 83, lines: 81 },
    },
  },
});

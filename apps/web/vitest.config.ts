import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Tests never need Tailwind's PostCSS pipeline, and loading
  // postcss.config.mjs makes Vite reject the string-form plugin entry.
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // The web app is still a shell, so the baseline is low (39.53/50/50/39.53).
      // A ratchet at that level is worth more than no gate: it only ever moves up.
      thresholds: { statements: 34, branches: 45, functions: 45, lines: 34 },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});

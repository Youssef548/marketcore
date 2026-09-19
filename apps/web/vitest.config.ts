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
      // Raised with the first real feature (was 34/45/45/34 on the shell). The
      // session rules, the refresh coordinator, the route gate, the cookie
      // attributes and the two forms are unit-tested at this level; what remains
      // uncovered is the route handlers and the page bodies, and those are covered
      // end to end by the behavioural suite instead — they are thin adapters, and an
      // assertion about a `Set-Cookie` header belongs where a real browser can see
      // one. A ratchet is worth more than no gate: it only ever moves up.
      thresholds: { statements: 52, branches: 75, functions: 55, lines: 52 },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});

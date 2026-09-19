import tseslint from 'typescript-eslint';
import { defineConfig } from '@app/eslint-config';

export default tseslint.config(
  { ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  // `type: 'package'` applies the "packages never import an app" rule. It is what
  // makes the worker's inability to import apps/api a build error rather than a
  // convention — see docs/adr/0001-modular-monolith-with-worker.md.
  ...defineConfig({ type: 'package' }),
);

import tseslint from 'typescript-eslint';
import { defineConfig } from '@app/eslint-config';

export default tseslint.config(
  { ignores: ['eslint.config.mjs', 'test-results/**', 'playwright-report/**'] },
  ...tseslint.configs.recommended,
  ...defineConfig({ type: 'app-e2e' }),
);

import tseslint from 'typescript-eslint';
import { defineConfig } from '@app/eslint-config';

export default tseslint.config(
  // reports/** is Stryker's HTML output, coverage/** is the coverage report: both
  // are generated, and linting generated JavaScript is noise rather than a finding.
  { ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**', 'reports/**'] },
  ...tseslint.configs.recommended,
  // `type: 'package'` is what applies the "packages never import an app" rule.
  ...defineConfig({ type: 'package' }),
);

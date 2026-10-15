import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import { defineConfig } from '../../index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// The fixture workspace's config. rootPath points at the fixture root because
// the fixtures are not under the real repo root; production consumers take the
// default, which is anchored to the monorepo root from the config's own location.
// `type: 'app-fixture'` selects the app element type, which is part of what is
// under test.
//
// JSX is enabled explicitly: one fixture is a `.tsx` component, and without this the
// parser fails with "Unexpected token <" and the rule under test never runs. Real
// consumers get it from `tseslint.configs.recommended`, which this fixture deliberately
// does not spread — it exists to test the boundary rules, not the recommended set.
export default tseslint.config(
  { languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } },
  ...defineConfig({ type: 'app-fixture', tsconfigRootDir: HERE, rootPath: HERE }),
);

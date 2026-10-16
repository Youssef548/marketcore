import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import { defineConfig } from '../../../../index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// A package-rooted config — the shape every real package has, and the one the root-level
// fixture config cannot reproduce. `files` globs resolve against this directory, so a glob
// written relative to the repo root matches nothing from here; the tests that lint with this
// directory as cwd are what caught the colour and no-unknown rules being silent everywhere.
export default tseslint.config(
  { languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } } },
  ...defineConfig({ type: 'package', tsconfigRootDir: HERE, rootPath: resolve(HERE, '..', '..') }),
);

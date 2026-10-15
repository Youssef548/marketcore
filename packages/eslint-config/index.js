import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import boundaries from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';

// Two levels up from this file: packages/eslint-config -> packages -> repo root.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The boundary rules: apps never import each other, packages never import an
 * app, and the tooling packages stay build/lint-time only. Violations are
 * `error`, and `default: 'disallow'` means an edge nobody wrote a rule for
 * fails rather than passes.
 *
 * `packages/eslint-config/test/boundaries.test.ts` runs these rules against a
 * miniature fixture workspace and fails if any of them stops firing.
 *
 * @param {object} options
 * @param {string} options.type            'app-api' | 'app-web' | 'app-e2e' | 'package'
 * @param {boolean} [options.importRules]  set false when the consuming flat
 *   config already registers a plugin under the key `import` (eslint-config-next
 *   does), because redefining that key makes ESLint throw. Such a consumer can
 *   still enable `import/no-extraneous-dependencies` in a rules-only config.
 * @param {string} options.tsconfigRootDir the consuming package's directory —
 *   pass `import.meta.dirname` from its eslint.config.mjs.
 * @param {string} [options.rootPath]      overrides PROJECT_ROOT; only the
 *   fixture workspace in this package's tests needs to.
 */
export function defineConfig({ type, tsconfigRootDir, importRules = true, rootPath = PROJECT_ROOT }) {
  // Required, because nothing fails without it on the command line. turbo lints one
  // package per process, so typescript-eslint infers the root from the single config
  // it has seen. The editor's ESLint server loads every package's config into one
  // process, sees several candidate roots, and fails every file with "No
  // tsconfigRootDir was set, and multiple candidate TSConfigRootDirs are present".
  if (!tsconfigRootDir) {
    throw new Error('defineConfig: pass tsconfigRootDir: import.meta.dirname');
  }

  const isApp = type.startsWith('app-');

  const elements = [
    { type: 'app', pattern: 'apps/*' },
    // Tooling packages get their own element type so nothing can import them.
    // They must be declared before the generic `packages/*` descriptor, because
    // the first matching descriptor wins. Expressing the exclusion this way
    // avoids depending on capture-pattern semantics entirely.
    { type: 'tooling', pattern: 'packages/config' },
    { type: 'tooling', pattern: 'packages/eslint-config' },
    { type: 'package', pattern: 'packages/*' },
  ];

  const rules = [
    {
      files: ['**/*.{ts,tsx}'],
      plugins: importRules ? { boundaries, import: importPlugin } : { boundaries },
      settings: {
        // Absolute, and this is load-bearing. The plugin resolves `include` and
        // `elements` against `process.cwd()` by default, but turbo runs each
        // package's lint script with cwd set to that package — so `apps/**`
        // matches nothing, no element is ever recognised, and every rule below
        // passes silently. An absolute root makes the rules independent of
        // where ESLint was invoked from.
        'boundaries/root-path': rootPath,
        'boundaries/include': ['apps/**', 'packages/**'],
        'boundaries/elements': elements,
        // Without an import resolver, eslint-module-utils falls back to the
        // node resolver without .ts/.tsx extensions, so extensionless relative
        // imports of TS files come back unresolved and boundaries silently
        // skips element-types checks on them.
        'import/resolver': { node: { extensions: ['.js', '.ts', '.tsx'] } },
      },
      rules: {
        'boundaries/element-types': [
          'error',
          {
            default: 'disallow',
            rules: [
              // An app may import packages. It may not import another app.
              { from: 'app', allow: ['package'] },
              // A package may import packages, but not an app and not tooling.
              { from: 'package', allow: ['package'] },
            ],
          },
        ],
        ...(importRules
          ? {
              'import/no-extraneous-dependencies': 'error',
              // The second half of the boundary hole, and the one the README got wrong.
              // It recorded "a package importing an app via a path that does not resolve
              // passes both ESLint and tsc", and implied `no-unknown` was what apps had.
              // It is not: `no-unknown` reports a file that *resolves* and belongs to no
              // element, and is silent on a path that resolves to nothing at all. So both
              // rules are needed, and the fixture for each shape proves it.
              //
              // Restricted to relative specifiers, which is the shape the hole is about. A
              // bare specifier is resolved by the bundler and TypeScript — including
              // subpath exports like `dotenv/config` and `vitest/config`, which the plain
              // node resolver this plugin uses cannot follow — so checking them here buys
              // false positives rather than safety.
              'import/no-unresolved': ['error', { ignore: ['^(?!\\.\\.?/)'] }],
            }
          : {}),
      },
    },
  ];

  // An import that resolves to no known element is a hole in the rules, so make it loud
  // rather than silent — for packages as well as apps.
  //
  // Until this covered packages, a `packages/*` → app import whose path did not resolve
  // passed both ESLint and `tsc`: `boundaries/no-unknown` was app-only, and TypeScript
  // deliberately ignores an unresolved *side-effect-only* import. It was recorded in the
  // README as a known gap because the fix belongs in this file rather than in a package.
  //
  // Both directions are listed; the consuming package's own tree first, so a reader sees
  // their own code at the front of the pattern.
  const own = isApp ? 'apps/*/src/**/*.{ts,tsx}' : 'packages/*/src/**/*.{ts,tsx}';
  const other = isApp ? 'packages/*/src/**/*.{ts,tsx}' : 'apps/*/src/**/*.{ts,tsx}';

  rules.push({
    files: [own, other],
    rules: { 'boundaries/no-unknown': 'error' },
  });

  // A colour belongs in the token layer, not in a component. This used to be a habit —
  // a `grep` in the README — and a grep is not a gate: it is run by whoever remembers.
  rules.push({
    files: ['apps/*/src/**/*.tsx', 'packages/*/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // A colour inside a class list counts, so the match is anchored at a word
          // boundary — the start of the string, after whitespace, or after the `[` of an
          // arbitrary Tailwind value — rather than requiring the literal to *be* a colour.
          selector: 'Literal[value=/(^|\\s|\\[)(#[0-9a-fA-F]{3,8}|oklch\\(|rgba?\\(|hsla?\\()/]',
          message:
            'A colour value belongs in the token layer (packages/ui/src/tokens.css), named for the job it does. A component names a role — bg-action, text-ink, border-rule — never a value.',
        },
      ],
    },
  });

  rules.push({ languageOptions: { parserOptions: { tsconfigRootDir } } });

  return rules;
}

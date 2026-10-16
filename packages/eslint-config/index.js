import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import boundaries from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';

// Two levels up from this file: packages/eslint-config -> packages -> repo root.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SOURCE_FILES = '**/src/**/*.{ts,tsx}';
const TEST_FILES = ['**/*.{test,spec,e2e-spec,integration-spec}.{ts,tsx}'];

// A colour belongs in the token layer, not in a component. This used to be a habit —
// a `grep` in the README — and a grep is not a gate: it is run by whoever remembers.
const COLOUR_LITERAL = {
  // A colour inside a class list counts, so the match is anchored at a word
  // boundary — the start of the string, after whitespace, or after the `[` of an
  // arbitrary Tailwind value — rather than requiring the literal to *be* a colour.
  selector: 'Literal[value=/(^|\\s|\\[)(#[0-9a-fA-F]{3,8}|oklch\\(|rgba?\\(|hsla?\\()/]',
  message:
    'A colour value belongs in the token layer (packages/ui/src/tokens.css), named for the job it does. A component names a role — bg-action, text-ink, border-rule — never a value.',
};

// An exported, hand-written shape lives in a `*.interface.ts` file — in an `interfaces/`
// folder, or beside its code as `packages/domain` and `packages/runtime` keep them — so a reader finds every
// shape in one place and an importer never reaches into an implementation file for one
// (BL-001). Two shapes are allowed where they are, deliberately: a type derived from a
// value beside it — `z.infer<typeof X>` is a type reference, `(typeof X)[keyof typeof X]`
// an indexed access, neither matched below — because moving it would split a type from
// its single source; and an unexported type, which belongs to its file.
const SHARED_TYPE_MESSAGE =
  'An exported interface or hand-written type belongs in a <concern>.interface.ts file (in an interfaces/ folder, or beside its code as packages/domain does), imported where it is used. Types derived from a value beside them (z.infer, typeof) stay where they are.';
const SHARED_TYPE_DECLARATIONS = [
  { selector: 'ExportNamedDeclaration > TSInterfaceDeclaration', message: SHARED_TYPE_MESSAGE },
  {
    selector:
      'ExportNamedDeclaration > TSTypeAliasDeclaration[typeAnnotation.type=/^(TSUnionType|TSIntersectionType|TSTypeLiteral|TSFunctionType|TSLiteralType|TSTupleType|TSMappedType)$/]',
    message: SHARED_TYPE_MESSAGE,
  },
];

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
  // `files` globs resolve against the directory of the config that spreads this one —
  // each package's own `eslint.config.mjs` — so a repo-relative glob such as
  // `packages/*/src/**` matched nothing in any real package, and this rule and the colour
  // rule below were silent everywhere except the fixture workspace, whose config happens
  // to sit at a repo-shaped root. `**/src/**` matches both: `src/…` from a package, and
  // `packages/pkg/src/…` from the fixture root. The package-rooted fixture test is what
  // keeps this from regressing.
  rules.push({
    files: [SOURCE_FILES],
    rules: { 'boundaries/no-unknown': 'error' },
  });

  // Two `no-restricted-syntax` gates share these blocks, because a later config setting the
  // same rule replaces an earlier one for the files both match: a `.tsx` block of its own
  // for the types rule would have switched the colour rule off.
  rules.push({
    files: ['**/src/**/*.tsx'],
    ignores: TEST_FILES,
    rules: { 'no-restricted-syntax': ['error', COLOUR_LITERAL, ...SHARED_TYPE_DECLARATIONS] },
  });
  rules.push({
    files: ['**/src/**/*.ts'],
    ignores: [...TEST_FILES, '**/interfaces/**', '**/*.interface.ts', '**/*.d.ts'],
    rules: { 'no-restricted-syntax': ['error', ...SHARED_TYPE_DECLARATIONS] },
  });

  rules.push({ languageOptions: { parserOptions: { tsconfigRootDir } } });

  return rules;
}

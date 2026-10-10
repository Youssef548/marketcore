import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { defineConfig } from '../index.js';

/**
 * These tests target the rules themselves, not any application code. A template
 * with no domain has nothing else worth asserting, and a boundary rule that
 * silently stops firing looks exactly like a codebase that follows it.
 *
 * Two things about this setup are load-bearing:
 *
 * 1. The fixtures are real files rather than inline snippets. An import whose
 *    target cannot be resolved is the one case where `eslint-plugin-boundaries`
 *    stays quiet, so a snippet with no resolvable target would pass while
 *    proving nothing.
 * 2. The tests run with the process cwd at this package, never at the fixture
 *    root. That is the situation that breaks in production — turbo runs each
 *    package's lint with cwd set to the package — so the fixture config passes
 *    an explicit `rootPath` instead of relying on `chdir`. If that anchoring
 *    regresses, these tests fail rather than passing silently.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '..');
const FIXTURES = join(TEST_DIR, 'fixtures');
const MONOREPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');

async function lintFile(relativePath: string) {
  const eslint = new ESLint({ cwd: FIXTURES });
  const [result] = await eslint.lintFiles([relativePath]);
  return result;
}

const rulesFired = (result: Awaited<ReturnType<typeof lintFile>>) =>
  result.messages.map((message) => message.ruleId);

describe('defineConfig defaults', () => {
  it('anchors boundary patterns to the monorepo root, not the process cwd', () => {
    // The plugin defaults to process.cwd(), which is the package directory when
    // turbo runs a package's lint — under which `apps/**` matches nothing and
    // every rule passes silently. This asserts the absolute override.
    const configs = defineConfig({ type: 'package' }) as unknown as Array<{
      settings?: Record<string, unknown>;
    }>;
    expect(configs[0].settings?.['boundaries/root-path']).toBe(MONOREPO_ROOT);
    expect(process.cwd()).not.toBe(FIXTURES);
  });
});

describe('dependency boundaries', () => {
  it('forbids an app importing another app', async () => {
    const result = await lintFile('apps/one/src/imports-app.ts');
    expect(rulesFired(result)).toContain('boundaries/element-types');
  });

  it('forbids a package importing an app', async () => {
    const result = await lintFile('packages/pkg/src/imports-app.ts');
    expect(rulesFired(result)).toContain('boundaries/element-types');
  });

  it('forbids a package importing a tooling package', async () => {
    const result = await lintFile('packages/pkg/src/imports-tooling.ts');
    expect(rulesFired(result)).toContain('boundaries/element-types');
  });

  it('allows an app importing a package', async () => {
    const result = await lintFile('apps/one/src/imports-package.ts');
    expect(rulesFired(result)).not.toContain('boundaries/element-types');
  });

  it('allows a package importing another package', async () => {
    const result = await lintFile('packages/pkg/src/imports-package.ts');
    expect(rulesFired(result)).not.toContain('boundaries/element-types');
  });

  it('forbids a package importing a file that belongs to no element', async () => {
    // Matches `packages/**` — so it is inside `boundaries/include` — but not `packages/*`,
    // so no element owns it. `no-unknown` is the only rule that reports this shape, and it
    // used to be enabled for apps only.
    const result = await lintFile('packages/pkg/src/imports-loose.ts');
    expect(rulesFired(result)).toContain('boundaries/no-unknown');
  });

  it('forbids an app importing a file that belongs to no element', async () => {
    const result = await lintFile('apps/one/src/imports-loose.ts');
    expect(rulesFired(result)).toContain('boundaries/no-unknown');
  });

  it('forbids an import whose path does not resolve at all', async () => {
    // The shape the README described, and the one `no-unknown` is silent on: a
    // side-effect-only import of a missing module. TypeScript ignores it deliberately — it
    // cannot tell a missing module from one declared elsewhere — so this rule is the only
    // thing between a typo'd import path and a green build.
    const pkg = await lintFile('packages/pkg/src/imports-missing.ts');
    const app = await lintFile('apps/one/src/imports-missing.ts');

    expect(rulesFired(pkg)).toContain('import/no-unresolved');
    expect(rulesFired(app)).toContain('import/no-unresolved');
  });
});

describe('colour literals', () => {
  it('forbids a colour value in a component', async () => {
    // The check used to be a `grep` in the README, which is a habit rather than a gate.
    const result = await lintFile('packages/pkg/src/colour-literal.tsx');
    expect(rulesFired(result)).toContain('no-restricted-syntax');
  });
});

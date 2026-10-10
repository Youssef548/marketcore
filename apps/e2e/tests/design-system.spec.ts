import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const WEB = 'https://web.marketcore.test:8443';

// `__dirname` rather than `import.meta.url`: Playwright compiles a spec to CommonJS, where
// `import.meta` is a syntax error rather than a missing property.
const UI_SRC = resolve(__dirname, '../../../packages/ui/src');

/**
 * Every class name the design system's components actually write.
 *
 * Read from the source rather than listed here, so a new component is covered the moment
 * it is written. Only the static part of each `className` is taken; tokens carrying a
 * `${…}` or an arbitrary value (`h-[38px]`) are skipped, because Tailwind escapes those in
 * ways that make a text search brittle — and a named token like `rounded-brand` is
 * exactly the shape this exists to guard.
 */
function utilitiesNamed(): string[] {
  const found = new Set<string>();

  for (const file of readdirSync(UI_SRC).filter((name) => name.endsWith('.tsx'))) {
    const source = readFileSync(join(UI_SRC, file), 'utf8');

    // Two captures, because a `className` is either a quoted string or a template literal —
    // and every component but one uses the latter. Reading only the first group silently
    // found one class out of dozens, which the count assertion below is there to catch.
    for (const [, quoted, template] of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      for (const token of (quoted ?? template ?? '').split(/\s+/)) {
        if (token !== '' && !token.includes('[') && !token.includes('${')) found.add(token);
      }
    }
  }

  return [...found].sort();
}

test.describe('the design system: is it actually painted?', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${WEB}/login`);
  });

  /**
   * The bug this closes, found by looking at the running app rather than at a test:
   * `--radius-brand` lived in a plain `:root` block, and Tailwind only generates a utility
   * from `@theme`. So `rounded-brand` was a class the stylesheet never contained — every
   * input, button and toggle rendered with `border-radius: 0` — and nothing failed, because
   * no test had ever asked what a component was painted with.
   */
  test('compiles every utility the components name', async ({ page }) => {
    const named = utilitiesNamed();
    expect(named.length, 'the components were read').toBeGreaterThan(10);

    const missing = await page.evaluate((classes: string[]) => {
      const css = [...document.styleSheets]
        .flatMap((sheet) => {
          try {
            return [...sheet.cssRules].map((rule) => rule.cssText);
          } catch {
            return [];
          }
        })
        .join('\n');

      return classes.filter((className) => !css.includes(`.${className.replace(/([:/])/g, '\\$1')}`));
    }, named);

    expect(missing, 'these classes are named by a component and absent from the stylesheet').toEqual([]);
  });

  test('paints the input and the primary action, rather than only labelling them', async ({ page }) => {
    const input = page.getByLabel('Email');
    const painted = await input.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        radius: Number.parseFloat(style.borderTopLeftRadius),
        borderWidth: Number.parseFloat(style.borderTopWidth),
        borderColor: style.borderTopColor,
      };
    });

    expect(painted.radius, 'the input is rounded').toBeGreaterThan(0);
    expect(painted.borderWidth, 'the input has a border').toBeGreaterThan(0);
    expect(painted.borderColor, 'and the border is a colour, not transparent').not.toContain('0, 0, 0, 0');

    const button = page.getByRole('button', { name: 'Sign in' });
    const action = await button.evaluate((element) => {
      const style = getComputedStyle(element);
      return { radius: Number.parseFloat(style.borderTopLeftRadius), background: style.backgroundColor };
    });

    expect(action.radius, 'the primary button is rounded').toBeGreaterThan(0);
    expect(action.background, 'and it is painted rather than transparent').not.toContain('0, 0, 0, 0');
  });
});

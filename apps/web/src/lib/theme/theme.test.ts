import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, parseTheme, SetThemeRequestSchema, Themes } from './theme';

describe('theme', () => {
  it('names the two themes once, spelled as the cookie and the CSS agree', () => {
    // The values are on the wire three ways TypeScript cannot check: the cookie a
    // browser already holds, the `data-theme` attribute the server paints, and the
    // `[data-theme='dark']` selectors in the token layer. The constants are the
    // one place the spelling lives, so this pins it.
    expect(Themes).toEqual({ LIGHT: 'light', DARK: 'dark' });
    expect(DEFAULT_THEME).toBe(Themes.LIGHT);
  });

  it('defaults to light, so a dark operating system does not choose for anyone', () => {
    expect(parseTheme(undefined)).toBe('light');
    expect(DEFAULT_THEME).toBe('light');
  });

  it('accepts the two themes and nothing else', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    // A cookie is attacker-controlled. An unknown value falls back rather than
    // reaching the render, and it cannot smuggle a third palette in.
    expect(parseTheme('solarized')).toBe('light');
    expect(parseTheme('')).toBe('light');
  });

  it('refuses a theme the request schema does not have', () => {
    expect(SetThemeRequestSchema.safeParse({ theme: 'dark' }).success).toBe(true);
    expect(SetThemeRequestSchema.safeParse({ theme: 'solarized' }).success).toBe(false);
    expect(SetThemeRequestSchema.safeParse({}).success).toBe(false);
  });
});

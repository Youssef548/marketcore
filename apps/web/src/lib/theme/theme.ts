import { z } from 'zod';
import { wireValues } from '@app/contracts';

/**
 * Which theme, and the cookie that remembers it.
 *
 * A cookie rather than `localStorage` for the reason the session uses one: the server
 * reads it, so the first paint is already the right theme. A script reading
 * `localStorage` could only run after the document arrives, which is a flash of the
 * wrong theme on every navigation.
 */
export const THEME_COOKIE = 'mc_theme';

/**
 * The two themes, named once. A const-object enum rather than a literal pair, so the
 * comparisons that narrow on a theme pass the member and the value lives in one place —
 * the cookie, the `data-theme` attribute and the token layer's selectors all spell it.
 */
export const Themes = { LIGHT: 'light', DARK: 'dark' } as const;
export type Theme = (typeof Themes)[keyof typeof Themes];

/** Light, deliberately, rather than "whatever the OS is set to". See ADR 013. */
export const DEFAULT_THEME: Theme = Themes.LIGHT;

export function parseTheme(value: string | undefined): Theme {
  return value === Themes.DARK ? Themes.DARK : DEFAULT_THEME;
}

export const SetThemeRequestSchema = z.object({ theme: z.enum(wireValues(Themes)) });

/** Not a credential, but it lives as long as a session would and is server-read. */
export function themeCookieAttributes(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  } as const;
}

import { z } from 'zod';

/**
 * Which theme, and the cookie that remembers it.
 *
 * A cookie rather than `localStorage` for the reason the session uses one: the server
 * reads it, so the first paint is already the right theme. A script reading
 * `localStorage` could only run after the document arrives, which is a flash of the
 * wrong theme on every navigation.
 */
export const THEME_COOKIE = 'mc_theme';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Light, deliberately, rather than "whatever the OS is set to". See ADR 013. */
export const DEFAULT_THEME: Theme = 'light';

export function parseTheme(value: string | undefined): Theme {
  return value === 'dark' ? 'dark' : DEFAULT_THEME;
}

export const SetThemeRequestSchema = z.object({ theme: z.enum(['light', 'dark']) });

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

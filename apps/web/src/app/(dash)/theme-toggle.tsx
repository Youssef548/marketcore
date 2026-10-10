'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { THEMES, type Theme } from '@/lib/theme/theme';

/**
 * Switch between the two themes.
 *
 * The current theme is read from the document rather than passed down: the server
 * already painted it onto `<html>`, so the DOM is the one place that cannot disagree
 * with what is on screen. After the change the route handler has re-set the cookie, so
 * `router.refresh()` re-renders the tree with the new palette.
 */
export function ThemeToggle() {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === 'dark' || current === 'light') setTheme(current);
  }, []);

  async function choose(next: Theme) {
    await fetch('/api/theme', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    });
    setTheme(next);
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      aria-label={`Switch to the ${theme === 'dark' ? 'light' : 'dark'} theme`}
      aria-pressed={theme === 'dark'}
      disabled={pending}
      onClick={() => void choose(theme === 'dark' ? 'light' : 'dark')}
      className="grid h-8 w-8 place-items-center rounded-brand border border-rule-strong bg-panel text-ink-muted hover:text-ink disabled:opacity-50"
    >
      {/* Both marks are drawn and one is hidden, so the control is the same size in
       * either theme and the button does not move when it is pressed. */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className={theme === 'dark' ? 'hidden' : 'block'}
      >
        <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
      </svg>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className={theme === 'dark' ? 'block' : 'hidden'}
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}

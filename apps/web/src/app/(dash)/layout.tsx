import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session/client';
import { DashboardChrome } from './chrome';

/**
 * Everything behind a session.
 *
 * A Server Component so it can read `APP_NAME` — a client component cannot see a
 * non-`NEXT_PUBLIC_` variable, and the project name is meant to live in exactly two
 * places rather than being typed into a header. It reads the session no further than
 * that: the session itself is loaded in a route handler, because a render cannot
 * write the cookies a rotation produces.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const appName = process.env.APP_NAME ?? 'app';

  return (
    <SessionProvider>
      <DashboardChrome appName={appName}>{children}</DashboardChrome>
    </SessionProvider>
  );
}

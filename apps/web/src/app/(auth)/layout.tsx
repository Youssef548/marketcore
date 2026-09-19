import type { ReactNode } from 'react';

/** The credential pages: a narrow column, centred, with nothing around them. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      {children}
    </main>
  );
}

import type { ReactNode } from 'react';

/** The credential pages: a narrow column, centred, on the canvas and nothing around them. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-canvas px-6">
      {children}
    </main>
  );
}

import type { ReactNode } from 'react';

/**
 * The credential pages: one card, centred, on the canvas and nothing around it.
 *
 * The card is the direction's — a panel on the canvas rather than a bare column — so
 * the sign-in screen reads as the same product as the console behind it.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-[26rem] rounded-[16px] border border-rule bg-panel p-7">
        {children}
      </div>
    </main>
  );
}

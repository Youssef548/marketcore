import type { ReactNode } from 'react';

/**
 * The credential pages: one card, centred, on the canvas and nothing around it.
 *
 * The card is the direction's — a panel on the canvas rather than a bare column — so
 * the sign-in screen reads as the same product as the console behind it.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  // The front door named no product, so a first-timer could not tell what they were
  // signing into. The name is the same one the rail shows, read from the same place.
  const appName = process.env.APP_NAME ?? 'app';

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-[26rem] space-y-4">
        <p className="text-center text-sm font-semibold tracking-tight text-ink">{appName}</p>
        <div className="rounded-[16px] border border-rule bg-panel p-7">{children}</div>
      </div>
    </main>
  );
}

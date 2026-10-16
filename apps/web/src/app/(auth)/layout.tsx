import type { ReactNode } from 'react';
import { AuthCard, CardBrand, PublicFrame } from '@/components/public-frame';

/**
 * The credential pages: a public bar, and one card centred on the canvas beneath it —
 * the composition of the Stitch sign-in and register screens (040, 046).
 *
 * The card is the direction's — a panel on the canvas rather than a bare column — so
 * the sign-in screen reads as the same product as the console behind it.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  // The front door named no product, so a first-timer could not tell what they were
  // signing into. The name is the same one the rail shows, read from the same place.
  const appName = process.env.APP_NAME ?? 'app';

  return (
    <PublicFrame appName={appName}>
      <AuthCard>
        <CardBrand appName={appName} />
        {children}
      </AuthCard>
    </PublicFrame>
  );
}

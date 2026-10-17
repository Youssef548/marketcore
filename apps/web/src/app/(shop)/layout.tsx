import type { PropsWithChildren } from 'react';
import { SessionProvider } from '@/lib/session/client';
import { StoreFrame } from './store-frame';

export default function ShopLayout({ children }: PropsWithChildren) {
  const appName = process.env.APP_NAME ?? 'app';
  return (
    <SessionProvider>
      <StoreFrame appName={appName}>{children}</StoreFrame>
    </SessionProvider>
  );
}

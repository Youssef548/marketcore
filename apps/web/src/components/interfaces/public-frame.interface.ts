import type { ReactNode } from 'react';
import type { BrandMarkSize } from '../constants';

export interface PublicFrameProps {
  appName: string;
  /** The bar's right-hand side: who is signed in, on the one screen where someone is. */
  aside?: ReactNode;
  children: ReactNode;
}

export interface AuthCardProps {
  /** The first-run card, which carries more prose. */
  wide?: boolean;
  children: ReactNode;
}

export interface CardBrandProps {
  appName: string;
}

export interface BrandMarkProps {
  size: BrandMarkSize;
}

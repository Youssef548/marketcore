import type { HTMLAttributes, ReactNode } from 'react';

export type AlertVariant = 'error' | 'success';

export interface AlertProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'children'> {
  variant?: AlertVariant;
  children?: ReactNode;
}

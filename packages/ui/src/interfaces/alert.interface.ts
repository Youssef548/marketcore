import type { HTMLAttributes, ReactNode } from 'react';
import type { AlertVariant } from '../constants';

export interface AlertProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'children'> {
  variant?: AlertVariant;
  children?: ReactNode;
}

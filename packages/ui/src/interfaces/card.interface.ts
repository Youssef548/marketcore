import type { ElementType } from 'react';
import type { PolymorphicProps } from './polymorphic.interface';

export type CardVariant = 'panel' | 'raised';

export type CardProps<E extends ElementType = 'div'> = PolymorphicProps<
  E,
  { variant?: CardVariant; className?: string }
>;

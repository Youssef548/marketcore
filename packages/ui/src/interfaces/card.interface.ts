import type { ElementType } from 'react';
import type { CARD_DEFAULT_ELEMENT, CardVariant } from '../constants';
import type { PolymorphicProps } from './polymorphic.interface';

/** What `Card` adds to the element it renders as. */
export interface CardOwnProps {
  variant?: CardVariant;
  className?: string;
}

export type CardProps<E extends ElementType = typeof CARD_DEFAULT_ELEMENT> = PolymorphicProps<E, CardOwnProps>;

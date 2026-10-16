import type { ElementType } from 'react';
import type { PolymorphicProps } from './polymorphic.interface';

/** What `TextLink` adds to the element it renders as. */
export interface TextLinkOwnProps {
  className?: string;
}

export type TextLinkProps<E extends ElementType = 'a'> = PolymorphicProps<E, TextLinkOwnProps>;

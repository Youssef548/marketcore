import type { ElementType } from 'react';
import type { TEXT_LINK_DEFAULT_ELEMENT } from '../constants';
import type { PolymorphicProps } from './polymorphic.interface';

/** What `TextLink` adds to the element it renders as. */
export interface TextLinkOwnProps {
  className?: string;
}

export type TextLinkProps<E extends ElementType = typeof TEXT_LINK_DEFAULT_ELEMENT> = PolymorphicProps<E, TextLinkOwnProps>;

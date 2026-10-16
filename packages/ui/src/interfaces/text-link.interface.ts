import type { ElementType } from 'react';
import type { PolymorphicProps } from './polymorphic.interface';

export type TextLinkProps<E extends ElementType = 'a'> = PolymorphicProps<E, { className?: string }>;

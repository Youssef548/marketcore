import type { ComponentPropsWithoutRef, ElementType } from 'react';

/**
 * Props for a component that renders as the element its caller names — an anchor, a router's
 * link, a button, a section — while keeping that element's own props typed. This package
 * cannot import `next/link`, so a link component takes the router's link as `as` rather than
 * depending on it.
 */
export type PolymorphicProps<E extends ElementType, P = object> = P & {
  as?: E;
} & Omit<ComponentPropsWithoutRef<E>, keyof P | 'as'>;

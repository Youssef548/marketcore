import type { ElementType } from 'react';
import { CARD_DEFAULT_ELEMENT, CardVariants, type CardVariant } from './constants';
import type { CardProps } from './interfaces/card.interface';

const variants: Record<CardVariant, string> = {
  // A surface inside the console: KPI tiles, tables, the add-product form.
  [CardVariants.PANEL]: 'rounded-xl border border-rule bg-panel',
  // The card a public screen centres on the canvas — sign in, register, first run — lifted
  // off the gradient behind it.
  [CardVariants.RAISED]: 'rounded-[18px] border border-rule bg-panel shadow-sm',
};

/**
 * The panel surface on a hairline. It sets the surface and nothing else: padding, width and
 * layout belong to what sits on it, so the caller passes them.
 */
export function Card<E extends ElementType = typeof CARD_DEFAULT_ELEMENT>({
  as,
  variant = CardVariants.PANEL,
  className = '',
  ...props
}: CardProps<E>) {
  const Component: ElementType = as ?? CARD_DEFAULT_ELEMENT;
  return <Component className={`${variants[variant]} ${className}`} {...props} />;
}

import type { ElementType } from 'react';
import type { CardProps, CardVariant } from './interfaces/card.interface';

const variants: Record<CardVariant, string> = {
  // A surface inside the console: KPI tiles, tables, the add-product form.
  panel: 'rounded-xl border border-rule bg-panel',
  // The card a public screen centres on the canvas — sign in, register, first run — lifted
  // off the gradient behind it.
  raised: 'rounded-[18px] border border-rule bg-panel shadow-sm',
};

/**
 * The panel surface on a hairline. It sets the surface and nothing else: padding, width and
 * layout belong to what sits on it, so the caller passes them.
 */
export function Card<E extends ElementType = 'div'>({
  as,
  variant = 'panel',
  className = '',
  ...props
}: CardProps<E>) {
  const Component: ElementType = as ?? 'div';
  return <Component className={`${variants[variant]} ${className}`} {...props} />;
}

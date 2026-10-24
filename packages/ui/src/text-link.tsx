import type { ElementType } from 'react';
import { TEXT_LINK_DEFAULT_ELEMENT } from './constants';
import type { TextLinkProps } from './interfaces/text-link.interface';

/**
 * Text that navigates or acts inside a sentence — "No account? Create one".
 *
 * An anchor by default; pass `as` for a router's link, or `as="button"` for an action that
 * reads as a link, such as signing out of the wrong account. The action colour on the panel
 * is a contrast pair `tokens.spec.ts` asserts, and the underline means the link does not rely
 * on colour alone (WCAG 1.4.1).
 */
export function TextLink<E extends ElementType = typeof TEXT_LINK_DEFAULT_ELEMENT>({ as, className = '', ...props }: TextLinkProps<E>) {
  const Component: ElementType = as ?? TEXT_LINK_DEFAULT_ELEMENT;
  return (
    <Component className={`font-semibold text-action underline underline-offset-2 ${className}`} {...props} />
  );
}

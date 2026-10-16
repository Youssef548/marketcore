import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Work is in flight. Sets `aria-busy` and `aria-disabled` and guards the click —
   * deliberately not `disabled`, which drops keyboard focus and throws a keyboard
   * user back to the top of the form mid-submit.
   */
  busy?: boolean;
}

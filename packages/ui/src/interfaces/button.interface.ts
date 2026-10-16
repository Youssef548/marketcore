import type { ButtonHTMLAttributes } from 'react';
import type { ButtonVariant, ControlSize } from '../constants';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  /**
   * Work is in flight. Sets `aria-busy` and `aria-disabled` and guards the click —
   * deliberately not `disabled`, which drops keyboard focus and throws a keyboard
   * user back to the top of the form mid-submit.
   */
  busy?: boolean;
}

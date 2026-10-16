import type { InputHTMLAttributes } from 'react';
import type { ControlSize } from '../constants';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /**
   * Marks the field as failing validation. Sets `aria-invalid` as well as the
   * colour, so the state reaches a screen reader rather than only the eye.
   */
  invalid?: boolean;
  size?: ControlSize;
}

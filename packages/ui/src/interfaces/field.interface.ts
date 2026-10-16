import type { ReactNode } from 'react';
import type { InputProps } from './input.interface';

export interface FieldProps extends Omit<InputProps, 'id' | 'invalid'> {
  label: ReactNode;
  /** The message a refusal produced, if any. */
  error?: string | null;
  /**
   * What the field asks for, stated before anything is refused — a password policy,
   * what a name is used for. Described by the input rather than merely placed under
   * it, so a screen reader reads the rule with the field instead of after the form.
   */
  hint?: ReactNode;
  id?: string;
}

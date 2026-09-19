'use client';

import { useId, type ReactNode } from 'react';
import { Alert } from './alert';
import { Input, type InputProps } from './input';
import { Label } from './label';

export interface FieldProps extends Omit<InputProps, 'id' | 'invalid'> {
  label: ReactNode;
  /** The message a refusal produced, if any. */
  error?: string | null;
  id?: string;
}

/**
 * A label, an input and the message that explains a refusal — wired once.
 *
 * This is not a convenience. A field error with nothing associating it to its input
 * is announced by a screen reader as an input, with the reason it was refused never
 * mentioned. Four fields across two forms were wrong in the same way, which is the
 * argument for a component stated exactly: wire it once, and every field inherits it.
 *
 * The generated id is React's `useId` rather than a counter, because it is stable
 * across a server render and the client's hydration of it.
 */
export function Field({ label, error = null, id, className = '', ...inputProps }: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        className={className}
        {...inputProps}
      />
      <Alert id={errorId}>{error}</Alert>
    </div>
  );
}

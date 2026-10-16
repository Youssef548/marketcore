'use client';

import { useId, type ReactNode } from 'react';
import { Alert } from './alert';
import { Input, type InputProps } from './input';
import { Label } from './label';

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
export function Field({
  label,
  error = null,
  hint,
  id,
  className = '',
  ...inputProps
}: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const hasHint = hint !== undefined && hint !== null;
  // The hint first, then the refusal: the rule, and then why this value broke it.
  const describedBy =
    [hasHint ? hintId : null, error === null ? null : errorId].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        invalid={error !== null}
        aria-describedby={describedBy}
        className={className}
        {...inputProps}
      />
      {hasHint && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      <Alert id={errorId}>{error}</Alert>
    </div>
  );
}

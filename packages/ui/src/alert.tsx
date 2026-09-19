import type { ReactNode } from 'react';

export type AlertVariant = 'error' | 'success';

export interface AlertProps {
  variant?: AlertVariant;
  children?: ReactNode;
}

const variants: Record<AlertVariant, string> = {
  error: 'border-red-200 bg-red-50 text-red-700',
  success: 'border-brand-200 bg-brand-50 text-brand-700',
};

/**
 * One message, announced rather than merely shown.
 *
 * `role="alert"` is the point: a form that reports a refusal only through colour and
 * position is invisible to a screen reader, and the refusal is the one thing the
 * user needs to perceive. It serves both a field-level message and a form-level one,
 * which is why it is not named for either.
 */
export function Alert({ variant = 'error', children }: AlertProps) {
  if (!children) return null;

  return (
    <p
      role="alert"
      className={`rounded-brand border px-3 py-2 text-sm ${variants[variant]}`}
    >
      {children}
    </p>
  );
}

import type { HTMLAttributes, ReactNode } from 'react';

export type AlertVariant = 'error' | 'success';

export interface AlertProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'children'> {
  variant?: AlertVariant;
  children?: ReactNode;
}

const variants: Record<AlertVariant, string> = {
  error: 'border-attention bg-attention-wash text-attention',
  success: 'border-positive bg-positive-wash text-positive',
};

/**
 * One message, announced rather than merely shown.
 *
 * `role="alert"` is the point: a form that reports a refusal only through colour and
 * position is invisible to a screen reader, and the refusal is the one thing the
 * user needs to perceive. It serves both a field-level message and a form-level one,
 * which is why it is not named for either — and it forwards an `id`, because a field
 * has to be able to point its input at it.
 */
export function Alert({ variant = 'error', className = '', children, ...props }: AlertProps) {
  if (!children) return null;

  return (
    <p
      role="alert"
      className={`rounded-brand border px-3 py-2 text-sm ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </p>
  );
}

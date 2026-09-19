'use client';

import type { InputHTMLAttributes } from 'react';

export type InputSize = 'md' | 'sm';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /**
   * Marks the field as failing validation. Sets `aria-invalid` as well as the
   * colour, so the state reaches a screen reader rather than only the eye.
   */
  invalid?: boolean;
  size?: InputSize;
}

const sizes: Record<InputSize, string> = {
  md: 'px-3 py-2 text-sm',
  sm: 'px-2.5 py-1.5 text-xs',
};

const borders = {
  valid: 'border-rule-strong focus:border-action',
  invalid: 'border-attention focus:border-attention',
} as const;

export function Input({ invalid = false, size = 'md', className = '', ...props }: InputProps) {
  const border = invalid ? borders.invalid : borders.valid;

  return (
    <input
      aria-invalid={invalid || undefined}
      // The surface and text colours are stated rather than inherited. A form control
      // with no background takes whatever the platform gives it, which is how an input
      // ends up as a white slab on a dark page the moment the theme is not the one the
      // component assumed.
      className={`w-full rounded-brand border bg-panel text-ink transition-colors outline-none placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-focus-ring disabled:opacity-50 ${sizes[size]} ${border} ${className}`}
      {...props}
    />
  );
}

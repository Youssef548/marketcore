'use client';

import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * Marks the field as failing validation. Sets `aria-invalid` as well as the
   * colour, so the state reaches a screen reader rather than only the eye.
   */
  invalid?: boolean;
}

const borders = {
  valid: 'border-gray-300 focus:border-brand-600',
  invalid: 'border-red-500 focus:border-red-500',
} as const;

export function Input({ invalid = false, className = '', ...props }: InputProps) {
  const border = invalid ? borders.invalid : borders.valid;

  return (
    <input
      aria-invalid={invalid || undefined}
      className={`w-full rounded-brand border px-3 py-2 text-sm transition-colors outline-none disabled:opacity-50 ${border} ${className}`}
      {...props}
    />
  );
}

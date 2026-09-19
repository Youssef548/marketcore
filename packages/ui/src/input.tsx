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
      // The surface and text colours are stated rather than inherited. A form control
      // with no background takes whatever the platform gives it, which is how an input
      // ends up as a white slab on a dark page the moment the theme is not the one the
      // component assumed.
      className={`w-full rounded-brand border bg-white px-3 py-2 text-sm text-gray-900 transition-colors outline-none placeholder:text-gray-400 disabled:opacity-50 ${border} ${className}`}
      {...props}
    />
  );
}

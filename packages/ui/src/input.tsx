'use client';

import { ControlSizes, type ControlSize } from './constants';
import type { InputProps } from './interfaces/input.interface';

const sizes: Record<ControlSize, string> = {
  // The credential and first-run forms: one column, a few fields, nothing else on the
  // screen — so the control is the size of the thing a person is there to do.
  [ControlSizes.LG]: 'h-11 px-3.5 text-sm',
  [ControlSizes.MD]: 'h-10 px-3 text-sm',
  [ControlSizes.SM]: 'h-8 px-2.5 text-xs',
};

const borders = {
  // `control-edge` rather than the decorative `rule-strong`: this border is the only
  // thing distinguishing the input from the page, so it answers to WCAG 1.4.11's 3:1
  // for a UI component boundary, and the token layer carries one that clears it.
  valid: 'border-control-edge focus:border-action',
  invalid: 'border-attention focus:border-attention',
} as const;

export function Input({ invalid = false, size = ControlSizes.MD, className = '', ...props }: InputProps) {
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

'use client';

import type { MouseEvent } from 'react';
import { ButtonVariants, ControlSizes, type ButtonVariant, type ControlSize } from './constants';
import type { ButtonProps } from './interfaces/button.interface';

const variants: Record<ButtonVariant, string> = {
  [ButtonVariants.PRIMARY]: 'bg-action text-ink-on-action border-transparent hover:bg-action-hover',
  // Bordered rather than transparent: in this direction the second action is a thing
  // you can see, not an absence. It is `secondary` rather than `ghost` because a
  // bordered ghost is a name that lies about what it paints.
  [ButtonVariants.SECONDARY]: 'bg-panel text-ink border-control-edge hover:bg-sunken',
  [ButtonVariants.QUIET]: 'bg-transparent text-ink-muted border-transparent hover:text-ink',
};

const sizes: Record<ControlSize, string> = {
  // Matches the `lg` input, so a form's submit lines up with the fields above it.
  [ControlSizes.LG]: 'h-11 px-5 text-sm font-semibold',
  [ControlSizes.MD]: 'h-10 px-4 text-sm font-medium',
  [ControlSizes.SM]: 'h-8 px-3 text-xs font-medium',
};

export function Button({
  variant = ButtonVariants.PRIMARY,
  size = ControlSizes.MD,
  busy = false,
  className = '',
  onClick,
  ...props
}: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (busy || props.disabled === true) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  }

  return (
    <button
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={handleClick}
      className={`inline-flex items-center justify-center gap-2 rounded-brand border transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

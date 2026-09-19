'use client';

import type { ButtonHTMLAttributes, MouseEvent } from 'react';

export type ButtonVariant = 'primary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Work is in flight. Sets `aria-busy` and `aria-disabled` and guards the click —
   * deliberately not `disabled`, which drops keyboard focus and throws a keyboard
   * user back to the top of the form mid-submit.
   */
  busy?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-action text-ink-on-action hover:bg-action-hover',
  ghost: 'bg-transparent text-action hover:bg-sunken',
};

const sizes: Record<ButtonSize, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-xs',
};

export function Button({
  variant = 'primary',
  size = 'md',
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
      className={`inline-flex items-center justify-center rounded-brand font-medium transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

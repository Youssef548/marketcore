'use client';

import type { ButtonHTMLAttributes, MouseEvent } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';
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
  primary: 'bg-action text-ink-on-action border-transparent hover:bg-action-hover',
  // Bordered rather than transparent: in this direction the second action is a thing
  // you can see, not an absence. It is `secondary` rather than `ghost` because a
  // bordered ghost is a name that lies about what it paints.
  secondary: 'bg-panel text-ink border-rule-strong hover:bg-sunken',
  quiet: 'bg-transparent text-ink-muted border-transparent hover:text-ink',
};

const sizes: Record<ButtonSize, string> = {
  md: 'h-10 px-4 text-sm',
  sm: 'h-8 px-3 text-xs',
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
      className={`inline-flex items-center justify-center gap-2 rounded-brand border font-medium transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

import type { LabelHTMLAttributes } from 'react';

export function Label({ className = '', ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`block text-sm font-medium text-gray-700 ${className}`} {...props} />;
}

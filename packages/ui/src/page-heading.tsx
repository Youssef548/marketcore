import type { PageHeadingProps } from './interfaces/page-heading.interface';

/** A page's title: one size, one weight, and the outline level the page needs. */
export function PageHeading({ level = 1, className = '', ...props }: PageHeadingProps) {
  const Tag = level === 2 ? 'h2' : 'h1';
  return <Tag className={`text-2xl font-bold tracking-tight text-ink ${className}`} {...props} />;
}

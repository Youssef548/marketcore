import { HeadingLevels } from './constants';
import type { PageHeadingProps } from './interfaces/page-heading.interface';

/** A page's title: one size, one weight, and the outline level the page needs. */
export function PageHeading({ level = HeadingLevels.H1, className = '', ...props }: PageHeadingProps) {
  const Tag = level === HeadingLevels.H2 ? 'h2' : 'h1';
  return <Tag className={`text-2xl font-bold tracking-tight text-ink ${className}`} {...props} />;
}

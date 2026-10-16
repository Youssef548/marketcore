import type { HTMLAttributes } from 'react';

export interface PageHeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /**
   * The outline level. A page's own title is `1`; a page inside the shell is `2`, because the
   * shell's top bar already carries the page's `h1`.
   */
  level?: 1 | 2;
}

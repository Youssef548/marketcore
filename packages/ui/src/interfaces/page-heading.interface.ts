import type { HTMLAttributes } from 'react';
import type { HeadingLevel } from '../constants';

export interface PageHeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /**
   * The outline level: `HeadingLevels.H1` for a page's own title, `H2` inside the shell, whose top
   * bar already carries the page's `h1`.
   */
  level?: HeadingLevel;
}

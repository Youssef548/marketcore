import type { HTMLAttributes } from 'react';
import type { HeadingLevel } from '../constants';

export interface PageHeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /**
   * The outline level: `HeadingLevels.H1` for a page's own title — the only `h1` in the
   * document — and `H2` for a section inside that page.
   */
  level?: HeadingLevel;
}

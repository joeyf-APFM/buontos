import type { ReactNode } from 'react';
import classes from './page.module.css';

export interface PaneStackProps {
  /** Panes (the kit's, or the shared panels'), top to bottom. */
  children: ReactNode;
}

/**
 * Panes in one column, 12px apart, each at its own content height, for a
 * detail page that scrolls. Panes side by side share borders (PageLayout's
 * content row); stacked panes keep their own borders and corners.
 */
export function PaneStack({ children }: PaneStackProps) {
  return <div className={classes.stack}>{children}</div>;
}

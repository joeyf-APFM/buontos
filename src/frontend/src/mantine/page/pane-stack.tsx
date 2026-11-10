import type { ReactNode } from 'react';
import classes from './page.module.css';

export interface PaneStackProps {
  /** Panes (the kit's, or the shared panels'), top to bottom. */
  children: ReactNode;
}

/**
 * Panes in one column, sharing 1px borders, each at its own content height,
 * for a detail page that scrolls. Only the stack's outer corners are rounded.
 * Put only panes (the kit's, or the shared panels') in it: a toolbar or a
 * heading goes above the stack.
 */
export function PaneStack({ children }: PaneStackProps) {
  return <div className={classes.stack}>{children}</div>;
}

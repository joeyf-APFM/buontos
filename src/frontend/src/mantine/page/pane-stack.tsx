import { Children, type CSSProperties, type ReactNode } from 'react';
import classes from './page.module.css';

export interface PaneStackProps {
  /** Panes (the kit's, or the shared panels'). */
  children: ReactNode;
  /**
   * Relative weights, one per pane, which lay the panes side by side in a row
   * sharing 1px borders: `[1, 2]` gives 1/3 and 2/3 of the width. Without it
   * the panes stay in one column, each at its own content height.
   */
  sizes?: number[];
}

/**
 * Panes in one column, sharing 1px borders, each at its own content height,
 * for a detail page that scrolls. Only the stack's outer corners are rounded.
 * Put only panes (the kit's, or the shared panels') in it: a toolbar or a
 * heading goes above the stack. With `sizes`, a row of weighted panes instead.
 */
export function PaneStack({ children, sizes }: PaneStackProps) {
  if (!sizes?.length) return <div className={classes.stack}>{children}</div>;
  return (
    <div className={classes.stack} data-sizes="">
      {Children.toArray(children).map((child, i) => (
        <div
          key={i}
          className={classes.stackCell}
          style={{ '--pane-size': String(sizes[i] ?? 1) } as CSSProperties}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

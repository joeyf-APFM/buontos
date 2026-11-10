import { useId, type ReactNode } from 'react';
import classes from './page.module.css';

export interface PaneProps {
  /** The pane's heading, in a 36px head; it also names the pane. */
  title?: string;
  /** At the end of the head. */
  actions?: ReactNode;
  /** No padding in the body, for a grid that runs edge to edge. */
  flush?: boolean;
  children: ReactNode;
  /** Names the pane when it has no title. */
  'aria-label'?: string;
  /** Added to the pane's own class, such as a caller's margin. */
  className?: string;
}

/**
 * A region of the page with a 1px border and no shadow. Panes side by side
 * share one border and drop their corners (page.module.css).
 */
export function Pane({ title, actions, flush = false, children, 'aria-label': ariaLabel, className }: PaneProps) {
  const titleId = useId();
  const head = title || actions;
  return (
    <section
      className={className ? `${classes.pane} ${className}` : classes.pane}
      aria-label={ariaLabel}
      aria-labelledby={!ariaLabel && title ? titleId : undefined}
    >
      {head && (
        <div className={classes.paneHead}>
          {title && (
            // A long title keeps to one line; its title shows it in full
            <h2 id={titleId} className={classes.paneTitle} title={title}>
              {title}
            </h2>
          )}
          {actions && <div className={classes.paneActions}>{actions}</div>}
        </div>
      )}
      <div className={classes.paneBody} data-flush={flush || undefined}>
        {children}
      </div>
    </section>
  );
}

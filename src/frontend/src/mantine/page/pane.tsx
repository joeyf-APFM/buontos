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
}

/**
 * A region of the page with a 1px border and no shadow. Panes side by side
 * share one border and drop their corners (page.module.css).
 */
export function Pane({ title, actions, flush = false, children, 'aria-label': ariaLabel }: PaneProps) {
  const titleId = useId();
  const head = title || actions;
  return (
    <section
      className={classes.pane}
      aria-label={ariaLabel}
      aria-labelledby={!ariaLabel && title ? titleId : undefined}
    >
      {head && (
        <div className={classes.paneHead}>
          {title && (
            <h2 id={titleId} className={classes.paneTitle}>
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

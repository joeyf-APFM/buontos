import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
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
  /**
   * Puts the whole title in the heading's `title` attribute, for a title that
   * can be too long for the head (it keeps to one line). Off by default, so
   * a short title gets no tooltip repeating it.
   */
  titleTooltip?: boolean;
  /**
   * Lets the title fold the body away. The body stays mounted when folded, so
   * what is typed or loaded in it survives. Needs a `title`.
   */
  collapsible?: boolean;
  /** With `collapsible`: start folded. */
  defaultCollapsed?: boolean;
}

/**
 * A region of the page with a 1px border and no shadow. Panes side by side
 * share one border and drop their corners (page.module.css).
 */
export function Pane({
  title,
  actions,
  flush = false,
  children,
  'aria-label': ariaLabel,
  className,
  titleTooltip = false,
  collapsible = false,
  defaultCollapsed = false,
}: PaneProps) {
  const titleId = useId();
  const bodyId = useId();
  const foldable = collapsible && !!title;
  const [collapsed, setCollapsed] = useState(foldable && defaultCollapsed);
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
            <h2 id={titleId} className={classes.paneTitle} title={titleTooltip ? title : undefined}>
              {foldable ? (
                <button
                  type="button"
                  className={classes.paneFold}
                  aria-expanded={!collapsed}
                  aria-controls={bodyId}
                  onClick={() => setCollapsed((c) => !c)}
                >
                  <ChevronDown size={14} aria-hidden className={classes.paneChevron} data-collapsed={collapsed || undefined} />
                  {title}
                </button>
              ) : (
                title
              )}
            </h2>
          )}
          {actions && <div className={classes.paneActions}>{actions}</div>}
        </div>
      )}
      <div id={bodyId} className={classes.paneBody} data-flush={flush || undefined} hidden={collapsed || undefined}>
        {children}
      </div>
    </section>
  );
}

import type { ReactNode } from 'react';
import classes from './page.module.css';

export interface FilterBarProps {
  /** The filter fields, 6px apart. */
  children: ReactNode;
  /** Muted text at the end of the bar, such as the result count. */
  hint?: ReactNode;
}

/** The row of filters under the header, ruled off from the panes below. */
export function FilterBar({ children, hint }: FilterBarProps) {
  return (
    <div className={classes.bar}>
      {children}
      {hint && <span className={classes.hint}>{hint}</span>}
    </div>
  );
}

import type { ReactNode } from 'react';
import classes from './page.module.css';

export interface PageHeaderProps {
  title: string;
  /** Beside the title, such as type and status tags. */
  badges?: ReactNode;
  /** At the end of the line, such as New asset. */
  actions?: ReactNode;
  /** The title's id, for aria-labelledby. */
  titleId?: string;
}

/** The page's one-line header: the 16px display-font title, its badges, and actions at the end. */
export function PageHeader({ title, badges, actions, titleId }: PageHeaderProps) {
  return (
    <div className={classes.header}>
      <h1 id={titleId} className={classes.title} title={title}>
        {title}
      </h1>
      {badges}
      {actions && <div className={classes.headerEnd}>{actions}</div>}
    </div>
  );
}

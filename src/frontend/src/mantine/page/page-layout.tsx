import type { ReactNode } from 'react';
import classes from './page.module.css';

export interface PageLayoutProps {
  /** Above the header, in the explorer's breadcrumb style (links in the accent). */
  breadcrumb?: ReactNode;
  /** A PageHeader. */
  header: ReactNode;
  /** A FilterBar, under the header. */
  filters?: ReactNode;
  /** Beside the main column on the right, 280px wide (the explorer's details panel). */
  aside?: ReactNode;
  /**
   * Fill the main area under the top bar, with the panes scrolling inside and
   * borders only between them (the explorer). Otherwise the page keeps its
   * natural height and the panes sit in a 14px margin with full borders.
   */
  fullBleed?: boolean;
  /** The panes, side by side. */
  children: ReactNode;
}

/**
 * A page laid out like the Asset Explorer: breadcrumb, a one-line header, the
 * filter bar, then panes, with an optional aside. Its route goes in
 * FULL_BLEED_ROUTES (mantine/shell/full-bleed.ts), so the layout's padding and
 * breadcrumbs give way to these.
 */
export function PageLayout({ breadcrumb, header, filters, aside, fullBleed = false, children }: PageLayoutProps) {
  return (
    <div className={classes.page} data-full-bleed={fullBleed || undefined}>
      <div className={classes.main}>
        {breadcrumb && <div className={classes.crumb}>{breadcrumb}</div>}
        {header}
        {filters}
        <div className={classes.content}>{children}</div>
      </div>
      {aside && <div className={classes.aside}>{aside}</div>}
    </div>
  );
}

import type { ReactNode } from 'react';
import classes from './page.module.css';

export interface PageLayoutProps {
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
  /**
   * Below this width the panes stack in one column, sharing a top border
   * instead of a side one: 'lg' is under 1024px, Tailwind's lg. Off by default.
   */
  stackBelow?: 'lg';
  /** The panes, side by side. */
  children: ReactNode;
}

/**
 * A page laid out like the Asset Explorer: a one-line header, the filter bar,
 * then panes, with an optional aside, under the shell's breadcrumb. Its route
 * goes in FULL_BLEED_ROUTES (mantine/shell/full-bleed.ts), so the layout's
 * padding gives way to these.
 */
export function PageLayout({ header, filters, aside, fullBleed = false, stackBelow, children }: PageLayoutProps) {
  return (
    <div className={classes.page} data-full-bleed={fullBleed || undefined}>
      <div className={classes.main}>
        {header}
        {filters}
        <div className={classes.content} data-stack-below={stackBelow}>
          {children}
        </div>
      </div>
      {aside && <div className={classes.aside}>{aside}</div>}
    </div>
  );
}

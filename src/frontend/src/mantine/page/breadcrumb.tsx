import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Home as HomeIcon } from 'lucide-react';
import classes from './page.module.css';

export interface BreadcrumbItem {
  label: string;
  /** A link; without one the item is plain text (the current page). */
  to?: string;
}

export interface BreadcrumbProps {
  /** After the Home icon link, each behind a "/" separator. */
  items?: BreadcrumbItem[];
}

/**
 * The page's breadcrumb for PageLayout's `breadcrumb` slot: the Home icon
 * link (unnamed, as the layout's was: R16), then the items. Its links take
 * the slot's accent; outside the slot (loading and error states) it keeps
 * the same markup.
 */
export function Breadcrumb({ items = [] }: BreadcrumbProps) {
  return (
    <nav aria-label="breadcrumb" className={classes.crumbTrail}>
      <Link to="/" className={classes.crumbHome}>
        <HomeIcon aria-hidden />
      </Link>
      {items.map((item, i) => (
        <Fragment key={`${i}:${item.label}`}>
          <span aria-hidden>/</span>
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

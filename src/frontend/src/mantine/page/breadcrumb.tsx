import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Menu, UnstyledButton } from '@mantine/core';
import { Home as HomeIcon } from 'lucide-react';
import { collapseTrail } from './collapse-trail';
import classes from './page.module.css';

export interface BreadcrumbItem {
  label: string;
  /** A link; the last item, the current page, is plain text whatever it has. */
  to?: string;
  /** Router state for the link (the shell marks its crumbs' navigations). */
  state?: unknown;
  /** Instead of a link: a button that does this. */
  onSelect?: () => void;
  /** The Home crumb: its icon sits before the word. */
  home?: boolean;
}

export interface BreadcrumbProps {
  /** Every crumb, Home first; the last is the current page. */
  items: BreadcrumbItem[];
  /** The nav's accessible name. */
  label: string;
  /** The name of the "…" button that lists the collapsed crumbs. */
  moreLabel?: string;
  /** More crumbs than this collapse their middle into "…". */
  max?: number;
  /** The last item is the current page (plain text, aria-current); off, it keeps its link. */
  lastIsCurrent?: boolean;
}

function Crumb({ item, current }: { item: BreadcrumbItem; current: boolean }) {
  const content = (
    <>
      {item.home && <HomeIcon aria-hidden className={classes.crumbHomeIcon} />}
      <span className={classes.crumbLabel}>{item.label}</span>
    </>
  );
  if (current) {
    return (
      <span aria-current="page" className={classes.crumbCurrent} title={item.label}>
        {item.label}
      </span>
    );
  }
  if (item.to) {
    return (
      <Link to={item.to} state={item.state} className={classes.crumbLink} title={item.label}>
        {content}
      </Link>
    );
  }
  if (item.onSelect) {
    return (
      <UnstyledButton className={classes.crumbLink} onClick={item.onSelect} title={item.label}>
        {content}
      </UnstyledButton>
    );
  }
  return (
    <span className={classes.crumbText} title={item.label}>
      {item.label}
    </span>
  );
}

/**
 * The breadcrumb the shell draws on every page: Home, then each crumb behind
 * a ">", one line. Long labels end in an ellipsis (their full text is the
 * title); a trail longer than `max` keeps its first crumb and last `max - 2`,
 * listing the others in the "…" menu.
 */
export function Breadcrumb({ items, label, moreLabel, max = 6, lastIsCurrent = true }: BreadcrumbProps) {
  const trail = collapseTrail(items, max);
  const last = lastIsCurrent ? items.length - 1 : -1;
  const entries: { key: string; node: ReactNode }[] = [];
  const add = (item: BreadcrumbItem, index: number) =>
    entries.push({ key: `${index}:${item.label}`, node: <Crumb item={item} current={index === last} /> });

  if (!trail.collapsed) {
    trail.crumbs.forEach(add);
  } else {
    add(trail.head, 0);
    entries.push({
      key: 'more',
      node: (
        <Menu position="bottom-start" withinPortal>
          <Menu.Target>
            <UnstyledButton className={classes.crumbLink} aria-label={moreLabel}>
              …
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            {trail.hidden.map((item, i) =>
              item.to ? (
                <Menu.Item key={i} component={Link} to={item.to} state={item.state}>
                  {item.label}
                </Menu.Item>
              ) : (
                <Menu.Item key={i} onClick={item.onSelect} disabled={!item.onSelect}>
                  {item.label}
                </Menu.Item>
              ),
            )}
          </Menu.Dropdown>
        </Menu>
      ),
    });
    const tailStart = items.length - trail.tail.length;
    trail.tail.forEach((item, i) => add(item, tailStart + i));
  }

  return (
    <nav aria-label={label} className={classes.crumbTrail}>
      <ol className={classes.crumbList}>
        {entries.map((entry, i) => (
          <li key={entry.key} className={classes.crumbItem}>
            {i > 0 && (
              <span aria-hidden data-crumb-separator="" className={classes.crumbSeparator}>
                {'>'}
              </span>
            )}
            {entry.node}
          </li>
        ))}
      </ol>
    </nav>
  );
}

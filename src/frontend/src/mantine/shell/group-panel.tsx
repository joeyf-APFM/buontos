import { Fragment, useEffect, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Pin } from 'lucide-react';
import { NAV_GROUPS, groupFace, menuNavState, type ActiveLocation, type NavGroupId, type NavItem, type NavSection } from './nav-config';
import { useShellStore } from './use-shell-store';
import classes from './shell.module.css';

interface GroupPanelProps {
  group: NavGroupId;
  sections: NavSection[];
  /** The current page's place in the menu, or null. */
  here: ActiveLocation | null;
}

/**
 * The open group's menu: titled sections, items, and expandable sub-items.
 * It highlights one item, the current page, and only when the page is in
 * this group (Build's Asset types isn't highlighted: the page is Semantics').
 */
export function GroupPanel({ group, sections, here }: GroupPanelProps) {
  const { t } = useTranslation(['shell', 'navigation', 'settings', 'features', 'concepts', 'data-contracts']);
  const { pathname } = useLocation();
  const pinned = useShellStore((s) => s.pinned);
  const expanded = useShellStore((s) => s.expanded);
  const { setPinned, toggleExpanded } = useShellStore((s) => s.actions);

  const match = here?.group === group ? here : null;
  // The current page's place, one id per depth: item, sub-item, its sub-item
  const place = match ? [match.itemId, match.childId, match.grandchildId] : [];
  // Every link here keeps this group for the page it opens
  const navState = menuNavState(group);
  const face = groupFace(NAV_GROUPS.find((g) => g.id === group)!);
  const groupLabel = t(face.labelKey);

  // Show the sub-items of the page you arrive on (you can still fold them):
  // Concepts for Define, and Define as well for Author Concepts
  const activeParent = match?.childId ? match.itemId : null;
  const activeSubParent = match?.grandchildId ? match.childId! : null;
  const activeGrandchild = match?.grandchildId;
  useEffect(() => {
    for (const id of [activeParent, activeSubParent]) {
      if (id && !useShellStore.getState().expanded.includes(id)) toggleExpanded(id);
    }
  }, [activeParent, activeSubParent, activeGrandchild, pathname, toggleExpanded]);

  // Whether an item, at its depth, is on the current page's place
  const onPlace = (item: NavItem, depth: number) => place[depth] === item.id;

  // A parent with a page of its own opens it (and unfolds); otherwise, or
  // when you are already on one of its pages, clicking only folds or unfolds.
  const onParentClick = (item: NavItem, depth: number) => (event: MouseEvent) => {
    const navigates = !!item.path && !onPlace(item, depth);
    if (navigates) {
      if (!expanded.includes(item.id)) toggleExpanded(item.id);
      return;
    }
    event.preventDefault();
    toggleExpanded(item.id);
  };

  // One indent step per depth
  const depthClass = [classes.item, `${classes.item} ${classes.subItem}`, `${classes.item} ${classes.subItem} ${classes.subSubItem}`];

  const renderItem = (item: NavItem, depth = 0): ReactNode => {
    const Icon = item.icon;
    const isOpen = !!item.children && expanded.includes(item.id);
    const onIt = onPlace(item, depth);
    // The page is this item's own, not one of its (shown) sub-items'
    const isPage = onIt && !item.children?.some((c) => c.id === place[depth + 1]);
    // An unfolded parent leaves the highlight to its sub-item; a folded one
    // stands in for it
    const isActive = isPage || (!!item.children && !isOpen && onIt);
    const Caret = isOpen ? ChevronDown : ChevronRight;
    const content = (
      <>
        {/* Sub-items show no icon */}
        {depth === 0 && <Icon className={classes.itemIcon} aria-hidden />}
        <span className={classes.itemLabel}>{t(item.labelKey)}</span>
        {item.children && <Caret className={classes.caret} aria-hidden />}
      </>
    );
    const common = {
      className: depthClass[Math.min(depth, depthClass.length - 1)],
      'data-depth': depth,
      'data-active': isActive || undefined,
      'aria-current': isPage ? ('page' as const) : undefined,
      'aria-expanded': item.children ? isOpen : undefined,
    };
    const onClick = item.children ? onParentClick(item, depth) : undefined;
    const row = item.path ? (
      <UnstyledButton component={Link} to={item.path} state={navState} {...common} onClick={onClick}>
        {content}
      </UnstyledButton>
    ) : (
      <UnstyledButton {...common} onClick={onClick}>
        {content}
      </UnstyledButton>
    );
    const children = isOpen && item.children!.map((child) => renderItem(child, depth + 1));
    // A top-level item wraps its sub-items; deeper ones sit beside theirs
    if (depth === 0) {
      return (
        <div key={item.id}>
          {row}
          {children}
        </div>
      );
    }
    // Always in a Fragment, so unfolding keeps the row (and its focus)
    return (
      <Fragment key={item.id}>
        {row}
        {children}
      </Fragment>
    );
  };

  return (
    <nav id="shell-group-panel" className={classes.panel} aria-label={groupLabel}>
      <div className={classes.panelTitle}>
        <span>{groupLabel}</span>
        <UnstyledButton
          className={classes.pin}
          aria-pressed={pinned}
          title={t('shell:panel.pinTitle')}
          onClick={() => setPinned(!pinned)}
        >
          <Pin size={11} aria-hidden />
          {pinned ? t('shell:panel.pinned') : t('shell:panel.pin')}
        </UnstyledButton>
      </div>
      <div className={classes.items}>
        {sections.map((section, i) => (
          <div key={section.titleKey ?? i}>
            {/* A section titled as the panel (Govern's first) shows no heading of its own */}
            {section.titleKey && section.titleKey !== face.labelKey && (
              <div className={classes.section}>{t(section.titleKey)}</div>
            )}
            {section.items.map((item) => renderItem(item))}
          </div>
        ))}
      </div>
      <div className={classes.foot}>{t('shell:panel.hint')}</div>
    </nav>
  );
}

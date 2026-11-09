import { useEffect, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Pin } from 'lucide-react';
import { NAV_GROUPS, matchInGroup, type NavGroupId, type NavItem, type NavSection } from './nav-config';
import { useShellStore } from './use-shell-store';
import classes from './shell.module.css';

interface GroupPanelProps {
  group: NavGroupId;
  sections: NavSection[];
}

/** The open group's menu: titled sections, items, and expandable sub-items. */
export function GroupPanel({ group, sections }: GroupPanelProps) {
  const { t } = useTranslation(['shell', 'navigation', 'settings', 'features']);
  const { pathname } = useLocation();
  const pinned = useShellStore((s) => s.pinned);
  const expanded = useShellStore((s) => s.expanded);
  const { setPinned, toggleExpanded } = useShellStore((s) => s.actions);

  const match = matchInGroup(sections, pathname);
  const groupLabel = t(NAV_GROUPS.find((g) => g.id === group)!.labelKey);

  // Show the sub-items of the page you arrive on (you can still fold them)
  const activeParent = match?.childId ? match.itemId : null;
  useEffect(() => {
    if (activeParent && !useShellStore.getState().expanded.includes(activeParent)) toggleExpanded(activeParent);
  }, [activeParent, pathname, toggleExpanded]);

  // A parent with a page of its own opens it (and unfolds); otherwise, or
  // when you are already on one of its pages, clicking only folds or unfolds.
  const onParentClick = (item: NavItem) => (event: MouseEvent) => {
    const navigates = !!item.path && match?.itemId !== item.id;
    if (navigates) {
      if (!expanded.includes(item.id)) toggleExpanded(item.id);
      return;
    }
    event.preventDefault();
    toggleExpanded(item.id);
  };

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const isOpen = !!item.children && expanded.includes(item.id);
    const isPage = match?.itemId === item.id && !match.childId;
    // A folded parent stands in for its active sub-item
    const isActive = isPage || (!!item.children && !isOpen && match?.itemId === item.id);
    const Caret = isOpen ? ChevronDown : ChevronRight;
    const content = (
      <>
        <Icon className={classes.itemIcon} aria-hidden />
        <span className={classes.itemLabel}>{t(item.labelKey)}</span>
        {item.children && <Caret className={classes.caret} aria-hidden />}
      </>
    );
    const common = {
      className: classes.item,
      'data-active': isActive || undefined,
      'aria-current': isPage ? ('page' as const) : undefined,
      'aria-expanded': item.children ? isOpen : undefined,
    };

    return (
      <div key={item.id}>
        {item.path ? (
          <UnstyledButton component={Link} to={item.path} {...common} onClick={item.children ? onParentClick(item) : undefined}>
            {content}
          </UnstyledButton>
        ) : (
          <UnstyledButton {...common} onClick={onParentClick(item)}>
            {content}
          </UnstyledButton>
        )}
        {isOpen &&
          item.children!.map((child) => {
            const isChildPage = match?.childId === child.id;
            return (
              <UnstyledButton
                key={child.id}
                component={Link}
                to={child.path!}
                className={`${classes.item} ${classes.subItem}`}
                data-active={isChildPage || undefined}
                aria-current={isChildPage ? 'page' : undefined}
              >
                <span className={classes.itemLabel}>{t(child.labelKey)}</span>
              </UnstyledButton>
            );
          })}
      </div>
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
            {section.titleKey && <div className={classes.section}>{t(section.titleKey)}</div>}
            {section.items.map(renderItem)}
          </div>
        ))}
      </div>
      <div className={classes.foot}>{t('shell:panel.hint')}</div>
    </nav>
  );
}

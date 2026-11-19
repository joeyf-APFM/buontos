import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { usePermissions } from '@/stores/permissions-store';
import { useFeatureVisibilityStore } from '@/stores/feature-visibility-store';
import { activeLocation, locateIn, menuNavGroup, visibleNav } from './nav-config';

/**
 * The menu as this user sees it, and the current page's place in it, for the
 * side menu and the breadcrumb: within the group a menu navigation was made
 * in, when that group lists the page (Build → Asset types stays Build's);
 * otherwise by the URL alone. `here` is null when the page is in no group
 * the user sees.
 */
export function useShellNav() {
  const { pathname, search, state } = useLocation();
  const { permissions, hasPermission } = usePermissions();
  const allowedMaturities = useFeatureVisibilityStore((s) => s.allowedMaturities);

  const nav = useMemo(
    () =>
      visibleNav(
        (id, level) => hasPermission(id, level),
        (maturity) => allowedMaturities.includes(maturity),
      ),
    // hasPermission reads the store; recompute when the permissions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions, hasPermission, allowedMaturities],
  );
  const navGroup = menuNavGroup(state);
  const located = (navGroup && nav[navGroup] && locateIn(navGroup, pathname, search)) || activeLocation(pathname, search);
  const here = located && nav[located.group] ? located : null;
  return { nav, here };
}

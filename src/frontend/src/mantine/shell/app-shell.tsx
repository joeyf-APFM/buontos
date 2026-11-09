import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { usePermissions } from '@/stores/permissions-store';
import { useFeatureVisibilityStore } from '@/stores/feature-visibility-store';
import { FeatureAccessLevel } from '@/types/settings';
import { NAV_GROUPS, visibleNav } from './nav-config';
import { useShellStore } from './use-shell-store';
import { SideStrip } from './side-strip';
import { GroupPanel } from './group-panel';
import { TopBar } from './top-bar';
import { HelixButton } from '@/mantine/helix/helix-button';
import { HelixPanel } from '@/mantine/helix/helix-panel';
import { HelixWindow } from '@/mantine/helix/helix-window';
import { useHelixStore } from '@/mantine/helix/helix-store';
import classes from './shell.module.css';

/** The one page where Helix is the right-hand pane rather than a window. */
const HELIX_PANE_PATH = '/assets';

/**
 * The app shell for every route: top bar, icon strip, the open group's panel,
 * the page, and Ask Helix: the top-bar button, and Helix itself as the
 * right-hand pane on the explorer or a floating window everywhere else (R24).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { permissions, hasPermission } = usePermissions();
  const allowedMaturities = useFeatureVisibilityStore((s) => s.allowedMaturities);
  const openGroup = useShellStore((s) => s.openGroup);
  const { afterNavigate } = useShellStore((s) => s.actions);
  const helixOpen = useHelixStore((s) => s.isOpen && !!s.config?.enabled);
  const helixEnabled = useHelixStore((s) => !!s.config?.enabled);
  // On the explorer Helix answers about the selection, beside it
  const helixAsPane = pathname === HELIX_PANE_PATH;

  const nav = useMemo(
    () =>
      visibleNav(
        (id) => hasPermission(id, FeatureAccessLevel.READ_ONLY),
        (maturity) => allowedMaturities.includes(maturity),
        (action) => action === 'helix' && helixEnabled,
      ),
    // hasPermission reads the store; recompute when the permissions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions, hasPermission, allowedMaturities, helixEnabled],
  );
  const groups = NAV_GROUPS.map((g) => g.id).filter((id) => nav[id]);

  // An unpinned panel closes once you have gone somewhere
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    afterNavigate();
  }, [pathname, afterNavigate]);

  return (
    <div className={classes.shell}>
      <TopBar helixSlot={<HelixButton />} />
      <div className={classes.body}>
        <div className={`${classes.side} apfm-surface`}>
          <SideStrip groups={groups} />
          {openGroup && nav[openGroup] && <GroupPanel group={openGroup} sections={nav[openGroup]} />}
        </div>
        <div className={classes.main}>{children}</div>
        {helixOpen && helixAsPane && <HelixPanel />}
      </div>
      {helixOpen && !helixAsPane && <HelixWindow />}
    </div>
  );
}

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { usePermissions } from '@/stores/permissions-store';
import { useFeatureVisibilityStore } from '@/stores/feature-visibility-store';
import { FeatureAccessLevel } from '@/types/settings';
import { NAV_GROUPS, SETTINGS_GATE, activeLocation, isPanelGroup, locateIn, menuNavGroup, visibleNav } from './nav-config';
import { useShellStore } from './use-shell-store';
import { SideStrip } from './side-strip';
import { GroupPanel } from './group-panel';
import { TopBar } from './top-bar';
import { HelixButton } from '@/mantine/helix/helix-button';
import { HelixWindow } from '@/mantine/helix/helix-window';
import { OntosWindow } from '@/mantine/ontos/ontos-window';
import { useOntosStore } from '@/mantine/ontos/ontos-store';
import { useCopilotStore } from '@/stores/copilot-store';
import { useHelixStore } from '@/mantine/helix/helix-store';
import classes from './shell.module.css';

/**
 * The app shell for every route: top bar, icon strip, the open group's panel,
 * the page, and the two assistants: Ask Helix (top-bar and strip buttons)
 * and Ask Ontos (strip button), each a floating window on every page (R25, R26).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname, search, state } = useLocation();
  const { permissions, hasPermission } = usePermissions();
  const allowedMaturities = useFeatureVisibilityStore((s) => s.allowedMaturities);
  const openGroup = useShellStore((s) => s.openGroup);
  const { afterNavigate } = useShellStore((s) => s.actions);
  const helixOpen = useHelixStore((s) => s.isOpen && !!s.config?.enabled);
  const ontosEnabled = useOntosStore((s) => !!s.status?.enabled);
  const ontosOpen = useCopilotStore((s) => s.isOpen) && ontosEnabled;

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
  const groups = NAV_GROUPS.map((g) => g.id).filter((id) => nav[id]);
  const settingsGate = hasPermission(SETTINGS_GATE, FeatureAccessLevel.READ_ONLY);
  // The current page's place in the menu, in a group this user sees: within
  // the group a menu navigation was made in, when that group lists the page
  // (Build → Asset types stays Build's); otherwise by the URL alone
  const navGroup = menuNavGroup(state);
  const located = (navGroup && nav[navGroup] && locateIn(navGroup, pathname, search)) || activeLocation(pathname, search);
  const here = located && nav[located.group] ? located : null;
  const shownGroup = isPanelGroup(openGroup) && nav[openGroup] ? openGroup : null;

  // After going anywhere (a menu item, an in-page link, back or forward, a
  // typed URL) the panel closes when unpinned, and otherwise follows the page
  // (a change of search alone counts too, such as New Contract's ?new=1)
  const url = pathname + search;
  const lastUrl = useRef(url);
  useEffect(() => {
    if (lastUrl.current === url) return;
    lastUrl.current = url;
    afterNavigate(here);
  }, [url, here, afterNavigate]);

  return (
    <div className={classes.shell}>
      <TopBar helixSlot={<HelixButton />} />
      <div className={classes.body}>
        <div className={`${classes.side} apfm-surface`}>
          <SideStrip groups={groups} nav={nav} settingsGate={settingsGate} here={here} shownGroup={shownGroup} />
          {shownGroup && <GroupPanel group={shownGroup} sections={nav[shownGroup]} settingsGate={settingsGate} here={here} />}
        </div>
        <div className={classes.main}>{children}</div>
      </div>
      {helixOpen && <HelixWindow />}
      {ontosOpen && <OntosWindow />}
    </div>
  );
}

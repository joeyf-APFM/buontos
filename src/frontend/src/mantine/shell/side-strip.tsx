import { UnstyledButton } from '@mantine/core';
import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import {
  NAV_GROUPS,
  groupDefaultPath,
  groupFace,
  type ActiveLocation,
  type NavGroupId,
  type NavSection,
} from './nav-config';
import { useShellStore } from './use-shell-store';
import { useHelixStore } from '@/mantine/helix/helix-store';
import { HelixMark } from '@/mantine/helix/helix-mark';
import { useCopilotStore } from '@/stores/copilot-store';
import { useOntosStore } from '@/mantine/ontos/ontos-store';
import classes from './shell.module.css';

/**
 * Ask Helix, after the last top group (the owner's strip order from the
 * Task 16 review): it opens or closes the Helix window and never opens a
 * group panel. Shown only while Helix is enabled.
 */
function HelixStripButton() {
  const { t } = useTranslation('shell');
  const enabled = useHelixStore((s) => !!s.config?.enabled);
  const isOpen = useHelixStore((s) => s.isOpen);
  const { open, close } = useHelixStore((s) => s.actions);
  if (!enabled) return null;
  return (
    <UnstyledButton
      className={`${classes.groupButton} ${classes.assistantButton}`}
      aria-label={t('strip.askHelix')}
      aria-pressed={isOpen}
      onClick={isOpen ? close : open}
    >
      <HelixMark size={17} />
      {t('strip.helix')}
    </UnstyledButton>
  );
}

/**
 * Ask Ontos, directly under Helix (R26): it opens or closes the Ask Ontos
 * window. Shown only when /api/llm-search/status says it's enabled.
 */
function OntosStripButton() {
  const { t } = useTranslation('shell');
  const enabled = useOntosStore((s) => !!s.status?.enabled);
  const loadStatus = useOntosStore((s) => s.actions.loadStatus);
  const isOpen = useCopilotStore((s) => s.isOpen);
  const togglePanel = useCopilotStore((s) => s.actions.togglePanel);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  if (!enabled) return null;
  return (
    <UnstyledButton
      className={`${classes.groupButton} ${classes.assistantButton}`}
      aria-label={t('strip.askOntos')}
      aria-pressed={isOpen}
      onClick={togglePanel}
    >
      <Sparkles size={17} strokeWidth={1.7} aria-hidden />
      {t('strip.ontos')}
    </UnstyledButton>
  );
}

interface SideStripProps {
  groups: NavGroupId[];
  /** The menu as this user sees it (visibleNav), for each group's default page. */
  nav: Partial<Record<NavGroupId, NavSection[]>>;
  settingsGate: boolean;
  /** The current page's place in the menu, or null. */
  here: ActiveLocation | null;
  /** The group whose panel is showing, or null. */
  shownGroup: NavGroupId | null;
}

/**
 * The icon strip: the top groups in NAV_GROUPS order (Discover, Build,
 * Organization, Semantics, Workflows), then Ask Helix and Ask Ontos, and
 * Settings alone at the bottom (Govern, without the Settings gate).
 *
 * One button is highlighted: the showing panel's group, or else the current
 * page's. A group's button opens its panel and goes to its default page,
 * unless the current page is already in the group; on the showing panel's
 * group it tucks the panel away.
 */
export function SideStrip({ groups, nav, settingsGate, here, shownGroup }: SideStripProps) {
  const { t } = useTranslation(['shell', 'navigation', 'settings']);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { openPanel, closePanel } = useShellStore((s) => s.actions);
  const highlighted = shownGroup ?? here?.group ?? null;

  const onGroupClick = (id: NavGroupId) => {
    if (shownGroup === id) return closePanel();
    const target = here?.group === id ? null : groupDefaultPath(NAV_GROUPS.find((g) => g.id === id)!, nav[id]);
    if (target && target !== pathname) {
      openPanel(id, true);
      navigate(target);
    } else {
      openPanel(id);
    }
  };

  const button = (id: NavGroupId) => {
    const group = NAV_GROUPS.find((g) => g.id === id)!;
    const face = groupFace(group, settingsGate);
    const active = highlighted === id || undefined;
    if (group.link) {
      // A direct link (Workflows): goes to its page and closes any panel, pinned or not
      return (
        <UnstyledButton
          key={id}
          component={Link}
          to={group.link}
          className={classes.groupButton}
          data-active={active}
          aria-current={here?.group === id ? 'page' : undefined}
          onClick={closePanel}
        >
          <face.icon size={17} strokeWidth={1.7} aria-hidden />
          {t(face.labelKey)}
        </UnstyledButton>
      );
    }
    const open = shownGroup === id;
    return (
      <UnstyledButton
        key={id}
        className={classes.groupButton}
        data-active={active}
        aria-expanded={open}
        aria-controls={open ? 'shell-group-panel' : undefined}
        onClick={() => onGroupClick(id)}
      >
        <face.icon size={17} strokeWidth={1.7} aria-hidden />
        {t(face.labelKey)}
      </UnstyledButton>
    );
  };

  const top = groups.filter((g) => g !== 'Settings');

  return (
    <nav className={classes.strip} aria-label={t('shell:strip.label')}>
      {top.map(button)}
      <HelixStripButton />
      <OntosStripButton />
      <div className={classes.stripSpacer} />
      {groups.includes('Settings') && button('Settings')}
    </nav>
  );
}

import { UnstyledButton } from '@mantine/core';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { NAV_GROUPS, activeLocation, groupFace, type NavGroupId } from './nav-config';
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

/**
 * The icon strip: the top groups in NAV_GROUPS order (Discover, Build,
 * Organization, Semantics, Workflows), then Ask Helix and Ask Ontos, and
 * Settings alone at the bottom (Govern, without the Settings gate).
 */
export function SideStrip({ groups, settingsGate }: { groups: NavGroupId[]; settingsGate: boolean }) {
  const { t } = useTranslation(['shell', 'navigation', 'settings']);
  const { pathname } = useLocation();
  const openGroup = useShellStore((s) => s.openGroup);
  const { toggleGroup } = useShellStore((s) => s.actions);
  const currentGroup = activeLocation(pathname)?.group;

  const button = (id: NavGroupId) => {
    const group = NAV_GROUPS.find((g) => g.id === id)!;
    const face = groupFace(group, settingsGate);
    if (group.link) {
      // A direct link (Workflows): goes to its page and opens no panel
      return (
        <UnstyledButton
          key={id}
          component={Link}
          to={group.link}
          className={classes.groupButton}
          aria-current={currentGroup === id ? 'page' : undefined}
        >
          <face.icon size={17} strokeWidth={1.7} aria-hidden />
          {t(face.labelKey)}
        </UnstyledButton>
      );
    }
    const open = openGroup === id;
    return (
      <UnstyledButton
        key={id}
        className={classes.groupButton}
        data-open={open || undefined}
        aria-expanded={open}
        aria-controls={open ? 'shell-group-panel' : undefined}
        onClick={() => toggleGroup(id)}
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

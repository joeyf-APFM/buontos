import { UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { NAV_GROUPS, type NavGroupId } from './nav-config';
import { useShellStore } from './use-shell-store';
import { useHelixStore } from '@/mantine/helix/helix-store';
import { HelixMark } from '@/mantine/helix/helix-mark';
import classes from './shell.module.css';

/**
 * Ask Helix, directly below Discover (the owner's call, over R25's "under the
 * last group"): it opens or closes the Helix window and never opens a group
 * panel. Shown only while Helix is enabled.
 */
function HelixStripButton() {
  const { t } = useTranslation('shell');
  const enabled = useHelixStore((s) => !!s.config?.enabled);
  const isOpen = useHelixStore((s) => s.isOpen);
  const { open, close } = useHelixStore((s) => s.actions);
  if (!enabled) return null;
  return (
    <UnstyledButton
      className={`${classes.groupButton} ${classes.helixButton}`}
      aria-label={t('strip.askHelix')}
      aria-pressed={isOpen}
      onClick={isOpen ? close : open}
    >
      <HelixMark size={17} />
      {t('strip.helix')}
    </UnstyledButton>
  );
}

/** The icon strip: Discover, Ask Helix and the other groups at the top, Settings at the bottom. */
export function SideStrip({ groups }: { groups: NavGroupId[] }) {
  const { t } = useTranslation(['shell', 'navigation', 'settings']);
  const openGroup = useShellStore((s) => s.openGroup);
  const { toggleGroup } = useShellStore((s) => s.actions);

  const button = (id: NavGroupId) => {
    const group = NAV_GROUPS.find((g) => g.id === id)!;
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
        <group.icon size={17} strokeWidth={1.7} aria-hidden />
        {t(group.labelKey)}
      </UnstyledButton>
    );
  };

  const top = groups.filter((g) => g !== 'Settings');
  // Helix goes right after Discover, or first when Discover isn't shown
  const helixAt = top.indexOf('Discover') + 1;

  return (
    <nav className={classes.strip} aria-label={t('shell:strip.label')}>
      {top.slice(0, helixAt).map(button)}
      <HelixStripButton />
      {top.slice(helixAt).map(button)}
      <div className={classes.stripSpacer} />
      {groups.includes('Settings') && button('Settings')}
    </nav>
  );
}

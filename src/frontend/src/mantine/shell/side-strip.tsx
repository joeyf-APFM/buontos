import { UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { NAV_GROUPS, type NavGroupId } from './nav-config';
import { useShellStore } from './use-shell-store';
import classes from './shell.module.css';

/** The icon strip: the four groups at the top, Settings at the bottom. */
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

  return (
    <div className={classes.strip}>
      {groups.filter((g) => g !== 'Settings').map(button)}
      <div className={classes.stripSpacer} />
      {groups.includes('Settings') && button('Settings')}
    </div>
  );
}

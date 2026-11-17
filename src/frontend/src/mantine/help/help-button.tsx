import { useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { HelpDrawer } from './help-drawer';
import classes from './help.module.css';

/** The top bar's help button (a dark "?"); it opens the help drawer. */
export function HelpButton() {
  const { t } = useTranslation('help');
  const [opened, setOpened] = useState(false);

  return (
    <>
      <Tooltip label={t('button.label')}>
        <ActionIcon
          className={classes.button}
          radius="xl"
          size="md"
          aria-label={t('button.label')}
          onClick={() => setOpened(true)}
        >
          ?
        </ActionIcon>
      </Tooltip>
      <HelpDrawer opened={opened} onClose={() => setOpened(false)} />
    </>
  );
}

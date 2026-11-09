/** "Ask Helix" in the top bar, shown only while Helix is enabled. */
import { useEffect } from 'react';
import { UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { HelixMark } from './helix-mark';
import { useHelixStore } from './helix-store';
import classes from './helix.module.css';

export function HelixButton() {
  const { t } = useTranslation('helix');
  const enabled = useHelixStore((s) => !!s.config?.enabled);
  const isOpen = useHelixStore((s) => s.isOpen);
  const { open, close, loadConfig } = useHelixStore((s) => s.actions);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  if (!enabled) return null;
  return (
    <UnstyledButton className={classes.button} aria-pressed={isOpen} onClick={isOpen ? close : open}>
      <HelixMark />
      {t('button')}
    </UnstyledButton>
  );
}

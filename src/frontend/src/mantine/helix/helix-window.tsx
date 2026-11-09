/** Helix in the shared floating assistant window, on every page (R25). */
import { useTranslation } from 'react-i18next';
import { AssistantWindow } from '@/mantine/assistant/assistant-window';
import { HelixContent } from './helix-panel';
import { HelixMark } from './helix-mark';
import { useHelixStore } from './helix-store';
import classes from './helix.module.css';

const isHelixOpen = () => useHelixStore.getState().isOpen;

export function HelixWindow() {
  const { t } = useTranslation('helix');
  const rect = useHelixStore((s) => s.windowRect);
  const focusRequested = useHelixStore((s) => s.focusRequested);
  const { close, setWindowRect, takeFocusRequest } = useHelixStore((s) => s.actions);

  return (
    <AssistantWindow
      title={
        <>
          {t('panel.title')} <span className={classes.headSub}>{t('panel.subtitle')}</span>
        </>
      }
      icon={<HelixMark />}
      closeLabel={t('panel.close')}
      onClose={close}
      isOpen={isHelixOpen}
      rect={rect}
      onRectChange={setWindowRect}
      focusRequested={focusRequested}
      takeFocusRequest={takeFocusRequest}
    >
      <HelixContent />
    </AssistantWindow>
  );
}

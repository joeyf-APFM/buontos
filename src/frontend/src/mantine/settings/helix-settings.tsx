/**
 * Settings → Helix & LLM: the Ask Helix switch, Helix's identity mode (set by
 * the deployment, shown read-only), and the LLM switch and endpoint, which
 * write the same keys as the General page.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Loader, Switch, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from '@/components/settings/settings-page-wrapper';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { useToast } from '@/hooks/use-toast';
import { useHelixStore, type HelixConfig } from '@/mantine/helix/helix-store';
import classes from './settings.module.css';

const PERMISSION_ID = 'settings-general';

interface Values {
  helixEnabled: boolean;
  llmEnabled: boolean;
  llmEndpoint: string;
}

function Row({ label, help, labelFor, children }: { label: string; help: string; labelFor?: string; children: ReactNode }) {
  return (
    <div className={classes.row}>
      <div className={classes.label}>
        {labelFor ? <label htmlFor={labelFor}>{label}</label> : <b>{label}</b>}
        <span>{help}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function HelixSettingsForm() {
  const { t } = useTranslation('helix');
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(PERMISSION_ID, FeatureAccessLevel.READ_WRITE);
  const loadConfig = useHelixStore((s) => s.actions.loadConfig);
  const [values, setValues] = useState<Values | null>(null);
  const [mode, setMode] = useState<HelixConfig['mode'] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (cancelled) return;
        setValues({
          helixEnabled: !!data.helix_enabled,
          llmEnabled: !!data.llm_enabled,
          llmEndpoint: data.llm_endpoint || '',
        });
      })
      .catch(() => !cancelled && setLoadFailed(true));
    // 404 while Helix is off: the mode isn't shown then
    fetch('/api/settings/helix')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => !cancelled && setMode(data?.mode === 'shared' || data?.mode === 'user' ? data.mode : null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!values) return;
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          helix_enabled: values.helixEnabled,
          llm_enabled: values.llmEnabled,
          llm_endpoint: values.llmEndpoint,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      toast({ title: t('settings.saved') });
      void loadConfig(); // show or hide the top-bar button
    } catch {
      toast({ title: t('settings.saveFailed'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loadFailed) return <Alert color="red">{t('settings.loadFailed')}</Alert>;
  if (!values) return <Loader size="sm" />;

  const modeText =
    mode === 'shared'
      ? { value: t('settings.modeShared'), help: t('settings.modeSharedHelp') }
      : mode === 'user'
        ? { value: t('settings.modeUser'), help: t('settings.modeUserHelp') }
        : { value: t('settings.modeUnknown'), help: t('settings.modeHelp') };

  return (
    <div className={classes.page}>
      <div className={classes.head}>
        <h1 className={classes.title}>{t('settings.title')}</h1>
        {canWrite && (
          <Button onClick={save} loading={saving}>
            {t('settings.save')}
          </Button>
        )}
      </div>

      <div className={classes.section}>{t('settings.helixSection')}</div>
      <div className={classes.form}>
        <Row label={t('settings.enable')} help={t('settings.enableHelp')} labelFor="helix-enabled">
          <Switch
            id="helix-enabled"
            checked={values.helixEnabled}
            disabled={!canWrite}
            onChange={(e) => setValues({ ...values, helixEnabled: e.currentTarget.checked })}
          />
        </Row>
        <Row label={t('settings.mode')} help={modeText.help}>
          {modeText.value}
        </Row>
      </div>

      <div className={classes.section}>{t('settings.llmSection')}</div>
      <div className={classes.form}>
        <Row label={t('settings.llmEnable')} help={t('settings.llmEnableHelp')} labelFor="llm-enabled">
          <Switch
            id="llm-enabled"
            checked={values.llmEnabled}
            disabled={!canWrite}
            onChange={(e) => setValues({ ...values, llmEnabled: e.currentTarget.checked })}
          />
        </Row>
        <Row label={t('settings.llmEndpoint')} help={t('settings.llmEndpointHelp')} labelFor="llm-endpoint">
          <TextInput
            id="llm-endpoint"
            className={classes.mono}
            value={values.llmEndpoint}
            disabled={!canWrite || !values.llmEnabled}
            onChange={(e) => setValues({ ...values, llmEndpoint: e.currentTarget.value })}
          />
        </Row>
      </div>
    </div>
  );
}

export default function HelixSettings() {
  const { t } = useTranslation('helix');
  return (
    <SettingsPageWrapper title={t('settings.title')} permissionId={PERMISSION_ID}>
      <HelixSettingsForm />
    </SettingsPageWrapper>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Loader, Select, Switch, TextInput } from '@mantine/core';
import { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, Clock, Edit2, Plus, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { ListViewSkeleton } from '@/components/common/list-view-skeleton';
import { useToast } from '@/hooks/use-toast';
import { Dialog, PageHeader, PageLayout, Pane } from '@/mantine/page';
import list from '@/components/common/list-page.module.css';
import classes from './entitlements-sync.module.css';

interface EntitlementsSyncConfig {
  id: string;
  name: string;
  connection: string;
  schedule: string;
  enabled: boolean;
  catalogs: string[];
  lastSync?: {
    status: 'success' | 'error' | 'running';
    timestamp?: string;
    error?: string;
  };
}

interface ConfigValues {
  name: string;
  connection: string;
  schedule: string;
  enabled: boolean;
  catalogs: string[];
}

interface Connection {
  id: string;
  name: string;
}

const FIELD_CLASSES = { label: classes.label };
const SELECT_CLASSES = { label: classes.label, option: classes.option };
const FORM_ID = 'entitlements-sync-form';

/**
 * The create/edit form. It is the dialog's body, so its fields start afresh
 * each time the dialog opens, and its Save is the footer's (the `form` attribute).
 */
function ConfigForm({
  config,
  connections,
  catalogs,
  onSave,
}: {
  config: EntitlementsSyncConfig | null;
  connections: Connection[];
  catalogs: string[];
  onSave: (values: ConfigValues) => void;
}) {
  const { t } = useTranslation(['entitlements', 'common']);
  const original = Array.isArray(config?.catalogs) ? config.catalogs : [];
  const [name, setName] = useState(config?.name ?? '');
  const [connection, setConnection] = useState<string | null>(config?.connection || null);
  const [schedule, setSchedule] = useState(config?.schedule ?? '');
  // The Select takes one catalog; null is "no catalog"
  const [catalog, setCatalog] = useState<string | null>(original[0] ?? null);
  const [enabled, setEnabled] = useState(config?.enabled ?? false);

  const connectionOptions = connections.map((c) => ({ value: c.id, label: c.name }));
  // A saved value stays selectable (and is kept on save) even when its list didn't load or lacks it
  if (connection && !connectionOptions.some((o) => o.value === connection)) {
    connectionOptions.push({ value: connection, label: connection });
  }
  const catalogOptions = catalogs.map((c) => ({ value: c, label: c }));
  if (catalog && !catalogOptions.some((o) => o.value === catalog)) {
    catalogOptions.push({ value: catalog, label: catalog });
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      name,
      connection: connection ?? '',
      schedule,
      enabled,
      // The Select shows only the first catalog: saving it untouched keeps the others
      catalogs: catalog === null ? [] : catalog === original[0] ? original : [catalog],
    });
  };

  return (
    <form id={FORM_ID} onSubmit={submit} className={classes.form}>
      <TextInput
        id="name"
        label={t('common:labels.name')}
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        required
        withAsterisk={false}
        classNames={FIELD_CLASSES}
        data-autofocus
      />
      <Select
        id="connection"
        label={t('common:labels.connection')}
        placeholder={t('common:placeholders.selectConnection')}
        data={connectionOptions}
        value={connection}
        onChange={setConnection}
        classNames={SELECT_CLASSES}
      />
      <TextInput
        id="schedule"
        label={t('entitlements:sync.scheduleCron')}
        placeholder={t('common:placeholders.enterCronExpression')}
        value={schedule}
        onChange={(e) => setSchedule(e.currentTarget.value)}
        required
        withAsterisk={false}
        classNames={FIELD_CLASSES}
      />
      <Select
        id="catalogs"
        label={t('entitlements:sync.catalogs')}
        placeholder={t('common:placeholders.selectCatalogs')}
        data={catalogOptions}
        value={catalog}
        onChange={setCatalog}
        classNames={SELECT_CLASSES}
      />
      <Switch
        id="enabled"
        label={t('common:labels.enabled')}
        checked={enabled}
        onChange={(e) => setEnabled(e.currentTarget.checked)}
      />
    </form>
  );
}

export default function EntitlementsSync() {
  const { t } = useTranslation(['entitlements', 'common']);
  const { toast } = useToast();
  const [configs, setConfigs] = useState<EntitlementsSyncConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // The list's failed load, shown with a Retry
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EntitlementsSyncConfig | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [catalogs, setCatalogs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EntitlementsSyncConfig | null>(null);
  // The confirm keeps the name it was opened for while it closes
  const [deleteName, setDeleteName] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Only the latest load may set the list: an earlier one that answers late is dropped
  const loadId = useRef(0);
  // A second click while a request is out sends nothing
  const busy = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  // Where focus goes once the delete confirm has closed: New Configuration
  // after a delete, since the row is gone; none otherwise, so the kit gives it
  // back to the row's delete button
  const afterDelete = useRef<HTMLElement | null>(null);

  const fetchConfigs = useCallback(async () => {
    const id = ++loadId.current;
    try {
      const response = await fetch('/api/entitlements-sync/configs');
      if (!response.ok) throw new Error('Failed to load configurations');
      const data = await response.json();
      if (id !== loadId.current) return;
      setConfigs(Array.isArray(data) ? data : []);
    } catch {
      if (id !== loadId.current) return;
      const message = t('entitlements:sync.errors.loadConfigsFailed');
      setLoadError(message);
      toast({
        title: t('common:toast.error'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (id === loadId.current) setIsLoading(false);
    }
  }, [t, toast]);

  const retry = () => {
    setIsLoading(true);
    setLoadError(null);
    return fetchConfigs();
  };

  useEffect(() => {
    // Load once on mount; the page starts out loading, so nothing is set before the answer
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load connections and catalogs when the dialog opens
  useEffect(() => {
    if (!isDialogOpen) return;
    let current = true;
    const load = async (path: string, failed: string, set: (data: unknown[]) => void) => {
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(failed);
        const data = await response.json();
        if (current) set(Array.isArray(data) ? data : []);
      } catch {
        if (current) {
          toast({ title: t('common:toast.error'), description: failed, variant: 'destructive' });
        }
      }
    };
    load('/api/entitlements-sync/connections', t('entitlements:sync.errors.loadConnectionsFailed'),
      (data) => setConnections(data as Connection[]));
    load('/api/entitlements-sync/catalogs', t('entitlements:sync.errors.loadCatalogsFailed'),
      (data) => setCatalogs(data as string[]));
    return () => {
      current = false;
    };
    // The dialog opening is the trigger; t and toast only name the messages
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialogOpen]);

  const openAdd = () => {
    setEditingConfig(null);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (values: ConfigValues) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const url = editingConfig
        ? `/api/entitlements-sync/configs/${editingConfig.id}`
        : '/api/entitlements-sync/configs';
      const method = editingConfig ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error('Failed to save configuration');

      toast({
        title: t('common:toast.success'),
        description: editingConfig ? t('entitlements:sync.configUpdated') : t('entitlements:sync.configCreated'),
      });

      setIsDialogOpen(false);
      fetchConfigs();
    } catch {
      toast({
        title: t('common:toast.error'),
        description: t('entitlements:sync.errors.saveConfigFailed'),
        variant: 'destructive',
      });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const closeDelete = () => {
    if (deleting) return;
    afterDelete.current = null;
    setDeleteTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget || busy.current) return;
    busy.current = true;
    const { id } = deleteTarget;
    setDeleting(true);
    let deleted = false;
    try {
      const response = await fetch(`/api/entitlements-sync/configs/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete configuration');
      deleted = true;

      toast({
        title: t('common:toast.success'),
        description: t('entitlements:sync.configDeleted'),
      });

      await fetchConfigs();
    } catch {
      if (!deleted) {
        toast({
          title: t('common:toast.error'),
          description: t('entitlements:sync.errors.deleteConfigFailed'),
          variant: 'destructive',
        });
      }
    } finally {
      afterDelete.current = deleted ? addButton.current : null;
      busy.current = false;
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // The columns read the row handlers through a ref, so the definitions stay
  // the same across renders and the cells keep their focus
  const rowActions = useRef({
    edit: (_config: EntitlementsSyncConfig) => {},
    remove: (_config: EntitlementsSyncConfig) => {},
  });
  useEffect(() => {
    rowActions.current = {
      edit: (config) => {
        setEditingConfig(config);
        setIsDialogOpen(true);
      },
      remove: (config) => {
        setDeleteName(config.name);
        setDeleteTarget(config);
      },
    };
  });

  const columns = useMemo<ColumnDef<EntitlementsSyncConfig>[]>(() => [
    {
      accessorKey: 'name',
      header: t('common:labels.name'),
      cell: ({ row }) => {
        const name = String(row.getValue('name') ?? '');
        return <span className={classes.name} title={name}>{name}</span>;
      },
    },
    {
      accessorKey: 'connection',
      header: t('common:labels.connection'),
      cell: ({ row }) => {
        const connection = String(row.getValue('connection') ?? '');
        return <span className={classes.connection} title={connection}>{connection}</span>;
      },
    },
    {
      accessorKey: 'schedule',
      header: t('common:labels.schedule'),
      cell: ({ row }) => <span className={classes.schedule}>{row.getValue('schedule')}</span>,
    },
    {
      accessorKey: 'enabled',
      header: t('common:labels.status'),
      cell: ({ row }) => (
        row.getValue('enabled') ? (
          <span className={`${classes.status} ${classes.good}`}>
            <CheckCircle2 aria-hidden />
            {t('common:labels.enabled')}
          </span>
        ) : (
          <span className={`${classes.status} ${classes.neutral}`}>
            <XCircle aria-hidden />
            {t('common:labels.disabled')}
          </span>
        )
      ),
    },
    {
      accessorKey: 'lastSync',
      header: t('common:labels.lastSync'),
      cell: ({ row }) => {
        const lastSync = row.original.lastSync;
        return (
          <span className={classes.lastSync} title={lastSync?.error}>
            {lastSync?.status === 'running' && <Clock aria-hidden className={classes.info} />}
            {lastSync?.status === 'success' && <CheckCircle2 aria-hidden className={classes.good} />}
            {lastSync?.status === 'error' && <XCircle aria-hidden className={classes.critical} />}
            {lastSync?.timestamp || t('entitlements:sync.never')}
          </span>
        );
      },
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const config = row.original;
        return (
          <div className={list.actions}>
            <ActionIcon
              variant="subtle"
              color="gray"
              className={list.action}
              data-action="edit"
              onClick={() => rowActions.current.edit(config)}
            >
              <Edit2 aria-hidden />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              className={`${list.action} ${list.delete}`}
              data-action="delete"
              onClick={() => rowActions.current.remove(config)}
            >
              <Trash2 aria-hidden />
            </ActionIcon>
          </div>
        );
      },
    },
  ], [t]);

  return (
    <>
      <PageLayout
        fullBleed
        header={
          <PageHeader
            title={t('entitlements:sync.title')}
            actions={
              <Button ref={addButton} onClick={openAdd}>
                <Plus />
                {t('entitlements:sync.newConfig')}
              </Button>
            }
          />
        }
      >
        <Pane flush aria-label={t('entitlements:sync.listPane')}>
          <div className={list.body}>
            {isLoading && configs.length === 0 ? (
              <ListViewSkeleton columns={5} rows={5} toolbarButtons={1} />
            ) : (
              <>
                {/* The list's failed load, with a Retry; the toolbar stays */}
                {loadError && (
                  <div className={classes.state}>
                    <Alert
                      color="red"
                      variant="light"
                      icon={<AlertCircle />}
                      className={`${list.alert} ${classes.stateAlert}`}
                      classNames={{ message: list.alertMessage }}
                    >
                      {loadError}
                    </Alert>
                    <Button variant="outline" onClick={retry}>{t('common:retry')}</Button>
                  </div>
                )}
                <DataTable
                  columns={columns}
                  data={configs}
                  searchColumn="name"
                  storageKey="entitlements-sync-sort"
                  isLoading={isLoading}
                />
              </>
            )}
          </div>
        </Pane>
      </PageLayout>

      <Dialog
        opened={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        size="md"
        title={editingConfig ? t('entitlements:sync.editConfig') : t('entitlements:sync.newConfig')}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" form={FORM_ID} disabled={saving}>
              {saving && <Loader size={12} color="currentColor" />}
              {t('common:actions.save')}
            </Button>
          </>
        }
      >
        <ConfigForm
          key={editingConfig?.id ?? 'new'}
          config={editingConfig}
          connections={connections}
          catalogs={catalogs}
          onSave={handleSubmit}
        />
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        opened={!!deleteTarget}
        onClose={closeDelete}
        size="sm"
        role="alertdialog"
        returnFocusTo={afterDelete}
        title={t('entitlements:sync.deleteDialog.title')}
        description={t('entitlements:sync.deleteDialog.description', { name: deleteName })}
        footer={
          <>
            <Button variant="outline" onClick={closeDelete} disabled={deleting}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader size={12} color="currentColor" />}
              {t('common:actions.delete')}
            </Button>
          </>
        }
      />
    </>
  );
}

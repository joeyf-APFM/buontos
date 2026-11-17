import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Loader, Select, Table, TextInput, Textarea } from '@mantine/core';
import { AlertCircle, Edit2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ListViewSkeleton } from '@/components/common/list-view-skeleton';
import { badgeToneStyle } from '@/components/common/aura-status';
import { Dialog, PageHeader, PageLayout, Pane } from '@/mantine/page';
import list from '@/components/common/list-page.module.css';
import classes from './security-features.module.css';

type FeatureType =
  | 'row_filtering'
  | 'column_masking'
  | 'differential_privacy'
  | 'homomorphic_encryption'
  | 'envelope_encryption'
  | 'tokenization';

interface SecurityFeature {
  id: string;
  name: string;
  description: string;
  type: FeatureType;
  status: string;
  target: string;
  conditions: string[];
  last_updated: string;
}

interface FeatureValues {
  name: string;
  description: string;
  type: string;
  target: string;
}

// The types the dialog offers, with the i18n key of each one's label
const TYPES: { value: FeatureType; key: string }[] = [
  { value: 'row_filtering', key: 'rowFiltering' },
  { value: 'column_masking', key: 'columnMasking' },
  { value: 'differential_privacy', key: 'differentialPrivacy' },
  { value: 'homomorphic_encryption', key: 'homomorphicEncryption' },
  { value: 'envelope_encryption', key: 'envelopeEncryption' },
  { value: 'tokenization', key: 'tokenization' },
];

const formatType = (type: string) =>
  type.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

const FIELD_CLASSES = { label: classes.label };
const SELECT_CLASSES = { label: classes.label, option: classes.option };
const FORM_ID = 'security-feature-form';

/**
 * The create/edit form. It is the dialog's body, so its fields start afresh
 * each time the dialog opens, and its Save is the footer's (the `form` attribute).
 */
function FeatureForm({
  feature,
  onSave,
}: {
  feature: SecurityFeature | null;
  onSave: (values: FeatureValues) => void;
}) {
  const { t } = useTranslation(['security-features', 'common']);
  const [values, setValues] = useState<FeatureValues>({
    name: feature?.name ?? '',
    description: feature?.description ?? '',
    type: feature?.type ?? 'row_filtering',
    target: feature?.target ?? '',
  });
  const set = <K extends keyof FeatureValues>(key: K, value: FeatureValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const types = TYPES.map(({ value, key }) => ({ value: value as string, label: t(`security-features:types.${key}`) }));
  // A feature's own type stays selectable and is kept on save, even when the
  // dialog doesn't list it (a Select would show it blank)
  if (values.type && !types.some((o) => o.value === values.type)) {
    types.push({ value: values.type, label: formatType(values.type) });
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(values);
  };

  return (
    <form id={FORM_ID} onSubmit={submit} className={classes.form}>
      <TextInput
        id="name"
        label={t('common:labels.name')}
        value={values.name}
        onChange={(e) => set('name', e.currentTarget.value)}
        classNames={FIELD_CLASSES}
        data-autofocus
      />
      <Textarea
        id="description"
        label={t('common:labels.description')}
        autosize
        minRows={2}
        maxRows={8}
        value={values.description}
        onChange={(e) => set('description', e.currentTarget.value)}
        classNames={FIELD_CLASSES}
      />
      <Select
        id="type"
        label={t('common:labels.type')}
        placeholder={t('common:placeholders.selectType')}
        data={types}
        value={values.type}
        onChange={(value) => set('type', value ?? values.type)}
        allowDeselect={false}
        classNames={SELECT_CLASSES}
      />
      <TextInput
        id="target"
        label={t('common:labels.target')}
        value={values.target}
        onChange={(e) => set('target', e.currentTarget.value)}
        classNames={FIELD_CLASSES}
      />
    </form>
  );
}

const SecurityFeatures: React.FC = () => {
  const { t } = useTranslation(['security-features', 'common']);
  const { toast } = useToast();
  const [features, setFeatures] = useState<SecurityFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // The list's failed load, shown with a Retry
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<SecurityFeature | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SecurityFeature | null>(null);
  // The confirm keeps the name it was opened for while it closes
  const [deleteName, setDeleteName] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Only the latest load may set the list: an earlier one that answers late is dropped
  const loadId = useRef(0);
  // A second click while a request is out sends nothing
  const busy = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  // Where focus goes once the delete confirm has closed: the Add button after
  // a delete, since the row is gone; none otherwise, so the kit gives it back
  // to the row's delete button
  const afterDelete = useRef<HTMLElement | null>(null);

  // Loads the list; the page starts out loading, so the first load sets nothing before its answer
  const loadFeatures = useCallback(async () => {
    const id = ++loadId.current;
    try {
      const response = await fetch('/api/security-features');
      if (!response.ok) {
        throw new Error('Failed to fetch security features');
      }
      const data = await response.json();
      if (id !== loadId.current) return;
      setFeatures(Array.isArray(data) ? data : []);
    } catch {
      if (id !== loadId.current) return;
      const message = t('security-features:toast.loadError');
      setLoadError(message);
      setFeatures([]);
      toast({
        title: t('common:toast.error'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (id === loadId.current) setIsLoading(false);
    }
  }, [t, toast]);

  // A reload (after a save or delete, or Retry) shows the skeleton again
  const fetchFeatures = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    return loadFeatures();
  }, [loadFeatures]);

  useEffect(() => {
    loadFeatures();
    // Load once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = () => {
    setEditingFeature(null);
    setIsDialogOpen(true);
  };

  const handleSaveFeature = async (values: FeatureValues) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const url = editingFeature
        ? `/api/security-features/${editingFeature.id}`
        : '/api/security-features';
      const method = editingFeature ? 'PUT' : 'POST';
      const body = editingFeature
        ? { ...editingFeature, ...values }
        : { ...values, status: 'active', conditions: [] };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Failed to save security feature');
      }

      toast({
        title: t('common:toast.success'),
        description: editingFeature ? t('security-features:toast.featureUpdated') : t('security-features:toast.featureCreated'),
      });

      fetchFeatures();
      setIsDialogOpen(false);
    } catch {
      toast({
        title: t('common:toast.error'),
        description: t('security-features:toast.saveError'),
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

  const handleDeleteFeature = async () => {
    if (!deleteTarget || busy.current) return;
    busy.current = true;
    const { id } = deleteTarget;
    setDeleting(true);
    let deleted = false;
    try {
      const response = await fetch(`/api/security-features/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete security feature');
      }
      deleted = true;

      toast({
        title: t('common:toast.success'),
        description: t('security-features:toast.featureDeleted'),
      });

      await fetchFeatures();
    } catch {
      if (!deleted) {
        toast({
          title: t('common:toast.error'),
          description: t('security-features:toast.deleteError'),
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

  return (
    <>
      <PageLayout
        fullBleed
        header={
          <PageHeader
            title={t('security-features:title')}
            actions={
              <Button ref={addButton} onClick={openAdd}>
                <Plus />
                {t('security-features:addFeature')}
              </Button>
            }
          />
        }
      >
        <Pane flush aria-label={t('security-features:listPane')}>
          <div className={list.body}>
            {isLoading ? (
              <ListViewSkeleton columns={7} rows={5} showToolbar={false} toolbarButtons={0} />
            ) : (
              <>
                {/* The list's failed load, with a Retry */}
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
                    <Button variant="outline" onClick={fetchFeatures}>{t('common:retry')}</Button>
                  </div>
                )}
                <div className={classes.scroll}>
                  <Table className={classes.table} withRowBorders={false}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t('common:labels.name')}</Table.Th>
                        <Table.Th>{t('common:labels.type')}</Table.Th>
                        <Table.Th>{t('common:labels.target')}</Table.Th>
                        <Table.Th>{t('common:labels.status')}</Table.Th>
                        <Table.Th>{t('security-features:table.conditions')}</Table.Th>
                        <Table.Th>{t('security-features:table.lastUpdated')}</Table.Th>
                        <Table.Th className={classes.end}>{t('common:labels.actions')}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {features.map((feature) => (
                        <Table.Tr key={feature.id}>
                          <Table.Td>
                            <span className={classes.name} title={feature.name}>{feature.name}</span>
                          </Table.Td>
                          <Table.Td>{formatType(feature.type)}</Table.Td>
                          <Table.Td>
                            <span className={classes.target} title={feature.target}>{feature.target}</span>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              variant="outline"
                              style={badgeToneStyle(feature.status === 'active' ? 'good' : 'neutral')}
                            >
                              {feature.status}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <div className={classes.conditions}>
                              {(feature.conditions ?? []).map((condition, index) => (
                                <Badge key={index} variant="outline" className={classes.condition} title={condition}>
                                  {condition}
                                </Badge>
                              ))}
                            </div>
                          </Table.Td>
                          <Table.Td className={classes.date}>
                            {new Date(feature.last_updated).toLocaleString()}
                          </Table.Td>
                          <Table.Td className={classes.end}>
                            <div className={list.actions}>
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                className={list.action}
                                data-action="edit"
                                onClick={() => {
                                  setEditingFeature(feature);
                                  setIsDialogOpen(true);
                                }}
                              >
                                <Edit2 aria-hidden />
                              </ActionIcon>
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                className={`${list.action} ${list.delete}`}
                                data-action="delete"
                                onClick={() => {
                                  setDeleteName(feature.name);
                                  setDeleteTarget(feature);
                                }}
                              >
                                <Trash2 aria-hidden />
                              </ActionIcon>
                            </div>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                      {features.length === 0 && !loadError && (
                        <Table.Tr>
                          <Table.Td colSpan={7} className={classes.empty}>
                            {t('security-features:empty')}
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </Pane>
      </PageLayout>

      <Dialog
        opened={isDialogOpen}
        // Not while a save is out: a failed save keeps the dialog and its input
        onClose={() => { if (!saving) setIsDialogOpen(false); }}
        size="md"
        title={editingFeature ? t('security-features:editFeature') : t('security-features:addFeature')}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" form={FORM_ID} disabled={saving}>
              {saving && <Loader size={12} color="currentColor" />}
              {editingFeature ? t('security-features:form.saveChanges') : t('security-features:form.addFeature')}
            </Button>
          </>
        }
      >
        <FeatureForm key={editingFeature?.id ?? 'new'} feature={editingFeature} onSave={handleSaveFeature} />
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        opened={!!deleteTarget}
        onClose={closeDelete}
        size="sm"
        role="alertdialog"
        returnFocusTo={afterDelete}
        title={t('security-features:deleteDialog.title')}
        description={t('security-features:deleteDialog.description', { name: deleteName })}
        footer={
          <>
            <Button variant="outline" onClick={closeDelete} disabled={deleting}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteFeature} disabled={deleting}>
              {deleting && <Loader size={12} color="currentColor" />}
              {t('common:actions.delete')}
            </Button>
          </>
        }
      />
    </>
  );
};

export default SecurityFeatures;

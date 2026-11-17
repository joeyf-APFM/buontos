import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Loader, Select, TextInput, Textarea } from '@mantine/core';
import { AlertCircle, Edit2, Plus, Settings, Trash2 } from 'lucide-react';
import { ListItemSkeleton } from '@/components/common/list-view-skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { PrincipalPicker } from '@/components/common/principal-picker';
import { badgeToneStyle, type StatusTone } from '@/components/common/aura-status';
import { Dialog, PageHeader, PageLayout, Pane, PaneStack, SelectableList, Tabs } from '@/mantine/page';
import list from '@/components/common/list-page.module.css';
import classes from './entitlements.module.css';

interface Privilege {
  securable_id: string;
  securable_type: string;
  permission: string;
}

interface Persona {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  privileges: Privilege[];
  groups: string[];
}

interface PersonaValues {
  name: string;
  description: string;
}

const DEFAULT_PRIVILEGE: Privilege = { securable_id: '', securable_type: 'table', permission: 'READ' };

const SECURABLE_TYPES = [
  { value: 'catalog', label: 'Catalog' },
  { value: 'schema', label: 'Schema' },
  { value: 'table', label: 'Table' },
  { value: 'view', label: 'View' },
];
const PERMISSIONS = ['READ', 'WRITE', 'MANAGE'].map((value) => ({ value, label: value }));

const PERMISSION_TONES: Record<string, StatusTone> = { READ: 'info', WRITE: 'good', MANAGE: 'warning' };

const FIELD_CLASSES = { label: classes.label };
const SELECT_CLASSES = { label: classes.label, option: classes.option };
const PERSONA_FORM_ID = 'persona-form';
const PRIVILEGE_FORM_ID = 'privilege-form';

/** The create/edit form: the dialog's body, so its fields start afresh each time it opens. */
function PersonaForm({ persona, onSave }: { persona: Persona | null; onSave: (values: PersonaValues) => void }) {
  const { t } = useTranslation(['entitlements', 'common']);
  const [values, setValues] = useState<PersonaValues>({
    name: persona?.name ?? '',
    description: persona?.description ?? '',
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(values);
  };
  return (
    <form id={PERSONA_FORM_ID} onSubmit={submit} className={classes.form}>
      <TextInput
        id="name"
        label={t('entitlements:personas.personaName')}
        value={values.name}
        onChange={(e) => {
          const name = e.currentTarget.value;
          setValues((prev) => ({ ...prev, name }));
        }}
        classNames={FIELD_CLASSES}
        required
        data-autofocus
      />
      <Textarea
        id="description"
        label={t('common:labels.description')}
        autosize
        minRows={2}
        maxRows={8}
        value={values.description}
        onChange={(e) => {
          const description = e.currentTarget.value;
          setValues((prev) => ({ ...prev, description }));
        }}
        classNames={FIELD_CLASSES}
      />
    </form>
  );
}

/** The Add Privilege form, afresh each time the dialog opens. */
function PrivilegeForm({
  value,
  onChange,
  onSave,
}: {
  value: Privilege;
  onChange: (next: Privilege) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation(['entitlements', 'common']);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.securable_id) onSave();
  };
  return (
    <form id={PRIVILEGE_FORM_ID} onSubmit={submit} className={classes.form}>
      <TextInput
        id="securable_id"
        label={t('common:labels.securableId')}
        placeholder={t('common:placeholders.exampleCatalogSchemaTable')}
        value={value.securable_id}
        onChange={(e) => onChange({ ...value, securable_id: e.currentTarget.value })}
        classNames={FIELD_CLASSES}
        required
        data-autofocus
      />
      {/* No clearing: the Radix Select these replace could not be cleared either */}
      <Select
        id="securable_type"
        label={t('common:labels.securableType')}
        placeholder={t('common:placeholders.selectType')}
        data={SECURABLE_TYPES}
        value={value.securable_type}
        onChange={(next) => onChange({ ...value, securable_type: next ?? value.securable_type })}
        allowDeselect={false}
        classNames={SELECT_CLASSES}
      />
      <Select
        id="permission"
        label={t('common:labels.permission')}
        placeholder={t('common:placeholders.selectPermission')}
        data={PERMISSIONS}
        value={value.permission}
        onChange={(next) => onChange({ ...value, permission: next ?? value.permission })}
        allowDeselect={false}
        classNames={SELECT_CLASSES}
      />
    </form>
  );
}

const Entitlements: React.FC = () => {
  const { t } = useTranslation(['entitlements', 'common']);
  const { toast } = useToast();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // The list's failed load, shown with a Retry; the last good list stays under it
  const [loadError, setLoadError] = useState<string | null>(null);
  // A failed save, delete or update: said once, cleared by the next success
  const [actionError, setActionError] = useState<string | null>(null);

  const [personaDialog, setPersonaDialog] = useState<'create' | 'edit' | null>(null);
  const [savingPersona, setSavingPersona] = useState(false);
  const [privilegeDialogOpen, setPrivilegeDialogOpen] = useState(false);
  const [newPrivilege, setNewPrivilege] = useState<Privilege>(DEFAULT_PRIVILEGE);
  const [savingPrivilege, setSavingPrivilege] = useState(false);

  // The confirms keep the name they were opened for while they close
  const [deletePersonaOpen, setDeletePersonaOpen] = useState(false);
  const [deletePersonaName, setDeletePersonaName] = useState('');
  const [deletingPersona, setDeletingPersona] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removeName, setRemoveName] = useState('');
  const [removing, setRemoving] = useState(false);

  // Only the latest load may set the list: an earlier one that answers late is dropped
  const loadId = useRef(0);
  // A second click while a request is out sends nothing
  const busy = useRef(false);
  const createButton = useRef<HTMLButtonElement>(null);
  const addPrivilegeButton = useRef<HTMLButtonElement>(null);
  // Where focus goes once a confirm has closed: a control that is still there
  // once the persona or privilege is gone; none otherwise, so the kit gives it
  // back to the button that opened the confirm
  const afterDeletePersona = useRef<HTMLElement | null>(null);
  const afterRemovePrivilege = useRef<HTMLElement | null>(null);

  const selectedPersona = personas.find((p) => p.id === selectedId) ?? null;

  const loadPersonas = useCallback(async () => {
    const id = ++loadId.current;
    try {
      const response = await fetch('/api/entitlements/personas');
      if (!response.ok) throw new Error('Failed to fetch personas');
      const data = await response.json();
      if (id !== loadId.current) return;
      setPersonas(Array.isArray(data) ? data : []);
      setLoadError(null);
      setActionError(null);
    } catch {
      if (id !== loadId.current) return;
      const message = t('entitlements:personas.errors.loadFailed');
      setLoadError(message);
      toast({ title: t('common:toast.error'), description: message, variant: 'destructive' });
    } finally {
      if (id === loadId.current) setIsLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    // Load once on mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPersonas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (message: string) => {
    setActionError(message);
    toast({ title: t('common:toast.error'), description: message, variant: 'destructive' });
  };

  const succeed = (message: string) => {
    setActionError(null);
    toast({ title: t('common:toast.success'), description: message });
  };

  /** Puts an updated persona (the answer to a privilege or group change) in the list. */
  const replacePersona = (updated: Persona) =>
    setPersonas((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));

  const handleSavePersona = async (values: PersonaValues) => {
    // Not once the dialog has closed (a second click on its way out)
    if (busy.current || personaDialog === null) return;
    busy.current = true;
    setSavingPersona(true);
    const editing = personaDialog === 'edit' ? selectedPersona : null;
    try {
      const response = await fetch(
        editing ? `/api/entitlements/personas/${editing.id}` : '/api/entitlements/personas',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        },
      );
      if (!response.ok) throw new Error('Failed to save persona');
      succeed(editing ? t('entitlements:personas.toast.personaUpdated') : t('entitlements:personas.toast.personaCreated'));
      setPersonaDialog(null);
      await loadPersonas();
    } catch {
      fail(t('entitlements:personas.errors.saveFailed'));
    } finally {
      busy.current = false;
      setSavingPersona(false);
    }
  };

  const closePersonaDialog = () => {
    if (savingPersona) return;
    setPersonaDialog(null);
  };

  const closeDeletePersona = () => {
    if (deletingPersona) return;
    afterDeletePersona.current = null;
    setDeletePersonaOpen(false);
  };

  const handleDeletePersona = async () => {
    if (!selectedPersona || busy.current) return;
    busy.current = true;
    const { id } = selectedPersona;
    setDeletingPersona(true);
    let deleted = false;
    try {
      const response = await fetch(`/api/entitlements/personas/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete persona');
      deleted = true;
      // Gone for good, even if the reload fails
      setPersonas((prev) => prev.filter((p) => p.id !== id));
      setSelectedId(null);
      succeed(t('entitlements:personas.toast.personaDeleted'));
      await loadPersonas();
    } catch {
      if (!deleted) fail(t('entitlements:personas.errors.deleteFailed'));
    } finally {
      afterDeletePersona.current = deleted ? createButton.current : null;
      busy.current = false;
      setDeletingPersona(false);
      setDeletePersonaOpen(false);
    }
  };

  const closePrivilegeDialog = () => {
    if (savingPrivilege) return;
    setPrivilegeDialogOpen(false);
  };

  const openAddPrivilege = () => {
    setNewPrivilege(DEFAULT_PRIVILEGE);
    setPrivilegeDialogOpen(true);
  };

  const handleSavePrivilege = async () => {
    if (!selectedPersona || !newPrivilege.securable_id || !privilegeDialogOpen || busy.current) return;
    busy.current = true;
    setSavingPrivilege(true);
    try {
      const response = await fetch(`/api/entitlements/personas/${selectedPersona.id}/privileges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrivilege),
      });
      if (!response.ok) throw new Error('Failed to add privilege');
      replacePersona(await response.json());
      setPrivilegeDialogOpen(false);
      succeed(t('entitlements:personas.toast.privilegeAdded'));
    } catch {
      fail(t('entitlements:personas.errors.privilegeAddFailed'));
    } finally {
      busy.current = false;
      setSavingPrivilege(false);
    }
  };

  const closeRemove = () => {
    if (removing) return;
    afterRemovePrivilege.current = null;
    setRemoveTarget(null);
  };

  const handleRemovePrivilege = async () => {
    if (!selectedPersona || removeTarget === null || busy.current) return;
    busy.current = true;
    setRemoving(true);
    let removed = false;
    try {
      const response = await fetch(
        `/api/entitlements/personas/${selectedPersona.id}/privileges/${encodeURIComponent(removeTarget)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('Failed to remove privilege');
      const updated = await response.json();
      removed = true;
      replacePersona(updated);
      succeed(t('entitlements:personas.toast.privilegeRemoved'));
    } catch {
      if (!removed) fail(t('entitlements:personas.errors.privilegeRemoveFailed'));
    } finally {
      afterRemovePrivilege.current = removed ? addPrivilegeButton.current : null;
      busy.current = false;
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  const handleUpdateGroups = async (personaId: string, groups: string[]) => {
    try {
      const response = await fetch(`/api/entitlements/personas/${personaId}/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }),
      });
      if (!response.ok) throw new Error('Failed to update groups');
      replacePersona(await response.json());
      succeed(t('entitlements:personas.toast.groupsUpdated'));
    } catch {
      fail(t('entitlements:personas.errors.groupsUpdateFailed'));
    }
  };

  const items = personas.map((persona) => ({
    id: persona.id,
    label: <span title={persona.name}>{persona.name}</span>,
    meta: t('entitlements:personas.privilegeCount', { count: persona.privileges?.length ?? 0 }),
  }));

  const privileges = selectedPersona?.privileges ?? [];

  return (
    <>
      <PageLayout
        header={
          <PageHeader
            title={t('entitlements:title')}
            actions={
              <Button ref={createButton} onClick={() => setPersonaDialog('create')}>
                <Plus />
                {t('entitlements:personas.createPersona')}
              </Button>
            }
          />
        }
      >
        <PaneStack sizes={[1, 3]}>
          <Pane title={t('entitlements:personas.title')} flush>
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setLoadError(null);
                    loadPersonas();
                  }}
                >
                  {t('common:retry')}
                </Button>
              </div>
            )}
            {isLoading ? (
              <ListItemSkeleton count={5} className={classes.skeleton} />
            ) : (
              <SelectableList
                aria-label={t('entitlements:personas.title')}
                items={items}
                selectedId={selectedId}
                onSelect={setSelectedId}
                emptyMessage={loadError ? null : t('entitlements:personas.noPersonas')}
              />
            )}
          </Pane>

          <Pane
            title={selectedPersona ? selectedPersona.name : t('entitlements:personas.selectPersona')}
            titleTooltip
            actions={
              selectedPersona && (
                <>
                  <Button variant="outline" onClick={() => setPersonaDialog('edit')}>
                    <Edit2 />
                    {t('common:actions.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDeletePersonaName(selectedPersona.name);
                      setDeletePersonaOpen(true);
                    }}
                  >
                    <Trash2 />
                    {t('common:actions.delete')}
                  </Button>
                </>
              )
            }
          >
            {actionError && (
              <Alert
                color="red"
                variant="light"
                icon={<AlertCircle />}
                className={`${list.alert} ${classes.actionAlert}`}
                classNames={{ message: list.alertMessage }}
              >
                {actionError}
              </Alert>
            )}
            {selectedPersona ? (
              <Tabs defaultValue="privileges">
                <Tabs.List>
                  <Tabs.Tab value="privileges">{t('entitlements:personas.accessPrivileges')}</Tabs.Tab>
                  <Tabs.Tab value="groups">{t('entitlements:personas.groupAssignments')}</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="privileges">
                  <div className={classes.section}>
                    <div className={classes.sectionHead}>
                      <h3 className={classes.sectionTitle}>{t('entitlements:personas.accessPrivileges')}</h3>
                      <Button ref={addPrivilegeButton} onClick={openAddPrivilege}>
                        <Plus />
                        {t('entitlements:personas.addPrivilege')}
                      </Button>
                    </div>
                    {privileges.length === 0 ? (
                      <div className={classes.empty}>{t('entitlements:personas.noPrivileges')}</div>
                    ) : (
                      <div className={classes.privileges}>
                        {privileges.map((privilege) => (
                          <div key={privilege.securable_id} className={classes.privilege}>
                            <div className={classes.privilegeText}>
                              <span className={classes.securable} title={privilege.securable_id}>
                                {privilege.securable_id}
                              </span>
                              <span className={classes.securableType}>{privilege.securable_type}</span>
                            </div>
                            <Badge
                              variant="outline"
                              style={badgeToneStyle(PERMISSION_TONES[privilege.permission] ?? 'neutral')}
                            >
                              {privilege.permission}
                            </Badge>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              className={`${list.action} ${list.delete}`}
                              aria-label={t('entitlements:personas.removePrivilege')}
                              onClick={() => {
                                setRemoveName(privilege.securable_id);
                                setRemoveTarget(privilege.securable_id);
                              }}
                            >
                              <Trash2 aria-hidden />
                            </ActionIcon>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Tabs.Panel>
                <Tabs.Panel value="groups">
                  <div className={classes.section}>
                    <h3 className={classes.sectionTitle}>{t('entitlements:personas.groupAssignments')}</h3>
                    <div className={classes.groups}>
                      <span className={classes.label}>{t('entitlements:personas.addGroups')}</span>
                      <PrincipalPicker
                        multiple
                        accepts={['group']}
                        value={selectedPersona.groups ?? []}
                        onChange={(next) => handleUpdateGroups(selectedPersona.id, next)}
                        placeholder={t('common:placeholders.selectGroup')}
                        aria-label={t('entitlements:personas.groupAssignments')}
                      />
                    </div>
                  </div>
                </Tabs.Panel>
              </Tabs>
            ) : (
              <div className={classes.hint}>
                <Settings aria-hidden />
                <p className={classes.hintTitle}>{t('entitlements:personas.selectPersonaHint')}</p>
                <p>{t('entitlements:personas.createPersonaHint')}</p>
              </div>
            )}
          </Pane>
        </PaneStack>
      </PageLayout>

      {/* Create and edit persona */}
      <Dialog
        opened={personaDialog !== null}
        onClose={closePersonaDialog}
        size="md"
        title={personaDialog === 'edit' ? t('entitlements:personas.editPersona') : t('entitlements:personas.createNewPersona')}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closePersonaDialog} disabled={savingPersona}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" form={PERSONA_FORM_ID} disabled={savingPersona}>
              {savingPersona && <Loader size={12} color="currentColor" />}
              {personaDialog === 'edit' ? t('common:actions.saveChanges') : t('entitlements:personas.createPersona')}
            </Button>
          </>
        }
      >
        <PersonaForm
          key={personaDialog === 'edit' ? selectedPersona?.id : 'new'}
          persona={personaDialog === 'edit' ? selectedPersona : null}
          onSave={handleSavePersona}
        />
      </Dialog>

      {/* Add Privilege */}
      <Dialog
        opened={privilegeDialogOpen}
        onClose={closePrivilegeDialog}
        size="md"
        title={t('entitlements:personas.addPrivilege')}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closePrivilegeDialog} disabled={savingPrivilege}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" form={PRIVILEGE_FORM_ID} disabled={!newPrivilege.securable_id || savingPrivilege}>
              {savingPrivilege && <Loader size={12} color="currentColor" />}
              {t('common:actions.add')}
            </Button>
          </>
        }
      >
        <PrivilegeForm value={newPrivilege} onChange={setNewPrivilege} onSave={handleSavePrivilege} />
      </Dialog>

      {/* Delete persona */}
      <Dialog
        opened={deletePersonaOpen}
        onClose={closeDeletePersona}
        size="sm"
        role="alertdialog"
        returnFocusTo={afterDeletePersona}
        title={t('entitlements:personas.deleteDialog.title')}
        description={t('entitlements:personas.deleteDialog.description', { name: deletePersonaName })}
        footer={
          <>
            <Button variant="outline" onClick={closeDeletePersona} disabled={deletingPersona}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeletePersona} disabled={deletingPersona}>
              {deletingPersona && <Loader size={12} color="currentColor" />}
              {t('common:actions.delete')}
            </Button>
          </>
        }
      />

      {/* Remove privilege */}
      <Dialog
        opened={removeTarget !== null}
        onClose={closeRemove}
        size="sm"
        role="alertdialog"
        returnFocusTo={afterRemovePrivilege}
        title={t('entitlements:personas.removeDialog.title')}
        description={t('entitlements:personas.removeDialog.description', { name: removeName })}
        footer={
          <>
            <Button variant="outline" onClick={closeRemove} disabled={removing}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRemovePrivilege} disabled={removing}>
              {removing && <Loader size={12} color="currentColor" />}
              {t('common:actions.remove')}
            </Button>
          </>
        }
      />
    </>
  );
};

export default Entitlements;

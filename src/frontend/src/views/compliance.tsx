import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Loader, Menu, Select, TextInput, Textarea } from '@mantine/core';
import { AlertCircle, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { DataTable } from '@/components/ui/data-table';
import { ListViewSkeleton } from '@/components/common/list-view-skeleton';
import { badgeToneStyle, type StatusTone } from '@/components/common/aura-status';
import { formatRuleWarning, type RuleWarning } from '@/lib/compliance-rule-warnings';
import { useMenuItemFocus } from '@/mantine/use-menu-item-focus';
import { Dialog, PageHeader, PageLayout, Pane, StatTile } from '@/mantine/page';
import list from '@/components/common/list-page.module.css';
import classes from './compliance.module.css';

interface CompliancePolicy {
  id: string; // UUID
  name: string;
  description: string;
  failure_message?: string;  // Human-readable message shown when policy fails
  rule: string;
  compliance: number;
  history: number[];
  created_at: string;
  updated_at: string;
  is_active: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  warnings?: RuleWarning[]; // returned by create/update when the rule cannot work as written
}

interface ComplianceStats {
  overall_compliance: number;
  active_policies: number;
  critical_issues: number;
}

interface ComplianceApiResponse {
  policies: CompliancePolicy[];
  stats: ComplianceStats;
}

const NO_STATS: ComplianceStats = { overall_compliance: 0, active_policies: 0, critical_issues: 0 };

// The categories and severities the dialog offers (a policy's own category
// is added when it is not one of these)
const CATEGORIES = [
  { value: 'Security', key: 'security' },
  { value: 'Data Quality', key: 'dataQuality' },
  { value: 'Privacy', key: 'privacy' },
  { value: 'Governance', key: 'governance' },
  { value: 'Maturity', key: 'maturity' },
] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

// Hints sit under their field
const HINT_BELOW = ['label', 'input', 'description', 'error'] as ('label' | 'input' | 'description' | 'error')[];
const FIELD_CLASSES = { label: classes.label, description: classes.hintText };
const SELECT_CLASSES = { ...FIELD_CLASSES, option: classes.option };

/** A score's status tone: 90 and up good, 70 and up a warning, below that critical. */
const scoreTone = (score: number) => (score >= 90 ? 'good' : score >= 70 ? 'warning' : 'critical');

// A severity, in the Aura status tones (one tone each, so they stay apart)
const SEVERITY_TONES: Record<string, StatusTone> = {
  low: 'info',
  medium: 'gold',
  high: 'warning',
  critical: 'critical',
};

type PolicyValues = {
  name: string;
  description: string;
  category: string | null;
  severity: string | null;
  rule: string;
  failure_message: string;
};

/**
 * The create/edit form. It is the dialog's body, so its fields start afresh
 * each time the dialog opens, and its Save is the footer's (the `form` attribute).
 */
function PolicyForm({
  formId,
  policy,
  onSave,
}: {
  formId: string;
  policy: CompliancePolicy | null;
  onSave: (values: PolicyValues) => void;
}) {
  const { t } = useTranslation(['compliance', 'common']);
  const [values, setValues] = useState<PolicyValues>({
    name: policy?.name ?? '',
    description: policy?.description ?? '',
    category: policy?.category || null,
    severity: policy?.severity || null,
    rule: policy?.rule ?? '',
    failure_message: policy?.failure_message ?? '',
  });
  const set = <K extends keyof PolicyValues>(key: K, value: PolicyValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const categories: { value: string; label: string }[] = CATEGORIES.map(({ value, key }) => ({
    value,
    label: t(`compliance:categories.${key}`),
  }));
  // A policy's own category stays selectable and is kept on save, even when the
  // dialog doesn't list it (a Select would show it blank, and save "General")
  if (values.category && !categories.some((c) => c.value === values.category)) {
    categories.push({ value: values.category, label: values.category });
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(values);
  };

  return (
    <form id={formId} onSubmit={submit} className={classes.form}>
      <TextInput
        id="name"
        label={t('common:labels.name')}
        withAsterisk
        required
        value={values.name}
        onChange={(e) => set('name', e.currentTarget.value)}
        classNames={FIELD_CLASSES}
        data-autofocus
      />
      <Textarea
        id="description"
        label={t('common:labels.description')}
        withAsterisk
        required
        autosize
        minRows={2}
        maxRows={8}
        value={values.description}
        onChange={(e) => set('description', e.currentTarget.value)}
        classNames={FIELD_CLASSES}
      />
      <Select
        id="category"
        label={t('common:labels.category')}
        placeholder={t('common:placeholders.selectCategory')}
        data={categories}
        value={values.category}
        onChange={(value) => set('category', value)}
        allowDeselect={false}
        classNames={SELECT_CLASSES}
      />
      <Select
        id="severity"
        label={t('common:labels.severity')}
        placeholder={t('common:placeholders.selectSeverity')}
        data={SEVERITIES.map((s) => ({ value: s, label: t(`compliance:severity.${s}`) }))}
        value={values.severity}
        onChange={(value) => set('severity', value)}
        allowDeselect={false}
        classNames={SELECT_CLASSES}
      />
      <Textarea
        id="rule"
        label={t('compliance:form.ruleCode')}
        withAsterisk
        required
        autosize
        minRows={8}
        maxRows={20}
        value={values.rule}
        onChange={(e) => set('rule', e.currentTarget.value)}
        placeholder={t('compliance:form.rulePlaceholder')}
        classNames={{ ...FIELD_CLASSES, input: classes.rule }}
        spellCheck={false}
      />
      <Textarea
        id="failure_message"
        label={t('compliance:form.failureMessage')}
        description={t('compliance:form.failureMessageHint')}
        inputWrapperOrder={HINT_BELOW}
        autosize
        minRows={3}
        maxRows={8}
        value={values.failure_message}
        onChange={(e) => set('failure_message', e.currentTarget.value)}
        placeholder={t('compliance:form.failureMessagePlaceholder')}
        classNames={FIELD_CLASSES}
      />
    </form>
  );
}

/** A row's actions menu. Its items open dialogs, so they hand focus over to them. */
function RowMenu({
  policy,
  onEdit,
  onDelete,
}: {
  policy: CompliancePolicy;
  onEdit: (policy: CompliancePolicy) => void;
  onDelete: (policy: CompliancePolicy) => void;
}) {
  const { t } = useTranslation('common');
  const { menuProps, opensDialog } = useMenuItemFocus();
  return (
    <div className={list.actions}>
      <Menu position="bottom-end" withinPortal {...menuProps}>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" className={list.action} aria-label={t('actions.open')}>
            <MoreHorizontal aria-hidden />
          </ActionIcon>
        </Menu.Target>
        {/* The dropdown is portalled, but its clicks still bubble through React to the row */}
        <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
          <Menu.Label>{t('labels.actions')}</Menu.Label>
          <Menu.Item leftSection={<Pencil aria-hidden />} onClick={opensDialog(() => onEdit(policy))}>
            {t('actions.edit')}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<Trash2 aria-hidden />} onClick={opensDialog(() => onDelete(policy))}>
            {t('actions.delete')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

export default function Compliance() {
  const { t } = useTranslation(['compliance', 'common']);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { get: apiGet, post: apiPost, put: apiPut, delete: apiDeleteApi } = useApi();
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((state) => state.setDynamicTitle);
  const [policies, setPolicies] = useState<CompliancePolicy[]>([]);
  const [stats, setStats] = useState<ComplianceStats>(NO_STATS);
  const [selectedPolicy, setSelectedPolicy] = useState<CompliancePolicy | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  // The list's failed load, shown with a Retry
  const [loadError, setLoadError] = useState<string | null>(null);
  // An action's error (save, delete), dismissible
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompliancePolicy | null>(null);
  // The confirm keeps the name it was opened for while it closes
  const [deleteName, setDeleteName] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Only the latest load may set the list: an earlier one that answers late is dropped
  const loadId = useRef(0);
  const createButton = useRef<HTMLButtonElement>(null);
  // Where focus goes once the delete confirm has closed: the Create Rule
  // button after a delete, since the row is gone; none otherwise, so the
  // kit gives it back to the row's menu button
  const afterDelete = useRef<HTMLElement | null>(null);

  const loadPolicies = useCallback(async (quiet = false) => {
    const id = ++loadId.current;
    if (!quiet) setLoading(true);
    setLoadError(null);
    try {
      const response = await apiGet<ComplianceApiResponse>('/api/compliance/policies');
      if (response.error) {
        throw new Error(response.error);
      }
      if (!response.data) {
        throw new Error(t('compliance:errors.noDataReceived'));
      }
      if (id !== loadId.current) return;
      setPolicies(Array.isArray(response.data.policies) ? response.data.policies : []);
      setStats(response.data.stats || NO_STATS);
    } catch (error) {
      if (id !== loadId.current) return;
      console.error('Error loading policies:', error);
      const errorMessage = error instanceof Error ? error.message : t('compliance:errors.loadPoliciesFailed');
      setLoadError(errorMessage);
      toast({
        title: t('compliance:errors.loadingPolicies'),
        description: errorMessage,
        variant: "destructive"
      });
      setPolicies([]);
      setStats(NO_STATS);
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  }, [apiGet, toast, t]);

  useEffect(() => {
    loadPolicies();
    setStaticSegments([]);
    setDynamicTitle(t('compliance:title'));

    return () => {
        setStaticSegments([]);
        setDynamicTitle(null);
    };
  }, [loadPolicies, setStaticSegments, setDynamicTitle, t]);

  const handleSave = async (values: PolicyValues) => {
    setActionError(null);
    setSaving(true);
    try {
      const policyData: Omit<CompliancePolicy, 'id' | 'created_at' | 'updated_at' | 'compliance' | 'history'> & Partial<Pick<CompliancePolicy, 'id' | 'compliance' | 'history' | 'created_at' | 'updated_at'>> = {
        name: values.name,
        description: values.description,
        failure_message: values.failure_message || undefined,
        category: values.category || 'General',
        severity: (values.severity as CompliancePolicy['severity']) || 'medium',
        rule: values.rule,
        is_active: selectedPolicy?.is_active ?? true,
      };

      let response;
      if (selectedPolicy?.id) {
        const updatePayload: CompliancePolicy = {
          ...selectedPolicy,
          ...policyData,
          updated_at: new Date().toISOString(),
        };
        response = await apiPut<CompliancePolicy>(`/api/compliance/policies/${selectedPolicy.id}`, updatePayload);
      } else {
        const createPayload: Omit<CompliancePolicy, 'id'> = {
          ...policyData,
          compliance: 0,
          history: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Omit<CompliancePolicy, 'id'>;
        response = await apiPost<CompliancePolicy>('/api/compliance/policies', createPayload);
      }

      if (response.error || !response.data) {
        throw new Error(response.error || t('compliance:errors.saveNoDataReturned'));
      }

      const warnings = response.data.warnings ?? [];
      toast(warnings.length
        ? {
            title: t('compliance:toast.policySavedWithWarnings', { name: response.data.name }),
            description: warnings.map((w) => formatRuleWarning(t, w)).join(' '),
          }
        : {
            title: t('common:toast.success'),
            description: t('compliance:toast.policySaved', { name: response.data.name })
          });

      setIsDialogOpen(false);
      loadPolicies(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('compliance:errors.savePolicyFailed');
      setActionError(errorMessage);
      toast({
        variant: "destructive",
        title: t('compliance:errors.savingPolicy'),
        description: errorMessage
      });
    } finally {
      setSaving(false);
    }
  };

  const closeDelete = () => {
    if (deleting) return;
    afterDelete.current = null;
    setDeleteTarget(null);
  };

  const handleDelete = async () => {
    // A second click while the request is out sends nothing
    if (!deleteTarget || deleting) return;
    const { id } = deleteTarget;
    setDeleting(true);
    setActionError(null);
    let deleted = false;
    try {
      const response = await apiDeleteApi(`/api/compliance/policies/${id}`);

      if (response.error) {
        throw new Error(response.error || 'Failed to delete policy');
      }
      deleted = true;

      toast({
        title: t('common:toast.success'),
        description: t('compliance:toast.policyDeleted')
      });

      await loadPolicies(true);
    } catch (err) {
      if (!deleted) {
        const errorMessage = err instanceof Error ? err.message : t('compliance:errors.deletePolicyFailed');
        setActionError(errorMessage);
        toast({
          variant: "destructive",
          title: t('compliance:errors.deletingPolicy'),
          description: errorMessage
        });
      }
    } finally {
      afterDelete.current = deleted ? createButton.current : null;
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleCreateRule = () => {
    setSelectedPolicy(null);
    setIsDialogOpen(true);
  };

  // The columns read the row handlers through a ref, so the definitions stay
  // the same across renders and the cells keep their focus
  const rowActions = useRef({
    edit: (_policy: CompliancePolicy) => {},
    remove: (_policy: CompliancePolicy) => {},
  });
  useEffect(() => {
    rowActions.current = {
      edit: (policy) => { setSelectedPolicy(policy); setIsDialogOpen(true); },
      remove: (policy) => { setDeleteName(policy.name); setDeleteTarget(policy); },
    };
  });

  const columns = useMemo<ColumnDef<CompliancePolicy>[]>(() => [
    {
      accessorKey: "name",
      header: t('common:labels.name'),
      cell: ({ row }) => {
        const name = row.getValue<string>("name");
        return <span className={list.title} title={name}>{name}</span>;
      },
    },
    {
      accessorKey: "category",
      header: t('common:labels.category'),
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("category")}</Badge>
      ),
    },
    {
      accessorKey: "severity",
      header: t('common:labels.severity'),
      cell: ({ row }) => {
        const severity = row.getValue<string>("severity");
        return (
          <Badge variant="outline" style={badgeToneStyle(SEVERITY_TONES[severity] ?? 'neutral')}>
            {severity}
          </Badge>
        );
      },
    },
    {
      accessorKey: "compliance",
      header: t('common:labels.compliance'),
      cell: ({ row }) => (
        <span className={classes.score} data-tone={scoreTone(row.getValue<number>("compliance"))}>
          {row.getValue("compliance")}%
        </span>
      ),
    },
    {
      accessorKey: "is_active",
      header: t('common:labels.status'),
      cell: ({ row }) => {
        const active = row.getValue<boolean>("is_active");
        return (
          <Badge variant="outline" style={badgeToneStyle(active ? 'good' : 'neutral')}>
            {active ? t('common:labels.active') : t('common:labels.inactive')}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => (
        <RowMenu
          policy={row.original}
          onEdit={(policy) => rowActions.current.edit(policy)}
          onDelete={(policy) => rowActions.current.remove(policy)}
        />
      ),
    },
  ], [t]);

  const formId = 'compliance-policy-form';
  const overallTone = scoreTone(stats.overall_compliance);

  return (
    <>
      <PageLayout fullBleed header={<PageHeader title={t('compliance:title')} />}>
        <Pane flush aria-label={t('compliance:listPane')}>
          {loading ? (
            <div className={list.body}>
              <ListViewSkeleton columns={6} rows={5} showToolbar={false} toolbarButtons={0} />
            </div>
          ) : (
            <>
              <div className={classes.stats}>
                <StatTile
                  label={t('compliance:stats.overallCompliance')}
                  value={
                    <>
                      {Number(stats.overall_compliance).toFixed(0)}%
                      <span className={classes.hint}>{t('compliance:stats.acrossAllRules')}</span>
                    </>
                  }
                  tone={overallTone === 'good' ? 'success' : overallTone}
                />
                <StatTile
                  label={t('compliance:stats.activeRules')}
                  value={
                    <>
                      {stats.active_policies}
                      <span className={classes.hint}>{t('compliance:stats.currentlyEnforced')}</span>
                    </>
                  }
                />
                <StatTile
                  label={t('compliance:stats.criticalIssues')}
                  value={
                    <>
                      {stats.critical_issues}
                      <span className={classes.hint}>{t('compliance:stats.requireAttention')}</span>
                    </>
                  }
                  tone={stats.critical_issues > 0 ? 'critical' : 'neutral'}
                />
                <StatTile
                  label={t('compliance:stats.lastUpdated')}
                  value={
                    <>
                      {t('compliance:stats.today')}
                      <span className={classes.hint}>12:30 PM</span>
                    </>
                  }
                />
              </div>
              <div className={list.body}>
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
                    <Button variant="outline" onClick={() => loadPolicies()}>{t('common:retry')}</Button>
                  </div>
                )}
                {/* An action's error (save, delete), dismissible */}
                {actionError && (
                  <Alert
                    color="red"
                    variant="light"
                    icon={<AlertCircle />}
                    className={list.alert}
                    classNames={{ message: list.alertMessage }}
                    withCloseButton
                    closeButtonLabel={t('common:tooltips.dismiss', 'Dismiss')}
                    onClose={() => setActionError(null)}
                  >
                    {actionError}
                  </Alert>
                )}
                <DataTable
                  columns={columns}
                  data={policies}
                  searchColumn="name"
                  storageKey="compliance-policies-sort"
                  toolbarActions={
                    <Button ref={createButton} onClick={handleCreateRule}>
                      <Plus />
                      {t('compliance:createRule')}
                    </Button>
                  }
                  onRowClick={(row) => navigate(`${pathname}/policies/${row.original.id}`)}
                />
              </div>
            </>
          )}
        </Pane>
      </PageLayout>

      <Dialog
        opened={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        size="lg"
        title={selectedPolicy ? t('compliance:editRule') : t('compliance:createNewRule')}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" form={formId} disabled={saving}>
              {saving && <Loader size={12} color="currentColor" />}
              {saving ? t('common:states.saving') : t('common:actions.save')}
            </Button>
          </>
        }
      >
        <PolicyForm key={selectedPolicy?.id ?? 'new'} formId={formId} policy={selectedPolicy} onSave={handleSave} />
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        opened={!!deleteTarget}
        onClose={closeDelete}
        size="sm"
        role="alertdialog"
        returnFocusTo={afterDelete}
        title={t('compliance:deleteDialog.title')}
        description={t('compliance:deleteDialog.description', { name: deleteName })}
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

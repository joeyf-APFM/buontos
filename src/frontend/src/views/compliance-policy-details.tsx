import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Loader } from '@mantine/core';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, ArrowLeft, PlayCircle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { DetailViewSkeleton } from '@/components/common/list-view-skeleton';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { usePageBreadcrumb } from '@/stores/breadcrumb-store';
import { CommentSidebar } from '@/components/comments';
import EntityMetadataPanel from '@/components/metadata/entity-metadata-panel';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { formatRuleWarning, type RuleWarning } from '@/lib/compliance-rule-warnings';
import { complianceRunErrorText } from '@/lib/compliance-run-error';
import { DetailsGrid, Dialog, PageHeader, PageLayout, Pane, PaneStack, StatTile, type DetailsRow } from '@/mantine/page';
import { PolicyForm, type PolicyValues } from './compliance-policy-form';
import classes from './compliance-details.module.css';

type Policy = {
  id: string; // UUID
  name: string;
  description?: string;
  failure_message?: string;  // Human-readable message shown when policy fails
  rule: string;
  category?: string;
  severity?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  examples?: { pass?: unknown[]; fail?: unknown[] } | null;
  warnings?: RuleWarning[]; // returned by update when the rule cannot work as written
};

type Run = {
  id: string;
  policy_id: string;
  status: string;
  started_at: string;
  finished_at?: string;
  success_count: number;
  failure_count: number;
  score: number;
  error_message?: string;
  error_code?: string | null;
  error_params?: Record<string, unknown> | null;
};

type Result = {
  id: string;
  run_id: string;
  object_type: string;
  object_id: string;
  object_name?: string;
  passed: boolean;
  message?: string;
  details_json?: string;
  created_at: string;
};

// How many passed and failed objects the run summary names
const SAMPLE = 5;

/** An example, as the policy stores it: a string, or any JSON. */
const exampleText = (example: unknown) => (typeof example === 'string' ? example : JSON.stringify(example));

/** A bulleted list, or its message when there is nothing to list. */
function ItemList({ items, empty }: { items: ReactElement[]; empty: string }) {
  if (items.length === 0) return <div className={classes.empty}>{empty}</div>;
  return <ul className={classes.list}>{items}</ul>;
}

export default function CompliancePolicyDetails() {
  const { t } = useTranslation(['compliance', 'common', 'metadata']);
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const { get, post, put } = useApi();
  const { toast } = useToast();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  // Edit and Run Now change the policy and may tag objects: they need write access to compliance
  const canWrite = !permissionsLoading && hasPermission('compliance', FeatureAccessLevel.READ_WRITE);
  // The metadata panel writes on compliance and on data-domains (the metadata routes' feature)
  const canEditMetadata = canWrite && hasPermission('data-domains', FeatureAccessLevel.READ_WRITE);
  // Ignored once the page has gone, so a late answer can't name the next page
  const { setStaticSegments, setDynamicTitle } = usePageBreadcrumb();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [isCommentSidebarOpen, setIsCommentSidebarOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [running, setRunning] = useState(false);
  // Only the latest results request may set the table: an earlier one that answers late is dropped
  const resultsRequest = useRef(0);

  // Memoised, so the cells keep their focus across renders
  const resultsColumns: ColumnDef<Result>[] = useMemo(() => [
    { accessorKey: 'object_type', header: t('common:labels.type') },
    {
      accessorKey: 'object_name',
      header: t('common:labels.name'),
      cell: ({ row }) => {
        const name = row.original.object_name || row.original.object_id;
        return <code className={classes.code} title={name}>{name}</code>;
      },
    },
    {
      accessorKey: 'passed',
      header: t('common:labels.status'),
      cell: ({ row }) => (
        <Badge variant={row.original.passed ? 'secondary' : 'destructive'}>
          {row.original.passed ? t('compliance:results.passed') : t('compliance:results.failed')}
        </Badge>
      ),
    },
    {
      accessorKey: 'message',
      header: t('common:labels.message'),
      cell: ({ row }) => <span className={classes.wrap}>{row.original.message || t('compliance:results.empty')}</span>,
    },
  ], [t]);

  const fetchRuns = useCallback(async (pid: string) => {
    const runsRes = await get<Run[]>(`/api/compliance/policies/${pid}/runs`);
    const items = runsRes.data && Array.isArray(runsRes.data) ? runsRes.data : [];
    setRuns(items);
    setActiveRun(items.length > 0 ? items[0] : null);
  }, [get]);

  const fetchResults = useCallback(async (runId?: string, failedOnly?: boolean) => {
    const request = ++resultsRequest.current;
    if (!runId) { setResults([]); return; }
    const res = await get<{ results?: Result[] }>(`/api/compliance/runs/${runId}/results?only_failed=${failedOnly ? 'true' : 'false'}`);
    if (request !== resultsRequest.current) return;
    setResults(res.data && Array.isArray(res.data.results) ? res.data.results : []);
  }, [get]);

  const load = useCallback(async () => {
    if (!policyId) return;
    setLoading(true);
    setError(null);
    try {
      const policyRes = await get<Policy>(`/api/compliance/policies/${policyId}`);
      // An error answer carries an empty object as its data
      if (policyRes.error || !policyRes.data?.id) throw new Error(policyRes.error || t('compliance:errors.loadPolicyFailed'));
      setPolicy(policyRes.data);
      setDynamicTitle(policyRes.data.name);
      await fetchRuns(policyId);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('compliance:errors.loadFailed'));
      setPolicy(null);
      setDynamicTitle(t('common:states.error'));
    } finally {
      setLoading(false);
    }
  }, [get, policyId, fetchRuns, setDynamicTitle, t]);

  useEffect(() => {
    setStaticSegments([{ label: t('compliance:title'), path: '/compliance' }]);
    load();
    return () => {
      setStaticSegments([]);
      setDynamicTitle(null);
    };
  }, [load, setStaticSegments, setDynamicTitle, t]);

  useEffect(() => {
    if (activeRun) {
      fetchResults(activeRun.id, onlyFailed);
    } else {
      resultsRequest.current += 1;
      setResults([]);
    }
  }, [activeRun, onlyFailed, fetchResults]);

  // A few of the shown results, passed and failed
  const passedSample = useMemo(() => results.filter((r) => r.passed).slice(0, SAMPLE), [results]);
  const failedSample = useMemo(() => results.filter((r) => !r.passed).slice(0, SAMPLE), [results]);

  const runNow = async () => {
    // A second click while the run is out sends nothing
    if (!policyId || running) return;
    setRunning(true);
    try {
      const res = await post<Run>(`/api/compliance/policies/${policyId}/runs`, { mode: 'inline' });
      if (res.error) {
        // e.g. 403 when the rule changes tags and the user can't write tags
        toast({
          variant: 'destructive',
          title: t('compliance:errors.runningPolicy'),
          description: res.error,
        });
        return;
      }
      if (res.data) {
        await fetchRuns(policyId);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleSave = async (values: PolicyValues) => {
    if (!policyId || !policy) return;
    setIsSaving(true);
    try {
      const updatedPolicy = {
        ...policy,
        name: values.name,
        description: values.description,
        failure_message: values.failure_message || undefined,
        category: values.category || policy.category,
        severity: values.severity || policy.severity,
        rule: values.rule,
        updated_at: new Date().toISOString(),
      };

      const response = await put<Policy>(`/api/compliance/policies/${policyId}`, updatedPolicy);
      if (response.error || !response.data) {
        throw new Error(response.error || t('compliance:errors.savePolicyFailed'));
      }

      setPolicy(response.data);
      setDynamicTitle(response.data.name);
      const warnings = response.data.warnings ?? [];
      toast(warnings.length
        ? {
            title: t('compliance:toast.policySavedWithWarnings', { name: response.data.name }),
            description: warnings.map((w) => formatRuleWarning(t, w)).join(' '),
          }
        : {
            title: t('common:toast.success'),
            description: t('compliance:toast.policySaved', { name: response.data.name }),
          });
      setIsEditDialogOpen(false);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('compliance:errors.savingPolicy'),
        description: err instanceof Error ? err.message : t('compliance:errors.savePolicyFailed'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={classes.state}>
        <DetailViewSkeleton cards={4} actionButtons={3} />
      </div>
    );
  }
  if (error || !policy) {
    return (
      <div className={classes.state}>
        <Alert color="red" variant="light" icon={<AlertCircle />}>
          {error || t('compliance:errors.policyNotFound')}
        </Alert>
        <Button variant="outline" size="sm" onClick={() => navigate('/compliance')}>
          <ArrowLeft /> {t('compliance:policyDetails.backToList')}
        </Button>
      </div>
    );
  }

  const formId = 'compliance-policy-details-form';
  const startedAt = activeRun ? new Date(activeRun.started_at).toLocaleString() : '';
  const examples = policy.examples && (policy.examples.pass?.length || policy.examples.fail?.length) ? policy.examples : null;
  const exampleItems = (items: unknown[] | undefined, key: string) =>
    (Array.isArray(items) ? items : []).map((ex, i) => (
      <li key={`${key}-${i}`}><code className={classes.code}>{exampleText(ex)}</code></li>
    ));
  const sampleItems = (rows: Result[], key: string, withMessage: boolean) =>
    rows.map((r) => (
      <li key={`${key}-${r.id}`}>
        <code className={classes.code}>{r.object_name || r.object_id}</code>
        {withMessage && r.message ? <span> — {r.message}</span> : null}
      </li>
    ));

  const detailRows: DetailsRow[] = [
    { label: t('common:labels.description'), value: <span className={classes.wrap}>{policy.description}</span> },
    { label: t('compliance:policyDetails.id'), value: <code className={classes.code}>{policy.id}</code> },
    { label: t('common:labels.category'), value: <Badge variant="outline">{policy.category || 'General'}</Badge> },
    { label: t('common:labels.severity'), value: <Badge>{policy.severity || 'medium'}</Badge> },
  ];

  return (
    <>
      <PageLayout
        header={
          <PageHeader
            title={policy.name}
            wrapActions
            actions={
              <>
                <Button variant="outline" size="sm" onClick={() => navigate('/compliance')}>
                  <ArrowLeft /> {t('compliance:policyDetails.backToList')}
                </Button>
                <CommentSidebar
                  entityType="compliance_policy"
                  entityId={policyId!}
                  isOpen={isCommentSidebarOpen}
                  onToggle={() => setIsCommentSidebarOpen(!isCommentSidebarOpen)}
                />
                {canWrite && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
                      <Pencil /> {t('common:actions.edit')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={runNow} disabled={running}>
                      {running ? <Loader size={12} color="currentColor" /> : <PlayCircle />} {t('compliance:policyDetails.run')}
                    </Button>
                  </>
                )}
              </>
            }
          />
        }
      >
        <PaneStack>
          <Pane aria-label={t('compliance:policyDetails.detailsPane')}>
            <DetailsGrid rows={detailRows} columns={1} />
          </Pane>

          <Pane title={t('common:labels.rule')}>
            <pre className={classes.rule}>{policy.rule}</pre>
            {examples && (
              <section className={classes.section}>
                <h3 className={classes.sectionTitle}>{t('compliance:policyDetails.examples')}</h3>
                <div className={classes.examples}>
                  <div>
                    <Badge variant="secondary">{t('compliance:policyDetails.shouldPass')}</Badge>
                    <ItemList items={exampleItems(examples.pass, 'pass')} empty={t('compliance:policyDetails.noExamples')} />
                  </div>
                  <div>
                    <Badge variant="destructive">{t('compliance:policyDetails.shouldFail')}</Badge>
                    <ItemList items={exampleItems(examples.fail, 'fail')} empty={t('compliance:policyDetails.noExamples')} />
                  </div>
                </div>
              </section>
            )}
          </Pane>

          {activeRun && (
            <Pane title={t('compliance:policyDetails.runSummary.title')}>
              <p className={classes.note}>
                {t('compliance:policyDetails.runSummary.lastRunStarted', { date: startedAt })} • {t('compliance:policyDetails.runSummary.statusLabel')}{' '}
                <span className={classes.value}>{activeRun.status}</span>
              </p>
              {activeRun.status === 'failed' && activeRun.error_message && (
                <p className={classes.error}>{t('compliance:policyDetails.runSummary.errorLabel')} {complianceRunErrorText(t, activeRun)}</p>
              )}
              <div className={classes.stats}>
                <StatTile label={t('compliance:policyDetails.runSummary.score')} value={`${activeRun.score}%`} />
                <StatTile label={t('compliance:policyDetails.runSummary.passed')} value={activeRun.success_count} tone="success" />
                <StatTile label={t('compliance:policyDetails.runSummary.failed')} value={activeRun.failure_count} tone="critical" />
              </div>
              <div className={classes.examples}>
                <div>
                  <Badge variant="secondary">{t('compliance:policyDetails.runSummary.passedExamples')}</Badge>
                  <ItemList items={sampleItems(passedSample, 'pass-prev', false)} empty={t('compliance:policyDetails.runSummary.noPassedExamples')} />
                </div>
                <div>
                  <Badge variant="destructive">{t('compliance:policyDetails.runSummary.failedExamples')}</Badge>
                  <ItemList items={sampleItems(failedSample, 'fail-prev', true)} empty={t('compliance:policyDetails.runSummary.noFailures')} />
                </div>
              </div>
            </Pane>
          )}

          <Pane title={t('compliance:policyDetails.runsList.title')}>
            <p className={classes.note}>{t('compliance:policyDetails.runsList.mostRecentFirst')}</p>
            {runs.length === 0 ? (
              <div className={classes.empty}>{t('compliance:policyDetails.runsList.noRuns')}</div>
            ) : (
              <div className={classes.runs}>
                {runs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveRun(r)}
                    className={classes.run}
                    data-selected={activeRun?.id === r.id || undefined}
                  >
                    <div className={classes.runLine}>
                      <Badge variant="outline">{r.status}</Badge>
                      <div>{new Date(r.started_at).toLocaleString()}</div>
                      <div className={classes.runScore}>
                        {t('compliance:policyDetails.runsList.scoreLabel')} <span className={classes.value}>{r.score}%</span> • {t('compliance:policyDetails.runsList.scoreDetail', { passed: r.success_count, failed: r.failure_count })}
                      </div>
                    </div>
                    <div className={classes.runLink}>
                      <a href={`/compliance/runs/${r.id}`}>{t('compliance:policyDetails.runsList.openRunDetails')}</a>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Pane>

          {activeRun && (
            <Pane
              title={t('compliance:policyDetails.resultsCard.title')}
              actions={
                <>
                  <Button size="sm" variant={onlyFailed ? 'default' : 'outline'} onClick={() => setOnlyFailed(true)}>{t('compliance:results.showFailed')}</Button>
                  <Button size="sm" variant={!onlyFailed ? 'default' : 'outline'} onClick={() => setOnlyFailed(false)}>{t('compliance:results.showAll')}</Button>
                </>
              }
            >
              <p className={classes.note}>
                {onlyFailed
                  ? t('compliance:policyDetails.resultsCard.filteredFailed', { date: startedAt })
                  : t('compliance:policyDetails.resultsCard.filteredAll', { date: startedAt })}
              </p>
              <DataTable columns={resultsColumns} data={results} searchColumn="object_name" />
            </Pane>
          )}

          {/* The panel keeps its own head (ruling R27 of wave 2), so the pane has no title */}
          <Pane aria-label={t('metadata:title', 'Metadata')}>
            <EntityMetadataPanel entityId={policyId!} entityType="compliance_policy" flush canEdit={canEditMetadata} />
          </Pane>
        </PaneStack>
      </PageLayout>

      {/* Edit Policy Dialog */}
      <Dialog
        opened={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        size="lg"
        title={t('compliance:editRule')}
        description={t('common:labels.editDescription', { name: policy.name })}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSaving}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" form={formId} disabled={isSaving}>
              {isSaving && <Loader size={12} color="currentColor" />}
              {isSaving ? t('common:states.saving') : t('common:actions.save')}
            </Button>
          </>
        }
      >
        <PolicyForm key={policy.id} formId={formId} policy={policy} onSave={handleSave} />
      </Dialog>
    </>
  );
}

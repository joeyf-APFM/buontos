import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert } from '@mantine/core';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { useApi } from '@/hooks/use-api';
import { usePageBreadcrumb } from '@/stores/breadcrumb-store';
import { CardSkeleton, DetailHeaderSkeleton, TableSkeleton } from '@/components/common/list-view-skeleton';
import { complianceRunErrorText } from '@/lib/compliance-run-error';
import { PageHeader, PageLayout, Pane, PaneStack, StatTile } from '@/mantine/page';
import classes from './compliance-details.module.css';

interface Run {
  id: string; // UUID
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
}

interface Result {
  id: string;
  run_id: string;
  object_type: string;
  object_id: string;
  object_name?: string;
  passed: boolean;
  message?: string;
  details_json?: string;
  created_at: string;
}

export default function ComplianceRunDetails() {
  const { t } = useTranslation(['compliance', 'common']);
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { get } = useApi();
  // Ignored once the page has gone, so a late answer can't name the next page
  const { setStaticSegments, setDynamicTitle } = usePageBreadcrumb();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [onlyFailed, setOnlyFailed] = useState(true);
  // Only the latest request may set the page: an earlier one that answers late is dropped
  const request = useRef(0);
  // The run on screen: a filter change refreshes the table in place, a new run starts afresh
  const shownRun = useRef<string | undefined>(undefined);

  // Memoised, so the cells keep their focus across renders
  const columns: ColumnDef<Result>[] = useMemo(() => [
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

  const load = useCallback(async () => {
    if (!runId) return;
    const mine = ++request.current;
    if (shownRun.current !== runId) setLoading(true);
    setError(null);
    try {
      const res = await get<{ run: Run; results?: Result[] }>(
        `/api/compliance/runs/${runId}/results?only_failed=${onlyFailed ? 'true' : 'false'}`,
      );
      if (mine !== request.current) return;
      // An error answer carries an empty object as its data
      if (res.error || !res.data?.run) throw new Error(res.error || t('compliance:errors.loadRunResultsFailed'));
      shownRun.current = runId;
      setRun(res.data.run);
      setResults(Array.isArray(res.data.results) ? res.data.results : []);
      setDynamicTitle(t('compliance:runDetails.runTitle', { id: runId }));
    } catch (e) {
      if (mine !== request.current) return;
      shownRun.current = undefined;
      setError(e instanceof Error && e.message ? e.message : t('compliance:errors.loadFailed'));
      setRun(null);
      setResults([]);
      setDynamicTitle(t('common:states.error'));
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }, [get, runId, onlyFailed, setDynamicTitle, t]);

  useEffect(() => {
    setStaticSegments([{ label: t('compliance:title'), path: '/compliance' }]);
    return () => {
      setStaticSegments([]);
      setDynamicTitle(null);
    };
  }, [setStaticSegments, setDynamicTitle, t]);

  // On arrival and whenever the filter changes
  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className={classes.state}>
        <DetailHeaderSkeleton actionButtons={1} />
        <CardSkeleton titleWidth="w-48" descriptionWidth="w-64" contentRows={3} />
        <TableSkeleton columns={6} rows={6} />
      </div>
    );
  }
  if (error || !run) {
    return (
      <div className={classes.state}>
        <Alert color="red" variant="light" icon={<AlertCircle />}>
          {error || t('compliance:errors.runNotFound')}
        </Alert>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft /> {t('common:actions.back')}
        </Button>
      </div>
    );
  }

  return (
    <PageLayout
      header={
        <PageHeader
          title={t('compliance:runDetails.runTitle', { id: run.id })}
          wrapActions
          actions={
            <>
              <Link to={`/compliance/policies/${run.policy_id}`} className={classes.viewPolicy}>
                {t('compliance:runDetails.viewPolicy')}
              </Link>
              <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
                <ArrowLeft /> {t('common:actions.back')}
              </Button>
            </>
          }
        />
      }
    >
      <PaneStack>
        <Pane title={t('compliance:policyDetails.runSummary.title')}>
          <p className={classes.note}>
            {t('compliance:runDetails.statusLabel')}{' '}
            <span className={classes.value} data-failed={run.status === 'failed' || undefined}>{run.status}</span>
            {' • '}
            {t('compliance:runDetails.startedLabel', { date: new Date(run.started_at).toLocaleString() })}
          </p>
          {run.status === 'failed' && run.error_message && (
            <p className={classes.error}>{t('compliance:runDetails.errorLabel')} {complianceRunErrorText(t, run)}</p>
          )}
          <div className={classes.stats}>
            <StatTile label={t('compliance:policyDetails.runSummary.score')} value={`${run.score}%`} />
            <StatTile label={t('compliance:policyDetails.runSummary.passed')} value={run.success_count} tone="success" />
            <StatTile label={t('compliance:policyDetails.runSummary.failed')} value={run.failure_count} tone="critical" />
          </div>
        </Pane>

        <Pane
          title={t('compliance:policyDetails.resultsCard.title')}
          actions={
            <>
              <Button size="sm" variant={onlyFailed ? 'default' : 'outline'} onClick={() => setOnlyFailed(true)}>{t('compliance:results.showFailed')}</Button>
              <Button size="sm" variant={!onlyFailed ? 'default' : 'outline'} onClick={() => setOnlyFailed(false)}>{t('compliance:results.showAll')}</Button>
            </>
          }
        >
          <DataTable columns={columns} data={results} searchColumn="object_name" />
        </Pane>
      </PaneStack>
    </PageLayout>
  );
}

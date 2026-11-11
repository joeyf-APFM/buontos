import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { Alert, Loader, UnstyledButton } from '@mantine/core';
import { AlertCircle, ChevronRight, Inbox, Plus, RefreshCw, Undo2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RelativeDate } from '@/components/common/relative-date';
import { LoadError } from '@/components/search/search-pane';
import { PageHeader, PageLayout, Pane } from '@/mantine/page';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/stores/permissions-store';
import { useUserStore } from '@/stores/user-store';
import { FeatureAccessLevel } from '@/types/settings';

import RunConfigDialog from '@/components/term-mapping/run-config-dialog';
import GenerateReviewDialog from '@/components/term-mapping/generate-review-dialog';

import type {
  ApplyResult,
  Run,
  RunStatus,
  RunSummary,
  UndoResult,
} from '@/types/term-mapping';
import classes from './term-mapping.module.css';

const FEATURE_ID = 'term-mapping';

const RUN_STATUS_VARIANT: Record<
  RunStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  suggesting: 'secondary',
  suggested: 'secondary',
  applying: 'secondary',
  applied: 'default',
  undone: 'outline',
  failed: 'destructive',
};

export default function TermMappingView() {
  const { t } = useTranslation(['term-mapping', 'common']);
  const { get, post } = useApi();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const currentUser = useUserStore((s) => s.userInfo);

  const canWrite = hasPermission(FEATURE_ID, FeatureAccessLevel.READ_WRITE);
  const isAdmin = hasPermission(FEATURE_ID, FeatureAccessLevel.ADMIN);

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [runDetailError, setRunDetailError] = useState<string | null>(null);

  const [isNewRunOpen, setIsNewRunOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  // A newer request drops an older answer: the list on a Refresh or Retry,
  // the detail when another run is picked
  const runsSeq = useRef(0);
  const detailSeq = useRef(0);
  // The selected run, for answers that arrive after the selection moved on
  // (a reload after Apply auto or Undo on run A while run B is picked)
  const selectedRunIdRef = useRef<string | null>(null);
  const selectRun = useCallback((id: string | null) => {
    selectedRunIdRef.current = id;
    setSelectedRunId(id);
  }, []);

  const fetchRuns = useCallback(async () => {
    const seq = ++runsSeq.current;
    setRunsLoading(true);
    setRunsError(null);
    try {
      const res = await get<RunSummary[]>('/api/term-mappings/runs?limit=50');
      if (res.error) throw new Error(res.error);
      if (seq === runsSeq.current) setRuns(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      if (seq === runsSeq.current) setRunsError(e instanceof Error ? e.message : t('errors.loadRunsFailed'));
    } finally {
      if (seq === runsSeq.current) setRunsLoading(false);
    }
  }, [get, t]);

  const fetchRunDetail = useCallback(
    async (runId: string) => {
      // Only the selected run's detail is loaded: another run's would replace it
      if (runId !== selectedRunIdRef.current) return;
      const seq = ++detailSeq.current;
      setRunDetailLoading(true);
      setRunDetailError(null);
      try {
        const res = await get<Run>(`/api/term-mappings/runs/${runId}`);
        if (res.error) throw new Error(res.error);
        if (seq === detailSeq.current) setSelectedRun(res.data ?? null);
      } catch (e) {
        if (seq !== detailSeq.current) return;
        const message = e instanceof Error ? e.message : t('toast.unknownError');
        toast({
          title: t('toast.loadRunFailed'),
          description: message,
          variant: 'destructive',
        });
        setSelectedRun(null);
        setRunDetailError(message);
      } finally {
        if (seq === detailSeq.current) setRunDetailLoading(false);
      }
    },
    [get, toast, t],
  );

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    if (selectedRunId) void fetchRunDetail(selectedRunId);
    else {
      detailSeq.current += 1;
      setSelectedRun(null);
    }
  }, [selectedRunId, fetchRunDetail]);

  const handleRunCreated = useCallback(
    (created: Run) => {
      // RunConfigDialog calls onCreated with the freshly persisted run, so we
      // can avoid the round-trip and immediately drill into it.
      setRuns((prev) => [
        {
          id: created.id,
          status: created.status,
          comment: created.comment ?? null,
          stats: created.stats,
          created_by: created.created_by ?? null,
          created_at: created.created_at,
          finished_at: created.finished_at ?? null,
          applied_at: created.applied_at ?? null,
        },
        ...prev,
      ]);
      selectRun(created.id);
    },
    [selectRun],
  );

  const handleApplyAuto = async () => {
    if (!selectedRun || actionPending) return;
    setActionPending(true);
    try {
      const res = await post<ApplyResult>(
        `/api/term-mappings/runs/${selectedRun.id}/apply?apply_auto=true`,
        {},
      );
      if (res.error) throw new Error(res.error);
      const r = res.data!;
      toast({
        title: t('toast.applied'),
        description: t('toast.appliedDescription', {
          created: r.links_created,
          skipped: r.links_skipped,
        }),
      });
      await Promise.all([fetchRuns(), fetchRunDetail(selectedRun.id)]);
    } catch (e) {
      toast({
        title: t('toast.applyFailed'),
        description: e instanceof Error ? e.message : t('toast.unknownError'),
        variant: 'destructive',
      });
    } finally {
      setActionPending(false);
    }
  };

  const handleUndo = async () => {
    if (!selectedRun || actionPending) return;
    if (!confirm(t('confirm.undo', { id: selectedRun.id }))) return;
    setActionPending(true);
    try {
      const res = await post<UndoResult>(
        `/api/term-mappings/runs/${selectedRun.id}/undo`,
        {},
      );
      if (res.error) throw new Error(res.error);
      const r = res.data!;
      toast({
        title: t('toast.undone'),
        description: t('toast.undoneDescription', {
          removed: r.links_removed,
          reverted: r.suggestions_reverted,
        }),
      });
      await Promise.all([fetchRuns(), fetchRunDetail(selectedRun.id)]);
    } catch (e) {
      toast({
        title: t('toast.undoFailed'),
        description: e instanceof Error ? e.message : t('toast.unknownError'),
        variant: 'destructive',
      });
    } finally {
      setActionPending(false);
    }
  };

  const totalsRow = (stats: Run['stats']) => (
    <div className={classes.stats}>
      <Stat label={t('stats.targets')} value={stats.targets ?? 0} />
      <Stat label={t('stats.suggestions')} value={stats.suggestions_total ?? 0} />
      <Stat label={t('stats.pending')} value={stats.suggestions_pending ?? 0} />
      <Stat label={t('stats.autoApply')} value={stats.suggestions_auto_apply ?? 0} />
      <Stat label={t('stats.accepted')} value={stats.suggestions_accepted ?? 0} />
      <Stat label={t('stats.rejected')} value={stats.suggestions_rejected ?? 0} />
      <Stat label={t('stats.linksCreated')} value={stats.links_created ?? 0} />
      <Stat label={t('stats.linksSkipped')} value={stats.links_skipped ?? 0} />
    </div>
  );

  // The detail pane: its title and head actions, and its body
  const renderDetailPane = () => {
    const paneLabel = t('detail.paneLabel', 'Run detail');
    if (!selectedRunId) {
      return (
        <Pane aria-label={paneLabel}>
          <div className={classes.state}>
            <Inbox size={32} className={classes.stateIcon} aria-hidden />
            <p>{t('actions.selectRunHint')}</p>
          </div>
        </Pane>
      );
    }
    if (runDetailError) {
      return (
        <Pane aria-label={paneLabel}>
          <LoadError error={runDetailError} onRetry={() => void fetchRunDetail(selectedRunId)} />
        </Pane>
      );
    }
    // Switching runs: nothing of the new one to show yet
    if (!selectedRun || selectedRun.id !== selectedRunId) {
      return (
        <Pane aria-label={paneLabel}>
          <div className={classes.state}>
            <Loader size="sm" />
          </div>
        </Pane>
      );
    }
    const stats = selectedRun.stats ?? {};
    const pending = (stats.suggestions_pending as number | undefined) ?? 0;
    const accepted = (stats.suggestions_accepted as number | undefined) ?? 0;
    const autoApply = (stats.suggestions_auto_apply as number | undefined) ?? 0;
    return (
      <Pane
        aria-label={paneLabel}
        title={`${t('detail.runLabel')} ${selectedRun.id.slice(0, 8)}`}
        actions={
          <>
            <Badge variant={RUN_STATUS_VARIANT[selectedRun.status]}>{selectedRun.status}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchRunDetail(selectedRun.id)}
              aria-busy={runDetailLoading || undefined}
            >
              <RefreshCw size={14} aria-hidden /> {t('actions.refresh')}
            </Button>
            {canWrite && autoApply > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleApplyAuto}
                aria-disabled={actionPending || undefined}
              >
                {actionPending && <Loader size={12} color="currentColor" />}
                {t('actions.applyAuto', { count: autoApply })}
              </Button>
            )}
            {canWrite && (pending > 0 || accepted > 0) && (
              <Button
                size="sm"
                onClick={() => !actionPending && setIsReviewOpen(true)}
                aria-disabled={actionPending || undefined}
              >
                {t('actions.generateReview')}
                <ChevronRight size={14} aria-hidden />
              </Button>
            )}
            {isAdmin && selectedRun.status === 'applied' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleUndo}
                aria-disabled={actionPending || undefined}
              >
                <Undo2 size={14} aria-hidden /> {t('actions.undo')}
              </Button>
            )}
          </>
        }
      >
        {/* A reload keeps the head (and a focused Refresh) mounted: the loader is in the body */}
        {runDetailLoading ? (
          <div className={classes.state} aria-live="polite">
            <Loader size="sm" />
          </div>
        ) : (
          <div className={classes.detail}>
            <div className={classes.meta}>
              <p className={classes.muted}>
                {t('detail.createdAt')} <RelativeDate date={selectedRun.created_at} />{' '}
                {selectedRun.created_by
                  ? t('detail.createdBy', { email: selectedRun.created_by })
                  : ''}
              </p>
              {selectedRun.comment && (
                <p className={classes.comment}>{selectedRun.comment}</p>
              )}
            </div>
            {totalsRow(stats)}
            {selectedRun.error && (
              <Alert color="red" variant="light" icon={<AlertCircle size={16} />}>
                <span className={classes.alertText}>{selectedRun.error}</span>
              </Alert>
            )}

            <section className={classes.section} aria-labelledby="term-mapping-sources">
              <h3 id="term-mapping-sources" className={classes.sectionTitle}>{t('detail.sourcesTitle')}</h3>
              <div>
                <FieldLabel>{t('detail.customerOntologies')}</FieldLabel>
                <ContextList items={selectedRun.ontology_contexts} />
              </div>
              <div>
                <FieldLabel>{t('detail.shippedTaxonomies')}</FieldLabel>
                <ContextList items={selectedRun.include_shipped} />
              </div>
              <p className={classes.reviewsNote}>
                {t('detail.reviewsLinkPrefix')}{' '}
                <Link to="/data-asset-reviews" className={classes.link}>
                  {t('detail.reviewsLinkText')}
                </Link>{' '}
                {t('detail.reviewsLinkSuffix')}
              </p>
            </section>
          </div>
        )}
      </Pane>
    );
  };

  return (
    <PageLayout
      stackBelow="lg"
      header={
        <>
          <PageHeader
            title={t('title')}
            actions={
              <>
                <Button variant="outline" size="sm" onClick={() => void fetchRuns()} disabled={runsLoading}>
                  <RefreshCw size={14} aria-hidden /> {t('actions.refresh')}
                </Button>
                {canWrite && (
                  <Button size="sm" onClick={() => setIsNewRunOpen(true)}>
                    <Plus size={14} aria-hidden /> {t('actions.newRun')}
                  </Button>
                )}
              </>
            }
          />
          <p className={classes.subtitle}>{t('subtitle')}</p>
        </>
      }
    >
      <Pane title={t('recent.title')} className={classes.runsPane}>
        {runsError ? (
          <LoadError error={runsError} onRetry={() => void fetchRuns()} />
        ) : runsLoading && runs.length === 0 ? (
          <div className={classes.state}>
            <Loader size="sm" />
          </div>
        ) : !runsLoading && runs.length === 0 ? (
          <p className={classes.empty}>
            <Trans
              i18nKey="term-mapping:recent.empty"
              components={{ strong: <strong /> }}
            />
          </p>
        ) : null}
        {!runsError && runs.length > 0 && (
          <ul className={classes.runs}>
            {runs.map((run) => {
              const stats = (run.stats ?? {}) as Record<string, number | undefined>;
              const isSelected = run.id === selectedRunId;
              return (
                <li key={run.id}>
                  <UnstyledButton
                    className={classes.run}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => selectRun(run.id)}
                  >
                    <span className={classes.runHead}>
                      <span className={classes.runId}>{run.id.slice(0, 8)}</span>
                      <Badge variant={RUN_STATUS_VARIANT[run.status]}>{run.status}</Badge>
                    </span>
                    <span className={classes.runComment} title={run.comment ?? undefined}>
                      {run.comment || t('recent.noComment')}
                    </span>
                    <span className={classes.runMeta}>
                      <RelativeDate date={run.created_at} />
                      {typeof stats.suggestions_total === 'number' &&
                        ` · ${t('recent.suggestionsCount', { count: stats.suggestions_total })}`}
                    </span>
                  </UnstyledButton>
                </li>
              );
            })}
          </ul>
        )}
      </Pane>

      {renderDetailPane()}

      <RunConfigDialog
        isOpen={isNewRunOpen}
        onOpenChange={setIsNewRunOpen}
        onCreated={handleRunCreated}
      />

      <GenerateReviewDialog
        isOpen={isReviewOpen}
        onOpenChange={setIsReviewOpen}
        run={selectedRun}
        currentUserEmail={currentUser?.email ?? undefined}
      />
    </PageLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={classes.stat}>
      <div className={classes.statLabel}>{label}</div>
      <div className={classes.statValue}>{value}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className={classes.fieldLabel}>{children}</div>;
}

function ContextList({ items }: { items: string[] }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className={classes.muted}>—</p>;
  }
  return (
    <ul className={classes.contexts}>
      {items.map((it) => (
        <li key={it} className={classes.context}>{it}</li>
      ))}
    </ul>
  );
}

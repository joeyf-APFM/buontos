import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Divider, Loader, Progress, Table } from '@mantine/core';
import {
  AlertCircle, Clock, Eye, FileCheck, GitCompare, Link2, Merge, Play, Plus, RefreshCw, Settings2, Trash2, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { RelativeDate } from '@/components/common/relative-date';
import { ListItemSkeleton } from '@/components/common/list-view-skeleton';
import {
  Dialog, DetailsGrid, PageHeader, PageLayout, Pane, PaneStack, SelectableList, StatTile, Tabs,
} from '@/mantine/page';
import list from '@/components/common/list-page.module.css';

import MdmConfigDialog from '@/components/mdm/mdm-config-dialog';
import LinkSourceDialog from '@/components/mdm/link-source-dialog';
import CreateReviewDialog from '@/components/mdm/create-review-dialog';
import MatchingRulesEditor from '@/components/mdm/matching-rules-editor';
import {
  MdmConfig,
  MdmSourceLink,
  MdmMatchRun,
  MdmMatchCandidate,
  MdmConfigStatus,
  MdmMatchRunStatus,
  MdmMatchCandidateStatus,
  MdmMatchType,
} from '@/types/mdm';
import { deleteOrThrow } from '@/lib/delete-or-throw';
import classes from './master-data-management.module.css';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  active: 'default',
  completed: 'default',
  running: 'secondary',
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
  merged: 'default',
  failed: 'destructive',
  paused: 'outline',
  archived: 'outline',
};

const MATCH_TYPE_VARIANTS: Record<string, BadgeVariant> = {
  exact: 'default',
  fuzzy: 'secondary',
  probabilistic: 'outline',
  new: 'secondary',
};

const StatusBadge = ({ status }: { status: string }) => (
  <Badge variant={STATUS_VARIANTS[status] || 'outline'}>{status}</Badge>
);

const MatchTypeBadge = ({ matchType }: { matchType: MdmMatchType }) => (
  <Badge variant={MATCH_TYPE_VARIANTS[matchType] || 'outline'}>{matchType}</Badge>
);

/** Green from 90%, amber from 80%, below that the warning's stronger colour. */
const confidenceTone = (score: number) => (score >= 0.9 ? 'good' : score >= 0.8 ? 'warning' : 'critical');

const lastRunTone = (status: string) => (status === 'completed' ? 'good' : status === 'failed' ? 'critical' : 'warning');

const asArray = <T,>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);

export default function MasterDataManagement() {
  const { t } = useTranslation(['mdm', 'common']);
  const [configs, setConfigs] = useState<MdmConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<MdmConfig | null>(null);
  const [sourceLinks, setSourceLinks] = useState<MdmSourceLink[]>([]);
  const [matchRuns, setMatchRuns] = useState<MdmMatchRun[]>([]);
  const [candidates, setCandidates] = useState<MdmMatchCandidate[]>([]);
  const [selectedRun, setSelectedRun] = useState<MdmMatchRun | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  // The list's failed load, shown with a Retry; the last good list stays under it
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [isRulesEditorOpen, setIsRulesEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // The confirms keep what they were opened for while they close
  const [deleteConfigOpen, setDeleteConfigOpen] = useState(false);
  const [deleteConfigTarget, setDeleteConfigTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingConfig, setDeletingConfig] = useState(false);
  const [removeSourceOpen, setRemoveSourceOpen] = useState(false);
  const [removeSourceTarget, setRemoveSourceTarget] = useState<{ id: string; name: string } | null>(null);
  const [removingSource, setRemovingSource] = useState(false);

  const { get, post, delete: deleteApi } = useApi();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Only the latest answer of each kind may land: an earlier one that answers
  // late, or one for a configuration or run no longer chosen, is dropped
  const configsReq = useRef(0);
  const sourcesReq = useRef(0);
  const runsReq = useRef(0);
  const candidatesReq = useRef(0);
  const selectedId = useRef<string | null>(null);
  const selectedRunId = useRef<string | null>(null);
  // A second click while a request is out sends nothing
  const busy = useRef({ start: false, merge: false, delete: false });

  const newButton = useRef<HTMLButtonElement>(null);
  const linkSourceButton = useRef<HTMLButtonElement>(null);
  // Where focus goes once a confirm has closed: a control that is still there
  // once the row is gone; none otherwise, so the kit gives it back to the opener
  const afterDeleteConfig = useRef<HTMLElement | null>(null);
  const afterRemoveSource = useRef<HTMLElement | null>(null);

  const fetchConfigs = async () => {
    const id = ++configsReq.current;
    try {
      const response = await get<MdmConfig[]>('/api/mdm/configs');
      if (id !== configsReq.current) return;
      if (response.error) {
        setLoadError(response.error);
        return;
      }
      const next = asArray<MdmConfig>(response.data);
      setConfigs(next);
      setLoadError(null);
      // The chosen configuration follows the list's newer copy of it
      setSelectedConfig((prev) => (prev ? next.find((c) => c.id === prev.id) ?? prev : prev));
    } catch (err: any) {
      if (id !== configsReq.current) return;
      setLoadError(err?.message || t('mdm:errors.loadFailed'));
    } finally {
      if (id === configsReq.current) setInitialLoading(false);
    }
  };

  const fetchSourceLinks = async (configId: string) => {
    const id = ++sourcesReq.current;
    try {
      const response = await get<MdmSourceLink[]>(`/api/mdm/configs/${configId}/sources`);
      if (id !== sourcesReq.current || configId !== selectedId.current || response.error) return;
      setSourceLinks(asArray<MdmSourceLink>(response.data));
    } catch (err: any) {
      console.error('Error fetching source links:', err);
    }
  };

  const fetchMatchRuns = async (configId: string) => {
    const id = ++runsReq.current;
    try {
      const response = await get<MdmMatchRun[]>(`/api/mdm/configs/${configId}/runs`);
      if (id !== runsReq.current || configId !== selectedId.current || response.error) return;
      setMatchRuns(asArray<MdmMatchRun>(response.data));
    } catch (err: any) {
      console.error('Error fetching match runs:', err);
    }
  };

  const fetchCandidates = async (runId: string) => {
    const id = ++candidatesReq.current;
    try {
      const response = await get<MdmMatchCandidate[]>(`/api/mdm/runs/${runId}/candidates`);
      if (id !== candidatesReq.current || runId !== selectedRunId.current || response.error) return;
      setCandidates(asArray<MdmMatchCandidate>(response.data));
    } catch (err: any) {
      console.error('Error fetching candidates:', err);
    }
  };

  useEffect(() => {
    // Load once on mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseRun = (run: MdmMatchRun | null) => {
    const changed = (run?.id ?? null) !== selectedRunId.current;
    selectedRunId.current = run?.id ?? null;
    setSelectedRun(run);
    // Another run's candidates never show (or gate Merge Approved) under this one
    if (run && changed) {
      setCandidates([]);
      fetchCandidates(run.id);
    }
  };

  const clearSelection = () => {
    selectedId.current = null;
    setSelectedConfig(null);
    setSourceLinks([]);
    setMatchRuns([]);
    chooseRun(null);
    setCandidates([]);
  };

  const handleSelectConfig = (config: MdmConfig) => {
    selectedId.current = config.id;
    setSelectedConfig(config);
    // The last configuration's sources and runs don't show under this one
    setSourceLinks([]);
    setMatchRuns([]);
    chooseRun(null);
    setCandidates([]);
    // Its Candidates tab goes with the run
    if (activeTab === 'candidates') setActiveTab('overview');
    fetchSourceLinks(config.id);
    fetchMatchRuns(config.id);
  };

  const openRun = (run: MdmMatchRun) => {
    chooseRun(run);
    setActiveTab('candidates');
  };

  const handleStartMatching = async (configId: string) => {
    if (busy.current.start) return;
    busy.current.start = true;
    try {
      const response = await post<MdmMatchRun>(`/api/mdm/configs/${configId}/start-run`, {});
      if (response.error) throw new Error(response.error);
      if (response.data) {
        toast({ title: t('common:toast.success'), description: t('mdm:toast.matchingStarted') });
        fetchMatchRuns(configId);
      }
    } catch (err: any) {
      toast({ title: t('common:toast.error'), description: err.message || t('mdm:errors.startMatchingFailed'), variant: 'destructive' });
    } finally {
      busy.current.start = false;
    }
  };

  const handleMergeApproved = async (runId: string) => {
    if (busy.current.merge) return;
    busy.current.merge = true;
    try {
      const response = await post(`/api/mdm/runs/${runId}/merge-approved`, {});
      if (response.error) throw new Error(response.error);
      if (response.data) {
        toast({
          title: t('common:toast.success'),
          description: (response.data as any).message || t('mdm:toast.mergeCompleted'),
        });
        if (selectedId.current) fetchMatchRuns(selectedId.current);
        if (selectedRunId.current) fetchCandidates(selectedRunId.current);
      }
    } catch (err: any) {
      toast({ title: t('common:toast.error'), description: err.message || t('mdm:errors.mergeFailed'), variant: 'destructive' });
    } finally {
      busy.current.merge = false;
    }
  };

  const askDeleteConfig = (config: MdmConfig) => {
    setDeleteConfigTarget({ id: config.id, name: config.name });
    setDeleteConfigOpen(true);
  };

  const closeDeleteConfig = () => {
    if (deletingConfig) return;
    afterDeleteConfig.current = null;
    setDeleteConfigOpen(false);
  };

  const handleDeleteConfig = async () => {
    if (!deleteConfigTarget || !deleteConfigOpen || busy.current.delete) return;
    busy.current.delete = true;
    const { id } = deleteConfigTarget;
    setDeletingConfig(true);
    let deleted = false;
    try {
      await deleteOrThrow(deleteApi, `/api/mdm/configs/${id}`);
      deleted = true;
      // Gone for good, even if the reload fails
      setConfigs((prev) => prev.filter((c) => c.id !== id));
      if (selectedId.current === id) clearSelection();
      toast({ title: t('common:toast.success'), description: t('mdm:toast.configDeleted') });
      fetchConfigs();
    } catch (err: any) {
      toast({ title: t('common:toast.error'), description: err.message || t('mdm:errors.deleteFailed'), variant: 'destructive' });
    } finally {
      afterDeleteConfig.current = deleted ? newButton.current : null;
      busy.current.delete = false;
      setDeletingConfig(false);
      setDeleteConfigOpen(false);
    }
  };

  const askRemoveSource = (link: MdmSourceLink) => {
    setRemoveSourceTarget({ id: link.id, name: link.source_contract_name || link.source_contract_id });
    setRemoveSourceOpen(true);
  };

  const closeRemoveSource = () => {
    if (removingSource) return;
    afterRemoveSource.current = null;
    setRemoveSourceOpen(false);
  };

  const handleRemoveSource = async () => {
    if (!removeSourceTarget || !removeSourceOpen || busy.current.delete) return;
    busy.current.delete = true;
    const { id } = removeSourceTarget;
    setRemovingSource(true);
    let removed = false;
    try {
      await deleteOrThrow(deleteApi, `/api/mdm/sources/${id}`);
      removed = true;
      setSourceLinks((prev) => prev.filter((l) => l.id !== id));
      toast({ title: t('common:toast.success'), description: t('mdm:toast.sourceRemoved') });
      if (selectedId.current) {
        fetchSourceLinks(selectedId.current);
        fetchConfigs(); // Refresh source count
      }
    } catch (err: any) {
      toast({ title: t('common:toast.error'), description: err.message || t('mdm:errors.deleteFailed'), variant: 'destructive' });
    } finally {
      afterRemoveSource.current = removed ? linkSourceButton.current : null;
      busy.current.delete = false;
      setRemovingSource(false);
      setRemoveSourceOpen(false);
    }
  };

  // Calculate statistics for selected config
  const configStats = useMemo(() => {
    if (!matchRuns.length) return null;

    const completedRuns = matchRuns.filter((r) => r.status === MdmMatchRunStatus.COMPLETED);
    const totalMatches = completedRuns.reduce((sum, r) => sum + r.matches_found, 0);
    const totalNew = completedRuns.reduce((sum, r) => sum + r.new_records, 0);
    const pendingReview = matchRuns.reduce((sum, r) => sum + r.pending_review_count, 0);

    return {
      totalRuns: matchRuns.length,
      completedRuns: completedRuns.length,
      totalMatches,
      totalNew,
      pendingReview,
    };
  }, [matchRuns]);

  const items = configs.map((config) => ({
    id: config.id,
    label: (
      <>
        <span className={classes.rowName} title={config.name}>{config.name}</span>
        <span className={classes.rowSub}>
          {config.entity_type} • {config.source_count} {t('mdm:sources')}
        </span>
      </>
    ),
    meta: (
      <span className={classes.rowMeta}>
        <StatusBadge status={config.status} />
        {/* Unnamed, as in the Task 1 baseline (R10) */}
        <ActionIcon
          variant="subtle"
          color="gray"
          className={`${list.action} ${list.delete}`}
          onClick={(event) => {
            // The row's own button: its click is not the row's
            event.stopPropagation();
            askDeleteConfig(config);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Trash2 aria-hidden />
        </ActionIcon>
      </span>
    ),
  }));

  const counts = {
    pending: candidates.filter((c) => c.status === MdmMatchCandidateStatus.PENDING).length,
    approved: candidates.filter((c) => c.status === MdmMatchCandidateStatus.APPROVED).length,
    merged: candidates.filter((c) => c.status === MdmMatchCandidateStatus.MERGED).length,
  };

  const renderOverview = (config: MdmConfig) => (
    <>
      <DetailsGrid
        rows={[
          { label: t('mdm:overview.masterContract'), value: config.master_contract_name || t('mdm:overview.notSet') },
          { label: t('mdm:overview.entityType'), value: <span className={classes.capitalize}>{config.entity_type}</span> },
          { label: t('mdm:overview.linkedSources'), value: config.source_count },
          { label: t('common:labels.status'), value: <StatusBadge status={config.status} /> },
          {
            label: t('mdm:lastRun'),
            value: config.last_run_at ? (
              <span className={classes.lastRun} data-tone={config.last_run_status ? lastRunTone(config.last_run_status) : undefined}>
                <RelativeDate date={config.last_run_at} />
                {config.last_run_status && <span className={classes.lastRunStatus}>({config.last_run_status})</span>}
              </span>
            ) : (
              '-'
            ),
          },
        ]}
      />
      {configStats && (
        <>
          <Divider className={classes.divider} />
          <div className={classes.stats}>
            <StatTile label={t('mdm:stats.totalRuns')} value={configStats.totalRuns} />
            <StatTile label={t('mdm:stats.matchesFound')} value={configStats.totalMatches} tone="success" />
            <StatTile label={t('mdm:stats.newRecords')} value={configStats.totalNew} />
            <StatTile label={t('mdm:stats.pendingReview')} value={configStats.pendingReview} tone="warning" />
          </div>
        </>
      )}
    </>
  );

  const renderSources = () =>
    sourceLinks.length > 0 ? (
      <div className={classes.scroll}>
        <Table className={classes.table} withRowBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('mdm:sourcesTab.sourceContract')}</Table.Th>
              <Table.Th>{t('common:labels.table')}</Table.Th>
              <Table.Th>{t('mdm:sourcesTab.keyColumn')}</Table.Th>
              <Table.Th>{t('common:labels.priority')}</Table.Th>
              <Table.Th>{t('common:labels.status')}</Table.Th>
              <Table.Th className={classes.actionCell} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sourceLinks.map((link) => {
              const name = link.source_contract_name || link.source_contract_id;
              return (
                <Table.Tr key={link.id}>
                  <Table.Td>
                    <span className={classes.name} title={name}>{name}</span>
                  </Table.Td>
                  <Table.Td>
                    <span className={classes.ident} title={link.source_table_fqn || undefined}>
                      {link.source_table_fqn || '-'}
                    </span>
                  </Table.Td>
                  <Table.Td>
                    <span className={classes.cellText} title={link.key_column}>{link.key_column}</span>
                  </Table.Td>
                  <Table.Td>{link.priority}</Table.Td>
                  <Table.Td><StatusBadge status={link.status} /></Table.Td>
                  <Table.Td className={classes.actionCell}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      className={`${list.action} ${list.delete}`}
                      aria-label={t('mdm:sourcesTab.removeSource')}
                      onClick={() => askRemoveSource(link)}
                    >
                      <Trash2 aria-hidden />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>
    ) : (
      <div className={classes.empty}>
        <Link2 aria-hidden />
        <p>{t('mdm:sourcesTab.noSources')}</p>
        <Button variant="outline" onClick={() => setIsLinkDialogOpen(true)}>
          <Plus />
          {t('mdm:configDetails.linkSource')}
        </Button>
      </div>
    );

  const renderRules = (config: MdmConfig) => {
    const matching = asArray<MdmConfig['matching_rules'][number]>(config.matching_rules);
    const survivorship = asArray<MdmConfig['survivorship_rules'][number]>(config.survivorship_rules);
    return (
      <>
        <div className={classes.section}>
          <div className={classes.sectionHead}>
            <h3 className={classes.sectionTitle}>
              <Settings2 aria-hidden />
              {t('mdm:rulesTab.title')}
            </h3>
            <Button variant="outline" size="sm" onClick={() => setIsRulesEditorOpen(true)}>
              {t('mdm:rulesTab.editRules')}
            </Button>
          </div>
          {matching.length > 0 ? (
            <div className={classes.rows}>
              {matching.map((rule, idx) => (
                <div key={idx} className={classes.card}>
                  <div className={classes.cardHead}>
                    <span className={classes.cardTitle} title={rule.name}>{rule.name}</span>
                    <Badge variant="outline">{rule.type}</Badge>
                  </div>
                  <div className={classes.cardText}>
                    {[
                      `${t('mdm:rulesTab.fields')}: ${asArray<string>(rule.fields).join(', ')}`,
                      `${t('mdm:rulesTab.weight')}: ${rule.weight}`,
                      `${t('mdm:rulesTab.threshold')}: ${rule.threshold}`,
                      ...(rule.algorithm ? [`${t('mdm:rulesTab.algorithm')}: ${rule.algorithm}`] : []),
                    ].join(' • ')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={classes.note}>{t('mdm:rulesTab.noRulesDefault')}</p>
          )}
        </div>

        <Divider className={classes.divider} />

        <div className={classes.section}>
          <div className={classes.sectionHead}>
            <h3 className={classes.sectionTitle}>
              <Merge aria-hidden />
              {t('mdm:survivorship.title')}
            </h3>
          </div>
          {survivorship.length > 0 ? (
            <div className={classes.rows}>
              {survivorship.map((rule, idx) => (
                <div key={idx} className={classes.card}>
                  <div className={classes.cardHead}>
                    <span className={classes.cardTitle} title={rule.field}>{rule.field}</span>
                    <Badge variant="secondary">{rule.strategy}</Badge>
                  </div>
                  {rule.priority && (
                    <div className={classes.cardText}>
                      {t('common:labels.priority')}: {rule.priority.join(' > ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className={classes.note}>{t('mdm:survivorship.noRules')}</p>
          )}
        </div>
      </>
    );
  };

  const renderRuns = (config: MdmConfig) =>
    matchRuns.length > 0 ? (
      <div className={classes.rows}>
        {matchRuns.map((run) => (
          <div
            key={run.id}
            className={classes.run}
            data-selected={selectedRun?.id === run.id || undefined}
            onClick={() => openRun(run)}
          >
            <div className={classes.cardHead}>
              <div>
                <span className={classes.cardTitle}>{t('mdm:runsTab.runLabel', { id: run.id.slice(0, 8) })}</span>
                <div className={classes.runMeta}>
                  <span>
                    <Clock aria-hidden />
                    <RelativeDate date={run.started_at || ''} />
                  </span>
                  {run.triggered_by && (
                    <span>
                      <Users aria-hidden />
                      {run.triggered_by}
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge status={run.status} />
            </div>

            {run.status === MdmMatchRunStatus.RUNNING && (
              <Progress value={50} size="sm" className={classes.progress} />
            )}

            {run.status === MdmMatchRunStatus.COMPLETED && (
              <div className={classes.runFoot}>
                <div className={classes.counts}>
                  <span className={classes.count} data-tone="good">
                    {t('mdm:runsTab.matchesCount', { count: run.matches_found })}
                  </span>
                  <span className={classes.count} data-tone="info">
                    {t('mdm:runsTab.newCount', { count: run.new_records })}
                  </span>
                  {run.pending_review_count > 0 && (
                    <span className={classes.count} data-tone="warning">
                      {t('mdm:runsTab.pendingReviewCount', { count: run.pending_review_count })}
                    </span>
                  )}
                  {run.approved_count > 0 && (
                    <span className={classes.count} data-tone="ready">
                      {t('mdm:runsTab.readyToMergeCount', { count: run.approved_count })}
                    </span>
                  )}
                </div>
                <div className={classes.runActions}>
                  {run.approved_count > 0 && (
                    <Button size="sm" variant="default" onClick={(event) => {
                        event.stopPropagation();
                        handleMergeApproved(run.id);
                      }}>
                      <Merge />
                      {t('mdm:runsTab.mergeButton', { count: run.approved_count })}
                    </Button>
                  )}
                  {run.pending_review_count > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        chooseRun(run);
                        setIsReviewDialogOpen(true);
                      }}
                    >
                      <FileCheck />
                      {t('mdm:runsTab.createReview')}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={(event) => {
                      event.stopPropagation();
                      openRun(run);
                    }}>
                    <Eye />
                    {t('common:actions.view')}
                  </Button>
                </div>
              </div>
            )}

            {run.status === MdmMatchRunStatus.FAILED && run.error_message && (
              <div className={classes.runError}>
                {t('common:status.error')}: {run.error_message}
              </div>
            )}
          </div>
        ))}
      </div>
    ) : (
      <div className={classes.empty}>
        <RefreshCw aria-hidden />
        <p>{t('mdm:runsTab.noRunsShort')}</p>
        <Button onClick={() => handleStartMatching(config.id)}>
          <Play />
          {t('mdm:runsTab.startFirstRun')}
        </Button>
      </div>
    );

  const renderCandidates = (run: MdmMatchRun) => (
    <div className={classes.section}>
      <div className={classes.candidatesHead}>
        <div>
          <h3 className={classes.candidatesTitle}>{t('mdm:candidates.forRun', { id: run.id.slice(0, 8) })}</h3>
          <p className={classes.note}>{t('mdm:candidates.summary', counts)}</p>
        </div>
        {counts.approved > 0 && (
          <Button onClick={() => handleMergeApproved(run.id)}>
            <Merge />
            {t('mdm:candidates.mergeApproved')}
          </Button>
        )}
      </div>

      {candidates.length > 0 ? (
        <div className={classes.scroll}>
          <Table className={classes.table} withRowBorders={false}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('common:labels.type')}</Table.Th>
                <Table.Th>{t('mdm:candidates.masterId')}</Table.Th>
                <Table.Th>{t('mdm:candidates.sourceId')}</Table.Th>
                <Table.Th>{t('mdm:candidates.confidence')}</Table.Th>
                <Table.Th>{t('mdm:candidates.matchedFields')}</Table.Th>
                <Table.Th>{t('common:labels.status')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {candidates.map((candidate) => {
                const fields = asArray<string>(candidate.matched_fields);
                return (
                  <Table.Tr
                    key={candidate.id}
                    className={classes.clickableRow}
                    onClick={() => {
                      // Navigate to review or show detail modal
                      if (candidate.review_request_id) {
                        navigate(`/data-asset-reviews/${candidate.review_request_id}`);
                      }
                    }}
                  >
                    <Table.Td><MatchTypeBadge matchType={candidate.match_type} /></Table.Td>
                    <Table.Td>
                      {candidate.master_record_id ? (
                        <span className={classes.ident} title={candidate.master_record_id}>{candidate.master_record_id}</span>
                      ) : (
                        <span className={classes.newRecord}>{t('mdm:candidates.new')}</span>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <span className={classes.ident} title={candidate.source_record_id}>{candidate.source_record_id}</span>
                    </Table.Td>
                    <Table.Td>
                      <span className={classes.confidence} data-tone={confidenceTone(candidate.confidence_score)}>
                        {(candidate.confidence_score * 100).toFixed(1)}%
                      </span>
                    </Table.Td>
                    <Table.Td>
                      {fields.length > 0 ? (
                        <div className={classes.fields}>
                          {fields.slice(0, 3).map((field, idx) => (
                            <Badge key={idx} variant="outline">{field}</Badge>
                          ))}
                          {fields.length > 3 && <Badge variant="outline">+{fields.length - 3}</Badge>}
                        </div>
                      ) : (
                        <span className={classes.muted}>-</span>
                      )}
                    </Table.Td>
                    <Table.Td><StatusBadge status={candidate.status} /></Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </div>
      ) : (
        <div className={classes.empty}>
          <p>{t('mdm:candidates.noCandidatesFound')}</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      <PageLayout
        header={
          <div className={classes.headerBlock}>
            <PageHeader
              title={t('mdm:title')}
              actions={
                <Button ref={newButton} onClick={() => setIsConfigDialogOpen(true)}>
                  <Plus />
                  {t('mdm:newConfiguration')}
                </Button>
              }
            />
            <p className={classes.subtitle}>{t('mdm:subtitle')}</p>
          </div>
        }
      >
        <PaneStack sizes={[1, 2]}>
          <Pane title={t('mdm:configurations')} flush>
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
                    fetchConfigs();
                  }}
                >
                  {t('common:retry')}
                </Button>
              </div>
            )}
            {initialLoading ? (
              <ListItemSkeleton count={4} className={classes.skeleton} />
            ) : (
              <SelectableList
                aria-label={t('mdm:configurations')}
                items={items}
                selectedId={selectedConfig?.id ?? null}
                onSelect={(id) => {
                  const config = configs.find((c) => c.id === id);
                  if (config) handleSelectConfig(config);
                }}
                emptyMessage={
                  loadError ? null : (
                    <div className={classes.emptyList}>
                      <p>{t('mdm:noConfigurations')}</p>
                      <p>{t('mdm:emptyState.createOne')}</p>
                    </div>
                  )
                }
              />
            )}
          </Pane>

          <Pane
            title={selectedConfig ? selectedConfig.name : t('mdm:configDetails.title')}
            titleTooltip
            actions={
              selectedConfig && (
                <>
                  <Button
                    onClick={() => handleStartMatching(selectedConfig.id)}
                    disabled={selectedConfig.status !== MdmConfigStatus.ACTIVE}
                  >
                    <Play />
                    {t('mdm:configDetails.startMatching')}
                  </Button>
                  <Button ref={linkSourceButton} variant="outline" onClick={() => setIsLinkDialogOpen(true)}>
                    <Link2 />
                    {t('mdm:buttons.linkSource')}
                  </Button>
                </>
              )
            }
          >
            {selectedConfig ? (
              <>
                <p className={classes.description}>
                  {selectedConfig.description || t('mdm:overview.masterContractFor', { entityType: selectedConfig.entity_type })}
                </p>
                <Tabs value={activeTab} onChange={(next) => next && setActiveTab(next)}>
                  <Tabs.List>
                    <Tabs.Tab value="overview">{t('mdm:tabs.overview')}</Tabs.Tab>
                    <Tabs.Tab value="sources">
                      {t('mdm:tabs.sources')} ({sourceLinks.length})
                    </Tabs.Tab>
                    <Tabs.Tab value="rules">{t('mdm:tabs.matchingRules')}</Tabs.Tab>
                    <Tabs.Tab value="runs">
                      {t('mdm:tabs.matchRuns')} ({matchRuns.length})
                    </Tabs.Tab>
                    {selectedRun && (
                      <Tabs.Tab value="candidates">
                        {t('mdm:tabs.candidates')} ({candidates.length})
                      </Tabs.Tab>
                    )}
                  </Tabs.List>
                  <Tabs.Panel value="overview">{renderOverview(selectedConfig)}</Tabs.Panel>
                  <Tabs.Panel value="sources">{renderSources()}</Tabs.Panel>
                  <Tabs.Panel value="rules">{renderRules(selectedConfig)}</Tabs.Panel>
                  <Tabs.Panel value="runs">{renderRuns(selectedConfig)}</Tabs.Panel>
                  {selectedRun && <Tabs.Panel value="candidates">{renderCandidates(selectedRun)}</Tabs.Panel>}
                </Tabs>
              </>
            ) : (
              <div className={classes.hint}>
                <GitCompare aria-hidden />
                <p className={classes.hintTitle}>{t('mdm:emptyState.selectTitle')}</p>
                <p>{t('mdm:emptyState.selectDescription')}</p>
                <Button onClick={() => setIsConfigDialogOpen(true)}>
                  <Plus />
                  {t('mdm:emptyState.createNew')}
                </Button>
              </div>
            )}
          </Pane>
        </PaneStack>
      </PageLayout>

      {/* Dialogs (Task 8's, consumed as they are) */}
      <MdmConfigDialog
        isOpen={isConfigDialogOpen}
        onClose={() => setIsConfigDialogOpen(false)}
        onSuccess={() => {
          fetchConfigs();
          setIsConfigDialogOpen(false);
        }}
      />

      {selectedConfig && (
        <LinkSourceDialog
          isOpen={isLinkDialogOpen}
          configId={selectedConfig.id}
          masterContractId={selectedConfig.master_contract_id}
          onClose={() => setIsLinkDialogOpen(false)}
          onSuccess={() => {
            fetchSourceLinks(selectedConfig.id);
            fetchConfigs();
            setIsLinkDialogOpen(false);
          }}
        />
      )}

      {selectedRun && (
        <CreateReviewDialog
          isOpen={isReviewDialogOpen}
          runId={selectedRun.id}
          candidateCount={selectedRun.pending_review_count}
          onClose={() => setIsReviewDialogOpen(false)}
          onSuccess={(reviewId) => {
            setIsReviewDialogOpen(false);
            navigate(`/data-asset-reviews/${reviewId}`);
          }}
        />
      )}

      {selectedConfig && (
        <MatchingRulesEditor
          isOpen={isRulesEditorOpen}
          onClose={() => setIsRulesEditorOpen(false)}
          onSuccess={() => {
            fetchConfigs();
            // Refresh selectedConfig with new rules (only the one still chosen, and only a real answer)
            const id = selectedConfig.id;
            get<MdmConfig>(`/api/mdm/configs/${id}`).then((response) => {
              if (!response.error && response.data && (response.data as MdmConfig).id === id && selectedId.current === id) {
                setSelectedConfig(response.data);
              }
            });
          }}
          config={selectedConfig}
        />
      )}

      {/* Delete a configuration */}
      <Dialog
        opened={deleteConfigOpen}
        onClose={closeDeleteConfig}
        size="sm"
        role="alertdialog"
        returnFocusTo={afterDeleteConfig}
        title={t('mdm:configDetails.deleteConfig')}
        description={
          <>
            {t('mdm:confirm.deleteConfig')} <strong className={classes.confirmName}>{deleteConfigTarget?.name}</strong>
          </>
        }
        footer={
          <>
            <Button variant="outline" onClick={closeDeleteConfig} disabled={deletingConfig}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfig} disabled={deletingConfig}>
              {deletingConfig && <Loader size={12} color="currentColor" />}
              {t('common:actions.delete')}
            </Button>
          </>
        }
      />

      {/* Remove a source link */}
      <Dialog
        opened={removeSourceOpen}
        onClose={closeRemoveSource}
        size="sm"
        role="alertdialog"
        returnFocusTo={afterRemoveSource}
        title={t('mdm:sourcesTab.removeSource')}
        description={
          <>
            {t('mdm:confirm.deleteSource')} <strong className={classes.confirmName}>{removeSourceTarget?.name}</strong>
          </>
        }
        footer={
          <>
            <Button variant="outline" onClick={closeRemoveSource} disabled={removingSource}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRemoveSource} disabled={removingSource}>
              {removingSource && <Loader size={12} color="currentColor" />}
              {t('common:actions.remove')}
            </Button>
          </>
        }
      />
    </>
  );
}

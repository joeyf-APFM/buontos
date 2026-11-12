import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Wand2, Loader2, Copy, Download, Save, XCircle, Clock, CheckCircle2, AlertCircle, History, ChevronDown, Trash2 } from 'lucide-react';
import {
  Alert,
  Combobox,
  Loader,
  Popover,
  Select,
  Switch,
  Table,
  TextInput,
  Textarea,
  UnstyledButton,
  type SelectProps,
} from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, PageHeader, PageLayout, Pane, PaneStack, Tabs } from '@/mantine/page';
import { FIELD_CLASSES, SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import { useHoverFocusCard } from '@/components/common/use-hover-focus-card';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { useKnowledgeGraphStore } from '@/stores/knowledge-graph-store';
import { usePermissions, usePermissionsReady } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import type { Connection } from '@/types/connections';
import SchemaBrowser from '@/components/schema-importer/schema-browser';
import classes from './ontology-generator.module.css';

// -- Types --

interface AgentStep {
  step_type: string;
  content: string;
  tool_name: string;
  duration_ms: number;
}

interface GenerateResponse {
  success: boolean;
  owl_content: string;
  classes: { uri: string; name: string; label: string; comment: string; emoji: string; parent: string; dataProperties: { name: string; label: string; uri: string }[] }[];
  properties: { uri: string; name: string; label: string; comment: string; type: string; domain: string; range: string }[];
  ontology_info: { uri: string; label: string; comment: string; namespace: string };
  constraints: Record<string, unknown>[];
  axioms: Record<string, unknown>[];
  steps: AgentStep[];
  iterations: number;
  error: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  tables_resolved?: number;
  tables_used?: number;
  caps_hit?: boolean;
  caps_note?: string;
}

interface RunParams {
  connection_id?: string;
  connection_name?: string;
  path_count: number;
  guidelines: string;
  base_uri: string;
  options: Record<string, unknown>;
}

interface RunSummary {
  run_id: string;
  status: string;
  progress_message?: string;
  error?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  params: RunParams;
  step_count: number;
}

interface RunDetail extends Omit<RunSummary, 'step_count'> {
  steps: AgentStep[];
  result?: GenerateResponse;
}

const POLL_INTERVAL_MS = 2000;

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_CONFIG: Record<string, { icon: typeof Loader2; variant: BadgeVariant; label: string }> = {
  pending: { icon: Clock, variant: 'outline', label: 'Pending' },
  running: { icon: Loader2, variant: 'default', label: 'Running' },
  completed: { icon: CheckCircle2, variant: 'secondary', label: 'Completed' },
  failed: { icon: AlertCircle, variant: 'destructive', label: 'Failed' },
  cancelled: { icon: XCircle, variant: 'outline', label: 'Cancelled' },
};

const list = <T,>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);

/** A result with its lists guarded: the API may leave one out. */
function guardResult(result: GenerateResponse): GenerateResponse {
  return {
    ...result,
    classes: list(result.classes).map((c) => ({ ...c, dataProperties: list(c.dataProperties) })),
    properties: list(result.properties),
    steps: list(result.steps),
  };
}

const stepVariant = (type: string): BadgeVariant =>
  type === 'tool_call' ? 'default' : type === 'tool_result' ? 'secondary' : 'outline';

function StatusIcon({ status }: { status: string }) {
  const Icon = (STATUS_CONFIG[status] || STATUS_CONFIG.pending).icon;
  return <Icon aria-hidden className={classes.statusIcon} data-status={STATUS_CONFIG[status] ? status : 'pending'} />;
}

const formatTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDateTime = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' });

/**
 * One recent run: a button that loads a completed run's result, its Delete,
 * and the run's card, which opens on hover and on keyboard focus.
 */
function RunRow({
  run,
  selected,
  onLoad,
  onDelete,
  canWrite,
  t,
}: {
  run: RunSummary;
  selected: boolean;
  onLoad: () => void;
  onDelete: (e: React.MouseEvent) => void;
  /** Delete needs ontology write (the backend lists only the user's own runs, or all for an admin) */
  canWrite: boolean;
  t: TFunction;
}) {
  const card = useHoverFocusCard({ openDelay: 300, closeDelay: 100 });
  const name = run.params?.connection_name || t('semantic-models:ontologyGenerator.direct');
  return (
    <li className={classes.runItem} data-selected={selected || undefined}>
      <Popover
        opened={card.opened}
        onClose={card.close}
        position="right-start"
        withinPortal
        shadow="md"
        width={288}
        returnFocus={false}
        withRoles={false}
      >
        <Popover.Target>
          <UnstyledButton
            className={classes.runButton}
            aria-current={selected || undefined}
            onClick={() => {
              if (run.status === 'completed') onLoad();
            }}
            {...card.target}
          >
            <StatusIcon status={run.status} />
            <span className={classes.runName} title={name}>{name}</span>
            <span className={classes.runTime}>{formatTime(run.created_at)}</span>
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown className={classes.card} {...card.dropdown}>
          <div className={classes.cardHead}>
            <span className={classes.cardTitle}>{run.params?.connection_name || t('semantic-models:ontologyGenerator.directGeneration')}</span>
            <Badge variant={STATUS_CONFIG[run.status]?.variant || 'outline'}>
              {t(`semantic-models:ontologyGenerator.runStatus.${run.status}`, run.status)}
            </Badge>
          </div>
          <dl className={classes.cardFacts}>
            <dt>{t('semantic-models:ontologyGenerator.paths')}</dt>
            <dd className={classes.mono}>{run.params?.path_count}</dd>
            <dt>{t('semantic-models:ontologyGenerator.steps')}</dt>
            <dd className={classes.mono}>{run.step_count}</dd>
            <dt>{t('semantic-models:ontologyGenerator.started')}</dt>
            <dd>{run.created_at ? formatDateTime(run.created_at) : '—'}</dd>
            {run.completed_at && (
              <>
                <dt>{t('semantic-models:ontologyGenerator.finished')}</dt>
                <dd>{formatDateTime(run.completed_at)}</dd>
              </>
            )}
          </dl>
          {run.params?.guidelines && (
            <div className={classes.cardSection}>
              <span className={classes.cardLabel}>{t('semantic-models:ontologyGenerator.guidelines')}:</span>
              <p className={classes.clamp}>{run.params.guidelines}</p>
            </div>
          )}
          {run.error && (
            <div className={classes.cardSection}>
              <p className={`${classes.clamp} ${classes.critical}`}>{run.error}</p>
            </div>
          )}
        </Popover.Dropdown>
      </Popover>
      {canWrite && run.status !== 'running' && run.status !== 'pending' && (
        <UnstyledButton
          className={classes.deleteRun}
          onClick={onDelete}
          aria-label={t('semantic-models:ontologyGenerator.deleteRun')}
          title={t('semantic-models:ontologyGenerator.deleteRun')}
        >
          <Trash2 aria-hidden />
        </UnstyledButton>
      )}
    </li>
  );
}

export default function OntologyGeneratorView() {
  const { t } = useTranslation(['semantic-models', 'common']);
  const { get: apiGet, post, delete: apiDelete } = useApi();
  const { toast } = useToast();
  const setStaticSegments = useBreadcrumbStore((s) => s.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((s) => s.setDynamicTitle);
  const bumpKnowledgeGraphRefresh = useKnowledgeGraphStore((s) => s.bumpRefreshNonce);
  const runsListId = useId();

  // The writes (Generate, Cancel, Delete run, Save to scheme) need ontology
  // write, as the backend checks; they show once the permissions are known.
  // The reads (connections, resources, runs and results) stay for everyone.
  const { hasPermission } = usePermissions();
  const permissionsReady = usePermissionsReady();
  const canWrite = permissionsReady && hasPermission('ontology', FeatureAccessLevel.READ_WRITE);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [connectionsError, setConnectionsError] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Generation options. Guidelines can be pre-filled from ?guidelines= when the
  // user arrives via the Define > Generate guided dialog (which composes a prompt
  // from a few questions), so they land on the generator with the prompt ready.
  const [searchParams] = useSearchParams();
  const [guidelines, setGuidelines] = useState(() => searchParams.get('guidelines') || '');
  const [baseUri, setBaseUri] = useState('http://ontos.example.org/ontology#');
  const [includeDataProperties, setIncludeDataProperties] = useState(true);
  const [includeRelationships, setIncludeRelationships] = useState(true);
  const [includeInheritance, setIncludeInheritance] = useState(true);

  // Async run state
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsError, setRunsError] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([]);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedRunIdRef = useRef<string | null>(null);

  // Save to collection
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [collectionDescription, setCollectionDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Recent runs panel visibility
  const [showRecentRuns, setShowRecentRuns] = useState(false);

  useEffect(() => {
    // Generator is reached from Define, so anchor the trail there:
    // Concepts > Define > Ontology Generator.
    setStaticSegments([
      { label: 'Concepts', path: '/concepts/browser' },
      { label: 'Define', path: '/concepts/define' },
    ]);
    setDynamicTitle('Ontology Generator');
    return () => {
      setStaticSegments([]);
      setDynamicTitle(null);
    };
  }, [setStaticSegments, setDynamicTitle, t]);

  // -- Connections --

  // A failed load says so, with Retry; a load that a newer one overtook drops its answer
  const connectionsLoadId = useRef(0);
  const fetchConnections = useCallback(async () => {
    const id = ++connectionsLoadId.current;
    setIsLoadingConnections(true);
    try {
      const resp = await apiGet<Connection[]>('/api/connections');
      if (id !== connectionsLoadId.current) return;
      if (resp.error) throw new Error(resp.error);
      const enabled = list(resp.data).filter((c) => c.enabled);
      setConnections(enabled);
      setConnectionsError(false);
      if (enabled.length === 1) setSelectedConnectionId(enabled[0].id);
    } catch (err) {
      if (id !== connectionsLoadId.current) return;
      console.error('Failed to fetch connections:', err);
      setConnectionsError(true);
    } finally {
      if (id === connectionsLoadId.current) setIsLoadingConnections(false);
    }
  }, [apiGet]);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  // -- Runs list fetch --

  const runsLoadId = useRef(0);
  const fetchRuns = useCallback(async () => {
    const id = ++runsLoadId.current;
    try {
      const resp = await apiGet<{ runs: RunSummary[] }>('/api/ontology/runs?limit=20');
      if (id !== runsLoadId.current) return;
      if (resp.error) throw new Error(resp.error);
      if (resp.data?.runs) {
        const loaded = list(resp.data.runs);
        setRuns(loaded);
        // If there's a running run and we're not already polling, resume
        const running = loaded.find((r) => r.status === 'running' || r.status === 'pending');
        if (running && !activeRunId) {
          setActiveRunId(running.run_id);
          setProgressMessage(running.progress_message || null);
        }
      }
      setRunsError(false);
    } catch (err) {
      if (id !== runsLoadId.current) return;
      console.error('Failed to fetch runs:', err);
      setRunsError(true);
    }
  }, [apiGet, activeRunId]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // -- Polling for active run --

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollRun = useCallback(async (runId: string) => {
    try {
      const resp = await apiGet<RunDetail>(`/api/ontology/runs/${runId}`);
      if (!resp.data) return;

      const run = resp.data;
      setProgressMessage(run.progress_message || null);

      // Only update the detail pane if the user is viewing this run (or no run selected)
      const viewing = selectedRunIdRef.current;
      const isViewingActiveRun = !viewing || viewing === runId;

      if (isViewingActiveRun) {
        setLiveSteps(list(run.steps));
      }

      if (run.status === 'completed') {
        stopPolling();
        setActiveRunId(null);
        if (run.result && isViewingActiveRun) {
          setResult(guardResult(run.result));
          setSelectedRunId(runId);
          selectedRunIdRef.current = runId;
        }
        toast({
          title: t('semantic-models:ontologyGenerator.toasts.generatedTitle'),
          description: run.result
            ? t('semantic-models:ontologyGenerator.toasts.generatedDescription', {
                classes: list(run.result.classes).length,
                properties: list(run.result.properties).length,
              })
            : t('semantic-models:ontologyGenerator.toasts.generatedFallback'),
        });
        fetchRuns();
      } else if (run.status === 'failed' || run.status === 'cancelled') {
        stopPolling();
        setActiveRunId(null);
        toast({
          title: run.status === 'cancelled'
            ? t('semantic-models:ontologyGenerator.toasts.cancelledTitle')
            : t('semantic-models:ontologyGenerator.toasts.failedTitle'),
          description: run.error || t('semantic-models:ontologyGenerator.toasts.unknownError'),
          variant: 'destructive',
        });
        fetchRuns();
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  }, [apiGet, stopPolling, toast, fetchRuns, t]);

  useEffect(() => {
    if (!activeRunId) return;
    pollRun(activeRunId);
    pollingRef.current = setInterval(() => pollRun(activeRunId), POLL_INTERVAL_MS);
    return stopPolling;
  }, [activeRunId, pollRun, stopPolling]);

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling]);

  // -- Generate --

  const handleConnectionChange = (id: string) => {
    setSelectedConnectionId(id);
    setSelectedPaths(new Set());
  };

  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);
  const isRunning = !!activeRunId;
  const canGenerate = selectedPaths.size > 0 && !isRunning && !isStarting;

  // Backend processes at most this many tables per run (see MAX_TABLES_IN_METADATA
  // in ontology_generator_manager.py). We surface the limit as a quiet always-on
  // caption, and only escalate to an amber skip-count warning when the user has
  // selected more than the cap in INDIVIDUAL tables (a count we can trust). We do
  // NOT try to guess a container's table count client-side: selecting a schema or
  // catalog resolves to an unknown number of tables server-side, so any pre-run
  // "this expands into many tables" guess is just as likely to cry wolf on a small
  // schema (e.g. a 3-table schema) as to catch a real overflow. The accurate
  // post-run banner (result.caps_note) reports the REAL resolved count instead.
  // A path with 3+ dot-segments (catalog.schema.table) is an individual table.
  const MAX_TABLES_PER_RUN = 50;
  const selectedTableCount = (() => {
    let n = 0;
    for (const path of selectedPaths) {
      if (path.split('.').length >= 3) n += 1;
    }
    return n;
  })();
  // Only an honest, countable overflow triggers the amber warning.
  const capWarning =
    selectedTableCount > MAX_TABLES_PER_RUN
      ? `${selectedTableCount} tables selected. This generator processes up to ${MAX_TABLES_PER_RUN} per run, so ${selectedTableCount - MAX_TABLES_PER_RUN} will be skipped. Narrow your selection or split it into multiple runs.`
      : null;

  const handleGenerate = async () => {
    if (!selectedConnectionId || selectedPaths.size === 0) return;

    setIsStarting(true);
    setResult(null);
    setLiveSteps([]);
    setSelectedRunId(null);
    selectedRunIdRef.current = null;

    try {
      const response = await post<{ run_id: string; status: string }>('/api/ontology/generate-from-connection', {
        connection_id: selectedConnectionId,
        selected_paths: Array.from(selectedPaths),
        guidelines,
        base_uri: baseUri,
        include_data_properties: includeDataProperties,
        include_relationships: includeRelationships,
        include_inheritance: includeInheritance,
      });

      if (response.error) {
        toast({ title: t('semantic-models:ontologyGenerator.toasts.startFailed'), description: response.error, variant: 'destructive' });
        return;
      }

      if (response.data?.run_id) {
        setActiveRunId(response.data.run_id);
        setProgressMessage(t('semantic-models:ontologyGenerator.progress.starting'));
        toast({ title: t('semantic-models:ontologyGenerator.toasts.startedTitle'), description: t('semantic-models:ontologyGenerator.toasts.startedDescription') });
      }
    } catch (err) {
      toast({ title: t('common:toast.error'), description: String(err), variant: 'destructive' });
    } finally {
      setIsStarting(false);
    }
  };

  // -- Cancel --

  const handleCancel = async () => {
    if (!activeRunId) return;
    try {
      await apiDelete(`/api/ontology/runs/${activeRunId}`);
      stopPolling();
      setActiveRunId(null);
      setProgressMessage(null);
      fetchRuns();
    } catch (err) {
      toast({ title: t('semantic-models:ontologyGenerator.toasts.cancelFailed'), description: String(err), variant: 'destructive' });
    }
  };

  // -- Load past run result --

  const loadRunResult = async (runId: string) => {
    try {
      const resp = await apiGet<RunDetail>(`/api/ontology/runs/${runId}`);
      if (resp.data?.result) {
        setResult(guardResult(resp.data.result));
        setSelectedRunId(runId);
        selectedRunIdRef.current = runId;
        setLiveSteps(list(resp.data.steps));
      } else {
        toast({ title: t('semantic-models:ontologyGenerator.toasts.noResultTitle'), description: t('semantic-models:ontologyGenerator.toasts.noResultDescription'), variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: t('common:toast.error'), description: String(err), variant: 'destructive' });
    }
  };

  const deleteRun = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiDelete(`/api/ontology/runs/${runId}`);
      if (selectedRunId === runId) {
        setResult(null);
        setSelectedRunId(null);
        selectedRunIdRef.current = null;
        setLiveSteps([]);
      }
      fetchRuns();
    } catch (err) {
      toast({ title: t('semantic-models:ontologyGenerator.toasts.deleteFailed'), description: String(err), variant: 'destructive' });
    }
  };

  // -- Turtle helpers --

  const copyTurtle = () => {
    if (result?.owl_content) {
      navigator.clipboard.writeText(result.owl_content);
      toast({ title: t('common:copied'), description: t('semantic-models:ontologyGenerator.toasts.turtleCopied') });
    }
  };

  const downloadTurtle = () => {
    if (result?.owl_content) {
      const blob = new Blob([result.owl_content], { type: 'text/turtle' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ontology.ttl';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // -- Save to collection --

  const handleSaveToCollection = async () => {
    if (!result?.owl_content || !collectionName.trim()) return;

    setIsSaving(true);
    try {
      const response = await post<{
        success: boolean;
        collection_iri: string;
        triples_imported: number;
        error: string;
      }>('/api/ontology/save-to-collection', {
        owl_content: result.owl_content,
        collection_name: collectionName.trim(),
        collection_description: collectionDescription.trim(),
      });

      if (response.error) {
        toast({ title: t('semantic-models:ontologyGenerator.toasts.saveFailed'), description: response.error, variant: 'destructive' });
        return;
      }

      if (response.data?.success) {
        toast({
          title: t('semantic-models:ontologyGenerator.toasts.savedTitle'),
          description: t('semantic-models:ontologyGenerator.toasts.savedDescription', {
            count: response.data.triples_imported,
            name: collectionName,
          }),
        });
        setIsSaveDialogOpen(false);
        setCollectionName('');
        setCollectionDescription('');
        bumpKnowledgeGraphRefresh('ontology-save');
      } else {
        toast({ title: t('semantic-models:ontologyGenerator.toasts.saveFailed'), description: response.data?.error || t('semantic-models:ontologyGenerator.toasts.unknownError'), variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: t('common:toast.error'), description: String(err), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // -- Render --

  const connectionOptions = uniqueOptions(connections.map((c) => ({ value: c.id, label: c.name, type: c.connector_type })));
  // An option's name and its connector type, as the Radix items showed them
  const renderConnection: SelectProps['renderOption'] = ({ option }) => (
    <span className={form.optionLine}>
      <span>{option.label}</span>
      <Badge variant="outline">{(option as (typeof connectionOptions)[number]).type}</Badge>
    </span>
  );
  const chosenConnection = connectionOptions.find((o) => o.value === selectedConnectionId);

  const resourcesTitle = selectedConnection
    ? t('semantic-models:ontologyGenerator.resourcesWithName', { name: selectedConnection.name })
    : t('semantic-models:ontologyGenerator.resources');

  const retryLabel = t('common:retry');

  return (
    <PageLayout
      header={
        <>
          <PageHeader title={t('semantic-models:ontologyGenerator.title')} />
          <p className={classes.subtitle}>{t('semantic-models:ontologyGenerator.subtitle')}</p>
        </>
      }
    >
      <div className={classes.columns}>
        {/* Settings: the connection, the options, the run and the recent runs */}
        <div className={classes.column}>
          <PaneStack>
            <Pane title={t('common:labels.connection')}>
              <p className={classes.hint}>{t('semantic-models:ontologyGenerator.connectionDescription')}</p>
              {isLoadingConnections ? (
                <div className={form.loading}>
                  <Loader size={14} />
                  {t('common:states.loading')}
                </div>
              ) : connectionsError ? (
                <div className={classes.state}>
                  <Alert color="red" variant="light" icon={<AlertCircle />} className={classes.alert}>
                    {t('semantic-models:ontologyGenerator.connectionsFailed', 'Could not load the connections.')}
                  </Alert>
                  <Button variant="outline" size="sm" onClick={fetchConnections}>{retryLabel}</Button>
                </div>
              ) : connections.length === 0 ? (
                <p className={classes.muted}>{t('semantic-models:ontologyGenerator.noConnections')}</p>
              ) : (
                <Select
                  aria-label={t('common:labels.connection')}
                  placeholder={t('semantic-models:ontologyGenerator.chooseConnection')}
                  data={connectionOptions}
                  value={selectedConnectionId}
                  onChange={(value) => value && handleConnectionChange(value)}
                  allowDeselect={false}
                  renderOption={renderConnection}
                  // The chosen connection's type stays in the field, as the Radix SelectValue repeated the item
                  {...(chosenConnection ? {
                    rightSection: (
                      <span className={form.fieldBadge}>
                        <Badge variant="outline">{chosenConnection.type}</Badge>
                        <Combobox.Chevron />
                      </span>
                    ),
                    rightSectionWidth: 'auto' as const,
                    rightSectionPointerEvents: 'none' as const,
                  } : {})}
                  classNames={SELECT_CLASSES}
                />
              )}
            </Pane>

            <Pane title={t('semantic-models:ontologyGenerator.generationOptions')}>
              <div className={form.form}>
                <p className={classes.hint}>{t('semantic-models:ontologyGenerator.generationOptionsDescription')}</p>
                <Textarea
                  label={t('semantic-models:ontologyGenerator.guidelines')}
                  placeholder={t('semantic-models:ontologyGenerator.guidelinesPlaceholder')}
                  value={guidelines}
                  onChange={(e) => setGuidelines(e.currentTarget.value)}
                  rows={3}
                  classNames={FIELD_CLASSES}
                />
                <TextInput
                  label={t('semantic-models:ontologyGenerator.baseUri')}
                  value={baseUri}
                  onChange={(e) => setBaseUri(e.currentTarget.value)}
                  classNames={{ ...FIELD_CLASSES, input: classes.monoInput }}
                />
                <div className={classes.switches}>
                  {([
                    ['incDataProps', 'dataProperties', includeDataProperties, setIncludeDataProperties],
                    ['incRels', 'relationships', includeRelationships, setIncludeRelationships],
                    ['incInherit', 'inheritance', includeInheritance, setIncludeInheritance],
                  ] as const).map(([id, key, checked, set]) => (
                    <div key={id} className={classes.switchRow}>
                      <label htmlFor={id} className={classes.switchLabel}>{t(`semantic-models:ontologyGenerator.${key}`)}</label>
                      <Switch id={id} checked={checked} onChange={(e) => set(e.currentTarget.checked)} />
                    </div>
                  ))}
                </div>
              </div>
            </Pane>

            {/* Generate / Cancel */}
            {(canWrite || isRunning) && (
            <Pane aria-label={t('semantic-models:ontologyGenerator.runPane', 'Run')}>
              {isRunning ? (
                <div className={classes.run}>
                  <div className={classes.progress}>
                    <Loader size={14} />
                    <span className={classes.progressText} title={progressMessage || undefined}>
                      {progressMessage || t('semantic-models:ontologyGenerator.progress.working')}
                    </span>
                  </div>
                  {canWrite && (
                    <Button variant="destructive" onClick={handleCancel} className={classes.fullWidth}>
                      <XCircle aria-hidden /> {t('semantic-models:ontologyGenerator.cancelGeneration')}
                    </Button>
                  )}
                </div>
              ) : (
                <div className={classes.run}>
                  {capWarning && (
                    <Alert color="yellow" variant="light" icon={<AlertCircle />} className={classes.alert}>
                      {capWarning}
                    </Alert>
                  )}
                  <Button onClick={handleGenerate} disabled={!canGenerate} className={classes.fullWidth}>
                    {isStarting ? (
                      <><Loader size={12} color="currentColor" /> Starting...</>
                    ) : (
                      <><Wand2 aria-hidden /> Generate Ontology ({selectedPaths.size} selected)</>
                    )}
                  </Button>
                  <p className={classes.caption}>
                    Processes up to {MAX_TABLES_PER_RUN} tables per run. For large schemas, split your selection into multiple runs.
                  </p>
                </div>
              )}
            </Pane>
            )}

            {/* Recent Runs: the head toggles the list */}
            <Pane aria-label={t('semantic-models:ontologyGenerator.recentRuns')} flush>
              <UnstyledButton
                className={classes.runsToggle}
                aria-expanded={showRecentRuns}
                aria-controls={showRecentRuns ? runsListId : undefined}
                onClick={() => setShowRecentRuns(!showRecentRuns)}
              >
                <History aria-hidden />
                <span className={classes.runsTitle}>{t('semantic-models:ontologyGenerator.recentRuns')}</span>
                {runs.length > 0 && <Badge variant="secondary">{runs.length}</Badge>}
                <ChevronDown aria-hidden className={classes.chevron} data-open={showRecentRuns || undefined} />
              </UnstyledButton>
              {showRecentRuns && (
                <div id={runsListId} className={classes.runs}>
                  {runsError ? (
                    <div className={classes.state}>
                      <Alert color="red" variant="light" icon={<AlertCircle />} className={classes.alert}>
                        {t('semantic-models:ontologyGenerator.runsFailed', 'Could not load the recent runs.')}
                      </Alert>
                      <Button variant="outline" size="sm" onClick={fetchRuns}>{retryLabel}</Button>
                    </div>
                  ) : runs.length === 0 ? (
                    <p className={classes.noRuns}>{t('semantic-models:ontologyGenerator.noRuns')}</p>
                  ) : (
                    <ul className={classes.runList}>
                      {runs.map((run) => (
                        <RunRow
                          key={run.run_id}
                          run={run}
                          selected={selectedRunId === run.run_id}
                          onLoad={() => loadRunResult(run.run_id)}
                          onDelete={(e) => deleteRun(run.run_id, e)}
                          canWrite={canWrite}
                          t={t}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Pane>
          </PaneStack>
        </div>

        {/* The resources, the live progress and the result */}
        <div className={classes.column}>
          <PaneStack>
            <Pane
              title={resourcesTitle}
              titleTooltip
              actions={selectedPaths.size > 0 && (
                <Badge variant="secondary">{t('semantic-models:ontologyGenerator.selectedCount', { count: selectedPaths.size })}</Badge>
              )}
            >
              <p className={classes.hint}>{t('semantic-models:ontologyGenerator.resourcesDescription')}</p>
              <SchemaBrowser connectionId={selectedConnectionId} selectedPaths={selectedPaths} onSelectionChange={setSelectedPaths} />
            </Pane>

            {/* Live progress while running */}
            {isRunning && liveSteps.length > 0 && (
              <Pane title={t('semantic-models:ontologyGenerator.agentProgress')} actions={<Loader size={14} />}>
                <ul className={classes.liveSteps}>
                  {liveSteps.map((step, i) => (
                    <li key={i} className={classes.liveStep}>
                      <Badge variant={stepVariant(step.step_type)}>{step.step_type}</Badge>
                      {step.tool_name && <span className={classes.toolName}>{step.tool_name}</span>}
                      <span className={classes.liveContent}>{step.content.slice(0, 80)}</span>
                    </li>
                  ))}
                </ul>
              </Pane>
            )}

            {result && (
              <Pane aria-label={t('semantic-models:ontologyGenerator.results', 'Results')}>
                <div className={classes.results}>
                  {canWrite && result.success && (result.classes.length > 0 || result.properties.length > 0) && (
                    <div className={classes.banner}>
                      <p>
                        Generated <span className={classes.strong}>{result.classes.length}</span> classes and{' '}
                        <span className={classes.strong}>{result.properties.length}</span> properties. Save them to a concept scheme to keep and use them.
                      </p>
                      <Button size="sm" onClick={() => setIsSaveDialogOpen(true)}>
                        <Save aria-hidden /> Save to scheme
                      </Button>
                    </div>
                  )}
                  <Tabs defaultValue="classes">
                    <Tabs.List>
                      <Tabs.Tab value="classes">{t('semantic-models:ontologyGenerator.tabs.classes', { count: result.classes.length })}</Tabs.Tab>
                      <Tabs.Tab value="properties">{t('semantic-models:ontologyGenerator.tabs.properties', { count: result.properties.length })}</Tabs.Tab>
                      <Tabs.Tab value="turtle">{t('semantic-models:ontologyGenerator.tabs.turtle')}</Tabs.Tab>
                      <Tabs.Tab value="agent">{t('semantic-models:ontologyGenerator.tabs.agentLog')}</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="classes">
                      <div className={classes.scroll} tabIndex={0} data-testid="generator-classes-scroll">
                        <Table className={classes.table}>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>{t('semantic-models:ontologyGenerator.table.class')}</Table.Th>
                              <Table.Th>{t('semantic-models:ontologyGenerator.table.parent')}</Table.Th>
                              <Table.Th>{t('semantic-models:ontologyGenerator.table.attributes')}</Table.Th>
                              <Table.Th>{t('common:labels.description')}</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {result.classes.map((cls) => (
                              <Table.Tr key={cls.uri}>
                                <Table.Td className={classes.identifier}>
                                  <span className={classes.wrap}>
                                    {cls.emoji && <span className={classes.emoji}>{cls.emoji}</span>}
                                    {cls.name}
                                  </span>
                                </Table.Td>
                                <Table.Td className={`${classes.identifier} ${classes.secondary}`}>
                                  <span className={classes.wrap}>{cls.parent || '—'}</span>
                                </Table.Td>
                                <Table.Td className={classes.attributes}>
                                  <div className={classes.badges}>
                                    {cls.dataProperties.map((dp) => (
                                      <Badge key={dp.name} variant="secondary" className={classes.monoBadge}>{dp.name}</Badge>
                                    ))}
                                    {cls.dataProperties.length === 0 && <span className={classes.secondary}>{t('semantic-models:ontologyGenerator.table.none')}</span>}
                                  </div>
                                </Table.Td>
                                <Table.Td className={classes.secondary}>
                                  <span className={`${classes.truncate} ${classes.description}`} title={cls.comment || undefined}>{cls.comment || '—'}</span>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                            {result.classes.length === 0 && (
                              <Table.Tr>
                                <Table.Td colSpan={4} className={classes.empty}>{t('semantic-models:ontologyGenerator.noClasses')}</Table.Td>
                              </Table.Tr>
                            )}
                          </Table.Tbody>
                        </Table>
                      </div>
                    </Tabs.Panel>

                    <Tabs.Panel value="properties">
                      <div className={classes.scroll} tabIndex={0} data-testid="generator-properties-scroll">
                        <Table className={classes.table}>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>{t('semantic-models:ontologyGenerator.table.property')}</Table.Th>
                              <Table.Th>{t('common:labels.type')}</Table.Th>
                              <Table.Th>{t('common:labels.domain')}</Table.Th>
                              <Table.Th>{t('semantic-models:ontologyGenerator.table.range')}</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {result.properties.map((prop) => (
                              <Table.Tr key={prop.uri}>
                                <Table.Td className={classes.identifier}><span className={classes.wrap}>{prop.name}</span></Table.Td>
                                <Table.Td>
                                  <Badge variant={prop.type === 'ObjectProperty' ? 'default' : 'secondary'}>
                                    {prop.type === 'ObjectProperty' ? t('semantic-models:ontologyGenerator.table.objectType') : t('semantic-models:ontologyGenerator.table.dataType')}
                                  </Badge>
                                </Table.Td>
                                <Table.Td className={classes.identifier}><span className={classes.wrap}>{prop.domain || '—'}</span></Table.Td>
                                <Table.Td className={classes.identifier}><span className={classes.wrap}>{prop.range || '—'}</span></Table.Td>
                              </Table.Tr>
                            ))}
                            {result.properties.length === 0 && (
                              <Table.Tr>
                                <Table.Td colSpan={4} className={classes.empty}>{t('semantic-models:ontologyGenerator.noProperties')}</Table.Td>
                              </Table.Tr>
                            )}
                          </Table.Tbody>
                        </Table>
                      </div>
                    </Tabs.Panel>

                    <Tabs.Panel value="turtle">
                      <div className={classes.panelHead}>
                        <h3 className={classes.panelTitle}>{t('semantic-models:ontologyGenerator.generatedTurtle')}</h3>
                        <div className={classes.panelActions}>
                          <Button variant="outline" size="sm" onClick={copyTurtle}><Copy aria-hidden /> Copy</Button>
                          <Button variant="outline" size="sm" onClick={downloadTurtle}><Download aria-hidden /> Download</Button>
                        </div>
                      </div>
                      <div className={classes.scroll} tabIndex={0}>
                        <pre className={classes.turtle}>{result.owl_content || t('semantic-models:ontologyGenerator.empty')}</pre>
                      </div>
                    </Tabs.Panel>

                    <Tabs.Panel value="agent">
                      <div className={classes.panelHead}>
                        <div>
                          <h3 className={classes.panelTitle}>{t('semantic-models:ontologyGenerator.agentExecutionLog')}</h3>
                          <p className={classes.hint}>
                            {t('semantic-models:ontologyGenerator.agentLogSummary', {
                              iterations: result.iterations,
                              promptTokens: result.usage?.prompt_tokens ?? 0,
                              completionTokens: result.usage?.completion_tokens ?? 0,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className={classes.scroll} tabIndex={0}>
                        <ul className={classes.steps}>
                          {result.steps.map((step, i) => (
                            <li key={i} className={classes.step}>
                              <div className={classes.stepHead}>
                                <Badge variant={stepVariant(step.step_type)}>{step.step_type}</Badge>
                                {step.tool_name && <span className={classes.toolName}>{step.tool_name}</span>}
                                {step.duration_ms > 0 && <span className={classes.duration}>{step.duration_ms}ms</span>}
                              </div>
                              <pre className={classes.stepContent}>{step.content}</pre>
                            </li>
                          ))}
                        </ul>
                        {result.steps.length === 0 && (
                          <p className={classes.empty}>{t('semantic-models:ontologyGenerator.noAgentSteps')}</p>
                        )}
                      </div>
                    </Tabs.Panel>
                  </Tabs>

                  {result.caps_hit && result.caps_note && (
                    <Alert color="yellow" variant="light" icon={<AlertCircle />} title="Capacity Limit" className={classes.alert}>
                      {result.caps_note}
                    </Alert>
                  )}

                  {!result.success && result.error && (
                    <Alert color="red" variant="light" icon={<AlertCircle />} className={classes.alert}>
                      {result.error}
                    </Alert>
                  )}
                </div>
              </Pane>
            )}
          </PaneStack>
        </div>
      </div>

      {/* Save to scheme dialog */}
      <Dialog
        opened={isSaveDialogOpen}
        onClose={() => setIsSaveDialogOpen(false)}
        size="md"
        title="Save to concept scheme"
        description="Create a new ontology-type concept scheme and import the generated triples into the knowledge graph. Generated items are saved as Draft for review."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)} disabled={isSaving}>{t('common:actions.cancel')}</Button>
            <Button onClick={handleSaveToCollection} disabled={isSaving || !collectionName.trim()}>
              {isSaving
                ? <><Loader size={12} color="currentColor" /> {t('common:actions.saving')}</>
                : <><Save aria-hidden /> {t('common:actions.save')}</>}
            </Button>
          </>
        }
      >
        <div className={form.form}>
          <TextInput
            label="Scheme name"
            placeholder="e.g., Customer Domain Ontology"
            value={collectionName}
            onChange={(e) => setCollectionName(e.currentTarget.value)}
            classNames={FIELD_CLASSES}
            data-autofocus
          />
          <Textarea
            label="Description (optional)"
            placeholder="Describe the purpose of this concept scheme..."
            value={collectionDescription}
            onChange={(e) => setCollectionDescription(e.currentTarget.value)}
            rows={3}
            classNames={FIELD_CLASSES}
          />
          {result && (
            <p className={form.muted}>
              {t('semantic-models:ontologyGenerator.saveDialog.importSummary', {
                classes: result.classes.length,
                properties: result.properties.length,
              })}
            </p>
          )}
        </div>
      </Dialog>
    </PageLayout>
  );
}

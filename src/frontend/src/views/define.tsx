import { Fragment, useState, useEffect, useCallback, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  PencilLine,
  Sparkles,
  Upload,
  Zap,
  ArrowUpFromLine,
  List,
  ListTree,
  Share2,
  Layers,
} from 'lucide-react';
import { usePagination, PaginationControls } from '@/components/common/paginated-list';
import { Alert, Loader, Tooltip } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader, PageLayout, Pane, PaneStack } from '@/mantine/page';
import { ImportConceptsDialog, CollectionEditorDialog } from '@/components/knowledge';
import type {
  KnowledgeCollection,
  KnowledgeCollectionCreate,
  KnowledgeCollectionUpdate,
} from '@/types/ontology';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions, usePermissionsReady } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import { GuidedGenerateDialog } from '@/components/concepts/guided-generate-dialog';
import classes from './define.module.css';

// Tooltips open on hover and on keyboard focus
const TOOLTIP_EVENTS = { hover: true, focus: true, touch: false };

// A recent creation-work item shown in the "In progress" list. Sourced from the
// ontology generator runs endpoint (real data). Imports do not yet have a
// dedicated feed, so this list is generator-runs only for now.
interface GenerationRunSummary {
  run_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress_message?: string | null;
  created_at?: string | null;
  step_count?: number;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Compact relative time ("just now", "3 min ago", "2 h ago", "5 d ago"),
// falling back to an absolute date for anything older than a week. Small local
// helper — the shared RelativeDate component is date-only and localized
// differently; these in-progress rows want minute/hour granularity.
function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(iso);
}

// The three output "rungs" — a glossary -> taxonomy -> ontology maturity ladder.
// Defined once, rendered both in the top legend and (via BuildsRow) inside every
// path card, so the same icon vocabulary is taught once and reused everywhere.
// `vocab` is the "what gets written" note behind each rung's info
// icon. Mirrors the backend's _resolve_concept_rdf_types / create_concept.
const RUNGS = [
  {
    key: 'glossary',
    label: 'Glossary',
    Icon: List,
    blurb: 'agreed terms + definitions',
    vocab: 'SKOS. skos:Concept with skos:prefLabel / skos:altLabel / skos:definition; flat (no hierarchy required).',
  },
  {
    key: 'taxonomy',
    label: 'Taxonomy',
    Icon: ListTree,
    blurb: 'terms in a broader/narrower hierarchy',
    vocab: 'SKOS. skos:Concept arranged with skos:broader / skos:narrower (skos:related for cross-links).',
  },
  {
    key: 'ontology',
    label: 'Ontology',
    Icon: Share2,
    blurb: 'typed relationships a machine can reason over',
    vocab:
      'OWL + RDFS. owl:Class with rdfs:subClassOf, owl:ObjectProperty / owl:DatatypeProperty with rdfs:domain / rdfs:range, owl:NamedIndividual. Labels/definitions still use SKOS.',
  },
] as const;

type RungKey = (typeof RUNGS)[number]['key'];
// Per-path production: 'yes' = this path builds that rung, 'file' = depends on the
// uploaded file (Import), undefined = not produced by this path.
type BuildsMap = Partial<Record<RungKey, 'yes' | 'file'>>;

// The reused "Builds:" row inside each path card. Lights the rungs this path
// produces; dims the rest. Same three icons, same order, in every card — so the
// user reads them as the shared vocabulary from the legend above.
function BuildsRow({ builds, note }: { builds: BuildsMap; note?: string }) {
  return (
    <div className={classes.builds}>
      <div className={classes.buildsLabel}>Builds</div>
      <div className={classes.buildsRungs}>
        {RUNGS.map((r) => {
          const state = builds[r.key];
          const active = state === 'yes';
          const fileDep = state === 'file';
          return (
            <Tooltip
              key={r.key}
              multiline
              w={220}
              events={TOOLTIP_EVENTS}
              label={
                <>
                  <span className={classes.strong}>{r.label}</span> — {r.blurb}.{' '}
                  {active
                    ? 'This path builds it.'
                    : fileDep
                    ? 'Produced if the uploaded file contains it.'
                    : 'Not produced by this path.'}
                </>
              }
            >
              <span className={classes.rung} data-state={active ? 'yes' : fileDep ? 'file' : 'no'}>
                <r.Icon aria-hidden />
                <span>{r.label}</span>
                {fileDep && <span className={classes.fileMark}>*</span>}
              </span>
            </Tooltip>
          );
        })}
      </div>
      {note && <p className={classes.buildsNote}>{note}</p>}
    </div>
  );
}

/**
 * The ring-and-"i" mark whose tooltip explains the thing beside it: an image
 * with a short name; the tooltip, which opens on hover and on focus, is its
 * description while it shows (Mantine's Tooltip sets aria-describedby).
 */
function InfoMark({ tip, label, width = 240, testId }: { tip: ReactNode; label: string; width?: number; testId?: string }) {
  return (
    <Tooltip label={tip} multiline w={width} events={TOOLTIP_EVENTS}>
      <span role="img" className={classes.info} tabIndex={0} aria-label={label} data-testid={testId}>
        i
      </span>
    </Tooltip>
  );
}

/** One creation path: its icon, title and tip, what it does, its button and what it builds. */
function PathCard({
  icon,
  title,
  tip,
  description,
  action,
  builds,
}: {
  icon: ReactNode;
  title: string;
  tip: string;
  description: string;
  action: ReactNode;
  builds: ReactNode;
}) {
  const { t } = useTranslation('semantic-models');
  const titleId = useId();
  const aboutLabel = t('semantic-models:define.about', { defaultValue: 'About {{name}}', name: title });
  return (
    <div role="group" aria-labelledby={titleId} className={classes.card}>
      <div className={classes.cardIcon}>{icon}</div>
      <div className={classes.cardTitleLine}>
        <h3 id={titleId} className={classes.cardTitle}>{title}</h3>
        <InfoMark tip={tip} label={aboutLabel} />
      </div>
      <p className={classes.cardDescription}>{description}</p>
      <div className={classes.cardFoot}>
        {action}
        {builds}
      </div>
    </div>
  );
}

// The dialogs the side menu opens through ?open= (Build → Concepts → Define)
type OpenParam = 'author' | 'generate' | 'import';

/**
 * One card's dialog: open from its button, or from ?open=<name> when allowed.
 * Closing it also drops that param. The setter is stable while the URL is.
 */
function useUrlDialog(name: OpenParam, openParam: string | null, canOpenFromUrl: boolean, clearOpenParam: () => void) {
  const [own, setOwn] = useState(false);
  const fromUrl = openParam === name;
  const setOpen = useCallback(
    (open: boolean) => {
      setOwn(open);
      if (!open && fromUrl) clearOpenParam();
    },
    [fromUrl, clearOpenParam],
  );
  return [own || (fromUrl && canOpenFromUrl), setOpen] as const;
}

export default function DefineView() {
  const { t } = useTranslation(['semantic-models', 'common']);
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  // On a fresh load the store starts empty and not loading: wait for its answer
  const permissionsLoading = !usePermissionsReady();

  // Read-only users still see the three paths, but the actions are disabled.
  const canWrite = hasPermission('semantic-models', FeatureAccessLevel.READ_WRITE);
  const requiresWriteTitle = canWrite
    ? undefined
    : t('semantic-models:define.requiresWrite', 'Requires write access');
  // Generate leads to the generator's run, which needs ontology write (the
  // backend's check); Author and Import write schemes (semantic-models)
  const canGenerate = hasPermission('ontology', FeatureAccessLevel.READ_WRITE);

  const { toast } = useToast();

  // The side menu's Author Concepts, Generate Ontology and Import RDF link
  // here with ?open=author|generate|import: each opens its card's dialog, for
  // the users whose card button is enabled. The param goes (replace) when the
  // dialog closes, so the menu highlights the item while it's open, and once
  // it is closed neither a reload nor back reopens it. Any other value does
  // nothing.
  const [searchParams, setSearchParams] = useSearchParams();
  const openParam = searchParams.get('open');
  const wants = (name: OpenParam) => openParam === name;
  const wantsDialog = wants('author') || wants('generate') || wants('import');
  const canOpenFromUrl = !permissionsLoading && canWrite;
  const canOpenGenerateFromUrl = !permissionsLoading && canGenerate;
  // The dialog ?open= names, if any, and whether this user may open it
  const allowedFromUrl = wants('generate') ? canGenerate : canWrite;
  const clearOpenParam = useCallback(
    () =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      }, { replace: true }),
    [setSearchParams],
  );
  const [authorOpen, setAuthorOpen] = useUrlDialog('author', openParam, canOpenFromUrl, clearOpenParam);
  const [guidedOpen, setGuidedOpen] = useUrlDialog('generate', openParam, canOpenGenerateFromUrl, clearOpenParam);
  const [importOpen, setImportOpen] = useUrlDialog('import', openParam, canOpenFromUrl, clearOpenParam);
  // Without write access, the param is dropped and nothing opens
  useEffect(() => {
    if (wantsDialog && !permissionsLoading && !allowedFromUrl) clearOpenParam();
  }, [wantsDialog, permissionsLoading, allowedFromUrl, clearOpenParam]);
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [runs, setRuns] = useState<GenerationRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState(false);

  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);

  useEffect(() => {
    setStaticSegments([
      { label: t('semantic-models:title', 'Concepts'), path: '/concepts' },
      { label: t('semantic-models:tabs.define', 'Define'), path: '/concepts/define' },
    ]);
  }, [setStaticSegments, t]);

  // Collections feed the Import dialog's target-scheme selector.
  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge/collections?hierarchical=true');
      if (res.ok) {
        const data = await res.json();
        setCollections(Array.isArray(data?.collections) ? data.collections : []);
      }
    } catch (err) {
      console.error('Failed to fetch collections:', err);
    }
  }, []);

  // In-progress list: recent generator runs (real endpoint). A failed load
  // says so, with Retry; a reload that a newer one overtook drops its answer.
  const runsLoadId = useRef(0);
  const fetchRuns = useCallback(async () => {
    const id = ++runsLoadId.current;
    setRunsLoading(true);
    try {
      const res = await fetch('/api/ontology/runs?limit=10');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (id !== runsLoadId.current) return;
      setRuns(Array.isArray(data?.runs) ? data.runs : []);
      setRunsError(false);
    } catch (err) {
      if (id !== runsLoadId.current) return;
      console.error('Failed to fetch generation runs:', err);
      setRunsError(true);
    } finally {
      if (id === runsLoadId.current) setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
    fetchRuns();
  }, [fetchCollections, fetchRuns]);

  // Author flow: create a new concept scheme (collection) in place, then land
  // the user in Explore scoped to it so they can add concepts within it.
  const handleCreateScheme = useCallback(
    async (data: KnowledgeCollectionCreate | KnowledgeCollectionUpdate, _isNew: boolean) => {
      const res = await fetch('/api/knowledge/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = err?.detail || 'Failed to create concept scheme';
        // Say so; the editor stays open (it catches the throw)
        toast({ title: t('common:toast.error', 'Error'), description: message, variant: 'destructive' });
        throw new Error(message);
      }
      const created = await res.json();
      toast({
        title: t('common:toast.success', 'Success'),
        description: t('semantic-models:messages.collectionCreated', 'Concept scheme created'),
      });
      setAuthorOpen(false);
      await fetchCollections();
      // Scope Explore to the new scheme (source filter) so the user starts
      // adding concepts within it.
      const iri = created?.iri;
      navigate(iri ? `/concepts/browser?source=${encodeURIComponent(iri)}` : '/concepts/browser');
    },
    // setAuthorOpen also drops a menu's ?open=author (replace), so back from Explore doesn't reopen it
    [fetchCollections, navigate, setAuthorOpen, t, toast],
  );

  // Creation work still open: not-yet-kept generator runs.
  const inProgress = runs.filter(
    (r) => r.status === 'pending' || r.status === 'running' || r.status === 'completed'
  );

  // Paginate the in-progress list (5 per page) so a long run history doesn't
  // push the whole landing page down.
  const {
    pageItems: inProgressPage,
    page: inProgressPageNum,
    setPage: setInProgressPage,
    pageCount: inProgressPageCount,
    pageSize: inProgressPageSize,
    setPageSize: setInProgressPageSize,
  } = usePagination(inProgress, 10);

  const statusBadge = (status: GenerationRunSummary['status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary">{t('semantic-models:define.needsReview', 'Needs review')}</Badge>;
      case 'running':
      case 'pending':
        return <Badge variant="outline">{t('semantic-models:define.running', 'Running')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const requiresWrite = { disabled: !canWrite, title: requiresWriteTitle };
  const requiresGenerate = {
    disabled: !canGenerate,
    title: canGenerate ? undefined : t('semantic-models:define.requiresWrite', 'Requires write access'),
  };

  return (
    <PageLayout
      header={
        <>
          <PageHeader title={t('semantic-models:tabs.define', 'Define')} />
          <p className={classes.subtitle}>
            {t('concepts:define.description', 'Author, generate, or import your business concept schemes.')}
          </p>
        </>
      }
    >
      <PaneStack>
        {/* Slim education legend: the three output rungs, each with a reused
            icon + one-line "what it is". The SAME three icons reappear inside
            every path card below (the "Builds" row), lit for what that path
            produces. Glossary -> taxonomy -> ontology is a maturity
            progression: start simple, harden where needed. */}
        <Pane title="What you can build">
          <div className={classes.rungs}>
            {RUNGS.map((r, i) => (
              <Fragment key={r.key}>
                {/* Progression separator between rungs: decoupled from the
                    rung info icon, never after the last rung, and hidden
                    when the columns stack. */}
                {i > 0 && (
                  <span className={classes.separator} aria-hidden data-testid="rung-separator">
                    →
                  </span>
                )}
                <div className={classes.legendRung}>
                  <r.Icon aria-hidden className={classes.legendIcon} />
                  <div className={classes.legendText}>
                    <div className={classes.legendTitle}>
                      <span className={classes.strong}>{r.label}</span>
                      {/* The RDF vocabulary this rung is written in (shown in both modes). */}
                      <InfoMark
                        width={280}
                        label={`${r.label} vocabulary`}
                        testId={`rung-vocab-${r.key}`}
                        tip={
                          <>
                            <span className={classes.vocab}>{r.vocab}</span>
                            <span className={classes.vocabNote}>Every scheme is a skos:ConceptScheme.</span>
                          </>
                        }
                      />
                    </div>
                    <div className={classes.blurb} title={r.blurb}>
                      {r.blurb}
                    </div>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </Pane>

        {/* Path cards */}
        <Pane title={t('semantic-models:define.startWith', 'Start with…')}>
          <div className={classes.cards}>
            <PathCard
              icon={<PencilLine aria-hidden />}
              title={t('semantic-models:define.author.title', 'Author')}
              tip={t(
                'semantic-models:define.author.tip',
                'Creates skos:Concept entries in a new concept scheme (skos:ConceptScheme). Entries can later be typed as owl:Class or an OWL property as the scheme matures.'
              )}
              description={t('semantic-models:define.author.desc', 'Write terms yourself.')}
              action={
                <Button className={classes.cta} {...requiresWrite} onClick={() => setAuthorOpen(true)}>
                  {t('semantic-models:define.author.cta', 'New Concept Scheme')}
                </Button>
              }
              builds={
                <BuildsRow
                  builds={{ glossary: 'yes', taxonomy: 'yes', ontology: 'yes' }}
                  note="Start as a glossary, harden over time."
                />
              }
            />
            <PathCard
              icon={<Sparkles aria-hidden />}
              title={t('semantic-models:define.generate.title', 'Generate')}
              tip={t(
                'semantic-models:define.generate.tip',
                'A guided interview drafts an OWL ontology from your tables: classes (owl:Class, hierarchy via rdfs:subClassOf) and properties (owl:ObjectProperty / owl:DatatypeProperty). Every candidate carries its source and is saved as Draft for review.'
              )}
              description={t('semantic-models:define.generate.desc', 'Answer a few questions; Ontos drafts the scheme.')}
              action={
                <Button className={classes.cta} {...requiresGenerate} onClick={() => setGuidedOpen(true)}>
                  {t('semantic-models:define.generate.cta', 'Start guided build')}
                </Button>
              }
              builds={<BuildsRow builds={{ ontology: 'yes' }} note="Saved as Draft for review." />}
            />
            <PathCard
              icon={<ArrowUpFromLine aria-hidden />}
              title={t('semantic-models:define.import.title', 'Import')}
              tip={t(
                'semantic-models:define.import.tip',
                'Parses .ttl / .rdf / .owl / .n3 / .jsonld. Several files can merge into one scheme or land one scheme per file. The source graph is preserved for round-trip export.'
              )}
              description={t('semantic-models:define.import.desc', 'Upload RDF files into a scheme.')}
              action={
                <Button className={classes.cta} variant="outline" {...requiresWrite} onClick={() => setImportOpen(true)}>
                  <Upload aria-hidden />
                  {t('semantic-models:define.import.cta', 'Upload files')}
                </Button>
              }
              builds={
                <BuildsRow
                  builds={{ glossary: 'file', taxonomy: 'file', ontology: 'file' }}
                  note="* Whatever the file contains. Imported terms stay read-only."
                />
              }
            />
          </div>
        </Pane>

        {/* In progress */}
        <Pane title={t('semantic-models:define.inProgress', 'In progress')}>
          {runsLoading ? (
            <div className={classes.loading}>
              <Loader size={14} />
              {t('common:status.loading', 'Loading…')}
            </div>
          ) : runsError ? (
            <div className={classes.state}>
              <Alert color="red" variant="light" icon={<AlertCircle />} className={classes.alert}>
                {t('semantic-models:define.runsFailed', 'Could not load the creation work in progress.')}
              </Alert>
              <Button variant="outline" onClick={fetchRuns}>{t('common:retry')}</Button>
            </div>
          ) : inProgress.length === 0 ? (
            <p className={classes.empty}>
              {t('semantic-models:define.noInProgress', 'No creation work in progress. Start with one of the paths above.')}
            </p>
          ) : (
            <>
              <ul className={classes.runs}>
                {inProgressPage.map((run) => {
                  const message =
                    run.progress_message ||
                    t('semantic-models:define.draftPending', 'Draft not yet assigned to a concept scheme.');
                  return (
                    // Thin, single-line row: icon · name+status · message ·
                    // metadata (time, steps), then the Review action. The
                    // message truncates (its title has it in full) so the
                    // metadata never wraps to a new row.
                    <li key={run.run_id} className={classes.run}>
                      <span className={classes.runIcon}>
                        <Zap aria-hidden />
                      </span>
                      <span className={classes.runName}>
                        {t('semantic-models:define.generatorRun', 'Generator run')}
                      </span>
                      {statusBadge(run.status)}
                      <span className={classes.runMessage} title={message}>
                        {message}
                      </span>
                      <span className={classes.runMeta}>
                        {run.created_at && (
                          <span title={new Date(run.created_at).toLocaleString()}>{relativeTime(run.created_at)}</span>
                        )}
                        {typeof run.step_count === 'number' && run.step_count > 0 && (
                          <span className={classes.steps}>
                            <Layers aria-hidden />
                            {t('semantic-models:define.stepCount', '{{count}} steps', {
                              count: run.step_count,
                            })}
                          </span>
                        )}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/concepts/generator?run=${encodeURIComponent(run.run_id)}`)}
                      >
                        {t('semantic-models:define.review', 'Review')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <PaginationControls
                page={inProgressPageNum}
                pageCount={inProgressPageCount}
                onPageChange={setInProgressPage}
                pageSize={inProgressPageSize}
                onPageSizeChange={setInProgressPageSize}
              />
            </>
          )}
        </Pane>
      </PaneStack>

      {/* Author: create a new concept scheme in place (reuses the collection
          editor; a collection IS a concept scheme in the domain model). */}
      <CollectionEditorDialog
        open={authorOpen}
        onOpenChange={setAuthorOpen}
        collection={null}
        collections={collections}
        onSave={handleCreateScheme}
      />

      {/* Generate: guided prompt-builder that feeds the existing generator. */}
      <GuidedGenerateDialog open={guidedOpen} onOpenChange={setGuidedOpen} />

      {/* Import dialog */}
      <ImportConceptsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        collections={collections}
        onImported={() => {
          fetchCollections();
        }}
      />
    </PageLayout>
  );
}

import { useState, useEffect, useCallback, useId, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import i18n from 'i18next';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Menu } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { PageHeader, PageLayout, Pane, PaneStack, Tabs } from '@/mantine/page';
import { useMenuItemFocus } from '@/mantine/use-menu-item-focus';
import { useConceptMode } from '@/components/concepts/mode-switch';
import KGSearch from '@/components/search/kg-search';
import { collectionSourceKey, stripSourcePrefix } from '@/lib/collection-source-key';
import { SPARQL_UI_ENABLED } from '@/config/features';

import {
  FolderTree,
  Plus,
  ChevronDown,
  List,
  Network,
  Globe2,
  Code2,
  X,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  FilterBarSkeleton,
  HierarchyTreeSkeleton,
} from '@/components/common/list-view-skeleton';
import type { OntologyConcept, KnowledgeCollection, CollectionType } from '@/types/ontology';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { useGlossaryPreferencesStore } from '@/stores/glossary-preferences-store';
import { useKnowledgeGraphStore } from '@/stores/knowledge-graph-store';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import { useToast } from '@/hooks/use-toast';
import { useExploreConcepts, useExploreSessionStore } from '@/hooks/use-explore-concepts';
import {
  ConceptsTab,
  GraphTab,
  CollectionEditorDialog,
  ConceptEditorDialog,
  GlossaryFilterPanel,
} from '@/components/knowledge';
import { schemeKindsForType } from '@/components/knowledge/concept-editor-dialog';
import classes from './explore.module.css';

// ---------------------------------------------------------------------------
// Explore — the ONE unified browse surface for concepts.
//
// A single fetch (via useExploreConcepts) feeds three render engines as
// interchangeable view-modes over the SAME filtered selection:
//   - List / Tree -> ConceptsTab (unchanged engine)
//   - Graph        -> GraphTab (unchanged cytoscape engine)
//
// Filters + Group-by (GlossaryFilterPanel) drive all modes. SPARQL search and
// the instance/estate hierarchy are intentionally NOT view-modes here; they
// live on their own routes (see app.tsx / concepts-layout.tsx).
// ---------------------------------------------------------------------------

type ViewMode = 'list' | 'tree' | 'graph';

const VIEW_MODES: { id: ViewMode; labelKey: string; defaultLabel: string; icon: LucideIcon }[] = [
  { id: 'list', labelKey: 'concepts:explore.viewList', defaultLabel: 'List', icon: List },
  { id: 'tree', labelKey: 'concepts:explore.viewTree', defaultLabel: 'Tree', icon: Network },
  { id: 'graph', labelKey: 'concepts:explore.viewGraph', defaultLabel: 'Graph', icon: Globe2 },
];

// Concept types the Create menu can preset, in menu order per scheme type.
// Property creation is parked pending a property design; existing properties
// can still be edited, and schemeKindsForType('property') is unchanged.
type CreatableConceptType = 'term' | 'concept' | 'class';

const CREATE_ITEMS: Record<CreatableConceptType, { labelKey: string; defaultLabel: string }> = {
  term: { labelKey: 'concepts:explore.createTerm', defaultLabel: 'New Term' },
  concept: { labelKey: 'concepts:explore.createConcept', defaultLabel: 'New Concept' },
  class: { labelKey: 'concepts:explore.createClass', defaultLabel: 'New Class' },
};

// Generic set (no single scheme in focus), in display order.
const GENERIC_CREATE_TYPES: CreatableConceptType[] = ['term', 'concept', 'class'];

/**
 * Create-menu concept types for the scheme in focus: the types whose scheme
 * kinds (schemeKindsForType) include the focused scheme's kind. With no single
 * scheme in focus, the full generic set (the editor explains when no editable
 * scheme fits a type and offers to create one).
 */
export function createMenuTypes(focused: KnowledgeCollection | undefined): CreatableConceptType[] {
  const kind = focused?.collection_type;
  if (!kind) return GENERIC_CREATE_TYPES;
  const byScheme = GENERIC_CREATE_TYPES.filter((ct) => schemeKindsForType(ct).includes(kind));
  return byScheme.length > 0 ? byScheme : GENERIC_CREATE_TYPES;
}

// Editable schemes in the (nested) scheme tree, depth-first.
function flattenEditable(colls: KnowledgeCollection[]): KnowledgeCollection[] {
  const result: KnowledgeCollection[] = [];
  const visit = (c: KnowledgeCollection) => {
    if (c.is_editable) result.push(c);
    c.child_collections?.forEach(visit);
  };
  colls.forEach(visit);
  return result;
}

function parseViewMode(value: string | null): ViewMode {
  if (value === 'tree' || value === 'graph') return value;
  return 'list';
}

export default function ExploreView() {
  const { t } = useTranslation(['semantic-models', 'common', 'concepts']);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const bumpKnowledgeGraphRefresh = useKnowledgeGraphStore((s) => s.bumpRefreshNonce);

  // The backend's checks: semantic-models READ_WRITE creates, edits, moves
  // concepts through their lifecycle, and renames or deletes schemes;
  // certifying needs ADMIN (semantic_models_routes.py)
  const canWrite = hasPermission('semantic-models', FeatureAccessLevel.READ_WRITE);
  const canCertify = hasPermission('semantic-models', FeatureAccessLevel.ADMIN);
  const viewsId = useId();
  // The Create menu's items open editors, which keep focus (R51)
  const createMenu = useMenuItemFocus();

  // SPARQL / knowledge-graph search panel: Advanced view only, session-only
  // open state (not persisted, not in the URL).
  const [conceptMode] = useConceptMode();
  const advanced = conceptMode === 'advanced';
  const [sparqlOpen, setSparqlOpen] = useState(false);

  // Single source of concept data — fetch + filteredConcepts live here.
  const {
    isLoading,
    loadError,
    collections,
    groupedConcepts,
    availableSources,
    sourceConceptCounts,
    filteredConcepts,
    relationshipConcepts,
    refetch,
  } = useExploreConcepts();

  // Session-only "Show system ontologies" toggle (default OFF). The hook reads
  // the same store and refetches with include_system=true when it is on.
  // The toggle is a power-user filter: only offered in Advanced (L) mode, and
  // the hook ignores the stored flag in Simple mode.
  const showSystemSources = useExploreSessionStore((s) => s.showSystemSources);
  const setShowSystemSources = useExploreSessionStore((s) => s.setShowSystemSources);

  // No concepts at all (before the user's source filters; system ontologies
  // hidden by default), i.e. no user content yet. Filters that merely hide
  // everything keep ConceptsTab's own "No concepts found" instead.
  const workspaceEmpty = useMemo(
    () => Object.values(groupedConcepts).every((group) => group.length === 0),
    [groupedConcepts],
  );

  // View-mode: List | Tree | Graph. Kept in the URL (?view=) so links are
  // shareable and refresh-safe; defaults to List.
  const viewMode = parseViewMode(searchParams.get('view'));
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (mode === 'list') next.delete('view');
          else next.set('view', mode);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // hiddenRoots stays LOCAL to Graph mode (user decision). List/Tree ignore it
  // and it is never lifted into the shared store.
  const [hiddenRoots, setHiddenRoots] = useState<Set<string>>(new Set());

  // Dialog state
  const [collectionEditorOpen, setCollectionEditorOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<KnowledgeCollection | null>(null);
  // Scheme kind preset for a new scheme (from the editor's "no fitting scheme" notice).
  const [createSchemeType, setCreateSchemeType] = useState<CollectionType | undefined>(undefined);
  const [conceptEditorOpen, setConceptEditorOpen] = useState(false);
  const [editingConcept, setEditingConcept] = useState<OntologyConcept | null>(null);
  // Create-menu preset: the concept type and target scheme for a new concept.
  const [createConceptType, setCreateConceptType] = useState<CreatableConceptType | undefined>(undefined);
  const [createCollection, setCreateCollection] = useState<KnowledgeCollection | undefined>(undefined);

  // Language selection - defaults to UI language
  const [selectedLanguage, setSelectedLanguage] = useState<string>(i18n.language?.split('-')[0] || 'en');

  const {
    hiddenSources,
    groupByDimension,
    groupBySource,
    groupByFile,
    showProperties,
    groupByDomain,
    isFilterExpanded,
    toggleSource,
    setHiddenSources,
    selectAllSources,
    selectNoneSources,
    setGroupByDimension,
    setShowProperties,
    setFilterExpanded,
  } = useGlossaryPreferencesStore();

  // Backwards-compat: the old single-page view tracked the selected concept
  // via ?concept=IRI. New layout uses /concepts/browser/:iri, so any old
  // deep link gets redirected once at mount.
  useEffect(() => {
    const conceptIri = searchParams.get('concept');
    if (!conceptIri) return;
    const decoded = (() => {
      try { return decodeURIComponent(conceptIri); } catch { return conceptIri; }
    })();
    navigate(`/concepts/browser/${encodeURIComponent(decoded)}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Breadcrumbs
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);
  useEffect(() => {
    setStaticSegments([
      { label: t('semantic-models:title', 'Concepts'), path: '/concepts' },
      { label: t('semantic-models:tabs.explore', 'Explore'), path: '/concepts/browser' },
    ]);
    return () => { setStaticSegments([]); };
  }, [setStaticSegments, t]);

  // Handle ?source= URL parameter for filtering (from home breakdown / Author).
  // Normalize the incoming param by stripping known URN prefixes (it may be a
  // full IRI) before comparing against availableSources (already stripped).
  //
  // Apply the filter in ONE idempotent set (hide every source except the target)
  // and then consume the ?source= param, so this runs once per deep-link. It must
  // NOT depend on or react to hiddenSources: an earlier version toggled sources
  // one-by-one and depended on hiddenSources, so each toggle re-fired the effect
  // — an infinite loop that froze the page. If the target isn't found, leave the
  // filter as-is (no blank page) but still consume the param.
  useEffect(() => {
    const sourceParam = searchParams.get('source');
    if (!sourceParam || availableSources.length === 0) return;

    const normalizedTarget = stripSourcePrefix(sourceParam);
    if (availableSources.includes(normalizedTarget)) {
      // Show only the target: hide everything else, in a single set.
      setHiddenSources(availableSources.filter((s) => s !== normalizedTarget));
    }
    // Consume the param either way so the effect can't re-fire on it.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('source');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, availableSources]);

  // Concept selection (List/Tree row click) — navigate to dedicated detail page.
  const handleSelectConcept = useCallback((concept: OntologyConcept) => {
    navigate(`/concepts/browser/${encodeURIComponent(concept.iri)}`);
  }, [navigate]);

  // Graph node click — same destination as a list row (unified detail page).
  const handleNodeClick = useCallback((concept: OntologyConcept) => {
    navigate(`/concepts/browser/${encodeURIComponent(concept.iri)}`);
  }, [navigate]);

  // Toggle root visibility in the graph (graph-local state only).
  const handleToggleRoot = useCallback((rootIri: string) => {
    setHiddenRoots((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rootIri)) newSet.delete(rootIri);
      else newSet.add(rootIri);
      return newSet;
    });
  }, []);

  // Concept CRUD handlers (creation flow only; edit/delete live on detail page).
  const handleCreateConcept = (conceptType: CreatableConceptType) => {
    setEditingConcept(null);
    setCreateConceptType(conceptType);
    // Target the focused scheme when it fits the type; otherwise the first
    // editable scheme that does (the dialog shows a notice if none fits).
    const kinds = schemeKindsForType(conceptType);
    setCreateCollection(
      focusedCollection && kinds.includes(focusedCollection.collection_type)
        ? focusedCollection
        : flattenEditable(collections).find((c) => kinds.includes(c.collection_type)),
    );
    setConceptEditorOpen(true);
  };

  // "New Concept Scheme" from the concept editor's notice: swap dialogs and
  // preset the scheme kind the entry needs.
  const handleCreateSchemeFromEditor = (kind: CollectionType) => {
    setConceptEditorOpen(false);
    setEditingConcept(null);
    setEditingCollection(null);
    setCreateSchemeType(kind);
    setCollectionEditorOpen(true);
  };

  const handleSaveConcept = async (data: any, isNew: boolean) => {
    try {
      const response = await fetch('/api/knowledge/concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to save concept');
      }
      toast({
        title: t('common:toast.success'),
        description: isNew
          ? t('semantic-models:messages.conceptCreated')
          : t('semantic-models:messages.conceptUpdated'),
      });
      setConceptEditorOpen(false);
      // Bump the shared nonce ONLY (useExploreConcepts does a single quiet
      // reload) — AND defer it a tick past the dialog close. Firing the list
      // re-render in the same tick as the Radix dialog close raced its
      // focus-restore + aria-hidden/scroll-lock cleanup, which could leave
      // <#root aria-hidden> / body pointer-events:none stuck = "can't click
      // anything" until the next render. Deferring lets the dialog fully settle.
      setTimeout(() => bumpKnowledgeGraphRefresh(isNew ? 'concept-create' : 'concept-update'), 0);
    } catch (error: any) {
      toast({ title: t('common:toast.error'), description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const handleCreateCollection = () => {
    setEditingCollection(null);
    setCreateSchemeType(undefined);
    setCollectionEditorOpen(true);
  };

  const handleSaveCollection = async (data: any, isNew: boolean) => {
    try {
      const url = isNew
        ? '/api/knowledge/collections'
        : `/api/knowledge/collections/${encodeURIComponent(editingCollection!.iri)}`;
      const method = isNew ? 'POST' : 'PATCH';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to save collection');
      }
      toast({
        title: t('common:toast.success'),
        description: isNew
          ? t('semantic-models:messages.collectionCreated')
          : t('semantic-models:messages.collectionUpdated'),
      });
      setCollectionEditorOpen(false);
      // Bump the shared nonce ONLY (single quiet reload), deferred a tick past
      // the dialog close so the list re-render doesn't race the Radix dialog's
      // focus-restore + aria-hidden/scroll-lock cleanup (see handleSaveConcept).
      setTimeout(() => bumpKnowledgeGraphRefresh(isNew ? 'collection-create' : 'collection-update'), 0);
    } catch (error: any) {
      toast({ title: t('common:toast.error'), description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  // Handle rename scheme from filter panel — open the collection editor in edit mode
  const handleRenameScheme = useCallback((collection: KnowledgeCollection) => {
    setEditingCollection(collection);
    setCollectionEditorOpen(true);
  }, []);

  // Handle delete scheme from filter panel
  const handleDeleteScheme = useCallback(async (collection: KnowledgeCollection) => {
    try {
      const response = await fetch(`/api/knowledge/collections/${encodeURIComponent(collection.iri)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete collection');
      }
      toast({
        title: t('common:toast.success'),
        description: t('semantic-models:messages.collectionDeleted'),
      });
      // Bump the shared nonce ONLY (single quiet reload via the hook's subscriber).
      bumpKnowledgeGraphRefresh('collection-delete');
    } catch (error: any) {
      toast({ title: t('common:toast.error'), description: error.message, variant: 'destructive' });
    }
  }, [t, toast, bumpKnowledgeGraphRefresh]);

  const editableCollections = useMemo(() => collections.filter((c) => c.is_editable), [collections]);

  // The scheme the user is working in: the only editable scheme, or the only
  // editable scheme left visible by the source filter. Otherwise none (the
  // Create menu then offers the generic set).
  const focusedCollection = useMemo(() => {
    if (editableCollections.length === 1) return editableCollections[0];
    const visible = editableCollections.filter(
      (c) => !hiddenSources.includes(collectionSourceKey(c)),
    );
    return visible.length === 1 ? visible[0] : undefined;
  }, [editableCollections, hiddenSources]);
  const createTypes = createMenuTypes(focusedCollection);

  const conceptsPane = t('semantic-models:explore.conceptsPane', 'Concepts');
  // Without the SPARQL editor (R57) the panel is the knowledge-graph search only
  const sparqlTitle = SPARQL_UI_ENABLED
    ? t('concepts:explore.sparqlPanel', 'SPARQL and knowledge graph search')
    : t('concepts:explore.knowledgeGraphPanel', 'Knowledge graph search');

  return (
    <PageLayout
      header={
        <>
          {/* The section tab strip names "Concepts"; the Simple/Advanced
              switch lives up in the layout's row */}
          <PageHeader
            title={t('semantic-models:tabs.explore', 'Explore')}
            wrapActions
            actions={
              <>
                {advanced && (
                  <Button
                    variant={sparqlOpen ? 'secondary' : 'outline'}
                    className="adv-only"
                    aria-pressed={sparqlOpen}
                    aria-controls="explore-sparql-panel"
                    onClick={() => setSparqlOpen((open) => !open)}
                  >
                    <Code2 aria-hidden />
                    {SPARQL_UI_ENABLED
                      ? t('concepts:explore.sparql', 'SPARQL')
                      : t('concepts:explore.knowledgeGraph', 'Knowledge graph')}
                  </Button>
                )}
                {canWrite && (
                  <Menu position="bottom-end" withinPortal {...createMenu.menuProps}>
                    <Menu.Target>
                      <Button>
                        <Plus aria-hidden />
                        {t('common:actions.create')}
                        <ChevronDown aria-hidden />
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {createTypes.map((ct) => (
                        <Menu.Item key={ct} leftSection={<Plus aria-hidden />} onClick={createMenu.opensDialog(() => handleCreateConcept(ct))}>
                          {t(CREATE_ITEMS[ct].labelKey, CREATE_ITEMS[ct].defaultLabel)}
                        </Menu.Item>
                      ))}
                      <Menu.Divider />
                      <Menu.Item leftSection={<FolderTree aria-hidden />} onClick={createMenu.opensDialog(handleCreateCollection)}>
                        {t('concepts:explore.createScheme', 'New Concept Scheme')}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
              </>
            }
          />
          <p className={classes.subtitle}>
            {t('concepts:explore.description', 'Author, browse, and deliver your business concept schemes.')}
          </p>
        </>
      }
    >
      <PaneStack>
        {/* SPARQL / knowledge-graph search: full-width above the results
            (Advanced view only). Not bound to any one concept. */}
        {advanced && sparqlOpen && (
          <Pane
            title={sparqlTitle}
            className="adv-only"
            actions={
              <ActionIcon
                variant="subtle"
                size={26}
                title={t('common:actions.close', 'Close')}
                aria-label={t('common:actions.close', 'Close')}
                onClick={() => setSparqlOpen(false)}
              >
                <X aria-hidden size={14} />
              </ActionIcon>
            }
          >
            <div id="explore-sparql-panel" data-testid="explore-sparql-panel" className={`adv-only ${classes.sparql}`}>
              <KGSearch />
            </div>
          </Pane>
        )}

        {isLoading ? (
          <Pane aria-label={conceptsPane}>
            <div className={classes.loading}>
              <FilterBarSkeleton filterCount={3} />
              <HierarchyTreeSkeleton groups={4} itemsPerGroup={4} />
            </div>
          </Pane>
        ) : loadError !== null ? (
          <Pane aria-label={conceptsPane}>
            <div className={classes.state}>
              <Alert
                color="red"
                variant="light"
                icon={<AlertCircle />}
                title={t('semantic-models:explore.loadFailed', 'Could not load the concepts.')}
                className={classes.alert}
              >
                {loadError || undefined}
              </Alert>
              <Button variant="outline" onClick={() => refetch()}>{t('common:retry')}</Button>
            </div>
          </Pane>
        ) : (
          <>
            {/* Filters + Group by drive ALL view-modes */}
            <GlossaryFilterPanel
              filteredConcepts={filteredConcepts}
              sourceConceptCounts={sourceConceptCounts}
              availableSources={availableSources}
              hiddenSources={hiddenSources}
              onToggleSource={toggleSource}
              onSelectAllSources={selectAllSources}
              onSelectNoneSources={selectNoneSources}
              groupByDimension={groupByDimension}
              onSetGroupByDimension={setGroupByDimension}
              showProperties={showProperties}
              onSetShowProperties={setShowProperties}
              showSystemSources={showSystemSources}
              onSetShowSystemSources={advanced ? setShowSystemSources : undefined}
              selectedLanguage={selectedLanguage}
              onSetSelectedLanguage={setSelectedLanguage}
              isFilterExpanded={isFilterExpanded}
              onSetFilterExpanded={setFilterExpanded}
              collections={collections}
              // Renaming and deleting a scheme write (semantic-models READ_WRITE)
              onRenameScheme={canWrite ? handleRenameScheme : undefined}
              onDeleteScheme={canWrite ? handleDeleteScheme : undefined}
            />

            {workspaceEmpty ? (
              <Pane aria-label={conceptsPane}>
                <div data-testid="explore-empty-state" className={classes.empty}>
                  <h2 className={classes.emptyTitle}>
                    {t('semantic-models:explore.emptyTitle', 'Nothing to explore yet')}
                  </h2>
                  <p className={classes.emptyBody}>
                    {t('semantic-models:explore.emptyBody', 'Import files or create concepts on the Define page.')}
                  </p>
                  <Button variant="outline" onClick={() => navigate('/concepts/define')}>
                    {t('semantic-models:explore.emptyCta', 'Go to Define')}
                  </Button>
                </div>
              </Pane>
            ) : (
              <Pane flush aria-label={conceptsPane}>
                {/* View-mode switch: List | Tree | Graph, in the URL (?view=) */}
                <Tabs
                  id={viewsId}
                  value={viewMode}
                  onChange={(value) => value && setViewMode(value as ViewMode)}
                  classNames={{ tabSection: classes.tabIcon }}
                >
                  <Tabs.List aria-label={t('concepts:explore.viewLabel', 'Explore views')} className={classes.tabs}>
                    {VIEW_MODES.map((mode) => (
                      <Tabs.Tab key={mode.id} value={mode.id} leftSection={<mode.icon aria-hidden size={14} />}>
                        {t(mode.labelKey, mode.defaultLabel)}
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                </Tabs>
                {/* One panel for the active view. List and Tree share one
                    ConceptsTab (it keeps its state across them, as before);
                    Graph uses GraphTab. The same filteredConcepts feeds every
                    mode. */}
                <div
                  role="tabpanel"
                  id={`${viewsId}-panel-${viewMode}`}
                  aria-labelledby={`${viewsId}-tab-${viewMode}`}
                  className={classes.view}
                >
                  {viewMode === 'graph' ? (
                    <GraphTab
                      concepts={filteredConcepts}
                      relationships={relationshipConcepts}
                      hiddenRoots={hiddenRoots}
                      onToggleRoot={handleToggleRoot}
                      onNodeClick={handleNodeClick}
                      showRootBadges={!groupBySource && !groupByFile}
                      selectedLanguage={selectedLanguage}
                    />
                  ) : (
                    <ConceptsTab
                      collections={collections}
                      groupedConcepts={groupedConcepts}
                      filteredConcepts={filteredConcepts}
                      selectedConcept={null}
                      onSelectConcept={handleSelectConcept}
                      groupBySource={groupBySource}
                      groupByFile={groupByFile}
                      showProperties={showProperties}
                      groupByDomain={groupByDomain}
                      selectedLanguage={selectedLanguage}
                      viewMode={viewMode === 'tree' ? 'tree' : 'list'}
                      // Editing and the bulk status changes write
                      onEditConcept={
                        canWrite
                          ? (concept) => {
                              setEditingConcept(concept);
                              setConceptEditorOpen(true);
                            }
                          : undefined
                      }
                      canBulkEdit={canWrite}
                      canCertify={canCertify}
                      onConceptsChanged={refetch}
                    />
                  )}
                </div>
              </Pane>
            )}
          </>
        )}
      </PaneStack>

      {/* Collection Editor Dialog */}
      <CollectionEditorDialog
        open={collectionEditorOpen}
        onOpenChange={setCollectionEditorOpen}
        collection={editingCollection}
        collections={collections}
        onSave={handleSaveCollection}
        initialCollectionType={editingCollection ? undefined : createSchemeType}
      />

      {/* Concept Editor Dialog (edit from list or create from action bar) */}
      <ConceptEditorDialog
        open={conceptEditorOpen}
        onOpenChange={(open) => {
          setConceptEditorOpen(open);
          if (!open) setEditingConcept(null);
        }}
        concept={editingConcept}
        collection={editingConcept ? undefined : createCollection}
        collections={collections}
        initialConceptType={editingConcept ? undefined : createConceptType}
        onSave={handleSaveConcept}
        onCreateScheme={handleCreateSchemeFromEditor}
      />
    </PageLayout>
  );
}

import { useEffect, useId, useMemo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Checkbox, Menu, Popover, TextInput } from '@mantine/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import {
  Search,
  ChevronRight,
  ChevronDown,
  Layers,
  BookOpen,
  Zap,
  User,
  FolderTree,
  Pencil,
  ArrowRight,
  X,
  ListFilter,
} from 'lucide-react';
import { usePagination, PaginationControls } from '@/components/common/paginated-list';
import { badgeToneStyle } from '@/components/common/aura-status';
import type {
  OntologyConcept,
  KnowledgeCollection,
  GroupedConcepts,
} from '@/types/ontology';
import { resolveLabel } from '@/lib/ontology-utils';
import { systemRdfNamespaceDisplayLabel } from '@/lib/system-rdf-namespace-labels';
import { createSchemeLookup } from '@/lib/scheme-lookup';
import { useGlossaryPreferencesStore } from '@/stores/glossary-preferences-store';
import { statusTone, typeTone } from './concept-tones';
import classes from './concepts-tab.module.css';

interface ConceptsTabProps {
  collections: KnowledgeCollection[];
  groupedConcepts: GroupedConcepts;
  filteredConcepts: OntologyConcept[];
  selectedConcept?: OntologyConcept | null;
  onSelectConcept: (concept: OntologyConcept) => void;
  // Display options (from unified filter panel)
  groupBySource: boolean;
  showProperties: boolean;
  groupByDomain: boolean;
  // Group concepts by their originating FILE (source_file) rather than by
  // scheme (source_context). Mutually exclusive with groupBySource in practice
  // (the store's lens enforces that). Additive: when false the tree behaves
  // exactly as before.
  groupByFile?: boolean;
  selectedLanguage: string;
  // Render mode. 'tree' (default) preserves the existing hierarchical engine;
  // 'list' renders a flat, alphabetically-sorted list of concepts with no
  // broader/narrower nesting. Additive — the tree path is unchanged.
  viewMode?: 'list' | 'tree';
  // Callback to open editor for a concept; no Edit button without it (the
  // caller passes it only to a user who may write)
  onEditConcept?: (concept: OntologyConcept) => void;
  /** Bulk selection and Set status (list view): semantic-models READ_WRITE. @default false */
  canBulkEdit?: boolean;
  /** Certify in Set status: semantic-models ADMIN. @default false */
  canCertify?: boolean;
  // Called after a bulk action mutates concepts, so the parent can refetch.
  onConceptsChanged?: () => void;
}

// Bulk "Set status" targets → the real lifecycle transition endpoints. Only
// the safe, always-available forward transitions are offered here; the backend
// still enforces VALID_TRANSITIONS and returns an error for invalid ones.
// Certify needs semantic-models ADMIN on the backend; the others READ_WRITE.
const BULK_STATUS_ACTIONS: { action: string; labelKey: string; defaultLabel: string }[] = [
  { action: 'submit-review', labelKey: 'semantic-models:bulk.status.submitReview', defaultLabel: 'Submit for review' },
  { action: 'approve', labelKey: 'semantic-models:bulk.status.approve', defaultLabel: 'Approve' },
  { action: 'publish', labelKey: 'semantic-models:bulk.status.publish', defaultLabel: 'Publish' },
  { action: 'certify', labelKey: 'semantic-models:bulk.status.certify', defaultLabel: 'Certify' },
  { action: 'deprecate', labelKey: 'semantic-models:bulk.status.deprecate', defaultLabel: 'Deprecate' },
  { action: 'archive', labelKey: 'semantic-models:bulk.status.archive', defaultLabel: 'Archive' },
];

// Sentinel group key for concepts that carry no source_file when grouping by
// file (the 'source' dimension). Concepts without a file collect under one
// "No source file" group rather than vanishing.
const NO_FILE_KEY = '__no_file__';

// The type's icon, in the type's tone (concepts-tab.module.css)
const TYPE_ICONS: Record<string, typeof Layers> = {
  concept: Layers,
  class: BookOpen,
  property: Zap,
  individual: User,
  term: Layers,
};

function TypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] || Layers;
  return <Icon aria-hidden className={classes.typeIcon} data-type={type} />;
}

/** A concept's status or type, as a badge in its Aura tone. */
function ToneBadge({ tone, children }: { tone: ReturnType<typeof statusTone>; children: React.ReactNode }) {
  return (
    <Badge variant="outline" style={badgeToneStyle(tone)}>
      {children}
    </Badge>
  );
}

// Statuses that mean a concept is no longer active clutter — dim them and,
// when they name successors, offer a "Replaced by" link. Kept broad so both
// `deprecated` and any `superseded`/`retired`/`archived` values are covered.
const INACTIVE_STATUSES = new Set(['deprecated', 'superseded', 'retired', 'archived']);
function isInactiveStatus(status?: string | null): boolean {
  return !!status && INACTIVE_STATUSES.has(status);
}

// Result of matching a concept against the search box. `rank` orders list hits
// (lower = better): 0 exact / 1 prefix / 2 substring on the label in the
// selected display language, 3 anything else (other-language labels, synonyms,
// definitions, IRI). `viaLang` is set when the selected-language label did NOT
// match but another language's label did, so the UI can say "matched: nl".
export interface ConceptSearchMatch {
  rank: number;
  viaLang?: string;
}

// Shared search matcher for BOTH the list and the tree view. Language-agnostic:
// matches every entry of `labels` (all languages), the legacy `label`, synonyms
// (skos:altLabel), every entry of `comments` plus `comment`, and the IRI.
// Returns null when the concept does not match. An empty query matches all.
export function matchConceptSearch(
  concept: OntologyConcept,
  query: string,
  selectedLanguage: string,
): ConceptSearchMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { rank: 0 };

  const current = resolveLabel(concept, selectedLanguage).toLowerCase();
  if (current === q) return { rank: 0 };
  if (current.startsWith(q)) return { rank: 1 };
  if (current.includes(q)) return { rank: 2 };

  const includes = (v?: string | null) => !!v && v.toLowerCase().includes(q);

  // Another language's label. Untagged ('') labels have no language to report.
  for (const [lang, value] of Object.entries(concept.labels || {})) {
    if (includes(value)) return lang ? { rank: 3, viaLang: lang } : { rank: 3 };
  }
  if (
    includes(concept.label) ||
    (concept.synonyms || []).some(includes) ||
    includes(concept.comment) ||
    Object.values(concept.comments || {}).some(includes) ||
    includes(concept.iri)
  ) {
    return { rank: 3 };
  }
  return null;
}

// Per-concept mapping status, from POST /api/semantic-links/mapping-status.
// Whether a concept links to a physical Asset, a data Product, and/or a data
// Contract. The three are independent (a concept can link to several), so they
// do not partition — they drive the single "Mapping" summary column.
interface MappingStatus {
  asset?: boolean;
  product?: boolean;
  contract?: boolean;
}

// Reduce a MappingStatus to the one label the wireframe shows in the Mapping
// column. `undefined` status => not yet loaded (or endpoint unavailable).
function mappingLabel(
  status: MappingStatus | undefined,
  t: (k: string, d?: any) => string,
): { text: string; none: boolean } | null {
  if (!status) return null; // not loaded — caller renders a muted dash
  const product = !!status.product || !!status.contract;
  if (status.asset && product) {
    return { text: t('semantic-models:mapping.assetAndProduct', 'Asset + product'), none: false };
  }
  if (status.asset) {
    return { text: t('semantic-models:mapping.asset', 'Asset'), none: false };
  }
  if (product) {
    return { text: t('semantic-models:mapping.product', 'Product'), none: false };
  }
  return { text: t('semantic-models:mapping.none', 'Not mapped'), none: true };
}

export function ConceptsTab({
  collections,
  groupedConcepts: _groupedConcepts,
  filteredConcepts,
  selectedConcept,
  onSelectConcept,
  groupBySource,
  groupByFile = false,
  showProperties: _showProperties,
  groupByDomain,
  selectedLanguage,
  viewMode = 'tree',
  onEditConcept,
  canBulkEdit = false,
  canCertify = false,
  onConceptsChanged,
}: ConceptsTabProps) {
  const { t } = useTranslation(['semantic-models', 'common']);
  const { toast } = useToast();
  const expandedGroups = useGlossaryPreferencesStore((s) => s.expandedConceptGroups);
  const toggleConceptGroup = useGlossaryPreferencesStore((s) => s.toggleConceptGroup);
  const setExpandedConceptGroups = useGlossaryPreferencesStore((s) => s.setExpandedConceptGroups);
  const conceptListScrollTop = useGlossaryPreferencesStore((s) => s.conceptListScrollTop);
  const setConceptListScrollTop = useGlossaryPreferencesStore((s) => s.setConceptListScrollTop);
  const searchQuery = useGlossaryPreferencesStore((s) => s.conceptListSearch);
  const setSearchQuery = useGlossaryPreferencesStore((s) => s.setConceptListSearch);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const statusGroupId = useId();

  // Bulk-select state (list view only). Tracks selected concept IRIs; a light
  // bulk-action bar appears when any are selected. Selection is component-local
  // and resets when the view mode changes.
  //
  // Pagination note: rows are selected per-row, and any bulk "select all" acts
  // on the CURRENT PAGE only (the rows actually rendered). We keep this simple —
  // selections persist across page changes if the user pages back, but a "select
  // all" gesture never silently selects off-page rows the user can't see.
  const [selectedIris, setSelectedIris] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelectedIris(new Set());
  }, [viewMode]);

  const toggleRowSelect = useCallback((iri: string) => {
    setSelectedIris((prev) => {
      const next = new Set(prev);
      if (next.has(iri)) next.delete(iri);
      else next.add(iri);
      return next;
    });
  }, []);

  const [bulkBusy, setBulkBusy] = useState(false);

  // List-scoped Status filter (Item 4). Retired + archived concepts are pure
  // clutter, so they are HIDDEN by default; deprecated/superseded stay visible
  // (they read as active-ish and their "Replaced by" link is useful). State is
  // component-local so it persists across re-render within the view but resets
  // on remount. List-only — the tree view is never status-filtered here.
  const DEFAULT_HIDDEN_STATUSES = ['retired', 'archived'];
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(
    () => new Set(DEFAULT_HIDDEN_STATUSES),
  );
  const toggleStatusHidden = useCallback((status: string) => {
    setHiddenStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  // Bulk "Set status": POST the chosen lifecycle transition for every selected
  // concept. The backend enforces VALID_TRANSITIONS, so concepts in a state
  // that can't take the transition come back as errors — we count and report
  // successes vs failures rather than assuming all succeed.
  const runBulkStatus = useCallback(
    async (action: string, label: string) => {
      const iris = Array.from(selectedIris);
      if (iris.length === 0) return;
      setBulkBusy(true);
      let ok = 0;
      let failed = 0;
      for (const iri of iris) {
        try {
          const res = await fetch(
            `/api/knowledge/concepts/by-iri/${action}?iri=${encodeURIComponent(iri)}`,
            { method: 'POST' },
          );
          if (res.ok) ok += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      setBulkBusy(false);
      toast({
        title:
          failed === 0
            ? t('common:toast.success', 'Success')
            : t('semantic-models:bulk.partial', 'Completed with some errors'),
        description: t(
          'semantic-models:bulk.statusResult',
          '{{label}}: {{ok}} updated, {{failed}} skipped',
          { label, ok, failed },
        ),
        variant: failed > 0 && ok === 0 ? 'destructive' : undefined,
      });
      setSelectedIris(new Set());
      onConceptsChanged?.();
    },
    [selectedIris, toast, t, onConceptsChanged],
  );

  // Per-IRI mapping status, fetched in one batch from the read-model endpoint.
  // Degrades gracefully: if the endpoint is unavailable (e.g. not yet deployed),
  // the map stays empty and the Mapping column shows a muted dash.
  const [mappingStatus, setMappingStatus] = useState<Record<string, MappingStatus>>({});

  // Successor IRIs per concept, from the versioning contract §1
  // (GET .../version → replaced_by_iris). Only fetched for concepts whose
  // status is inactive (deprecated/superseded/retired), so we can render a
  // "Replaced by {successor}" link. Degrades silently if the endpoint is
  // unavailable. Keyed by concept IRI; [] means "checked, no successor".
  const { get } = useApi();
  const [successorsByIri, setSuccessorsByIri] = useState<Record<string, string[]>>({});

  // Restore scroll position once after mount, then again whenever the data
  // size changes substantially. Saving happens on scroll.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = conceptListScrollTop;
    // Only restore on mount; subsequent changes are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whether the tree is in a "group by a flat dimension" mode. The two source-
  // ish dimensions diverge: 'scheme' (groupBySource) keys on source_context,
  // 'source' (groupByFile) keys on the originating source_file. Both render
  // through the SAME group-row engine; only the key extractor and the group
  // label differ.
  const isGrouping = groupBySource || groupByFile;

  // Group-key extractor. For file grouping, concepts with no source_file fall
  // under a single sentinel group (NO_FILE_KEY -> "No source file"). For scheme
  // grouping, a missing source_context yields undefined (never matches a real
  // group key) — preserving the pre-existing behavior where such concepts are
  // not placed under any scheme group.
  const groupKeyOf = useCallback(
    (concept: OntologyConcept): string | undefined => {
      if (groupByFile) return concept.source_file?.trim() || NO_FILE_KEY;
      return concept.source_context || undefined;
    },
    [groupByFile],
  );

  // Build tree data structure from concepts
  const treeData = useMemo(() => {
    const conceptMap = new Map<string, OntologyConcept>();
    const hierarchy = new Map<string, string[]>();
    const groupKeys = new Set<string>();

    const baseConcepts = filteredConcepts.filter(concept => {
      const conceptType = concept.concept_type;
      return conceptType === 'class' || conceptType === 'concept' || conceptType === 'property';
    });

    baseConcepts.forEach(concept => {
      conceptMap.set(concept.iri, concept);

      // Collect the distinct group keys for the active grouping dimension.
      // 'file' grouping keys on source_file (with a sentinel for none);
      // 'scheme' grouping keys on source_context (unchanged behavior).
      if (groupByFile) {
        groupKeys.add(concept.source_file?.trim() || NO_FILE_KEY);
      } else if (concept.source_context) {
        groupKeys.add(concept.source_context);
      }

      concept.parent_concepts.forEach(parentIri => {
        if (!hierarchy.has(parentIri)) {
          hierarchy.set(parentIri, []);
        }
        const parentChildren = hierarchy.get(parentIri)!;
        if (!parentChildren.includes(concept.iri)) {
          parentChildren.push(concept.iri);
        }
      });

      if (!hierarchy.has(concept.iri)) {
        hierarchy.set(concept.iri, []);
      }
    });

    return { conceptMap, hierarchy, groupKeys: Array.from(groupKeys).sort() };
  }, [filteredConcepts, groupByFile]);

  // For each SCHEME group, the file it was derived from — but ONLY when every
  // concept in the group that has a source_file shares the SAME one (i.e. the
  // group came from a single upload). Mixed or absent source_file → null, so
  // the row shows just the scheme name. Memoized so per-row renders stay cheap.
  // Only relevant when grouping by scheme (source_context); when grouping by
  // file the group title IS the filename, so this subtitle is never shown.
  const sourceGroupFile = useMemo(() => {
    const byContext = new Map<string, string | null>();
    if (groupByFile) return byContext; // file groups don't use the "from <file>" subtitle
    for (const context of treeData.groupKeys) {
      const files = new Set<string>();
      for (const concept of treeData.conceptMap.values()) {
        if (concept.source_context !== context) continue;
        const file = concept.source_file?.trim();
        if (file) files.add(file);
      }
      byContext.set(context, files.size === 1 ? Array.from(files)[0] : null);
    }
    return byContext;
  }, [treeData, groupByFile]);

  const rootConcepts = useMemo(() => {
    if (isGrouping) {
      return treeData.groupKeys;
    }

    return Array.from(treeData.conceptMap.values())
      .filter(concept => {
        if (groupByDomain && concept.concept_type === 'property' && concept.domain) {
          return false;
        }
        return concept.parent_concepts.length === 0 ||
               !concept.parent_concepts.some(parentIri => treeData.conceptMap.has(parentIri));
      })
      .map(concept => concept.iri);
  }, [treeData, isGrouping, groupByDomain]);

  const getChildren = useCallback((itemId: string): string[] => {
    if (isGrouping && treeData.groupKeys.includes(itemId)) {
      return Array.from(treeData.conceptMap.values())
        .filter(concept => {
          const matchesGroup = groupKeyOf(concept) === itemId;
          if (groupByDomain && concept.concept_type === 'property' && concept.domain) {
            return false;
          }
          const isRootLevel = concept.parent_concepts.length === 0 ||
                 !concept.parent_concepts.some(parentIri => treeData.conceptMap.has(parentIri));
          return matchesGroup && isRootLevel;
        })
        .map(concept => concept.iri);
    }

    if (groupByDomain) {
      const regularChildren = treeData.hierarchy.get(itemId) || [];
      const propertiesWithThisDomain = Array.from(treeData.conceptMap.values())
        .filter(concept => concept.concept_type === 'property' && concept.domain === itemId)
        .map(concept => concept.iri);
      return [...new Set([...regularChildren, ...propertiesWithThisDomain])];
    }

    return treeData.hierarchy.get(itemId) || [];
  }, [treeData, isGrouping, groupKeyOf, groupByDomain]);

  const isFolder = useCallback((itemId: string): boolean => {
    if (isGrouping && treeData.groupKeys.includes(itemId)) {
      return true;
    }

    const concept = treeData.conceptMap.get(itemId);
    if (!concept) return false;

    if (groupByDomain) {
      const hasPropertiesWithThisDomain = Array.from(treeData.conceptMap.values()).some(
        c => c.concept_type === 'property' && c.domain === concept.iri
      );
      if (hasPropertiesWithThisDomain) return true;
    }

    const children = treeData.hierarchy.get(itemId) || [];
    return children.length > 0 || (concept.child_concepts && concept.child_concepts.length > 0);
  }, [treeData, isGrouping, groupByDomain]);

  // When switching grouping modes, expand the new top-level groups so users
  // see something meaningful instead of a collapsed flat list. Applies to both
  // scheme (source_context) and file (source_file) grouping.
  useEffect(() => {
    if (isGrouping && treeData.groupKeys.length > 0) {
      const next = new Set(expandedGroups);
      treeData.groupKeys.forEach((s) => next.add(s));
      if (next.size !== expandedGroups.length) {
        setExpandedConceptGroups(Array.from(next));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGrouping, treeData.groupKeys.join('|')]);

  // Scheme lookup keyed by the same key concepts are grouped under
  // (source_context); handles the nested scheme tree and the IRI fallback.
  const findScheme = useMemo(() => createSchemeLookup(collections), [collections]);

  // One label for a scheme everywhere (group headers and the Scheme column):
  // the collection record's label, falling back to the prettified key.
  const schemeLabel = useCallback(
    (sourceKey: string) => findScheme(sourceKey)?.label || systemRdfNamespaceDisplayLabel(sourceKey, t),
    [findScheme, t],
  );

  const handleSelect = useCallback((concept: OntologyConcept) => {
    // Save current scroll position so we can restore it on the way back.
    if (scrollContainerRef.current) {
      setConceptListScrollTop(scrollContainerRef.current.scrollTop);
    }
    onSelectConcept(concept);
  }, [onSelectConcept, setConceptListScrollTop]);

  const conceptLabel = useCallback(
    (concept: OntologyConcept) => resolveLabel(concept, selectedLanguage),
    [selectedLanguage],
  );

  // Flat list (list view-mode only): all concepts from the same filtered/typed
  // selection the tree is built from, sorted alphabetically by label. No
  // broader/narrower nesting. groupByDomain still hides domain-owned properties
  // (mirrors the tree's rootConcepts logic) so the two modes cover the same set.
  //
  // The search box filters this list with the same matcher the tree uses
  // (matchConceptSearch). While searching, exact/prefix hits on the label in
  // the selected language sort first, then alphabetical within each rank.
  const { flatConcepts, searchMatches } = useMemo(() => {
    const matches = new Map<string, ConceptSearchMatch>();
    const rows = Array.from(treeData.conceptMap.values())
      .filter(concept => {
        if (groupByDomain && concept.concept_type === 'property' && concept.domain) {
          return false;
        }
        const m = matchConceptSearch(concept, searchQuery, selectedLanguage);
        if (!m) return false;
        matches.set(concept.iri, m);
        return true;
      })
      .sort((a, b) =>
        (matches.get(a.iri)!.rank - matches.get(b.iri)!.rank) ||
        conceptLabel(a).localeCompare(conceptLabel(b), undefined, { sensitivity: 'base' }),
      );
    return { flatConcepts: rows, searchMatches: matches };
  }, [treeData, groupByDomain, conceptLabel, searchQuery, selectedLanguage]);

  // Distinct statuses present in the flat set, for the Status filter dropdown.
  // Only statuses that actually occur are offered, so the control doesn't list
  // dead options.
  const presentStatuses = useMemo(() => {
    const s = new Set<string>();
    flatConcepts.forEach((c) => {
      if (c.status) s.add(c.status);
    });
    return Array.from(s).sort();
  }, [flatConcepts]);

  // Apply the list-scoped Status filter. A concept is shown unless its status is
  // currently hidden. Concepts without a status are always shown.
  const visibleFlatConcepts = useMemo(() => {
    if (hiddenStatuses.size === 0) return flatConcepts;
    return flatConcepts.filter((c) => !(c.status && hiddenStatuses.has(c.status)));
  }, [flatConcepts, hiddenStatuses]);

  // Paginate the flat LIST view (25 per page). The TREE view is never
  // paginated — paginating a hierarchy would orphan parent/child rows.
  const {
    pageItems: pagedFlatConcepts,
    page: listPage,
    setPage: setListPage,
    pageCount: listPageCount,
    pageSize: listPageSize,
    setPageSize: setListPageSize,
  } = usePagination(visibleFlatConcepts, 10);

  // Batch-fetch mapping status for the concepts currently on screen (list view).
  // One request for the whole visible set, not per-row. Only IRIs we don't
  // already have are requested, so paging/filtering top-ups stay cheap.
  useEffect(() => {
    if (viewMode !== 'list') return;
    // Only the current page is on screen, so only fetch mapping status for it.
    const iris = pagedFlatConcepts
      .map((c) => c.iri)
      .filter((iri) => !(iri in mappingStatus));
    if (iris.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/semantic-links/mapping-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ iris }),
        });
        if (!res.ok) return; // endpoint unavailable — leave column as muted dash
        const data = await res.json();
        if (cancelled || !data?.statuses) return;
        setMappingStatus((prev) => ({ ...prev, ...data.statuses }));
      } catch {
        // Network/endpoint error — degrade silently to muted dash.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, pagedFlatConcepts]);

  // Fetch successor IRIs for the visible inactive concepts (deprecated /
  // superseded / retired). One §1 read per such concept; results are cached, so
  // scrolling/filtering only queries the newly-seen ones. Runs in both list and
  // tree modes (both surface status badges).
  useEffect(() => {
    const targets = filteredConcepts.filter(
      (c) => isInactiveStatus(c.status) && !(c.iri in successorsByIri),
    );
    if (targets.length === 0) return;

    let cancelled = false;
    (async () => {
      const updates: Record<string, string[]> = {};
      for (const c of targets) {
        try {
          const res = await get<{ replaced_by_iris?: string[] }>(
            `/api/semantic-models/concepts/version?iri=${encodeURIComponent(c.iri)}`,
          );
          if (cancelled) return;
          updates[c.iri] = res.data?.replaced_by_iris ?? [];
        } catch {
          if (cancelled) return;
          updates[c.iri] = [];
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setSuccessorsByIri((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredConcepts]);

  // Resolve an IRI to a human label from the concepts we already have. Simple
  // view must never show a raw IRI, so fall back to the last path segment (a
  // readable-ish token) rather than the full IRI when the concept isn't loaded.
  const labelForIri = useCallback(
    (iri: string): string => {
      const match = treeData.conceptMap.get(iri) || filteredConcepts.find((c) => c.iri === iri);
      if (match) return conceptLabel(match);
      return iri.split(/[/#]/).pop() || iri;
    },
    [treeData, filteredConcepts, conceptLabel],
  );

  // The "Replaced by {successor}" link shown on inactive concepts that name a
  // successor. Navigates to the successor's detail page. Rendered in both the
  // tree row and the list row.
  const renderReplacedBy = (concept: OntologyConcept): React.ReactNode => {
    if (!isInactiveStatus(concept.status)) return null;
    const successors = successorsByIri[concept.iri];
    if (!successors || successors.length === 0) return null;
    const primary = successors[0];
    const text = t('semantic-models:versionHistory.replacedBy', 'Replaced by {{label}}', {
      label: labelForIri(primary),
    });
    return (
      <button
        type="button"
        className={classes.replacedBy}
        title={text}
        onClick={(e) => {
          e.stopPropagation();
          const target = treeData.conceptMap.get(primary) || filteredConcepts.find((c) => c.iri === primary);
          if (target) onSelectConcept(target);
        }}
      >
        <ArrowRight aria-hidden />
        <span className={classes.truncate}>{text}</span>
      </button>
    );
  };

  // Render a single tree row with rich content (icon + label + type + collection
  // + status pill + property hints).
  //
  // `flat` (default false) is used ONLY by the list view-mode: it forces the row
  // to render as a leaf (no expand chevron, no child recursion) so the SAME row
  // markup can be reused for a flat list without a divergent copy. The tree path
  // never passes `flat`, so its rendering output is unchanged.
  const renderTreeItem = (itemId: string, level: number = 0, flat: boolean = false): React.ReactNode => {
    // A group header row — either a scheme group (groupBySource, keyed on
    // source_context) or a file group (groupByFile, keyed on source_file).
    // `isSourceGroup` keeps its name for minimal churn but now means "is any
    // group header". `isFileGroup` narrows it to the file dimension.
    const isSourceGroup = isGrouping && treeData.groupKeys.includes(itemId);
    const isFileGroup = groupByFile && isSourceGroup;
    const concept = treeData.conceptMap.get(itemId);
    const isExpanded = !flat && (expandedGroups.includes(itemId) || (searchQuery.length > 0));
    const hasChildren = !flat && isFolder(itemId);
    const children = flat ? [] : getChildren(itemId);
    const isSelected = selectedConcept?.iri === itemId;

    // Same language-agnostic matcher as the list view.
    const matches = (c: OntologyConcept) =>
      matchConceptSearch(c, searchQuery, selectedLanguage) !== null;

    if (isSourceGroup && searchQuery) {
      const hasMatchingChildren = children.some(childId => {
        const child = treeData.conceptMap.get(childId);
        return !!child && matches(child);
      });
      if (!hasMatchingChildren) return null;
    }

    if (!isSourceGroup && searchQuery && concept) {
      const matchesSelf = matches(concept);

      const hasMatchingDescendants = (): boolean => {
        const stack = [...children];
        while (stack.length > 0) {
          const childId = stack.pop()!;
          const child = treeData.conceptMap.get(childId);
          if (child) {
            if (matches(child)) {
              return true;
            }
            stack.push(...getChildren(childId));
          }
        }
        return false;
      };

      if (!matchesSelf && !hasMatchingDescendants()) {
        return null;
      }
    }

    const displayName = isFileGroup
      // A file group's title IS the filename verbatim (no namespace
      // prettifying — it's a literal file). The sentinel renders as a muted
      // "No source file" label.
      ? (itemId === NO_FILE_KEY
          ? t('semantic-models:filters.noSourceFile', 'No source file')
          : itemId)
      : isSourceGroup
        ? schemeLabel(itemId)
        : (concept ? conceptLabel(concept) : itemId);

    const collectionLabel = concept?.source_context ? schemeLabel(concept.source_context) : null;
    const groupFile = isSourceGroup ? sourceGroupFile.get(itemId) : null;

    return (
      <div key={itemId}>
        <div
          role={isSourceGroup ? 'button' : 'link'}
          tabIndex={0}
          data-testid={isSourceGroup ? `concept-group-${itemId}` : `concept-row-${itemId}`}
          className={classes.treeRow}
          data-group={isSourceGroup || undefined}
          data-selected={(isSelected && !isSourceGroup) || undefined}
          // Dim inactive concepts (deprecated/superseded/retired) so they
          // don't read as active clutter. Hover restores full opacity.
          data-inactive={(!isSourceGroup && isInactiveStatus(concept?.status)) || undefined}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (!isSourceGroup && concept) {
              handleSelect(concept);
            } else if (hasChildren) {
              toggleConceptGroup(itemId);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!isSourceGroup && concept) {
                handleSelect(concept);
              } else if (hasChildren) {
                toggleConceptGroup(itemId);
              }
            }
          }}
        >
          <div className={classes.toggleSlot}>
            {hasChildren && (
              <button
                type="button"
                aria-label={
                  isExpanded
                    ? t('semantic-models:collectionTree.collapse', { defaultValue: 'Collapse {{name}}', name: displayName })
                    : t('semantic-models:collectionTree.expand', { defaultValue: 'Expand {{name}}', name: displayName })
                }
                aria-expanded={isExpanded}
                className={classes.toggle}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleConceptGroup(itemId);
                }}
              >
                {isExpanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
              </button>
            )}
          </div>

          {isSourceGroup ? <FolderTree aria-hidden className={classes.groupIcon} /> : <TypeIcon type={concept?.concept_type || 'concept'} />}

          {groupFile ? (
            <span className={classes.nameStack}>
              <span className={`${classes.name} ${classes.truncate}`} title={displayName}>
                {displayName}
              </span>
              <span className={`${classes.sub} ${classes.truncate}`} title={groupFile}>
                {t('semantic-models:columns.fromFile', 'from {{file}}', { file: groupFile })}
              </span>
            </span>
          ) : (
            <span
              className={`${classes.name} ${classes.truncate}`}
              // The "No source file" sentinel group reads as an absence
              data-absent={(isFileGroup && itemId === NO_FILE_KEY) || undefined}
              title={displayName}
            >
              {displayName}
            </span>
          )}

          {/* Right-side metadata: type, collection, status, property hints */}
          {!isSourceGroup && concept && (
            <div className={classes.meta}>
              {concept.concept_type === 'property' && (concept.domain || concept.range) && (
                <span className={classes.domainRange} title={`${concept.domain || '?'} → ${concept.range || '?'}`}>
                  {(concept.domain ? concept.domain.split(/[/#]/).pop() : '?')}
                  <span aria-hidden className={classes.arrow}>→</span>
                  {(concept.range ? concept.range.split(/[/#]/).pop() : '?')}
                </span>
              )}
              {collectionLabel && (
                <span className={classes.schemeBadge}>
                  <Badge variant="outline" title={collectionLabel}>
                    <span className={classes.truncate}>{collectionLabel}</span>
                  </Badge>
                </span>
              )}
              <ToneBadge tone={typeTone(concept.concept_type)}>
                {t(`semantic-models:types.${concept.concept_type}`)}
              </ToneBadge>
              {concept.status && (
                <span className={classes.statusBadge}>
                  <ToneBadge tone={statusTone(concept.status)}>
                    {t(`semantic-models:status.${concept.status}`, concept.status)}
                  </ToneBadge>
                </span>
              )}
              {renderReplacedBy(concept)}
              {onEditConcept && (
                <ActionIcon
                  variant="subtle"
                  size={24}
                  className={classes.edit}
                  aria-label={t('common:actions.edit')}
                  title={t('common:actions.edit')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditConcept(concept);
                  }}
                >
                  <Pencil aria-hidden size={14} />
                </ActionIcon>
              )}
            </div>
          )}

          {isSourceGroup && (
            <span className={classes.count}>
              <Badge variant="secondary">{children.length}</Badge>
            </span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className={classes.children}>
            {children.map(childId => renderTreeItem(childId, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Grid columns shared by the list header and its rows, so cells align:
  // checkbox | name+definition | Kind | Scheme | Mapping | Status | edit.
  // The checkbox and edit columns are there only for a user who may use them.
  const listColumns = [
    canBulkEdit ? '28px' : null,
    'minmax(220px, 1.6fr)',
    '110px',
    'minmax(120px, 1fr)',
    'minmax(120px, 0.8fr)',
    '110px',
    onEditConcept ? '40px' : null,
  ].filter(Boolean).join(' ');
  const gridStyle = { gridTemplateColumns: listColumns };

  // Render one flat LIST row: a real table row with columns, a bulk-select
  // checkbox, and an inline edit pencil. Distinct from renderTreeItem so the
  // tree engine stays untouched; only the list gets the columnar layout.
  const renderListRow = (concept: OntologyConcept): React.ReactNode => {
    const label = conceptLabel(concept);
    const viaLang = searchQuery ? searchMatches.get(concept.iri)?.viaLang : undefined;
    const definition = concept.comment || '';
    const collectionLabel = concept.source_context ? schemeLabel(concept.source_context) : '';
    const map = mappingLabel(mappingStatus[concept.iri], t);
    const checked = selectedIris.has(concept.iri);

    return (
      <div
        key={concept.iri}
        data-testid={`concept-row-${concept.iri}`}
        className={classes.listRow}
        style={gridStyle}
        data-checked={checked || undefined}
        // Dim inactive concepts (deprecated/superseded/retired); hover restores.
        data-inactive={(isInactiveStatus(concept.status) && !checked) || undefined}
        onClick={() => handleSelect(concept)}
      >
        {canBulkEdit && (
          <div onClick={(e) => e.stopPropagation()} className={classes.cellCenter}>
            <Checkbox
              size="xs"
              checked={checked}
              onChange={() => toggleRowSelect(concept.iri)}
              aria-label={t('common:actions.select', 'Select')}
            />
          </div>
        )}

        <div className={classes.nameCell}>
          <TypeIcon type={concept.concept_type} />
          <div className={classes.nameStack}>
            <div className={classes.nameLine}>
              <span className={`${classes.name} ${classes.truncate}`} title={label}>{label}</span>
              {viaLang && (
                <span className={classes.sub} data-testid={`concept-match-lang-${concept.iri}`}>
                  {t('semantic-models:search.matchedLanguage', 'matched: {{lang}}', { lang: viaLang })}
                </span>
              )}
            </div>
            {definition && (
              <div className={`${classes.definition} ${classes.truncate}`} title={definition}>
                {definition}
              </div>
            )}
            {/* Raw IRI is the ontology layer — shown only in Advanced view. */}
            <div className={`adv-only ${classes.iri} ${classes.truncate}`} title={concept.iri}>
              {concept.iri}
            </div>
          </div>
        </div>

        <span className={`${classes.secondary} ${classes.truncate}`}>
          {t(`semantic-models:types.${concept.concept_type}`)}
        </span>

        <span className={classes.truncate} title={collectionLabel}>{collectionLabel}</span>

        <span className={classes.truncate} data-unmapped={map?.none || undefined}>
          {map ? map.text : <span className={classes.secondary}>—</span>}
        </span>

        <span className={classes.statusCell}>
          {concept.concept_type === 'property' ? (
            <span className={classes.secondary}>—</span>
          ) : (
            <>
              {concept.status && (
                <ToneBadge tone={statusTone(concept.status)}>
                  {t(`semantic-models:status.${concept.status}`, concept.status)}
                </ToneBadge>
              )}
              {renderReplacedBy(concept)}
            </>
          )}
        </span>

        {onEditConcept && (
          <div className={classes.cellCenter} onClick={(e) => e.stopPropagation()}>
            <ActionIcon
              variant="subtle"
              size={26}
              className={classes.edit}
              aria-label={t('common:actions.edit')}
              title={t('common:actions.edit')}
              onClick={() => onEditConcept(concept)}
            >
              <Pencil aria-hidden size={14} />
            </ActionIcon>
          </div>
        )}
      </div>
    );
  };

  // Select-all checkbox for the current page (list view only).
  const allVisibleSelected = pagedFlatConcepts.length > 0 && pagedFlatConcepts.every((c) => selectedIris.has(c.iri));

  // Column header row for the list. Labels live here so cells stay quiet text.
  const listHeader = (
    <div className={classes.listHeader} style={gridStyle}>
      {canBulkEdit && (
        <div onClick={(e) => e.stopPropagation()} className={classes.cellCenter}>
          <Checkbox
            size="xs"
            checked={allVisibleSelected}
            onChange={(e) => {
              // Select (or deselect) all visible rows on the current page
              const newSelected = new Set(selectedIris);
              if (e.currentTarget.checked) pagedFlatConcepts.forEach((c) => newSelected.add(c.iri));
              else pagedFlatConcepts.forEach((c) => newSelected.delete(c.iri));
              setSelectedIris(newSelected);
            }}
            aria-label={t('semantic-models:bulk.selectAll', 'Select all')}
          />
        </div>
      )}
      <span>{t('semantic-models:columns.name', 'Name')}</span>
      <span>{t('semantic-models:columns.kind', 'Kind')}</span>
      <span>{t('semantic-models:columns.scheme', 'Scheme')}</span>
      <span>{t('semantic-models:columns.mapping', 'Mapping')}</span>
      <span>{t('semantic-models:columns.status', 'Status')}</span>
      {onEditConcept && <span />}
    </div>
  );

  // Light bulk-action bar, shown when any rows are selected (list view only).
  const bulkBar = canBulkEdit && selectedIris.size > 0 && (
    <div className={classes.bulkBar}>
      <b className={classes.bulkCount}>
        {t('semantic-models:bulk.selected', '{{count}} selected', { count: selectedIris.size })}
      </b>
      <div className={classes.bulkActions}>
        {/* Set status: real lifecycle transitions across the selection. The
            backend enforces which transitions are valid per concept. */}
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Button variant="outline" size="sm" disabled={bulkBusy}>
              {t('semantic-models:bulk.setStatus', 'Set status')}
              <ChevronDown aria-hidden />
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {BULK_STATUS_ACTIONS.filter((a) => a.action !== 'certify' || canCertify).map((a) => {
              const label = t(a.labelKey, a.defaultLabel);
              return (
                <Menu.Item key={a.action} onClick={() => runBulkStatus(a.action, label)}>
                  {label}
                </Menu.Item>
              );
            })}
          </Menu.Dropdown>
        </Menu>
        <ActionIcon
          variant="subtle"
          size={26}
          aria-label={t('common:actions.clear', 'Clear')}
          title={t('common:actions.clear', 'Clear')}
          onClick={() => setSelectedIris(new Set())}
        >
          <X aria-hidden size={14} />
        </ActionIcon>
      </div>
    </div>
  );

  // List-scoped Status filter (list view only). A checkbox list over the
  // statuses actually present; unchecked = hidden. Retired + archived are
  // hidden by default (see hiddenStatuses init). Shows a small count badge when
  // any status is hidden so the filtered-down state is legible.
  const hiddenPresentCount = presentStatuses.filter((s) => hiddenStatuses.has(s)).length;
  const statusFilterBar = presentStatuses.length > 0 && (
    <div className={classes.statusBar}>
      <Popover position="bottom-start" withinPortal shadow="md">
        <Popover.Target>
          <Button variant="outline" size="sm">
            <ListFilter aria-hidden />
            {t('semantic-models:filters.status', 'Status')}
            {hiddenPresentCount > 0 && (
              <Badge variant="secondary">
                {presentStatuses.length - hiddenPresentCount}/{presentStatuses.length}
              </Badge>
            )}
            <ChevronDown aria-hidden />
          </Button>
        </Popover.Target>
        <Popover.Dropdown className={classes.statusDropdown}>
          <div role="group" aria-labelledby={statusGroupId} className={classes.statusOptions}>
            <span id={statusGroupId} className={classes.statusLabel}>
              {t('semantic-models:filters.showStatuses', 'Show statuses')}
            </span>
            {presentStatuses.map((status) => (
              <Checkbox
                key={status}
                size="xs"
                label={t(`semantic-models:status.${status}`, status)}
                checked={!hiddenStatuses.has(status)}
                onChange={() => toggleStatusHidden(status)}
              />
            ))}
          </div>
        </Popover.Dropdown>
      </Popover>
      {hiddenPresentCount > 0 && (
        <span className={classes.secondary}>
          {t('semantic-models:filters.statusHiddenNote', '{{count}} hidden', {
            count: hiddenPresentCount,
          })}
        </span>
      )}
    </div>
  );

  const noConcepts = (
    <div className={classes.empty}>
      <Layers aria-hidden />
      <p>{t('semantic-models:messages.noConceptsFound')}</p>
    </div>
  );
  const searchLabel = t('common:placeholders.searchConceptsAndTerms');

  return (
    <div className={classes.root}>
      <div className={classes.toolbar}>
        <TextInput
          className={classes.search}
          leftSection={<Search aria-hidden size={14} />}
          placeholder={searchLabel}
          aria-label={searchLabel}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />
      </div>

      <div
        ref={scrollContainerRef}
        className={classes.scroll}
        onScroll={(e) => {
          const target = e.currentTarget;
          // Throttle via rAF; this is simple and good enough for a tree.
          if (target) {
            window.requestAnimationFrame(() => {
              setConceptListScrollTop(target.scrollTop);
            });
          }
        }}
      >
        <div className={classes.body} data-view={viewMode}>
          {viewMode === 'list' ? (
            <>
              {bulkBar}
              {statusFilterBar}
              {visibleFlatConcepts.length > 0 && listHeader}
              {isGrouping
                ? treeData.groupKeys.map(groupKey => {
                    // Group only the CURRENT PAGE's rows so headers reflect what
                    // is actually on screen; pagination is over the flat set.
                    // The key extractor keys on source_context (scheme) or
                    // source_file (file) depending on the active dimension.
                    const rows = pagedFlatConcepts.filter(c => groupKeyOf(c) === groupKey);
                    if (rows.length === 0) return null;
                    // File groups show the filename verbatim (sentinel → muted
                    // "No source file"); scheme groups use the namespace label.
                    const groupLabel = groupByFile
                      ? (groupKey === NO_FILE_KEY
                          ? t('semantic-models:filters.noSourceFile', 'No source file')
                          : groupKey)
                      : schemeLabel(groupKey);
                    return (
                      <div key={`flat-group-${groupKey}`}>
                        <div className={classes.groupHeader}>
                          <FolderTree aria-hidden className={classes.groupIcon} />
                          <span
                            className={`${classes.name} ${classes.truncate}`}
                            data-absent={(groupByFile && groupKey === NO_FILE_KEY) || undefined}
                            title={groupLabel}
                          >
                            {groupLabel}
                          </span>
                          <span className={classes.count}>
                            <Badge variant="secondary">{rows.length}</Badge>
                          </span>
                        </div>
                        {rows.map(c => renderListRow(c))}
                      </div>
                    );
                  })
                : pagedFlatConcepts.map(c => renderListRow(c))}

              {visibleFlatConcepts.length === 0 && noConcepts}

              {visibleFlatConcepts.length > 0 && (
                <div className={classes.pager}>
                  <PaginationControls
                    page={listPage}
                    pageCount={listPageCount}
                    onPageChange={setListPage}
                    pageSize={listPageSize}
                    onPageSizeChange={setListPageSize}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {rootConcepts.map(id => renderTreeItem(id, 0))}
              {rootConcepts.length === 0 && noConcepts}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

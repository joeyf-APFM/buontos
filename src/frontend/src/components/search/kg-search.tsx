import { buildKgSearchParams, DEFAULT_KG_SPARQL } from '@/lib/kg-search-url';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Menu, Popover, Select, Switch, Textarea, TextInput, UnstyledButton } from '@mantine/core';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pane } from '@/mantine/page';
import { useHoverFocusCard } from '@/components/common/use-hover-focus-card';
import { useApi } from '@/hooks/use-api';
import { SPARQL_UI_ENABLED } from '@/config/features';
import { LoadError } from './search-pane';
import { asList } from './search-utils';
import classes from './search.module.css';

type KGItem = { value: string; type: 'resource' | 'property' };
type Neighbor = {
  direction: 'outgoing' | 'incoming' | 'predicate';
  predicate: string;
  display: string;
  displayType: 'resource' | 'property' | 'literal';
  stepIri?: string | null;
  stepIsResource?: boolean;
};

type DirectionFilter = 'all' | 'incoming' | 'outgoing';

interface ResourceDescriptionTriple {
  predicate: string;
  object: string;
  objectType: 'uri' | 'literal' | 'bnode';
  expanded?: ResourceDescriptionTriple[];
}
interface ResourceDescription {
  iri: string;
  triples: ResourceDescriptionTriple[];
}

const PREDICATE_PREFIXES: Record<string, string> = {
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#': 'rdf:',
  'http://www.w3.org/2000/01/rdf-schema#': 'rdfs:',
  'http://www.w3.org/2001/XMLSchema#': 'xsd:',
  'http://www.w3.org/ns/shacl#': 'sh:',
};
function shortPredicate(iri: string): string {
  for (const [prefix, short] of Object.entries(PREDICATE_PREFIXES)) {
    if (iri.startsWith(prefix)) return short + iri.slice(prefix.length);
  }
  const local = iri.includes('#') ? iri.split('#').pop()! : iri.split('/').pop()!;
  return local || iri;
}

interface KGSearchProps {
  initialPrefix?: string;
  initialPath?: string[];
  initialSparql?: string;
  initialDirectionFilter?: DirectionFilter;
  initialShowConceptsOnly?: boolean;
}

/**
 * An app entity (urn:ontos:…) with a card of its details, on hover and on
 * keyboard focus (useHoverFocusCard), and Open in it.
 */
function AppEntityHover({ iri, children }: { iri: string; children: ReactNode }) {
  const { t } = useTranslation(['search', 'common']);
  const info = parseAppEntity(iri);
  const [details, setDetails] = useState<any>(null);
  const card = useHoverFocusCard();
  const open = card.opened;

  useEffect(() => {
    if (!open || !info) return;
    const load = async () => {
      try {
        const url = info.entityType === 'data_product'
          ? `/api/data-products/${info.entityId}`
          : info.entityType === 'data_domain'
            ? `/api/data-domains/${info.entityId}`
            : `/api/data-contracts/${info.entityId}`;
        const resp = await fetch(url);
        if (resp.ok) setDetails(await resp.json());
      } catch { /* ignore */ }
    };
    load();
  }, [open, iri]);

  if (!info) return <>{children}</>;
  return (
    <Popover opened={card.opened} onClose={card.close} position="bottom-start" withinPortal shadow="md" returnFocus={false} withRoles={false}>
      <Popover.Target>
        <span className={classes.entity} role="button" tabIndex={0} aria-expanded={card.opened} {...card.target}>
          {children}
        </span>
      </Popover.Target>
      <Popover.Dropdown {...card.dropdown}>
        {!details ? (
          <div className={classes.cardMuted}>{t('common:states.loading')}</div>
        ) : (
          <div className={classes.card}>
            <div className={classes.cardTitle}>{details.info?.title || details.name || info.entityId}</div>
            <div className={classes.cardMuted}>{t('search:kg.hover.type', { type: info.entityType.replace('_', ' ') })}</div>
            <div className={classes.cardMuted}>
              <div>{t('search:kg.hover.id', { id: info.entityId })}</div>
              {details.info?.owner && <div>{t('search:kg.hover.owner', { owner: details.info.owner })}</div>}
              {details.info?.status && <div>{t('search:kg.hover.status', { status: details.info.status })}</div>}
            </div>
            {details.info?.description && (
              <div className={classes.cardDescription}>{details.info.description}</div>
            )}
            <div>
              <Button size="sm" variant="outline"
                onClick={() => {
                  const path = info.entityType === 'data_product'
                    ? `/data-products/${info.entityId}`
                    : info.entityType === 'data_domain'
                      ? `/settings/data-domains/${info.entityId}`
                      : `/data-contracts/${info.entityId}`;
                  window.location.href = path;
                }}>{t('common:actions.open')}</Button>
            </div>
          </div>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

// Helper function to parse app entities
const parseAppEntity = (iri: string): { entityType: 'data_product' | 'data_domain' | 'data_contract'; entityId: string } | null => {
  const m = iri.match(/^urn:ontos:(data_product|data_domain|data_contract):(.+)$/);
  if (!m) return null;
  return { entityType: m[1] as any, entityId: m[2] };
};

/** A failed request's text, for an Alert's message. */
function SparqlError({ error }: { error: string }) {
  const { t } = useTranslation(['search', 'common']);
  return (
    <Alert color="red" variant="light" icon={<AlertCircle />} title={t('common:states.error')} className={classes.alert}>
      {error && <span className={classes.alertMessage}>{error}</span>}
    </Alert>
  );
}

/**
 * The knowledge-graph search (wave 2 Task 13b): Prefix Search and Path
 * Explorer side by side, SPARQL under both (only with SPARQL_UI_ENABLED), as
 * kit panes sharing their borders. On Search's Knowledge Graph tab and in Explore's SPARQL pane.
 */
export default function KGSearch({
  initialPrefix = '',
  initialPath = [],
  initialSparql = 'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10',
  initialDirectionFilter = 'all',
  initialShowConceptsOnly = false
}: KGSearchProps) {
  const { get, post } = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(['search', 'common']);

  const [prefix, setPrefix] = useState(initialPrefix);
  const [prefixResults, setPrefixResults] = useState<KGItem[]>([]);
  const [path, setPath] = useState<string[]>(initialPath);
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [sparql, setSparql] = useState(initialSparql);
  const [sparqlRows, setSparqlRows] = useState<any[]>([]);
  const [resourceDescription, setResourceDescription] = useState<ResourceDescription | null>(null);

  // Failed loads: their errors, and retry nonces; a newer request wins over
  // an answer still on its way
  const [prefixError, setPrefixError] = useState<string | null>(null);
  const [prefixNonce, setPrefixNonce] = useState(0);
  const [neighborsError, setNeighborsError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [pathNonce, setPathNonce] = useState(0);
  const [sparqlError, setSparqlError] = useState<string | null>(null);
  const sparqlSeq = useRef(0);

  // New filter states
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>(initialDirectionFilter);
  const [showConceptsOnly, setShowConceptsOnly] = useState(initialShowConceptsOnly);

  // Update URL when state changes - only manages KG-specific params
  const updateUrl = (updates: Partial<{
    prefix: string;
    path: string[];
    sparql: string;
    directionFilter: DirectionFilter;
    showConceptsOnly: boolean;
  }>) => {
    // Get current values from URL for params we're not updating
    const currentParams = new URLSearchParams(location.search);

    const params = buildKgSearchParams(location.search, {
      prefix: updates.prefix !== undefined ? updates.prefix : currentParams.get('prefix') || '',
      path: updates.path !== undefined ? updates.path : (currentParams.get('path')?.split('|').filter(Boolean) || []),
      sparql: updates.sparql !== undefined ? updates.sparql : currentParams.get('sparql') || DEFAULT_KG_SPARQL,
      directionFilter: updates.directionFilter !== undefined ? updates.directionFilter : (currentParams.get('direction') as DirectionFilter || 'all'),
      showConceptsOnly: updates.showConceptsOnly !== undefined ? updates.showConceptsOnly : currentParams.get('concepts_only') === 'true',
    });
    const queryString = params.toString();
    navigate(`${location.pathname}?${queryString}`, { replace: true });
  };

  // Load initial state from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    // Support both new simple params and legacy startIri param
    const urlPrefix = params.get('prefix');
    const urlPath = params.get('path');
    const urlSparql = params.get('sparql');
    const urlDirection = params.get('direction') as DirectionFilter;
    const urlConceptsOnly = params.get('concepts_only') === 'true';
    const startIri = params.get('startIri'); // Legacy support

    if (urlPrefix && urlPrefix !== initialPrefix) setPrefix(urlPrefix);
    if (urlPath) {
      const pathArray = urlPath.split('|').filter(Boolean);
      if (pathArray.length > 0 && JSON.stringify(pathArray) !== JSON.stringify(initialPath)) {
        setPath(pathArray);
      }
      // Also populate prefix from path if no explicit prefix is provided
      // This helps users see what concept they navigated to in the Prefix Search field
      if (!urlPrefix && pathArray.length > 0) {
        // Extract a useful prefix from the first path element (e.g., namespace or local name)
        const firstIri = pathArray[0];
        // Use the IRI itself or extract the local name after # or /
        const localName = firstIri.split('#').pop() || firstIri.split('/').pop() || firstIri;
        setPrefix(localName);
      }
    } else if (startIri && path.length === 0) {
      // Legacy: convert startIri to path
      setPath([startIri]);
      // Also populate prefix from startIri
      const localName = startIri.split('#').pop() || startIri.split('/').pop() || startIri;
      setPrefix(localName);
    }
    if (SPARQL_UI_ENABLED && urlSparql && urlSparql !== initialSparql) setSparql(urlSparql);
    if (urlDirection && urlDirection !== initialDirectionFilter) setDirectionFilter(urlDirection);
    if (urlConceptsOnly !== initialShowConceptsOnly) setShowConceptsOnly(urlConceptsOnly);
  }, [location.search]);

  // Load neighbors when path changes
  useEffect(() => {
    let current = true;
    const loadNeighbors = async () => {
      if (path.length > 0) {
        const currentIri = path[path.length - 1];
        try {
          const res = await get<Neighbor[]>(`/api/semantic-models/neighbors?iri=${encodeURIComponent(currentIri)}&limit=200`);
          if (!current) return;
          setNeighbors(asList<Neighbor>(res.data));
          setNeighborsError(res.error ? res.error : null);
        } catch (e) {
          if (!current) return;
          console.error('Failed to load neighbors:', e);
          setNeighbors([]);
          setNeighborsError(e instanceof Error ? e.message : '');
        }
      } else {
        setNeighbors([]);
        setNeighborsError(null);
      }
    };
    loadNeighbors();
    return () => { current = false; };
  }, [path, pathNonce]);

  // Load full resource description (with expanded blank nodes) when path changes
  useEffect(() => {
    let current = true;
    const loadDescription = async () => {
      if (path.length === 0) {
        setResourceDescription(null);
        setDescriptionError(null);
        return;
      }
      const currentIri = path[path.length - 1];
      try {
        const res = await get<ResourceDescription>(
          `/api/semantic-models/resources/${encodeURIComponent(currentIri)}/description`
        );
        if (!current) return;
        const description = res.error ? null : res.data || null;
        setResourceDescription(description ? { ...description, triples: asList(description.triples) } : null);
        setDescriptionError(res.error ? res.error : null);
      } catch (e) {
        if (!current) return;
        console.error('Failed to load resource description:', e);
        setResourceDescription(null);
        setDescriptionError(e instanceof Error ? e.message : '');
      }
    };
    loadDescription();
    return () => { current = false; };
  }, [path, pathNonce]);

  // Prefix search
  useEffect(() => {
    let current = true;
    const run = async () => {
      if (!prefix.trim()) {
        setPrefixResults([]);
        setPrefixError(null);
        updateUrl({ prefix: '' });
        return;
      }
      const res = await get<KGItem[]>(`/api/semantic-models/prefix?q=${encodeURIComponent(prefix)}&limit=25`);
      if (!current) return;
      setPrefixResults(asList<KGItem>(res.data));
      setPrefixError(res.error ? res.error : null);
      updateUrl({ prefix });
    };
    const t = setTimeout(run, 250);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [prefix, prefixNonce]);

  const selectStart = async (iri: string) => {
    const newPath = [iri];
    setPath(newPath);
    updateUrl({ path: newPath });
  };

  const stepTo = async (iri: string) => {
    const newPath = [...path, iri];
    setPath(newPath);
    updateUrl({ path: newPath });
  };

  const jumpTo = async (index: number) => {
    const newPath = path.slice(0, index + 1);
    setPath(newPath);
    updateUrl({ path: newPath });
  };

  const runSparql = async () => {
    const seq = ++sparqlSeq.current;
    const res = await post<any[]>(`/api/semantic-models/query`, { sparql });
    if (seq !== sparqlSeq.current) return;
    setSparqlRows(asList(res.data));
    setSparqlError(res.error ? res.error : null);
    updateUrl({ sparql });
  };

  // Filter neighbors based on current filters
  const filteredNeighbors = neighbors.filter(neighbor => {
    // Direction filter
    if (directionFilter === 'incoming' && neighbor.direction !== 'incoming') return false;
    if (directionFilter === 'outgoing' && neighbor.direction !== 'outgoing') return false;

    // Concepts/Classes only filter
    if (showConceptsOnly) {
      // Show only resources that are likely concepts/classes
      const isConceptOrClass = neighbor.displayType === 'resource' &&
        (neighbor.predicate.includes('type') ||
          neighbor.predicate.includes('subClassOf') ||
          neighbor.predicate.includes('Class') ||
          neighbor.display.includes('Class') ||
          neighbor.display.includes('concept'));
      if (!isConceptOrClass) return false;
    }

    return true;
  });

  const handleDirectionFilterChange = (value: DirectionFilter) => {
    setDirectionFilter(value);
    updateUrl({ directionFilter: value });
  };

  const handleConceptsOnlyToggle = (checked: boolean) => {
    setShowConceptsOnly(checked);
    updateUrl({ showConceptsOnly: checked });
  };

  const pathError = neighborsError ?? descriptionError;

  const EXAMPLES: { key: string; query: string }[] = [
    { key: 'search:kg.resourcesInNamespace', query: 'SELECT ?resource WHERE { ?resource ?p ?o . FILTER(REGEX(STR(?resource), "^urn:ontos")) }' },
    { key: 'search:kg.resourcesWithLabel', query: 'SELECT ?s ?label WHERE { ?s <http://www.w3.org/2000/01/rdf-schema#label> ?label } LIMIT 50' },
    { key: 'search:kg.subjectsAndTypes', query: 'SELECT ?s ?type WHERE { ?s a ?type } LIMIT 100' },
    { key: 'search:kg.topPredicates', query: 'SELECT ?p (COUNT(*) AS ?count) WHERE { ?s ?p ?o } GROUP BY ?p ORDER BY DESC(?count) LIMIT 25' },
    { key: 'search:kg.mostLinkedSeeAlso', query: 'SELECT ?o (COUNT(*) AS ?count) WHERE { ?s <http://www.w3.org/2000/01/rdf-schema#seeAlso> ?o } GROUP BY ?o ORDER BY DESC(?count) LIMIT 25' },
  ];

  return (
    <div className={classes.grid}>
      <Pane title={t('search:kg.prefixSearch')}>
        <p className={classes.paneIntro}>{t('search:kg.prefixSearchDesc')}</p>
        <TextInput
          value={prefix}
          placeholder={t('search:kg.prefixPlaceholder')}
          aria-label={t('search:kg.prefixSearch')}
          onChange={(e) => setPrefix(e.currentTarget.value)}
          mb={8}
        />
        {prefixError !== null ? (
          <div className={classes.state}>
            <Alert color="red" variant="light" icon={<AlertCircle />} title={t('search:states.searchFailed', 'The search failed.')} className={classes.alert}>
              {prefixError && <span className={classes.alertMessage}>{prefixError}</span>}
            </Alert>
            <Button variant="outline" onClick={() => setPrefixNonce((n) => n + 1)}>{t('common:retry')}</Button>
          </div>
        ) : (
          <div className={classes.list}>
            {prefixResults.map((r) => (
              <div key={r.value} className={classes.row}>
                <div className={`${classes.rowLine} ${classes.rowMain}`}>
                  <Badge variant="secondary">{r.type}</Badge>
                  <AppEntityHover iri={r.value}>
                    <span className={classes.ellipsis} title={r.value}>{r.value}</span>
                  </AppEntityHover>
                </div>
                <Button size="sm" variant="outline" onClick={() => selectStart(r.value)}>{t('search:kg.startPath')}</Button>
              </div>
            ))}
          </div>
        )}
      </Pane>

      <Pane title={t('search:kg.pathExplorer')}>
        <p className={classes.paneIntro}>{t('search:kg.pathExplorerDesc')}</p>
        {path.length > 0 && (
          <div className={classes.path}>
            {path.map((iri, idx) => (
              <UnstyledButton key={idx} className={classes.step} onClick={() => jumpTo(idx)} title={iri}>
                <span className={classes.ellipsis}>{iri}</span>
              </UnstyledButton>
            ))}
          </div>
        )}

        {/* Filter Controls */}
        <div className={classes.filters}>
          <Select
            label={t('search:kg.directionFilter')}
            data={[
              { value: 'all', label: t('search:kg.everything') },
              { value: 'incoming', label: t('search:kg.incomingOnly') },
              { value: 'outgoing', label: t('search:kg.outgoingOnly') },
            ]}
            value={directionFilter}
            onChange={(value) => value && handleDirectionFilterChange(value as DirectionFilter)}
            allowDeselect={false}
            classNames={{ label: classes.filterLabel }}
          />
          <div>
            <div className={classes.filterLabel}>{t('search:kg.contentFilter')}</div>
            <div className={classes.switchRow}>
              <Switch
                checked={showConceptsOnly}
                onChange={(e) => handleConceptsOnlyToggle(e.currentTarget.checked)}
                label={t('search:kg.showConceptsOnly')}
              />
            </div>
          </div>
        </div>

        {pathError !== null ? (
          <LoadError error={pathError} onRetry={() => setPathNonce((n) => n + 1)} />
        ) : (
          <>
            <div className={classes.list}>
              {filteredNeighbors.length === 0 ? (
                <p className={classes.note}>
                  {neighbors.length === 0
                    ? t('search:kg.noOutgoingLinks')
                    : t('search:kg.noLinksMatch')}
                </p>
              ) : filteredNeighbors.map((n, i) => (
                <div key={i} className={classes.row}>
                  <div className={classes.rowText}>
                    <span className={classes.direction}>{n.direction}</span>
                    <span className={classes.predicate}>{shortPredicate(n.predicate)}</span>
                    <div className={classes.rowLine}>
                      {parseAppEntity(n.display) ? (
                        <AppEntityHover iri={n.display}>{n.display}</AppEntityHover>
                      ) : (
                        <span className={classes.ellipsis} title={n.display}>{n.display}</span>
                      )}
                      <span className={classes.kind}>{n.displayType}</span>
                    </div>
                  </div>
                  {n.stepIsResource && n.stepIri ? (
                    <Button variant="ghost" size="sm" onClick={() => stepTo(n.stepIri!)}>{t('search:kg.step')}</Button>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Resource detail: full description with expanded blank nodes */}
            {path.length >= 1 && (
              <div className={classes.detail}>
                <h3 className={classes.columnTitle}>{t('search:kg.resourceDetail', 'Resource detail')}</h3>
                {resourceDescription == null ? (
                  <p className={classes.note}>{t('search:kg.resourceLoading')}</p>
                ) : resourceDescription.triples.length === 0 ? (
                  <p className={classes.note}>{t('search:kg.noTriples')}</p>
                ) : (
                  <div className={classes.triples}>
                    {resourceDescription.triples.map((trip, idx) => (
                      <div key={idx}>
                        <div className={classes.triple}>
                          <span className={classes.triplePredicate}>{shortPredicate(trip.predicate)}</span>
                          {trip.objectType === 'bnode' && trip.expanded && trip.expanded.length > 0 ? (
                            <span className={classes.cardMuted}>{t('search:kg.blankNodeExpanded')}</span>
                          ) : (
                            <span title={trip.object} className={classes.tripleObject}>{trip.object}</span>
                          )}
                        </div>
                        {trip.objectType === 'bnode' && trip.expanded && trip.expanded.length > 0 && (
                          <div className={classes.expanded}>
                            {trip.expanded.map((sub, j) => (
                              <div key={j} className={classes.triple}>
                                <span className={classes.triplePredicate}>{shortPredicate(sub.predicate)}</span>
                                <span title={sub.object} className={classes.tripleObject}>{sub.object}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Pane>

      {/* SPARQL Query Section - Full Width; off while the SPARQL editor
          isn't an interface option (SPARQL_UI_ENABLED, R57) */}
      {SPARQL_UI_ENABLED && (
        <Pane
          title={t('search:kg.sparql')}
          actions={
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button variant="outline" size="sm">
                  {t('search:kg.examples')}
                  <ChevronDown aria-hidden />
                </Button>
              </Menu.Target>
              <Menu.Dropdown className={classes.examples}>
                {EXAMPLES.map((example) => (
                  <Menu.Item key={example.key} onClick={() => setSparql(example.query)}>{t(example.key)}</Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          }
        >
          <div className={classes.sparqlBody}>
            <p className={classes.paneIntro}>{t('search:kg.sparqlDesc')}</p>
            <Textarea
              value={sparql}
              onChange={(e) => setSparql(e.currentTarget.value)}
              aria-label={t('search:kg.sparql')}
              autosize
              minRows={3}
              maxRows={16}
              className={classes.query}
            />
            <Button onClick={runSparql}>{t('search:kg.runSparql')}</Button>
            {sparqlError !== null && <SparqlError error={sparqlError} />}
            {sparqlRows.length > 0 && (
              <div className={classes.rows}>
                {sparqlRows.map((row, idx) => (
                  <pre key={idx} className={classes.json}>{JSON.stringify(row, null, 2)}</pre>
                ))}
              </div>
            )}
          </div>
        </Pane>
      )}
    </div>
  );
}

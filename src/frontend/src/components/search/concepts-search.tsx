import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Select, UnstyledButton } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { DetailsGrid, Dialog, Pane, PaneStack } from '@/mantine/page';
import { SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import { Shapes, Columns2, FileText, Package, Globe, Link2, Table, Folder, FolderOpen, Box } from 'lucide-react';
import UCAssetLookupDialog from '@/components/data-contracts/uc-asset-lookup-dialog';
import { UCAssetInfo, UCAssetType } from '@/types/uc-asset';
import { LoadError, SearchPane } from './search-pane';
import { asList, localName } from './search-utils';
import classes from './search.module.css';

type ConceptItem = { value: string; label: string; type: 'class' };
type Neighbor = {
  direction: 'outgoing' | 'incoming' | 'predicate';
  predicate: string;
  display: string;
  displayType: 'resource' | 'property' | 'literal';
  stepIri?: string | null;
  stepIsResource?: boolean;
};

type SemanticLink = {
  id: string;
  entity_id: string;
  entity_type: string;
  iri: string;
};

type EnrichedSemanticLink = SemanticLink & {
  entity_name?: string;
};

interface ConceptsSearchProps {
  initialQuery?: string;
  initialSelectedConcept?: ConceptItem | null;
}

const UC_TYPES = ['uc_catalog', 'uc_schema', 'uc_table'];

/**
 * The Concepts tab of Search (/concepts/search), on the page kit (wave 2
 * Task 13b): the search pane, then the selected concept (its IRI and
 * attributes, with Assign to Concept) and its relations in three columns.
 * The Assign dialog and the UC asset lookup it opens are kit Dialogs.
 */
export default function ConceptsSearch({
  initialQuery = '',
  initialSelectedConcept = null
}: ConceptsSearchProps) {
  const { get, post } = useApi();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(['search', 'common']);
  const { hasPermission } = usePermissions();
  // Linking a concept to an object writes: POST /api/semantic-links/ needs
  // semantic-models READ_WRITE (semantic_links_routes.py)
  const canLink = hasPermission('semantic-models', FeatureAccessLevel.READ_WRITE);

  const [conceptSearchQuery, setConceptSearchQuery] = useState(initialQuery);
  const [conceptSearchResults, setConceptSearchResults] = useState<ConceptItem[]>([]);
  const [isConceptDropdownOpen, setIsConceptDropdownOpen] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<ConceptItem | null>(initialSelectedConcept);
  const [conceptIri, setConceptIri] = useState('');
  const [conceptLabel, setConceptLabel] = useState('');
  const [conceptNeighbors, setConceptNeighbors] = useState<Neighbor[]>([]);
  const [semanticLinks, setSemanticLinks] = useState<EnrichedSemanticLink[]>([]);

  // The search's state: the query it last answered, its error, a retry nonce,
  // and the text a selection put in the field (no "no results" for that)
  const [answeredQuery, setAnsweredQuery] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNonce, setSearchNonce] = useState(0);
  const [selectionText, setSelectionText] = useState<string | null>(null);
  const searchSeq = useRef(0);
  // The selected concept's details: a failed load's error; a newer selection wins
  const [detailError, setDetailError] = useState<string | null>(null);
  const selectSeq = useRef(0);

  // Assign to Object dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<string>('');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [availableEntities, setAvailableEntities] = useState<any[]>([]);
  const [ucTableDialogOpen, setUCTableDialogOpen] = useState(false);

  // Update URL when state changes - only manages concepts-specific params
  const updateUrl = (updates: Partial<{
    query: string;
    conceptIri: string;
  }>) => {
    const params = new URLSearchParams();

    // Get current values from URL for params we're not updating
    const currentParams = new URLSearchParams(location.search);
    const currentQuery = updates.query !== undefined ? updates.query : currentParams.get('query') || '';
    const currentIri = updates.conceptIri !== undefined ? updates.conceptIri : currentParams.get('iri') || '';

    if (currentQuery) {
      params.set('query', currentQuery);
    }
    if (currentIri) {
      params.set('iri', currentIri);
    }

    const queryString = params.toString();
    const newUrl = queryString ? `${location.pathname}?${queryString}` : location.pathname;
    navigate(newUrl, { replace: true });
  };

  // Load initial state from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlQuery = params.get('query');
    const urlIri = params.get('iri');

    if (urlQuery && urlQuery !== initialQuery) {
      setConceptSearchQuery(urlQuery);
    }

    if (urlIri) {
      // Load concept from IRI using the exact IRI endpoint
      const loadConceptFromIri = async () => {
        try {
          const res = await get<{ concept: any }>(`/api/semantic-models/concepts/by-iri?iri=${encodeURIComponent(urlIri)}`);
          if (res.data && res.data.concept) {
            const concept = res.data.concept;
            const conceptItem: ConceptItem = {
              value: concept.iri,
              label: concept.label || concept.iri.split(/[/#]/).pop() || concept.iri,
              type: 'class'
            };
            await selectConcept(conceptItem);
          }
        } catch (error) {
          console.error('Error loading concept from URL:', error);
        }
      };
      loadConceptFromIri();
    }
  }, [location.search]);

  // Search concepts as user types
  useEffect(() => {
    // A newer query (or Retry) wins over an answer still on its way
    const seq = ++searchSeq.current;
    // The text a pick put in the field isn't a search: searching it would
    // only rewrite ?query=, moving the URL under a dialog opened right after
    // the pick (the kit Dialog then gives no focus back, R41)
    if (selectionText !== null && conceptSearchQuery === selectionText) return undefined;
    const searchConcepts = async () => {
      if (!conceptSearchQuery.trim()) {
        setConceptSearchResults([]);
        setIsConceptDropdownOpen(false);
        setSearchError(null);
        setAnsweredQuery(null);
        updateUrl({ query: '' });
        return;
      }

      try {
        const res = await get<ConceptItem[]>(`/api/semantic-models/concepts?q=${encodeURIComponent(conceptSearchQuery)}&limit=50`);
        if (seq !== searchSeq.current) return;
        const results = asList<ConceptItem>(res.data);
        setConceptSearchResults(results);
        setIsConceptDropdownOpen(results.length > 0);
        setSearchError(res.error ? res.error : null);
        setAnsweredQuery(conceptSearchQuery);
        updateUrl({ query: conceptSearchQuery });
      } catch (error) {
        if (seq !== searchSeq.current) return;
        console.error('Error searching concepts:', error);
        setConceptSearchResults([]);
        setIsConceptDropdownOpen(false);
        setSearchError(error instanceof Error ? error.message : '');
      }
    };

    const timer = setTimeout(searchConcepts, 250);
    return () => clearTimeout(timer);
  }, [conceptSearchQuery, searchNonce, selectionText]);

  const clearSearch = () => {
    setConceptSearchQuery('');
    setSelectedConcept(null);
    setConceptIri('');
    setConceptLabel('');
    setConceptNeighbors([]);
    setSemanticLinks([]);
    setIsConceptDropdownOpen(false);
    setSelectionText(null);
    setDetailError(null);
    selectSeq.current++;
    updateUrl({ query: '', conceptIri: '' });
  };

  // Select a concept and load its details
  const selectConcept = async (concept: ConceptItem) => {
    const seq = ++selectSeq.current;
    setSelectedConcept(concept);
    setConceptIri(concept.value);
    setDetailError(null);

    // Use label if available, otherwise extract last part of IRI
    let displayLabel = concept.label;
    if (!displayLabel || displayLabel.trim() === concept.value) {
      if (concept.value.includes('#')) {
        displayLabel = concept.value.split('#').pop() || concept.value;
      } else if (concept.value.includes('/')) {
        displayLabel = concept.value.split('/').pop() || concept.value;
      } else {
        displayLabel = concept.value;
      }
    }

    setConceptLabel(displayLabel);
    setConceptSearchQuery(`${displayLabel} - ${concept.value}`);
    setSelectionText(`${displayLabel} - ${concept.value}`);
    setIsConceptDropdownOpen(false);
    updateUrl({ conceptIri: concept.value });

    let failure: string | null = null;

    // Load neighbors for this concept
    try {
      const res = await get<Neighbor[]>(`/api/semantic-models/neighbors?iri=${encodeURIComponent(concept.value)}&limit=200`);
      if (seq !== selectSeq.current) return;
      if (res.error) failure = res.error;
      setConceptNeighbors(asList<Neighbor>(res.data));
    } catch (error) {
      if (seq !== selectSeq.current) return;
      console.error('Error loading neighbors:', error);
      failure = error instanceof Error ? error.message : '';
      setConceptNeighbors([]);
    }

    // Load semantic links (catalog objects linked to this concept)
    try {
      // Query-param form: proxy-safe for IRIs containing ``//`` (see by-iri route).
      const res = await get<SemanticLink[]>(`/api/semantic-links/by-iri?iri=${encodeURIComponent(concept.value)}`);
      if (res.error) failure = failure ?? res.error;
      const links = asList<SemanticLink>(res.data);

      // Enrich semantic links with entity names
      const enrichedLinks = await enrichSemanticLinksWithNames(links);
      if (seq !== selectSeq.current) return;
      setSemanticLinks(enrichedLinks);
    } catch (error) {
      if (seq !== selectSeq.current) return;
      console.error('Error loading semantic links:', error);
      failure = failure ?? (error instanceof Error ? error.message : '');
      setSemanticLinks([]);
    }

    if (seq === selectSeq.current) setDetailError(failure);
  };

  // Navigate to a related concept (parent/subclass)
  const navigateToConcept = async (iri: string) => {
    const label = conceptNeighbors.find(n => n.stepIri === iri)?.display || iri.split('/').pop() || iri.split('#').pop() || iri;
    const conceptItem: ConceptItem = {
      value: iri,
      label: label,
      type: 'class'
    };
    await selectConcept(conceptItem);
  };

  // Get parent classes from neighbors
  const getParentClasses = () => {
    return conceptNeighbors.filter(n =>
      n.direction === 'outgoing' &&
      (n.predicate.includes('subClassOf') || n.predicate.includes('rdfs:subClassOf')) &&
      n.stepIsResource
    );
  };

  // Get subclasses from neighbors
  const getSubclasses = () => {
    return conceptNeighbors.filter(n =>
      n.direction === 'incoming' &&
      (n.predicate.includes('subClassOf') || n.predicate.includes('rdfs:subClassOf')) &&
      n.stepIsResource
    );
  };

  // Get related properties
  const getRelatedProperties = () => {
    return conceptNeighbors.filter(n =>
      n.displayType === 'property' ||
      n.predicate.includes('domain') ||
      n.predicate.includes('range')
    );
  };

  // Get linked catalog objects from semantic links
  const getCatalogObjects = () => {
    return semanticLinks;
  };

  // Enrich semantic links with readable entity names
  const enrichSemanticLinksWithNames = async (links: SemanticLink[]): Promise<EnrichedSemanticLink[]> => {
    const enrichedLinks: EnrichedSemanticLink[] = [];

    for (const link of links) {
      try {
        let entityName = link.entity_id;
        let endpoint = '';

        switch (link.entity_type) {
          case 'data_product':
            endpoint = `/api/data-products/${link.entity_id}`;
            break;
          case 'data_contract':
            endpoint = `/api/data-contracts/${link.entity_id}`;
            break;
          case 'data_domain':
            endpoint = `/api/data-domains/${link.entity_id}`;
            break;
          case 'asset':
            endpoint = `/api/assets/${link.entity_id}`;
            break;
          case 'data_contract_schema': {
            const [contractId, schemaName] = String(link.entity_id).split('#');
            if (contractId) {
              const contractRes = await get<any>(`/api/data-contracts/${contractId}`);
              const contractTitle = contractRes.data?.name || contractRes.data?.info?.title || contractId;
              entityName = `${contractTitle}#${schemaName || ''}`.trim();
            }
            enrichedLinks.push({ ...link, entity_name: entityName });
            continue;
          }
          case 'data_contract_property': {
            const [contractId, schemaName, propertyName] = String(link.entity_id).split('#');
            if (contractId) {
              const contractRes = await get<any>(`/api/data-contracts/${contractId}`);
              const contractTitle = contractRes.data?.name || contractRes.data?.info?.title || contractId;
              entityName = `${contractTitle}#${schemaName || ''}.${propertyName || ''}`.trim();
            }
            enrichedLinks.push({ ...link, entity_name: entityName });
            continue;
          }
          case 'uc_catalog':
          case 'uc_schema':
          case 'uc_table':
          case 'uc_column':
            entityName = link.entity_id;
            enrichedLinks.push({ ...link, entity_name: entityName });
            continue;
          default:
            enrichedLinks.push({ ...link, entity_name: link.entity_id });
            continue;
        }

        const entityRes = await get<any>(endpoint);
        if (entityRes.data && !entityRes.error) {
          entityName = entityRes.data.name || entityRes.data.info?.title || entityRes.data.title || link.entity_id;
        }

        enrichedLinks.push({ ...link, entity_name: entityName });
      } catch (error) {
        console.error("Error fetching details for", link.entity_type, ":", link.entity_id, error);
        enrichedLinks.push({ ...link, entity_name: link.entity_id });
      }
    }

    return enrichedLinks;
  };

  // Load entities for assignment
  const loadEntitiesForType = async (entityType: string) => {
    if (UC_TYPES.includes(entityType)) return;
    try {
      let endpoint = '';
      switch (entityType) {
        case 'data_product':
          endpoint = '/api/data-products';
          break;
        case 'data_contract':
          endpoint = '/api/data-contracts';
          break;
        case 'data_domain':
          endpoint = '/api/data-domains';
          break;
        case 'asset': {
          // /api/assets returns a paginated envelope {items, total, ...} — unwrap to a flat list.
          const res = await get<{ items: any[]; total: number }>('/api/assets?limit=200');
          setAvailableEntities(asList(res.data?.items));
          return;
        }
        default:
          return;
      }

      const res = await get<any[]>(endpoint);
      setAvailableEntities(asList(res.data));
    } catch (error) {
      console.error('Error loading entities:', error);
      setAvailableEntities([]);
    }
  };

  // Handle entity type selection
  const handleEntityTypeChange = (entityType: string) => {
    setSelectedEntityType(entityType);
    setSelectedEntityId('');
    loadEntitiesForType(entityType);
  };

  // Navigate to entity detail page
  const navigateToEntity = (link: EnrichedSemanticLink) => {
    let path = '';
    switch (link.entity_type) {
      case 'data_product':
        path = `/data-products/${link.entity_id}`;
        break;
      case 'data_contract':
        path = `/data-contracts/${link.entity_id}`;
        break;
      case 'data_domain':
        path = `/settings/data-domains/${link.entity_id}`;
        break;
      case 'asset':
        path = `/assets/${link.entity_id}`;
        break;
      case 'uc_catalog':
      case 'uc_schema':
      case 'uc_table':
      case 'uc_column': {
        navigate(`/catalog-commander`);
        const ucLabel = link.entity_type === 'uc_catalog' ? t('search:concepts.linkedUCCatalog')
          : link.entity_type === 'uc_schema' ? t('search:concepts.linkedUCSchema')
          : link.entity_type === 'uc_column' ? t('search:concepts.linkedUCColumn')
          : t('search:concepts.linkedUCTable');
        toast({
          title: ucLabel,
          description: link.entity_name || link.entity_id
        });
        return;
      }
      default:
        toast({
          title: t('common:toast.error'),
          description: t('search:concepts.messages.navigationError', { entityType: link.entity_type }),
          variant: 'destructive'
        });
        return;
    }
    navigate(path);
  };

  const getEntityTypeLabel = (entityType: string) => {
    switch (entityType) {
      case 'data_product': return t('search:concepts.assignDialog.dataProduct');
      case 'data_contract': return t('search:concepts.assignDialog.dataContract');
      case 'data_domain': return t('search:concepts.assignDialog.dataDomain');
      case 'asset': return t('search:concepts.assignDialog.asset', { defaultValue: 'Asset' });
      case 'uc_catalog': return t('search:concepts.assignDialog.ucCatalog');
      case 'uc_schema': return t('search:concepts.assignDialog.ucSchema');
      case 'uc_table': return t('search:concepts.assignDialog.ucTable');
      default: return entityType;
    }
  };

  const handleUCAssetSelect = (asset: UCAssetInfo) => {
    if (!selectedConcept || !selectedEntityType) return;
    const ucType = selectedEntityType as 'uc_catalog' | 'uc_schema' | 'uc_table';
    if (ucType !== 'uc_catalog' && ucType !== 'uc_schema' && ucType !== 'uc_table') return;

    post('/api/semantic-links/', {
      entity_id: asset.full_name,
      entity_type: ucType,
      iri: selectedConcept.value
    })
      .then((res) => {
        if (res.error) throw new Error(res.error);
        toast({
          title: t('common:toast.success'),
          description: t('search:concepts.messages.linkedSuccess', {
            label: selectedConcept.label,
            entityType: getEntityTypeLabel(ucType),
            entityId: asset.full_name
          })
        });
        setAssignDialogOpen(false);
        setUCTableDialogOpen(false);
        setSelectedEntityType('');
        selectConcept(selectedConcept);
      })
      .catch((err: any) => {
        toast({
          title: t('common:toast.error'),
          description: err.message || t('search:concepts.messages.assignFailed'),
          variant: 'destructive'
        });
      });
  };

  // Create semantic link (for dropdown-selected entities: data_product, data_contract, data_domain)
  const handleAssignToObject = async () => {
    if (!selectedConcept || !selectedEntityType || !selectedEntityId) {
      toast({
        title: t('common:toast.error'),
        description: t('search:concepts.messages.assignError'),
        variant: 'destructive'
      });
      return;
    }

    try {
      const res = await post('/api/semantic-links/', {
        entity_id: selectedEntityId,
        entity_type: selectedEntityType,
        iri: selectedConcept.value,
      });

      if (res.error) {
        throw new Error(res.error);
      }

      toast({
        title: t('common:toast.success'),
        description: t('search:concepts.messages.linkedSuccess', {
          label: selectedConcept.label,
          entityType: getEntityTypeLabel(selectedEntityType),
          entityId: selectedEntityId
        }),
      });

      setAssignDialogOpen(false);
      setSelectedEntityType('');
      setSelectedEntityId('');

      await selectConcept(selectedConcept);
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error.message || t('search:concepts.messages.assignFailed'),
        variant: 'destructive'
      });
    }
  };

  const linkIcon = (entityType: string) =>
    entityType === 'data_contract'
      ? FileText
      : entityType === 'data_product'
      ? Package
      : entityType === 'data_domain'
      ? Globe
      : entityType === 'asset'
      ? Box
      : entityType === 'uc_catalog'
      ? Folder
      : entityType === 'uc_schema'
      ? FolderOpen
      : entityType === 'uc_table' || entityType === 'uc_column'
      ? Table
      : entityType === 'data_contract_schema'
      ? Shapes
      : entityType === 'data_contract_property'
      ? Columns2
      : FileText;

  const linkTypeLabel = (entityType: string) =>
    entityType === 'uc_catalog'
      ? t('search:concepts.linkedUCCatalog')
      : entityType === 'uc_schema'
      ? t('search:concepts.linkedUCSchema')
      : entityType === 'uc_table'
      ? t('search:concepts.linkedUCTable')
      : entityType === 'uc_column'
      ? t('search:concepts.linkedUCColumn')
      : entityType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const literalAttributes = conceptNeighbors.filter(n =>
    n.direction === 'outgoing' &&
    n.displayType === 'literal' &&
    !n.predicate.includes('subClassOf') &&
    !n.predicate.includes('type')
  );

  const hierarchyChips = (items: Neighbor[]) =>
    items.map((item, idx) => (
      <UnstyledButton
        key={idx}
        className={classes.chip}
        onClick={() => item.stepIri && navigateToConcept(item.stepIri)}
        title={item.stepIri || item.display}
      >
        <Shapes aria-hidden size={12} />
        <span className={classes.ellipsis}>{localName(item.display)}</span>
      </UnstyledButton>
    ));

  const isUcType = UC_TYPES.includes(selectedEntityType);
  const showingSelection = selectionText !== null && conceptSearchQuery === selectionText;
  const noResults =
    !showingSelection &&
    conceptSearchQuery.trim() !== '' &&
    answeredQuery === conceptSearchQuery &&
    searchError === null &&
    conceptSearchResults.length === 0;
  const title = conceptLabel || selectedConcept?.label || '';

  const entityTypeOptions = [
    { value: 'data_product', label: t('search:concepts.assignDialog.dataProduct') },
    { value: 'data_contract', label: t('search:concepts.assignDialog.dataContract') },
    { value: 'data_domain', label: t('search:concepts.assignDialog.dataDomain') },
    { value: 'asset', label: t('search:concepts.assignDialog.asset', { defaultValue: 'Asset' }) },
    { value: 'uc_catalog', label: t('search:concepts.assignDialog.ucCatalog') },
    { value: 'uc_schema', label: t('search:concepts.assignDialog.ucSchema') },
    { value: 'uc_table', label: t('search:concepts.assignDialog.ucTable') },
  ];
  const entityOptions = uniqueOptions(
    availableEntities
      .filter((entity) => entity && entity.id != null)
      .map((entity) => ({ value: String(entity.id), label: entity.name || entity.info?.title || entity.title || String(entity.id) })),
  );

  return (
    <>
      <PaneStack>
        <SearchPane
          paneLabel={t('search:concepts.searchPane', 'Concept search')}
          intro={t('search:concepts.searchAndSelect')}
          placeholder={t('search:concepts.searchPlaceholder')}
          query={conceptSearchQuery}
          onQueryChange={setConceptSearchQuery}
          onFocus={() => setIsConceptDropdownOpen(conceptSearchResults.length > 0)}
          results={conceptSearchResults}
          open={isConceptDropdownOpen}
          onPick={(result) => selectConcept(result as ConceptItem)}
          icon={<Shapes aria-hidden size={14} />}
          showClear={!!(conceptSearchQuery || selectedConcept)}
          clearLabel={t('search:concepts.clear')}
          onClear={clearSearch}
          noResults={noResults}
          error={searchError}
          onRetry={() => setSearchNonce((n) => n + 1)}
        />

        {/* Selected Concept Details: its IRI and every assigned literal */}
        {selectedConcept && (
          <Pane
            title={title}
            titleTooltip
            actions={
              canLink ? (
                <Button variant="outline" onClick={() => setAssignDialogOpen(true)} disabled={!selectedConcept}>
                  <Link2 aria-hidden />
                  {t('search:concepts.assignToConcept')}
                </Button>
              ) : undefined
            }
          >
            <p className={classes.iri}>
              <Shapes aria-hidden size={14} />
              <span>{conceptIri}</span>
            </p>
            {detailError !== null ? (
              <LoadError error={detailError} onRetry={() => selectConcept(selectedConcept)} />
            ) : literalAttributes.length > 0 ? (
              <DetailsGrid
                rows={literalAttributes.map((prop) => ({
                  label: prop.predicate.split('/').pop()?.split('#').pop() || prop.predicate,
                  value: <span className={classes.value}>{prop.display}</span>,
                }))}
              />
            ) : null}
          </Pane>
        )}

        {/* The hierarchy, the properties and the linked objects, side by side */}
        {selectedConcept && detailError === null && (
          <Pane flush aria-label={t('search:concepts.relationsPane', 'Concept relations')}>
            <div className={classes.columns}>
              <div className={classes.column}>
                <h3 className={classes.columnTitle}>{t('search:concepts.conceptHierarchy')}</h3>
                <div className={classes.group}>
                  <h4 className={classes.subTitle}>{t('search:concepts.parentClasses')}</h4>
                  {getParentClasses().length === 0 ? (
                    <p className={classes.note}>{t('search:concepts.noParentClasses')}</p>
                  ) : (
                    <div className={classes.chips}>{hierarchyChips(getParentClasses())}</div>
                  )}
                </div>
                <div className={classes.group}>
                  <h4 className={classes.subTitle}>{t('search:concepts.subclasses')}</h4>
                  {getSubclasses().length === 0 ? (
                    <p className={classes.note}>{t('search:concepts.noSubclasses')}</p>
                  ) : (
                    <div className={classes.chips}>{hierarchyChips(getSubclasses())}</div>
                  )}
                </div>
              </div>

              <div className={classes.column}>
                <h3 className={classes.columnTitle}>{t('search:concepts.relatedProperties')}</h3>
                {getRelatedProperties().length === 0 ? (
                  <p className={classes.note}>{t('search:concepts.noRelatedProperties')}</p>
                ) : (
                  <div className={classes.chips}>
                    {getRelatedProperties().map((prop, idx) => (
                      <span key={idx} className={classes.chip} data-plain="" title={prop.display}>
                        <Columns2 aria-hidden size={12} />
                        <span className={classes.ellipsis}>{localName(prop.display)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className={classes.column}>
                <h3 className={classes.columnTitle}>{t('search:concepts.linkedCatalogObjects')}</h3>
                {getCatalogObjects().length === 0 ? (
                  <p className={classes.note}>{t('search:concepts.noCatalogObjects')}</p>
                ) : (
                  <div className={classes.chips}>
                    {getCatalogObjects().map((link) => {
                      const typeLabel = linkTypeLabel(link.entity_type);
                      const Icon = linkIcon(link.entity_type);
                      return (
                        <UnstyledButton
                          key={link.id}
                          className={classes.chip}
                          onClick={() => navigateToEntity(link)}
                          title={`${typeLabel}: ${link.entity_name || link.entity_id} • ${link.iri}`}
                        >
                          <Icon aria-hidden size={12} />
                          <span className={classes.ellipsis}>{typeLabel}: {link.entity_name || link.entity_id}</span>
                        </UnstyledButton>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </Pane>
        )}
      </PaneStack>

      {/* Assign to Concept Dialog */}
      <Dialog
        opened={assignDialogOpen}
        onClose={() => setAssignDialogOpen(false)}
        title={t('search:concepts.assignDialog.title')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              {t('common:actions.cancel')}
            </Button>
            {!isUcType && (
              <Button onClick={handleAssignToObject} disabled={!selectedEntityType || !selectedEntityId}>
                {t('common:actions.assign')}
              </Button>
            )}
          </>
        }
      >
        <div className={form.form}>
          {selectedConcept && (
            <div className={form.box}>
              <span className={form.strong}>{selectedConcept.label}</span>
              <span className={form.code}>{selectedConcept.value}</span>
            </div>
          )}

          <Select
            label={t('search:concepts.assignDialog.entityType')}
            placeholder={t('search:concepts.assignDialog.selectEntityType')}
            data={entityTypeOptions}
            value={selectedEntityType || null}
            onChange={(value) => value && handleEntityTypeChange(value)}
            allowDeselect={false}
            classNames={SELECT_CLASSES}
          />

          {isUcType && (
            <Button variant="outline" className={form.fullWidth} onClick={() => setUCTableDialogOpen(true)}>
              {selectedEntityType === 'uc_catalog' && <Folder aria-hidden />}
              {selectedEntityType === 'uc_schema' && <FolderOpen aria-hidden />}
              {selectedEntityType === 'uc_table' && <Table aria-hidden />}
              {selectedEntityType === 'uc_catalog' && t('search:concepts.assignDialog.browseUCCatalog')}
              {selectedEntityType === 'uc_schema' && t('search:concepts.assignDialog.browseUCSchema')}
              {selectedEntityType === 'uc_table' && t('search:concepts.assignDialog.browseUCTable')}
            </Button>
          )}

          {selectedEntityType && !isUcType && (
            <Select
              label={getEntityTypeLabel(selectedEntityType)}
              placeholder={t('search:concepts.assignDialog.selectEntity', {
                entityType: getEntityTypeLabel(selectedEntityType)
              })}
              data={entityOptions}
              value={selectedEntityId || null}
              onChange={(value) => value && setSelectedEntityId(value)}
              allowDeselect={false}
              classNames={SELECT_CLASSES}
            />
          )}
        </div>
      </Dialog>

      <UCAssetLookupDialog
        isOpen={ucTableDialogOpen}
        onOpenChange={setUCTableDialogOpen}
        onSelect={handleUCAssetSelect}
        title={
          selectedEntityType === 'uc_catalog' ? t('search:concepts.assignDialog.ucCatalogTitle') :
          selectedEntityType === 'uc_schema' ? t('search:concepts.assignDialog.ucSchemaTitle') :
          t('search:concepts.assignDialog.ucTableTitle')
        }
        allowedTypes={
          selectedEntityType === 'uc_table'
            ? [UCAssetType.TABLE, UCAssetType.VIEW, UCAssetType.MATERIALIZED_VIEW, UCAssetType.STREAMING_TABLE]
            : undefined
        }
        selectableTypes={
          selectedEntityType === 'uc_catalog' ? [UCAssetType.CATALOG] :
          selectedEntityType === 'uc_schema' ? [UCAssetType.SCHEMA] :
          undefined
        }
        includeColumns={false}
      />
    </>
  );
}

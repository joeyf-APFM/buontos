import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Select } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { DetailsGrid, Dialog, Pane, PaneStack } from '@/mantine/page';
import { SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import { Columns2, FileText, Shapes, Link2, Box } from 'lucide-react';
import UCAssetLookupDialog from '@/components/data-contracts/uc-asset-lookup-dialog';
import { UCAssetInfo, UCAssetType } from '@/types/uc-asset';
import { LoadError, SearchPane } from './search-pane';
import { asList } from './search-utils';
import classes from './search.module.css';

type PropertyItem = { value: string; label: string; type: 'property' };
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

interface PropertiesSearchProps {
  initialQuery?: string;
  initialSelectedProperty?: PropertyItem | null;
}

/**
 * The Properties tab of Search (/concepts/search), on the page kit (wave 2
 * Task 13b): the search pane, then the selected property (its IRI and
 * attributes, with Assign to Property) and its links (domain and range, and
 * the linked catalog objects). The Assign dialog and the UC asset lookup it
 * opens are kit Dialogs.
 */
export default function PropertiesSearch({
  initialQuery = '',
  initialSelectedProperty = null
}: PropertiesSearchProps) {
  const { get, post } = useApi();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(['search', 'common']);
  const { hasPermission } = usePermissions();
  // Linking a property to an object writes: POST /api/semantic-links/ needs
  // semantic-models READ_WRITE (semantic_links_routes.py)
  const canLink = hasPermission('semantic-models', FeatureAccessLevel.READ_WRITE);

  const [propertySearchQuery, setPropertySearchQuery] = useState(initialQuery);
  const [propertySearchResults, setPropertySearchResults] = useState<PropertyItem[]>([]);
  const [isPropertyDropdownOpen, setIsPropertyDropdownOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyItem | null>(initialSelectedProperty);
  const [propertyIri, setPropertyIri] = useState('');
  const [propertyLabel, setPropertyLabel] = useState('');
  const [propertyNeighbors, setPropertyNeighbors] = useState<Neighbor[]>([]);
  const [semanticLinks, setSemanticLinks] = useState<EnrichedSemanticLink[]>([]);

  // The search's state (as on the Concepts tab)
  const [answeredQuery, setAnsweredQuery] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNonce, setSearchNonce] = useState(0);
  const [selectionText, setSelectionText] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const [detailError, setDetailError] = useState<string | null>(null);
  const selectSeq = useRef(0);

  // Assign dialog: target type and selection
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTargetType, setAssignTargetType] = useState<'data_contract_property' | 'uc_column' | 'asset' | ''>('');
  const [contracts, setContracts] = useState<any[]>([]);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [selectedSchemaName, setSelectedSchemaName] = useState('');
  const [selectedPropertyEntityId, setSelectedPropertyEntityId] = useState('');
  const [ucAssetDialogOpen, setUCAssetDialogOpen] = useState(false);
  // Column-like assets (Column / Logical Attribute) for the `asset` target type
  const [columnAssets, setColumnAssets] = useState<Array<{ id: string; name: string; asset_type_name?: string | null; location?: string | null }>>([]);
  const [selectedAssetId, setSelectedAssetId] = useState('');

  const updateUrl = (updates: Partial<{ query: string; iri: string }>) => {
    const params = new URLSearchParams();
    const currentParams = new URLSearchParams(location.search);
    const currentQuery = updates.query !== undefined ? updates.query : currentParams.get('query') || '';
    const currentIri = updates.iri !== undefined ? updates.iri : currentParams.get('iri') || '';

    if (currentQuery) params.set('query', currentQuery);
    if (currentIri) params.set('iri', currentIri);

    params.set('tab', 'properties');
    const queryString = params.toString();
    navigate(`${location.pathname}?${queryString}`, { replace: true });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlQuery = params.get('query');
    const urlIri = params.get('iri');

    if (urlQuery && urlQuery !== initialQuery) {
      setPropertySearchQuery(urlQuery);
    }

    if (urlIri) {
      const loadPropertyFromIri = async () => {
        try {
          const res = await get<PropertyItem[]>(`/api/semantic-models/properties?q=${encodeURIComponent(urlIri)}&limit=10`);
          const match = asList<PropertyItem>(res.data).find((p: PropertyItem) => p.value === urlIri);
          if (match) {
            await selectProperty(match);
          } else {
            const item: PropertyItem = {
              value: urlIri,
              label: urlIri.split(/[/#]/).pop() || urlIri,
              type: 'property'
            };
            await selectProperty(item);
          }
        } catch (error) {
          console.error('Error loading property from URL:', error);
        }
      };
      loadPropertyFromIri();
    }
  }, [location.search]);

  useEffect(() => {
    // A newer query (or Retry) wins over an answer still on its way
    const seq = ++searchSeq.current;
    const searchProperties = async () => {
      if (!propertySearchQuery.trim()) {
        setPropertySearchResults([]);
        setIsPropertyDropdownOpen(false);
        setSearchError(null);
        setAnsweredQuery(null);
        updateUrl({ query: '' });
        return;
      }

      try {
        const res = await get<PropertyItem[]>(`/api/semantic-models/properties?q=${encodeURIComponent(propertySearchQuery)}&limit=50`);
        if (seq !== searchSeq.current) return;
        const results = asList<PropertyItem>(res.data);
        setPropertySearchResults(results);
        setIsPropertyDropdownOpen(results.length > 0);
        setSearchError(res.error ? res.error : null);
        setAnsweredQuery(propertySearchQuery);
        updateUrl({ query: propertySearchQuery });
      } catch (error) {
        if (seq !== searchSeq.current) return;
        console.error('Error searching properties:', error);
        setPropertySearchResults([]);
        setIsPropertyDropdownOpen(false);
        setSearchError(error instanceof Error ? error.message : '');
      }
    };

    const timer = setTimeout(searchProperties, 250);
    return () => clearTimeout(timer);
  }, [propertySearchQuery, searchNonce]);

  const clearSearch = () => {
    setPropertySearchQuery('');
    setSelectedProperty(null);
    setPropertyIri('');
    setPropertyLabel('');
    setPropertyNeighbors([]);
    setSemanticLinks([]);
    setIsPropertyDropdownOpen(false);
    setSelectionText(null);
    setDetailError(null);
    selectSeq.current++;
    updateUrl({ query: '', iri: '' });
  };

  const selectProperty = async (property: PropertyItem) => {
    const seq = ++selectSeq.current;
    setSelectedProperty(property);
    setPropertyIri(property.value);
    setDetailError(null);

    let displayLabel = property.label;
    if (!displayLabel || displayLabel.trim() === property.value) {
      displayLabel = property.value.includes('#') ? property.value.split('#').pop()! : property.value.split('/').pop() || property.value;
    }

    setPropertyLabel(displayLabel);
    setPropertySearchQuery(`${displayLabel} - ${property.value}`);
    setSelectionText(`${displayLabel} - ${property.value}`);
    setIsPropertyDropdownOpen(false);
    updateUrl({ iri: property.value });

    let failure: string | null = null;

    try {
      const res = await get<Neighbor[]>(`/api/semantic-models/neighbors?iri=${encodeURIComponent(property.value)}&limit=200`);
      if (seq !== selectSeq.current) return;
      if (res.error) failure = res.error;
      setPropertyNeighbors(asList<Neighbor>(res.data));
    } catch (error) {
      if (seq !== selectSeq.current) return;
      console.error('Error loading neighbors:', error);
      failure = error instanceof Error ? error.message : '';
      setPropertyNeighbors([]);
    }

    try {
      // Query-param form: proxy-safe for IRIs containing ``//`` (see by-iri route).
      const res = await get<SemanticLink[]>(`/api/semantic-links/by-iri?iri=${encodeURIComponent(property.value)}`);
      if (res.error) failure = failure ?? res.error;
      const links = asList<SemanticLink>(res.data);
      const enriched = await enrichSemanticLinksWithNames(links);
      if (seq !== selectSeq.current) return;
      setSemanticLinks(enriched);
    } catch (error) {
      if (seq !== selectSeq.current) return;
      console.error('Error loading semantic links:', error);
      failure = failure ?? (error instanceof Error ? error.message : '');
      setSemanticLinks([]);
    }

    if (seq === selectSeq.current) setDetailError(failure);
  };

  const enrichSemanticLinksWithNames = async (links: SemanticLink[]): Promise<EnrichedSemanticLink[]> => {
    const result: EnrichedSemanticLink[] = [];

    for (const link of links) {
      let entityName = link.entity_id;
      try {
        if (link.entity_type === 'data_contract_property') {
          const [contractId, schemaName, propName] = String(link.entity_id).split('#');
          if (contractId) {
            const contractRes = await get<any>(`/api/data-contracts/${contractId}`);
            const contractTitle = contractRes.data?.name || contractRes.data?.info?.title || contractId;
            entityName = `${contractTitle}#${schemaName || ''}.${propName || ''}`.trim();
          }
        } else if (link.entity_type === 'uc_column') {
          entityName = link.entity_id;
        } else if (link.entity_type === 'data_contract') {
          const contractRes = await get<any>(`/api/data-contracts/${link.entity_id}`);
          entityName = contractRes.data?.name || contractRes.data?.info?.title || link.entity_id;
        } else if (link.entity_type === 'asset') {
          const assetRes = await get<any>(`/api/assets/${link.entity_id}`);
          entityName = assetRes.data?.name || link.entity_id;
        }
        result.push({ ...link, entity_name: entityName });
      } catch (error) {
        console.error('Error fetching details for', link.entity_type, link.entity_id, error);
        result.push({ ...link, entity_name: link.entity_id });
      }
    }
    return result;
  };

  const getLiteralAttributes = () => {
    return propertyNeighbors.filter(
      (n) => n.direction === 'outgoing' && n.displayType === 'literal' && !n.predicate.includes('type')
    );
  };

  const getDomainRange = () => {
    return propertyNeighbors.filter(
      (n) =>
        n.displayType === 'resource' &&
        (n.predicate.includes('domain') || n.predicate.includes('range'))
    );
  };

  // Load contracts for assign dialog
  useEffect(() => {
    if (assignTargetType === 'data_contract_property') {
      get<any[]>('/api/data-contracts')
        .then((res) => setContracts(asList(res.data)))
        .catch(() => setContracts([]));
    } else if (assignTargetType === 'asset') {
      // Restrict to column-like asset types — rdf:Property only makes sense for these.
      const typeFilter = encodeURIComponent('Column,Logical Attribute');
      get<{ items: any[]; total: number }>(`/api/assets?asset_type_names=${typeFilter}&limit=200`)
        .then((res) => setColumnAssets(asList(res.data?.items)))
        .catch(() => setColumnAssets([]));
    }
  }, [assignTargetType]);

  const [selectedContractDetail, setSelectedContractDetail] = useState<any>(null);

  useEffect(() => {
    if (!selectedContractId) {
      setSelectedContractDetail(null);
      return;
    }
    // A newer contract wins over an answer still on its way
    let current = true;
    get<any>(`/api/data-contracts/${selectedContractId}`)
      .then((res) => { if (current) setSelectedContractDetail(res.data); })
      .catch(() => { if (current) setSelectedContractDetail(null); });
    return () => { current = false; };
  }, [selectedContractId]);

  type SchemaObject = { name?: string; physical_name?: string; properties?: unknown };
  const schemaObjects = asList<SchemaObject>(selectedContractDetail?.schema_objects);
  const schemas = schemaObjects.map((s) => ({ name: s.name || s.physical_name }));
  const selectedSchema = schemaObjects.find((s) => (s.name || s.physical_name) === selectedSchemaName);
  const properties = asList<{ name: string }>(selectedSchema?.properties);

  const handleAssignTargetTypeChange = (v: string) => {
    setAssignTargetType(v as 'data_contract_property' | 'uc_column' | 'asset');
    setSelectedContractId('');
    setSelectedSchemaName('');
    setSelectedPropertyEntityId('');
    setSelectedAssetId('');
  };

  const handleAssign = async () => {
    if (!selectedProperty || !assignTargetType) return;

    let entityId = '';
    const entityType: 'data_contract_property' | 'uc_column' | 'asset' = assignTargetType as any;

    if (assignTargetType === 'data_contract_property') {
      entityId = selectedPropertyEntityId;
      if (!entityId) {
        toast({
          title: t('common:toast.error'),
          description: t('search:properties.messages.selectPropertyTarget'),
          variant: 'destructive'
        });
        return;
      }
    } else if (assignTargetType === 'asset') {
      entityId = selectedAssetId;
      if (!entityId) {
        toast({
          title: t('common:toast.error'),
          description: t('search:properties.messages.selectPropertyTarget'),
          variant: 'destructive'
        });
        return;
      }
    } else if (assignTargetType === 'uc_column') {
      // uc_column is handled by the UC asset lookup dialog flow
      return;
    }

    try {
      const res = await post('/api/semantic-links/', {
        entity_id: entityId,
        entity_type: entityType,
        iri: selectedProperty.value
      });

      if (res.error) throw new Error(res.error);

      toast({
        title: t('common:toast.success'),
        description: t('search:properties.messages.linkedSuccess')
      });

      setAssignDialogOpen(false);
      setAssignTargetType('');
      setSelectedContractId('');
      setSelectedSchemaName('');
      setSelectedPropertyEntityId('');
      setSelectedAssetId('');
      await selectProperty(selectedProperty);
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error.message || t('search:properties.messages.assignFailed'),
        variant: 'destructive'
      });
    }
  };

  const handleUCColumnSelect = (asset: UCAssetInfo) => {
    if (!asset.column_name || !selectedProperty) return;
    const entityId = asset.full_name;

    post('/api/semantic-links/', {
      entity_id: entityId,
      entity_type: 'uc_column',
      iri: selectedProperty.value
    })
      .then((res) => {
        if (res.error) throw new Error(res.error);
        toast({
          title: t('common:toast.success'),
          description: t('search:properties.messages.linkedSuccess')
        });
        setAssignDialogOpen(false);
        setUCAssetDialogOpen(false);
        selectProperty(selectedProperty);
      })
      .catch((err: any) => {
        toast({
          title: t('common:toast.error'),
          description: err.message || t('search:properties.messages.assignFailed'),
          variant: 'destructive'
        });
      });
  };

  const showingSelection = selectionText !== null && propertySearchQuery === selectionText;
  const noResults =
    !showingSelection &&
    propertySearchQuery.trim() !== '' &&
    answeredQuery === propertySearchQuery &&
    searchError === null &&
    propertySearchResults.length === 0;
  const title = propertyLabel || selectedProperty?.label || '';
  const domainRange = getDomainRange();

  const contractOptions = uniqueOptions(
    contracts.filter((c) => c && c.id != null).map((c) => ({ value: String(c.id), label: c.name || c.info?.title || String(c.id) })),
  );
  const schemaOptions = uniqueOptions(
    schemas.filter((s) => s.name).map((s) => ({ value: String(s.name), label: String(s.name) })),
  );
  const propertyOptions = uniqueOptions(
    properties.map((p) => {
      const entityId = `${selectedContractId}#${selectedSchemaName}#${p.name}`;
      return { value: entityId, label: String(p.name) };
    }),
  );
  const assetOptions = uniqueOptions(
    columnAssets.filter((a) => a && a.id != null).map((a) => ({
      value: String(a.id),
      label: `${a.name}${a.asset_type_name ? ` (${a.asset_type_name})` : ''}`,
    })),
  );

  return (
    <>
      <PaneStack>
        <SearchPane
          paneLabel={t('search:properties.searchPane', 'Property search')}
          intro={t('search:properties.searchAndSelect')}
          placeholder={t('search:properties.searchPlaceholder')}
          query={propertySearchQuery}
          onQueryChange={setPropertySearchQuery}
          onFocus={() => setIsPropertyDropdownOpen(propertySearchResults.length > 0)}
          results={propertySearchResults}
          open={isPropertyDropdownOpen}
          onPick={(result) => selectProperty(result as PropertyItem)}
          icon={<Columns2 aria-hidden size={14} />}
          showClear={!!(propertySearchQuery || selectedProperty)}
          clearLabel={t('search:properties.clear')}
          onClear={clearSearch}
          noResults={noResults}
          error={searchError}
          onRetry={() => setSearchNonce((n) => n + 1)}
        />

        {selectedProperty && (
          <Pane
            title={title}
            titleTooltip
            actions={
              canLink ? (
                <Button variant="outline" onClick={() => setAssignDialogOpen(true)} disabled={!selectedProperty}>
                  <Link2 aria-hidden />
                  {t('search:properties.assignToProperty')}
                </Button>
              ) : undefined
            }
          >
            <p className={classes.iri}>
              <Columns2 aria-hidden size={14} />
              <span>{propertyIri}</span>
            </p>
            {detailError !== null ? (
              <LoadError error={detailError} onRetry={() => selectProperty(selectedProperty)} />
            ) : getLiteralAttributes().length > 0 ? (
              <DetailsGrid
                rows={getLiteralAttributes().map((prop) => ({
                  label: prop.predicate.split('/').pop()?.split('#').pop() || prop.predicate,
                  value: <span className={classes.value}>{prop.display}</span>,
                }))}
              />
            ) : null}
          </Pane>
        )}

        {selectedProperty && detailError === null && (
          <Pane flush aria-label={t('search:properties.relationsPane', 'Property links')}>
            <div className={classes.columns} style={{ '--columns': domainRange.length > 0 ? 2 : 1 } as CSSProperties}>
              {domainRange.length > 0 && (
                <div className={classes.column}>
                  <h3 className={classes.columnTitle}>{t('search:properties.domainRange')}</h3>
                  <div className={classes.chips}>
                    {domainRange.map((n, idx) => {
                      const text = `${n.predicate.split('#').pop() || n.predicate}: ${n.display.split('#').pop() || n.display}`;
                      return (
                        <span key={idx} className={classes.chip} data-plain="" title={text}>
                          <span className={classes.ellipsis}>{text}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={classes.column}>
                <h3 className={classes.columnTitle}>{t('search:properties.linkedCatalogObjects')}</h3>
                {semanticLinks.length === 0 ? (
                  <p className={classes.note}>{t('search:properties.noCatalogObjects')}</p>
                ) : (
                  <div className={classes.chips}>
                    {semanticLinks.map((link) => {
                      const typeLabel = link.entity_type === 'uc_column'
                        ? t('search:properties.assignDialog.ucColumn')
                        : link.entity_type === 'uc_table'
                        ? t('search:properties.assignDialog.ucTable')
                        : link.entity_type === 'asset'
                        ? t('search:properties.assignDialog.asset', { defaultValue: 'Asset' })
                        : link.entity_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                      const Icon = link.entity_type === 'data_contract_property'
                        ? FileText
                        : link.entity_type === 'uc_column'
                        ? Columns2
                        : link.entity_type === 'asset'
                        ? Box
                        : Shapes;
                      return (
                        <span
                          key={link.id}
                          className={classes.chip}
                          title={`${typeLabel}: ${link.entity_name || link.entity_id}`}
                        >
                          <Icon aria-hidden size={12} />
                          <span className={classes.ellipsis}>{link.entity_name || link.entity_id}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </Pane>
        )}
      </PaneStack>

      <Dialog
        opened={assignDialogOpen}
        onClose={() => setAssignDialogOpen(false)}
        title={t('search:properties.assignDialog.title')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>{t('common:actions.cancel')}</Button>
            {assignTargetType === 'data_contract_property' && (
              <Button onClick={handleAssign} disabled={!selectedPropertyEntityId}>{t('common:actions.assign')}</Button>
            )}
            {assignTargetType === 'asset' && (
              <Button onClick={handleAssign} disabled={!selectedAssetId}>{t('common:actions.assign')}</Button>
            )}
          </>
        }
      >
        <div className={form.form}>
          {selectedProperty && (
            <div className={form.box}>
              <span className={form.strong}>{selectedProperty.label}</span>
              <span className={form.code}>{selectedProperty.value}</span>
            </div>
          )}

          <Select
            label={t('search:properties.assignDialog.targetType')}
            placeholder={t('search:properties.assignDialog.selectTargetType')}
            data={[
              { value: 'data_contract_property', label: t('search:properties.assignDialog.dataContractProperty') },
              { value: 'uc_column', label: t('search:properties.assignDialog.ucColumn') },
              { value: 'asset', label: t('search:properties.assignDialog.asset', { defaultValue: 'Asset (Column / Logical Attribute)' }) },
            ]}
            value={assignTargetType || null}
            onChange={(value) => value && handleAssignTargetTypeChange(value)}
            allowDeselect={false}
            classNames={SELECT_CLASSES}
          />

          {assignTargetType === 'data_contract_property' && (
            <>
              <Select
                label={t('search:properties.assignDialog.contract')}
                placeholder={t('search:properties.assignDialog.selectContract')}
                data={contractOptions}
                value={selectedContractId || null}
                onChange={(v) => { if (!v) return; setSelectedContractId(v); setSelectedSchemaName(''); setSelectedPropertyEntityId(''); }}
                allowDeselect={false}
                classNames={SELECT_CLASSES}
              />
              {selectedContractId && (
                <Select
                  label={t('search:properties.assignDialog.schema')}
                  placeholder={t('search:properties.assignDialog.selectSchema')}
                  data={schemaOptions}
                  value={selectedSchemaName || null}
                  onChange={(v) => { if (!v) return; setSelectedSchemaName(v); setSelectedPropertyEntityId(''); }}
                  allowDeselect={false}
                  classNames={SELECT_CLASSES}
                />
              )}
              {selectedSchemaName && (
                <Select
                  label={t('search:properties.assignDialog.property')}
                  placeholder={t('search:properties.assignDialog.selectProperty')}
                  data={propertyOptions}
                  value={selectedPropertyEntityId || null}
                  onChange={(v) => v && setSelectedPropertyEntityId(v)}
                  allowDeselect={false}
                  classNames={SELECT_CLASSES}
                />
              )}
            </>
          )}

          {assignTargetType === 'uc_column' && (
            <Button variant="outline" className={form.fullWidth} onClick={() => setUCAssetDialogOpen(true)}>
              {t('search:properties.assignDialog.browseUCColumn')}
            </Button>
          )}

          {assignTargetType === 'asset' && (
            <Select
              label={t('search:properties.assignDialog.asset', { defaultValue: 'Asset (Column / Logical Attribute)' })}
              placeholder={t('search:properties.assignDialog.selectAsset', { defaultValue: 'Select asset' })}
              data={assetOptions}
              value={selectedAssetId || null}
              onChange={(v) => v && setSelectedAssetId(v)}
              allowDeselect={false}
              nothingFoundMessage={t('search:properties.assignDialog.noColumnAssets', { defaultValue: 'No Column or Logical Attribute assets found' })}
              classNames={SELECT_CLASSES}
            />
          )}
        </div>
      </Dialog>

      <UCAssetLookupDialog
        isOpen={ucAssetDialogOpen}
        onOpenChange={setUCAssetDialogOpen}
        onSelect={handleUCColumnSelect}
        title={t('search:properties.assignDialog.ucColumnTitle')}
        allowedTypes={[UCAssetType.TABLE, UCAssetType.VIEW, UCAssetType.MATERIALIZED_VIEW]}
        includeColumns={true}
      />
    </>
  );
}

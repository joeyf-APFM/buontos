import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Search, Check, X, Database, Table2, Eye, Radio,
  LayoutDashboard, BookOpen, BrainCircuit, Globe, Zap,
  Box, Server, Shapes, FolderTree, Columns2, FileCode, Brain,
  Activity, Shield, FolderOpen,
} from 'lucide-react';
import { Checkbox, Loader, TextInput } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, Tabs } from '@/mantine/page';
import { useApi } from '@/hooks/use-api';
import { useTranslation } from 'react-i18next';
import classes from './asset-selector.module.css';
import { AssetTypeRead } from '@/types/asset';

export interface AssetSearchResult {
  id: string;
  name: string;
  description?: string;
  asset_type_name?: string;
  platform?: string;
  location?: string;
  status?: string;
}

export interface SelectedAsset extends AssetSearchResult {
  relationshipType: string;
}

interface AssetSelectorProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (assets: SelectedAsset[]) => void;
  relationshipType?: string;
  relationshipLabel?: string;
  targetAssetTypes?: string[];
  excludeAssetIds?: string[];
  title?: string;
  description?: string;
  confirmLabel?: string;
  /** When false, the dialog stays open after confirm (caller must close it). Default true. */
  closeOnConfirm?: boolean;
  /** Additional disable condition for the confirm button (ORed with empty selection). */
  confirmDisabled?: boolean;
}

const ASSET_TYPE_ICONS: Record<string, React.ElementType> = {
  Dataset: Database,
  Table: Table2,
  View: Eye,
  'Metric View': Eye,
  'Delivery Channel': Radio,
  Dashboard: LayoutDashboard,
  Notebook: BookOpen,
  'ML Model': BrainCircuit,
  'API Endpoint': Globe,
  Stream: Zap,
};

const ICON_MAP: Record<string, React.ElementType> = {
  Table2, Eye, Columns2, LayoutDashboard, Globe, FileCode, Brain, Activity,
  Server, Shield, BookOpen, Database, FolderOpen, Shapes, Box,
};

const CATEGORY_META: Record<string, { labelKey: string; icon: React.ElementType; order: number }> = {
  data: { labelKey: 'assetSelector.categories.data', icon: Database, order: 1 },
  analytics: { labelKey: 'assetSelector.categories.analytics', icon: LayoutDashboard, order: 2 },
  integration: { labelKey: 'assetSelector.categories.integration', icon: Globe, order: 3 },
  system: { labelKey: 'assetSelector.categories.system', icon: Server, order: 4 },
  custom: { labelKey: 'assetSelector.categories.custom', icon: Shapes, order: 5 },
};

function getAssetIcon(typeName?: string) {
  if (!typeName) return Database;
  return ASSET_TYPE_ICONS[typeName] || Database;
}

function getIconComponent(iconName?: string | null): React.ElementType {
  if (!iconName) return Box;
  return ICON_MAP[iconName] || Box;
}

// --- Reusable sub-components ---

function AssetResultRow({ asset, isSelected, onToggle }: {
  asset: AssetSearchResult;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation('common');
  const Icon = getAssetIcon(asset.asset_type_name);
  return (
    // The row is the control: pressed while the asset is chosen. Its checkbox only shows that
    <button type="button" onClick={onToggle} aria-pressed={isSelected} className={classes.row}>
      <Checkbox checked={isSelected} readOnly tabIndex={-1} aria-hidden size="xs" className={classes.check} />
      <Icon size={16} className={classes.icon} aria-hidden />
      <div className={classes.rowText}>
        <div className={classes.name} title={asset.name}>{asset.name}</div>
        {asset.location && (
          <div className={classes.location} title={asset.location}>{asset.location}</div>
        )}
      </div>
      <Badge variant="outline">
        {asset.asset_type_name || t('common:assetSelector.assetFallback')}
      </Badge>
      {isSelected && <Check size={16} className={classes.tick} aria-hidden />}
    </button>
  );
}

function AssetResultsList({ results, loading, selected, onToggle, emptyMessage }: {
  results: AssetSearchResult[];
  loading: boolean;
  selected: Map<string, AssetSearchResult>;
  onToggle: (asset: AssetSearchResult) => void;
  emptyMessage?: string;
}) {
  if (loading) {
    return (
      <div className={classes.loading}>
        <Loader size={18} />
      </div>
    );
  }
  if (results.length === 0 && emptyMessage) {
    return <p className={classes.empty}>{emptyMessage}</p>;
  }
  return (
    <div className={classes.list}>
      {results.map(asset => (
        <AssetResultRow
          key={asset.id}
          asset={asset}
          isSelected={selected.has(asset.id)}
          onToggle={() => onToggle(asset)}
        />
      ))}
    </div>
  );
}

// --- Main component ---

export function AssetSelector({
  isOpen,
  onOpenChange,
  onConfirm,
  relationshipType = '',
  relationshipLabel,
  targetAssetTypes,
  excludeAssetIds = [],
  title,
  description,
  confirmLabel,
  closeOnConfirm = true,
  confirmDisabled = false,
}: AssetSelectorProps) {
  const hasNarrowTypeFilter = !!targetAssetTypes && targetAssetTypes.length > 0 && targetAssetTypes.length <= 2;

  const { t } = useTranslation('common');
  const [mode, setMode] = useState<'search' | 'browse'>(hasNarrowTypeFilter ? 'search' : 'browse');
  const [selected, setSelected] = useState<Map<string, AssetSearchResult>>(new Map());
  const { get: apiGet } = useApi();

  // Search mode state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AssetSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  // The latest search: an answer to an older one is dropped
  const searchSeq = useRef(0);

  // Browse mode state
  const [assetTypes, setAssetTypes] = useState<AssetTypeRead[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [browseResults, setBrowseResults] = useState<AssetSearchResult[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseFilter, setBrowseFilter] = useState('');
  const browseFilterRef = useRef<HTMLInputElement>(null);
  const browseDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  // The latest browse request (a type switch or a filter): an older answer is dropped
  const browseSeq = useRef(0);

  const groupedTypes = useMemo(() => {
    const filtered = targetAssetTypes && targetAssetTypes.length > 0
      ? assetTypes.filter(t => targetAssetTypes.includes(t.name))
      : assetTypes;
    const groups: Record<string, AssetTypeRead[]> = {};
    for (const t of filtered) {
      const cat = t.category || 'custom';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    }
    return Object.entries(groups)
      .map(([cat, types]) => ({
        category: cat,
        label: CATEGORY_META[cat]?.labelKey ? t(`common:${CATEGORY_META[cat].labelKey}`) : cat,
        icon: CATEGORY_META[cat]?.icon || Shapes,
        order: CATEGORY_META[cat]?.order || 99,
        types: types.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.order - b.order);
  }, [assetTypes, targetAssetTypes, t]);

  // --- Search mode ---

  const doSearch = useCallback(async (query: string) => {
    const seq = ++searchSeq.current;
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      let url = `/api/assets?name=${encodeURIComponent(query)}&limit=20`;
      if (targetAssetTypes && targetAssetTypes.length > 0) {
        url += `&asset_type_names=${encodeURIComponent(targetAssetTypes.join(','))}`;
      }
      const response = await apiGet<{ items: AssetSearchResult[]; total: number }>(url);
      if (seq !== searchSeq.current) return;
      const items = response.data?.items;
      if (!response.error && Array.isArray(items)) {
        setSearchResults(items.filter(a => !excludeAssetIds.includes(a.id)));
      } else {
        setSearchResults([]);
      }
    } catch {
      if (seq === searchSeq.current) setSearchResults([]);
    } finally {
      if (seq === searchSeq.current) setSearchLoading(false);
    }
  }, [apiGet, targetAssetTypes, excludeAssetIds]);

  const handleSearchQueryChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  // --- Browse mode ---

  const fetchAssetTypes = useCallback(async () => {
    setTypesLoading(true);
    try {
      const response = await apiGet<AssetTypeRead[]>('/api/asset-types?limit=100');
      if (!response.error && Array.isArray(response.data)) {
        setAssetTypes(response.data.filter(t => t.status === 'active'));
      }
    } catch {
      // silently fail
    } finally {
      setTypesLoading(false);
    }
  }, [apiGet]);

  const fetchBrowseAssets = useCallback(async (typeId: string, nameFilter?: string) => {
    const seq = ++browseSeq.current;
    setBrowseLoading(true);
    try {
      let url = `/api/assets?asset_type_id=${typeId}&limit=50`;
      if (nameFilter && nameFilter.length >= 2) {
        url += `&name=${encodeURIComponent(nameFilter)}`;
      }
      const response = await apiGet<{ items: AssetSearchResult[]; total: number }>(url);
      if (seq !== browseSeq.current) return;
      const items = response.data?.items;
      if (!response.error && Array.isArray(items)) {
        setBrowseResults(items.filter(a => !excludeAssetIds.includes(a.id)));
        setBrowseTotal(response.data?.total ?? 0);
      } else {
        setBrowseResults([]);
        setBrowseTotal(0);
      }
    } catch {
      if (seq === browseSeq.current) {
        setBrowseResults([]);
        setBrowseTotal(0);
      }
    } finally {
      if (seq === browseSeq.current) setBrowseLoading(false);
    }
  }, [apiGet, excludeAssetIds]);

  const handleTypeSelect = (typeId: string) => {
    // A filter still waiting for the previous type's debounce is that type's
    if (browseDebounceRef.current) clearTimeout(browseDebounceRef.current);
    setSelectedTypeId(typeId);
    setBrowseFilter('');
    fetchBrowseAssets(typeId);
  };

  const handleBrowseFilterChange = (value: string) => {
    setBrowseFilter(value);
    if (browseDebounceRef.current) clearTimeout(browseDebounceRef.current);
    if (selectedTypeId) {
      if (value.length === 0) {
        fetchBrowseAssets(selectedTypeId);
      } else {
        browseDebounceRef.current = setTimeout(() => {
          fetchBrowseAssets(selectedTypeId, value);
        }, 300);
      }
    }
  };

  // --- Shared ---

  const toggleSelect = (asset: AssetSearchResult) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        next.set(asset.id, asset);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const assets: SelectedAsset[] = Array.from(selected.values()).map(a => ({
      ...a,
      relationshipType,
    }));
    onConfirm(assets);
    if (closeOnConfirm) onOpenChange(false);
  };

  const resetState = () => {
    // Drop any answer still on its way, and any search still waiting
    searchSeq.current++;
    browseSeq.current++;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (browseDebounceRef.current) clearTimeout(browseDebounceRef.current);
    setSearchLoading(false);
    setBrowseLoading(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelected(new Map());
    setSelectedTypeId(null);
    setBrowseResults([]);
    setBrowseTotal(0);
    setBrowseFilter('');
    setMode(hasNarrowTypeFilter ? 'search' : 'browse');
  };

  useEffect(() => {
    if (isOpen) {
      resetState();
      fetchAssetTypes();
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (mode === 'search') {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (browseDebounceRef.current) clearTimeout(browseDebounceRef.current);
    };
  }, []);

  const descText = description || (relationshipLabel || relationshipType
    ? t('common:assetSelector.descWithRel', { rel: relationshipLabel || relationshipType })
    : t('common:assetSelector.descDefault'));
  const selectedTypeName = assetTypes.find(t => t.id === selectedTypeId)?.name;

  return (
    <Dialog
      opened={isOpen}
      onClose={() => { onOpenChange(false); resetState(); }}
      size="lg"
      title={title || t('common:assetSelector.title')}
      description={descText}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common:actions.cancel')}</Button>
          <Button onClick={handleConfirm} disabled={selected.size === 0 || confirmDisabled}>
            {confirmLabel || (selected.size > 0 ? t('common:assetSelector.linkCount', { count: selected.size }) : t('common:assetSelector.linkEmpty'))}
          </Button>
        </>
      }
    >
      <div className={classes.body}>
        {/* Mode toggle */}
        <Tabs value={mode} onChange={(v) => v && setMode(v as 'search' | 'browse')}>
          <Tabs.List>
            <Tabs.Tab value="search" leftSection={<Search size={14} aria-hidden />}>
              {t('common:actions.search')}
            </Tabs.Tab>
            <Tabs.Tab value="browse" leftSection={<FolderTree size={14} aria-hidden />}>
              {t('common:actions.browse')}
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {mode === 'search' ? (
          <div className={classes.search}>
            <TextInput
              ref={searchInputRef}
              aria-label={t('common:assetSelector.searchPlaceholder')}
              placeholder={t('common:assetSelector.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => handleSearchQueryChange(e.currentTarget.value)}
              leftSection={<Search size={16} aria-hidden />}
              leftSectionPointerEvents="none"
              rightSection={searchLoading ? <Loader size={14} /> : undefined}
            />
            <div className={classes.scroll}>
              <AssetResultsList
                results={searchResults}
                loading={false}
                selected={selected}
                onToggle={toggleSelect}
                emptyMessage={
                  searchQuery.length >= 2
                    ? (searchLoading ? undefined : t('common:assetSelector.noAssetsFound'))
                    : t('common:assetSelector.typeToSearchHint')
                }
              />
            </div>
          </div>
        ) : (
          <div className={classes.browse}>
            {/* Type sidebar */}
            <div className={classes.sidebar}>
              {typesLoading ? (
                <div className={classes.loading}>
                  <Loader size={16} />
                </div>
              ) : groupedTypes.length === 0 ? (
                <p className={classes.empty}>{t('common:assetSelector.noAssetTypes')}</p>
              ) : (
                groupedTypes.map(group => (
                  <div key={group.category} className={classes.group}>
                    <div className={classes.groupHead}>
                      <group.icon size={14} aria-hidden />
                      <span>{group.label}</span>
                    </div>
                    {group.types.map(t => {
                      const TypeIcon = getIconComponent(t.icon);
                      return (
                        <button
                          type="button"
                          key={t.id}
                          onClick={() => handleTypeSelect(t.id)}
                          aria-pressed={selectedTypeId === t.id}
                          className={classes.type}
                        >
                          <TypeIcon size={14} aria-hidden />
                          <span className={classes.typeName} title={t.name}>{t.name}</span>
                          <span className={classes.count}>
                            {t.asset_count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Results panel */}
            <div className={classes.panel}>
              {selectedTypeId ? (
                <>
                  <div className={classes.filter}>
                    <TextInput
                      ref={browseFilterRef}
                      aria-label={t('common:assetSelector.filterPlaceholder', { type: selectedTypeName || t('common:assetSelector.assetsFallback') })}
                      placeholder={t('common:assetSelector.filterPlaceholder', { type: selectedTypeName || t('common:assetSelector.assetsFallback') })}
                      value={browseFilter}
                      onChange={(e) => handleBrowseFilterChange(e.currentTarget.value)}
                      leftSection={<Search size={14} aria-hidden />}
                      leftSectionPointerEvents="none"
                    />
                  </div>
                  <div className={classes.panelScroll}>
                    <AssetResultsList
                      results={browseResults}
                      loading={browseLoading}
                      selected={selected}
                      onToggle={toggleSelect}
                      emptyMessage={
                        browseFilter.length >= 2
                          ? t('common:assetSelector.noMatchingAssets')
                          : t('common:assetSelector.noAssetsOfType')
                      }
                    />
                    {browseTotal > 50 && !browseLoading && (
                      <p className={classes.limit}>
                        {t('common:assetSelector.showingLimit', { total: browseTotal })}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className={classes.placeholder}>
                  <FolderTree size={32} aria-hidden />
                  <p className={classes.empty}>{t('common:assetSelector.selectTypeToBrowse')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selected items bar */}
        {selected.size > 0 && (
          <div className={classes.chosen}>
            {Array.from(selected.values()).map(a => {
              const Icon = getAssetIcon(a.asset_type_name);
              return (
                <Badge key={a.id} variant="secondary" className={classes.chip}>
                  <Icon size={12} aria-hidden />
                  <span className={classes.chipName} title={a.name}>{a.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleSelect(a)}
                    aria-label={t('common:assetSelector.removeSelected', { name: a.name })}
                    className={classes.remove}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}

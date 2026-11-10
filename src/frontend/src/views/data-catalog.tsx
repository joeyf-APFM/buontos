/**
 * Data Catalog / Data Dictionary View
 *
 * Column-centric view for browsing all columns across Data Contracts and Assets.
 * Features:
 * - Server-side pagination
 * - Faceted filters (Asset Type, System, Catalog, Schema)
 * - Full-field search
 * - Sortable columns (client-side within page)
 * - Source provenance badges
 * - Click-through to table/contract details
 */

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Eye,
  ArrowUpDown,
  RefreshCw,
  Tag,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

import { ActionIcon, Loader, Select, Skeleton, TextInput } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { FilterBar, PageHeader, PageLayout, Pane } from '@/mantine/page';
// The Asset Explorer's grid: 28px header and rows, monospace names, its hover
// and selection highlight
import grid from '@/mantine/asset-explorer/explorer.module.css';
import classes from './data-catalog.module.css';

import type {
  ColumnDictionaryEntry,
  DataDictionaryResponse,
  ColumnSearchResponse,
  HierarchyFilters,
} from '@/types/data-catalog';

// =============================================================================
// Types
// =============================================================================

type SortField = 'column_label' | 'column_name' | 'table_name' | 'column_type';
type SortDirection = 'asc' | 'desc';

/**
 * The "all" choice of a filter. Mantine's Select rejects duplicate values, so
 * it must not collide with a real type, system, catalog or schema; a name
 * can't hold a NUL character.
 */
const ALL = '\u0000all';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

// =============================================================================
// Component
// =============================================================================

const DataCatalog: React.FC = () => {
  const { t } = useTranslation(['data-catalog', 'common']);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((state) => state.setDynamicTitle);

  const initialSearch = searchParams.get('search') || searchParams.get('concept') || '';

  // Data state
  const [columns, setColumns] = useState<ColumnDictionaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [tableCount, setTableCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [hierarchyFilters, setHierarchyFilters] = useState<HierarchyFilters | null>(null);
  const [selectedAssetType, setSelectedAssetType] = useState<string>(ALL);
  const [selectedSystem, setSelectedSystem] = useState<string>(ALL);
  const [selectedCatalog, setSelectedCatalog] = useState<string>(ALL);
  const [selectedSchema, setSelectedSchema] = useState<string>(ALL);

  // Sorting (client-side within page)
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'column_name',
    direction: 'asc',
  });

  // Set breadcrumbs
  useEffect(() => {
    setStaticSegments([
      { label: t('common:home'), path: '/' },
      { label: t('data-catalog:title', 'Data Catalog'), path: '/data-catalog' },
    ]);
    setDynamicTitle('');
  }, [setStaticSegments, setDynamicTitle, t]);

  // Fetch hierarchy filter values
  const fetchHierarchy = useCallback(async () => {
    try {
      const response = await fetch('/api/data-catalog/hierarchy');
      if (!response.ok) return;
      const data: HierarchyFilters = await response.json();
      setHierarchyFilters(data);
    } catch (err) {
      console.error('Error fetching hierarchy filters:', err);
    }
  }, []);

  // Build query params for API calls
  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedAssetType !== ALL) params.append('asset_type', selectedAssetType);
    if (selectedSystem !== ALL) params.append('system', selectedSystem);
    if (selectedCatalog !== ALL) params.append('catalog', selectedCatalog);
    if (selectedSchema !== ALL) params.append('schema', selectedSchema);
    return params;
  }, [selectedAssetType, selectedSystem, selectedCatalog, selectedSchema]);

  // Each columns request takes the next id; an answer for an older id is
  // dropped, so a slow earlier request never overwrites a newer one
  const requestId = useRef(0);

  // Fetch columns (paginated)
  const fetchColumns = useCallback(async (currentOffset: number) => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);

    try {
      const params = buildFilterParams();
      params.set('offset', String(currentOffset));
      params.set('limit', String(pageSize));

      const response = await fetch(`/api/data-catalog/columns?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch columns: ${response.statusText}`);
      }

      const data: DataDictionaryResponse = await response.json();
      if (id !== requestId.current) return;
      setColumns(data.columns);
      setTableCount(data.table_count);
      setTotalCount(data.column_count);
      setHasMore(data.has_more);
      setOffset(data.offset);
    } catch (err) {
      if (id !== requestId.current) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast({
        title: t('common:error'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [buildFilterParams, pageSize, t, toast]);

  // Search columns (paginated)
  const searchColumns = useCallback(async (query: string, currentOffset: number) => {
    if (!query.trim()) {
      fetchColumns(0);
      return;
    }

    const id = ++requestId.current;
    setIsSearching(true);

    try {
      const params = buildFilterParams();
      params.set('q', query);
      params.set('offset', String(currentOffset));
      params.set('limit', String(pageSize));

      const response = await fetch(`/api/data-catalog/columns/search?${params.toString()}`);
      if (!response.ok) throw new Error('Search failed');

      const data: ColumnSearchResponse = await response.json();
      if (id !== requestId.current) return;
      setColumns(data.columns);
      setTotalCount(data.total_count);
      setHasMore(data.has_more);
      setOffset(data.offset);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      if (id === requestId.current) {
        setIsSearching(false);
        setIsLoading(false);
      }
    }
  }, [buildFilterParams, fetchColumns, pageSize]);

  // Initial load
  useEffect(() => {
    fetchHierarchy();
    if (initialSearch) {
      searchColumns(initialSearch, 0);
    } else {
      fetchColumns(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filters change
  useEffect(() => {
    setOffset(0);
    if (searchQuery.trim()) {
      searchColumns(searchQuery, 0);
    } else {
      fetchColumns(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssetType, selectedSystem, selectedCatalog, selectedSchema, pageSize]);

  // The latest fetchers, for the debounce timer: the ones its effect
  // captured would send the filters of the render that typed
  const latest = useRef({ fetchColumns, searchColumns });
  useEffect(() => {
    latest.current = { fetchColumns, searchColumns };
  });

  // Debounced search: only when the query changes (the initial load and the
  // filter effect already fetch on mount)
  const debouncedQuery = useRef(searchQuery);
  useEffect(() => {
    if (searchQuery === debouncedQuery.current) return;
    debouncedQuery.current = searchQuery;
    const timer = setTimeout(() => {
      setOffset(0);
      if (searchQuery.trim()) {
        latest.current.searchColumns(searchQuery, 0);
      } else {
        latest.current.fetchColumns(0);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Pagination handlers
  const handleNextPage = () => {
    const newOffset = offset + pageSize;
    if (searchQuery.trim()) {
      searchColumns(searchQuery, newOffset);
    } else {
      fetchColumns(newOffset);
    }
  };

  const handlePrevPage = () => {
    const newOffset = Math.max(0, offset - pageSize);
    if (searchQuery.trim()) {
      searchColumns(searchQuery, newOffset);
    } else {
      fetchColumns(newOffset);
    }
  };

  // Sort handler
  const handleSort = (field: SortField) => {
    setSortConfig((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Sorted columns (client-side within page)
  const sortedColumns = useMemo(() => {
    const sorted = [...columns];
    sorted.sort((a, b) => {
      let aVal = '';
      let bVal = '';

      switch (sortConfig.field) {
        case 'column_label':
          aVal = a.column_label || a.column_name;
          bVal = b.column_label || b.column_name;
          break;
        case 'column_name':
          aVal = a.column_name;
          bVal = b.column_name;
          break;
        case 'table_name':
          aVal = a.table_name;
          bVal = b.table_name;
          break;
        case 'column_type':
          aVal = a.column_type;
          bVal = b.column_type;
          break;
      }

      const comparison = aVal.localeCompare(bVal);
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [columns, sortConfig]);

  // Clear all filters
  const clearFilters = () => {
    setSelectedAssetType(ALL);
    setSelectedSystem(ALL);
    setSelectedCatalog(ALL);
    setSelectedSchema(ALL);
    setSearchQuery('');
  };

  const hasActiveFilters =
    selectedAssetType !== ALL ||
    selectedSystem !== ALL ||
    selectedCatalog !== ALL ||
    selectedSchema !== ALL;

  // Navigate to table details or contract details
  const handleRowClick = (entry: ColumnDictionaryEntry) => {
    if (entry.table_type === 'CONTRACT' && entry.contract_id) {
      navigate(`/data-contracts/${entry.contract_id}`);
    } else if (entry.asset_id) {
      navigate(`/assets/${entry.asset_id}`);
    } else {
      navigate(`/data-catalog/${encodeURIComponent(entry.table_full_name)}`);
    }
  };

  // Render helpers
  // A plain function, not a component, so the header cells keep their DOM across sorts
  const sortHeader = (field: SortField, label: React.ReactNode) => {
    const active = sortConfig.field === field;
    return (
      <th
        className={classes.sortable}
        aria-sort={active ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : undefined}
        onClick={() => handleSort(field)}
      >
        <span className={classes.sortLabel}>
          {label}
          <ArrowUpDown aria-hidden className={classes.sortIcon} data-active={active || undefined} />
        </span>
      </th>
    );
  };

  const getDisplayLabel = (entry: ColumnDictionaryEntry): string => {
    return entry.column_label || entry.column_name;
  };

  const truncateDescription = (desc: string | null, maxLength: number = 100): string => {
    if (!desc) return '—';
    if (desc.length <= maxLength) return desc;
    return desc.substring(0, maxLength) + '...';
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'both':
        return <Badge variant="default">{t('data-catalog:sourceBadges.both')}</Badge>;
      case 'asset':
        return <Badge variant="secondary">{t('data-catalog:sourceBadges.asset')}</Badge>;
      case 'contract':
        return <Badge variant="outline">{t('data-catalog:sourceBadges.contract')}</Badge>;
      default:
        return null;
    }
  };

  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(totalCount / pageSize);


  const allOption = (label: string) => ({ value: ALL, label });
  const options = (values: string[]) => values.map((v) => ({ value: v, label: v }));
  const COLUMN_COUNT = 8;

  const body = isLoading ? (
    Array.from({ length: 10 }, (_, i) => (
      <tr key={i} aria-hidden className={classes.stateRow}>
        <td colSpan={COLUMN_COUNT}>
          <Skeleton height={10} radius="sm" />
        </td>
      </tr>
    ))
  ) : error ? (
    <tr className={classes.stateRow}>
      <td colSpan={COLUMN_COUNT} className={classes.state} role="alert">
        <p className={classes.stateTitle}>{t('common:error')}</p>
        <p>{error}</p>
      </td>
    </tr>
  ) : sortedColumns.length === 0 ? (
    <tr className={classes.stateRow}>
      <td colSpan={COLUMN_COUNT} className={classes.state}>
        <p className={classes.stateTitle}>{t('data-catalog:noResults', 'No columns found')}</p>
        <p>
          {searchQuery
            ? t('data-catalog:tryDifferentSearch', 'Try a different search term')
            : t('data-catalog:noTablesAccessible', 'No tables accessible in Unity Catalog')}
        </p>
      </td>
    </tr>
  ) : (
    sortedColumns.map((entry, idx) => (
      <tr
        key={`${entry.table_full_name}-${entry.column_name}-${idx}`}
        tabIndex={0}
        onClick={() => handleRowClick(entry)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) handleRowClick(entry);
        }}
      >
        <td className={classes.label}>{getDisplayLabel(entry)}</td>
        <td className={classes.description}>
          <span className={classes.wrap}>{truncateDescription(entry.description)}</span>
        </td>
        <td>
          <code className={`${grid.mono} ${classes.code}`}>{entry.column_name}</code>
        </td>
        <td>
          <span className={`${grid.mono} ${classes.type}`}>{entry.column_type}</span>
        </td>
        <td>
          {entry.business_terms && entry.business_terms.length > 0 ? (
            <span className={classes.chips}>
              {entry.business_terms.slice(0, 2).map((term, termIdx) => (
                <Badge
                  key={`${term.iri}-${termIdx}`}
                  variant="secondary"
                  className={classes.term}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    navigate(`/semantic-models?concept=${encodeURIComponent(term.iri)}`);
                  }}
                  title={term.iri}
                >
                  <Tag aria-hidden className={classes.termIcon} />
                  {term.label || term.iri.split('#').pop()?.split('/').pop() || 'Term'}
                </Badge>
              ))}
              {entry.business_terms.length > 2 && (
                <Badge variant="secondary">+{entry.business_terms.length - 2}</Badge>
              )}
            </span>
          ) : (
            <span className={classes.none}>—</span>
          )}
        </td>
        <td>
          <span className={grid.mono} title={entry.table_full_name}>
            {entry.table_name}
          </span>
        </td>
        <td>{getSourceBadge(entry.source)}</td>
        <td className={classes.open}>
          <Eye aria-hidden />
        </td>
      </tr>
    ))
  );

  return (
    <PageLayout
      fullBleed
      header={
        <>
          <PageHeader
            title={t('data-catalog:title', 'Data Catalog')}
            badges={
              !isLoading && <span className={classes.tag}>{t('data-catalog:tableCountBadge', { count: tableCount })}</span>
            }
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearFilters();
                  fetchColumns(0);
                }}
                disabled={isLoading}
              >
                <RefreshCw className={isLoading ? classes.spin : undefined} />
                {t('common:refresh', 'Refresh')}
              </Button>
            }
          />
          <p className={classes.subtitle}>
            {t('data-catalog:subtitle', 'Browse all columns across Unity Catalog tables and views')}
          </p>
        </>
      }
      filters={
        <FilterBar>
          {/* Asset Type */}
          <Select
            className={classes.filterNarrow}
            data={[allOption(t('data-catalog:filters.allTypes')), ...options(hierarchyFilters?.asset_types ?? [])]}
            value={selectedAssetType}
            onChange={(v) => v && setSelectedAssetType(v)}
            allowDeselect={false}
          />

          {/* System */}
          {hierarchyFilters && hierarchyFilters.systems.length > 0 && (
            <Select
              className={classes.filter}
              data={[allOption(t('data-catalog:filters.allSystems')), ...options(hierarchyFilters.systems)]}
              value={selectedSystem}
              onChange={(v) => v && setSelectedSystem(v)}
              allowDeselect={false}
            />
          )}

          {/* Catalog */}
          {hierarchyFilters && hierarchyFilters.catalogs.length > 0 && (
            <Select
              className={classes.filter}
              data={[allOption(t('data-catalog:filters.allCatalogs')), ...options(hierarchyFilters.catalogs)]}
              value={selectedCatalog}
              onChange={(v) => v && setSelectedCatalog(v)}
              allowDeselect={false}
            />
          )}

          {/* Schema */}
          {hierarchyFilters && hierarchyFilters.schemas.length > 0 && (
            <Select
              className={classes.filter}
              data={[allOption(t('data-catalog:filters.allSchemas')), ...options(hierarchyFilters.schemas)]}
              value={selectedSchema}
              onChange={(v) => v && setSelectedSchema(v)}
              allowDeselect={false}
            />
          )}

          {/* Clear filters */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X />
              {t('common:actions.clear')}
            </Button>
          )}

          {/* Search */}
          <TextInput
            className={classes.search}
            placeholder={t('data-catalog:searchPlaceholder', 'Search columns, tables, terms...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            leftSection={<Search size={14} aria-hidden />}
            rightSection={isSearching ? <Loader size={12} /> : null}
          />
        </FilterBar>
      }
    >
      <Pane flush aria-label={t('data-catalog:listPane', 'Catalog columns')}>
        <div className={classes.gridColumn}>
          <div className={grid.tableWrap}>
            <table className={`${grid.table} ${classes.grid}`}>
              <thead>
                <tr>
                  {sortHeader('column_label', t('data-catalog:columns.label', 'Label'))}
                  <th className={classes.descriptionHead}>{t('data-catalog:columns.description', 'Description')}</th>
                  {sortHeader('column_name', t('data-catalog:columns.columnName', 'Column Name'))}
                  {sortHeader('column_type', t('data-catalog:columns.type', 'Type'))}
                  <th>{t('data-catalog:columns.businessTerms', 'Business Terms')}</th>
                  {sortHeader('table_name', t('data-catalog:columns.tableName', 'Table Name'))}
                  <th>{t('data-catalog:columns.source')}</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody>{body}</tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {!isLoading && !error && totalCount > 0 && (
            <div className={classes.pager}>
              <span className={classes.muted}>
                {t('data-catalog:pagination.showing', {
                  from: offset + 1,
                  to: Math.min(offset + pageSize, totalCount),
                  total: totalCount.toLocaleString(),
                })}
                {searchQuery && t('data-catalog:pagination.matching', { query: searchQuery })}
              </span>

              <div className={classes.pagerEnd}>
                {/* Page size */}
                <span className={classes.pagerGroup}>
                  <span className={classes.muted}>{t('data-catalog:pagination.perPage')}</span>
                  <Select
                    className={classes.pageSize}
                    data={['25', '50', '100']}
                    value={String(pageSize)}
                    onChange={(v) => v && setPageSize(Number(v))}
                    allowDeselect={false}
                  />
                </span>

                {/* Page navigation */}
                <span className={classes.pagerGroup}>
                  <ActionIcon variant="default" onClick={handlePrevPage} disabled={offset === 0}>
                    <ChevronLeft size={14} aria-hidden />
                  </ActionIcon>
                  <span className={classes.muted}>
                    {t('data-catalog:pagination.pageOf', { current: currentPage, total: totalPages })}
                  </span>
                  <ActionIcon variant="default" onClick={handleNextPage} disabled={!hasMore}>
                    <ChevronRight size={14} aria-hidden />
                  </ActionIcon>
                </span>
              </div>
            </div>
          )}
        </div>
      </Pane>
    </PageLayout>
  );
};

export default DataCatalog;

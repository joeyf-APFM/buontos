/**
 * Data Catalog Details View
 * 
 * Shows detailed information for a specific table:
 * - Overview tab: metadata, owner, dates
 * - Data Details tab: column list with types and descriptions
 * - Lineage tab: interactive lineage visualization
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  Copy,
  Check,
  Columns,
  GitBranch,
  Info,
} from 'lucide-react';
import { ActionIcon, Alert, Tooltip } from '@mantine/core';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TabsDetailSkeleton } from '@/components/common/list-view-skeleton';
import { useToast } from '@/hooks/use-toast';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import LineageGraphComponent from '@/components/data-catalog/lineage-graph';
import { DetailsGrid, PageHeader, PageLayout, Pane, PaneStack, Tabs, type DetailsRow } from '@/mantine/page';
// The Asset Explorer's grid: 28px header and rows, monospace names
import grid from '@/mantine/asset-explorer/explorer.module.css';
import classes from './data-catalog-details.module.css';

import type { 
  TableInfo, 
  // ColumnInfo, // Available for future use
  LineageGraph,
  LineageDirection,
  ImpactAnalysis
} from '@/types/data-catalog';

// =============================================================================
// Component
// =============================================================================

const DataCatalogDetails: React.FC = () => {
  const { '*': tableFqn } = useParams<{ '*': string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const listPath = pathname.replace(/\/catalog\/.*$/, '/catalog');
  const { t } = useTranslation(['data-catalog', 'common']);
  const { toast } = useToast();
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((state) => state.setDynamicTitle);

  // State
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Lineage state
  const [lineageGraph, setLineageGraph] = useState<LineageGraph | null>(null);
  const [lineageDirection, setLineageDirection] = useState<LineageDirection>('both');
  const [isLineageLoading, setIsLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState<string | null>(null);
  
  // Impact state
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [_isImpactLoading, setIsImpactLoading] = useState(false);
  
  // Copy state
  const [copiedFqn, setCopiedFqn] = useState(false);

  // Decode the table FQN
  const decodedFqn = tableFqn ? decodeURIComponent(tableFqn) : '';

  // Set breadcrumbs
  useEffect(() => {
    setStaticSegments([
      { label: t('common:home'), path: '/' },
      { label: t('data-catalog:title', 'Data Catalog'), path: '/data-catalog' }
    ]);
    setDynamicTitle(tableInfo?.name || decodedFqn.split('.').pop() || t('data-catalog:details.fallbackTitle'));
  }, [setStaticSegments, setDynamicTitle, t, tableInfo, decodedFqn]);

  // Fetch table details
  const fetchTableDetails = useCallback(async () => {
    if (!decodedFqn) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/data-catalog/tables/${encodeURIComponent(decodedFqn)}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(t('data-catalog:errors.tableNotFound'));
        }
        throw new Error(t('data-catalog:errors.fetchTableFailed', { status: response.statusText }));
      }

      const data: TableInfo = await response.json();
      setTableInfo(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common:errors.unknownError');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [decodedFqn, t]);

  // Fetch lineage
  const fetchLineage = useCallback(async () => {
    if (!decodedFqn) return;
    
    setIsLineageLoading(true);
    setLineageError(null);
    
    try {
      const response = await fetch(
        `/api/data-catalog/tables/${encodeURIComponent(decodedFqn)}/lineage?direction=${lineageDirection}`
      );
      
      if (!response.ok) {
        throw new Error(t('data-catalog:errors.fetchLineageFailed'));
      }

      const data: LineageGraph = await response.json();
      setLineageGraph(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('data-catalog:errors.loadLineageFailed');
      setLineageError(message);
    } finally {
      setIsLineageLoading(false);
    }
  }, [decodedFqn, lineageDirection, t]);

  // Fetch impact analysis
  const fetchImpact = useCallback(async () => {
    if (!decodedFqn) return;
    
    setIsImpactLoading(true);
    
    try {
      const response = await fetch(
        `/api/data-catalog/tables/${encodeURIComponent(decodedFqn)}/impact`
      );
      
      if (response.ok) {
        const data: ImpactAnalysis = await response.json();
        setImpact(data);
      }
    } catch (err) {
      console.error('Failed to fetch impact:', err);
    } finally {
      setIsImpactLoading(false);
    }
  }, [decodedFqn]);

  // Initial load
  useEffect(() => {
    fetchTableDetails();
  }, [fetchTableDetails]);

  // Fetch lineage when tab changes or direction changes
  useEffect(() => {
    if (activeTab === 'lineage') {
      fetchLineage();
      fetchImpact();
    }
  }, [activeTab, fetchLineage, fetchImpact]);

  // Copy FQN to clipboard
  const handleCopyFqn = async () => {
    if (!tableInfo) return;
    
    try {
      await navigator.clipboard.writeText(tableInfo.full_name);
      setCopiedFqn(true);
      setTimeout(() => setCopiedFqn(false), 2000);
      toast({
        title: t('common:copied'),
        description: tableInfo.full_name
      });
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Format date
  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Format bytes
  const formatBytes = (bytes: number | null | undefined): string => {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };


  const backButton = (
    <Button variant="outline" onClick={() => navigate(listPath)} size="sm">
      <ArrowLeft /> {t('data-catalog:details.backToList')}
    </Button>
  );

  if (isLoading) {
    // Mirrors rendered shape: header (back button), title, tabs row
    // (Overview / Data Details / Lineage), and the overview panes.
    return (
      <div className={classes.state}>
        <TabsDetailSkeleton tabs={3} actionButtons={1} contentVariant="two-col" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={classes.state}>
        <Alert color="red" variant="light" icon={<AlertCircle size={16} />} title={t('common:error')} role="alert">
          {error}
        </Alert>
        <div className={classes.stateActions}>
          {backButton}
          <Button onClick={fetchTableDetails} size="sm">
            {t('common:retry', 'Retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (!tableInfo) {
    return null;
  }

  const isView = tableInfo.table_type === 'VIEW';

  const withBy = (date: string | null | undefined, user: string | null | undefined) => (
    <span className={classes.dated}>
      <span>{formatDate(date)}</span>
      {user && <span className={classes.by}>{t('data-catalog:details.by', { user })}</span>}
    </span>
  );

  const basicRows: DetailsRow[] = [
    { label: t('data-catalog:overview.catalog', 'Catalog'), value: tableInfo.catalog_name },
    { label: t('data-catalog:overview.schema', 'Schema'), value: tableInfo.schema_name },
    { label: t('data-catalog:overview.owner', 'Owner'), value: tableInfo.owner || '—' },
    { label: t('data-catalog:overview.type', 'Type'), value: <Badge variant="outline">{tableInfo.table_type}</Badge> },
    { label: t('data-catalog:overview.created', 'Created'), value: withBy(tableInfo.created_at, tableInfo.created_by) },
    { label: t('data-catalog:overview.updated', 'Updated'), value: withBy(tableInfo.updated_at, tableInfo.updated_by) },
  ];

  const storageRows: DetailsRow[] = [
    { label: t('data-catalog:overview.columns', 'Columns'), value: tableInfo.columns.length },
    { label: t('data-catalog:overview.rows', 'Rows'), value: tableInfo.row_count?.toLocaleString() || '—' },
    { label: t('data-catalog:overview.size', 'Size'), value: formatBytes(tableInfo.size_bytes) },
    { label: t('data-catalog:overview.format', 'Format'), value: tableInfo.data_source_format || '—' },
  ];
  if (tableInfo.storage_location) {
    storageRows.push({
      label: t('data-catalog:overview.location', 'Storage Location'),
      value: (
        <span className={`${grid.mono} ${classes.location}`} title={tableInfo.storage_location}>
          {tableInfo.storage_location}
        </span>
      ),
    });
  }

  return (
    <PageLayout
      header={
        <>
          <PageHeader
            title={tableInfo.name}
            badges={<Badge variant={isView ? 'secondary' : 'default'}>{tableInfo.table_type}</Badge>}
            actions={backButton}
          />
          <div className={classes.fqn}>
            <code className={`${grid.mono} ${classes.code}`}>{tableInfo.full_name}</code>
            <Tooltip label={t('common:copy')} withArrow={false}>
              <ActionIcon variant="subtle" color="gray" size={22} onClick={handleCopyFqn}>
                {copiedFqn ? <Check size={13} className={classes.copied} aria-hidden /> : <Copy size={13} aria-hidden />}
              </ActionIcon>
            </Tooltip>
          </div>
        </>
      }
    >
      <div className={classes.body}>
        <Tabs value={activeTab} onChange={(v) => v && setActiveTab(v)} classNames={{ tabSection: classes.tabIcon }}>
          <Tabs.List>
            <Tabs.Tab value="overview" leftSection={<Info aria-hidden />}>
              {t('data-catalog:tabs.overview', 'Overview')}
            </Tabs.Tab>
            <Tabs.Tab value="columns" leftSection={<Columns aria-hidden />}>
              {t('data-catalog:tabs.dataDetails', 'Data Details')}
            </Tabs.Tab>
            <Tabs.Tab value="lineage" leftSection={<GitBranch aria-hidden />}>
              {t('data-catalog:tabs.lineage', 'Lineage')}
            </Tabs.Tab>
          </Tabs.List>

          {/* Overview */}
          <Tabs.Panel value="overview">
            <PaneStack>
              <Pane title={t('data-catalog:overview.basicInfo', 'Basic Information')}>
                <DetailsGrid rows={basicRows} />
              </Pane>
              <Pane title={t('data-catalog:overview.storage', 'Storage & Statistics')}>
                <DetailsGrid rows={storageRows} />
              </Pane>
              {tableInfo.comment && (
                <Pane title={t('data-catalog:overview.description', 'Description')}>
                  <p className={classes.comment}>{tableInfo.comment}</p>
                </Pane>
              )}
              {tableInfo.tags && Object.keys(tableInfo.tags).length > 0 && (
                <Pane title={t('data-catalog:overview.tags', 'Tags')}>
                  <span className={classes.chips}>
                    {Object.entries(tableInfo.tags).map(([key, value]) => (
                      <Badge key={key} variant="secondary">
                        {key}: {value}
                      </Badge>
                    ))}
                  </span>
                </Pane>
              )}
            </PaneStack>
          </Tabs.Panel>

          {/* Data Details: the columns */}
          <Tabs.Panel value="columns">
            <Pane
              flush
              title={t('data-catalog:dataDetails.title', 'Columns')}
              actions={<Badge variant="secondary">{tableInfo.columns.length}</Badge>}
            >
              <div className={grid.gridHint}>
                {t('data-catalog:dataDetails.description', 'Column definitions and metadata')}
              </div>
              <table className={`${grid.table} ${classes.columns}`}>
                <thead>
                  <tr>
                    <th className={classes.index}>#</th>
                    <th>{t('data-catalog:dataDetails.columnName', 'Column Name')}</th>
                    <th>{t('data-catalog:dataDetails.type', 'Type')}</th>
                    <th>{t('data-catalog:dataDetails.nullable', 'Nullable')}</th>
                    <th>{t('data-catalog:dataDetails.description', 'Description')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableInfo.columns.map((col, idx) => (
                    <tr key={col.name}>
                      <td className={classes.muted}>{idx + 1}</td>
                      <td>
                        <span className={classes.nameCell}>
                          <code className={`${grid.mono} ${classes.code} ${classes.columnName}`}>{col.name}</code>
                          {col.partition_index !== null && col.partition_index !== undefined && (
                            <Badge variant="outline">
                              {t('data-catalog:dataDetails.partition', { index: col.partition_index })}
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className={`${grid.mono} ${classes.muted}`}>{col.type_text}</span>
                      </td>
                      <td>
                        {col.nullable ? (
                          <Badge variant="outline">{t('data-catalog:dataDetails.yes')}</Badge>
                        ) : (
                          <Badge variant="destructive">{t('data-catalog:dataDetails.no')}</Badge>
                        )}
                      </td>
                      <td className={classes.commentCell}>
                        <span className={classes.wrap}>{col.comment || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Pane>
          </Tabs.Panel>

          {/* Lineage */}
          <Tabs.Panel value="lineage">
            <PaneStack>
              <Pane title={t('data-catalog:lineage.title', 'Data Lineage')}>
                <p className={classes.paneIntro}>
                  {t('data-catalog:lineage.description', 'Visualize upstream and downstream dependencies')}
                </p>
                <LineageGraphComponent
                  graph={lineageGraph}
                  isLoading={isLineageLoading}
                  error={lineageError}
                  direction={lineageDirection}
                  onDirectionChange={setLineageDirection}
                  onRefresh={fetchLineage}
                />
              </Pane>

              {/* Impact summary */}
              {impact && impact.total_impacted_count > 0 && (
                <Pane
                  title={t('data-catalog:lineage.impactSummary', 'Impact Summary')}
                  actions={<AlertTriangle aria-hidden className={classes.warning} />}
                >
                  <p className={classes.paneIntro}>
                    {t('data-catalog:lineage.impactWarning', 'Changes to this table may affect:')}
                  </p>
                  <span className={classes.chips}>
                    {impact.impacted_tables.length > 0 && (
                      <Badge variant="outline">{t('data-catalog:lineage.impactedTables', { count: impact.impacted_tables.length })}</Badge>
                    )}
                    {impact.impacted_views.length > 0 && (
                      <Badge variant="outline">{t('data-catalog:lineage.impactedViews', { count: impact.impacted_views.length })}</Badge>
                    )}
                    {impact.impacted_external.length > 0 && (
                      <Badge variant="outline">{t('data-catalog:lineage.impactedExternal', { count: impact.impacted_external.length })}</Badge>
                    )}
                  </span>
                  {impact.affected_owners.length > 0 && (
                    <p className={classes.owners}>
                      {t('data-catalog:lineage.notifyOwners', 'Owners to notify')}: {impact.affected_owners.join(', ')}
                    </p>
                  )}
                </Pane>
              )}
            </PaneStack>
          </Tabs.Panel>
        </Tabs>
      </div>
    </PageLayout>
  );
};

export default DataCatalogDetails;

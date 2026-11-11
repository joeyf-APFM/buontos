import { createElement, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Select, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import {
  Network, AlertCircle, Search,
  Box, Table2, Eye, Columns2, LayoutDashboard, Globe, FileCode, Brain,
  Activity, Server, Shield, BookOpen, Database, FolderOpen, Shapes,
  ExternalLink, RefreshCw, ListTree, GitFork, Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  HierarchyTreeSkeleton,
  HierarchyDetailSkeleton,
} from '@/components/common/list-view-skeleton';
import { LoadError } from '@/components/search/search-pane';
import { PageHeader, PageLayout, Pane } from '@/mantine/page';
import { useApi } from '@/hooks/use-api';
import { usePermissions } from '@/stores/permissions-store';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { FeatureAccessLevel } from '@/types/settings';
import { HierarchyTreeNode } from '@/components/hierarchy/hierarchy-tree-node';
import { HierarchyGraphView } from '@/components/hierarchy/hierarchy-graph-view';
import type { InstanceHierarchyNode, HierarchyRootGroup } from '@/types/ontology-schema';
import { useFormatLabel } from '@/lib/format-label';
import classes from './hierarchy-browser.module.css';

type DetailViewMode = 'tree' | 'graph';

const ALL_ROOT_TYPES = ['System', 'DataDomain', 'DataProduct'] as const;

const DEPTH_OPTIONS: { value: string; all?: boolean }[] = [
  { value: '2' },
  { value: '3' },
  { value: '4' },
  { value: '6' },
  { value: '10', all: true },
];

const ICON_MAP: Record<string, React.ElementType> = {
  Table2, Eye, Columns2, LayoutDashboard, Globe, FileCode, Brain, Activity,
  Server, Shield, BookOpen, Database, FolderOpen, Shapes, Box, Network,
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  active: 'default',
  deprecated: 'secondary',
  archived: 'destructive',
};

const TYPE_ROUTE_MAP: Record<string, string> = {
  DataProduct: '/data-products',
  DataContract: '/data-contracts',
  DataDomain: '/data-domains',
};

// Tooltips open on keyboard focus too
const TOOLTIP_EVENTS = { hover: true, focus: true, touch: false };

function getIconComponent(iconName?: string | null): React.ElementType {
  if (!iconName) return Box;
  return ICON_MAP[iconName] || Box;
}

/** An entity type's icon (a lookup, so no component is made during render). */
function EntityIcon({ icon, className }: { icon?: string | null; className?: string }) {
  return createElement(getIconComponent(icon), { 'aria-hidden': true, className });
}

function getEntityRoute(entityType: string, entityId: string): string {
  const base = TYPE_ROUTE_MAP[entityType];
  if (base) return `${base}/${entityId}`;
  return `/assets/${entityId}`;
}

const childrenOf = (node: InstanceHierarchyNode): InstanceHierarchyNode[] =>
  Array.isArray(node.children) ? node.children : [];

interface DetailPanelProps {
  paneLabel: string;
  node: InstanceHierarchyNode | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  detailNode: InstanceHierarchyNode | null;
  viewMode: DetailViewMode;
  onViewModeChange: (mode: DetailViewMode) => void;
  maxDepth: string;
  onMaxDepthChange: (depth: string) => void;
  visibleTypes: Set<string>;
  onVisibleTypesChange: (types: Set<string>) => void;
}

function collectEntityTypes(node: InstanceHierarchyNode): Set<string> {
  const types = new Set<string>();
  function walk(n: InstanceHierarchyNode) {
    types.add(n.entity_type);
    for (const child of childrenOf(n)) walk(child);
  }
  walk(node);
  return types;
}

function filterNodeByTypes(
  node: InstanceHierarchyNode,
  visibleTypes: Set<string>,
): InstanceHierarchyNode | null {
  if (!visibleTypes.has(node.entity_type)) return null;
  const filteredChildren: InstanceHierarchyNode[] = [];
  for (const child of childrenOf(node)) {
    const filtered = filterNodeByTypes(child, visibleTypes);
    if (filtered) filteredChildren.push(filtered);
  }
  return { ...node, children: filteredChildren, child_count: filteredChildren.length };
}

/** The detail pane: the chosen entity's head, its type filter, and its hierarchy as a tree or a graph. */
function DetailPanel({
  paneLabel, node, loading, error, onRetry, detailNode, viewMode, onViewModeChange,
  maxDepth, onMaxDepthChange, visibleTypes, onVisibleTypesChange,
}: DetailPanelProps) {
  const navigate = useNavigate();
  const { t } = useTranslation(['data-catalog', 'common']);

  // A failed load shows its error, not the tree row's shallow copy as if it had no children
  const rawDisplayNode = error !== null ? null : detailNode || node;

  const allTypes = useMemo(
    () => rawDisplayNode ? collectEntityTypes(rawDisplayNode) : new Set<string>(),
    [rawDisplayNode],
  );
  const displayNode = useMemo(() => {
    if (!rawDisplayNode) return null;
    if (visibleTypes.size === 0 || visibleTypes.size >= allTypes.size) return rawDisplayNode;
    return filterNodeByTypes(rawDisplayNode, visibleTypes) || rawDisplayNode;
  }, [rawDisplayNode, visibleTypes, allTypes]);

  const toggleType = useCallback((type: string) => {
    const base = visibleTypes.size === 0 ? new Set(allTypes) : new Set(visibleTypes);
    if (base.has(type)) {
      if (base.size > 1) base.delete(type);
    } else {
      base.add(type);
    }
    onVisibleTypesChange(base);
  }, [visibleTypes, allTypes, onVisibleTypesChange]);

  const depthData = useMemo(
    () => DEPTH_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.all
        ? t('data-catalog:hierarchy.allLevels')
        : t('data-catalog:hierarchy.levelsOption', { count: Number(opt.value) }),
    })),
    [t],
  );

  if (loading) {
    return (
      <Pane aria-label={paneLabel} className={classes.detailPane}>
        <HierarchyDetailSkeleton showControls treeRows={6} />
      </Pane>
    );
  }

  if (node && error !== null) {
    return (
      <Pane aria-label={paneLabel} className={classes.detailPane} title={node.name || undefined} titleTooltip>
        <LoadError error={error} onRetry={onRetry} />
      </Pane>
    );
  }

  if (!node || !displayNode) {
    return (
      <Pane aria-label={paneLabel} className={classes.detailPane}>
        <div className={classes.empty}>
          <Network aria-hidden className={classes.emptyIcon} />
          <p className={classes.emptyTitle}>{t('data-catalog:hierarchy.selectEntity')}</p>
          <p className={classes.emptyBody}>{t('data-catalog:hierarchy.selectEntityHint')}</p>
        </div>
      </Pane>
    );
  }

  const children = childrenOf(displayNode);
  const hasChildren = children.length > 0;

  const actions = (
    <>
      {hasChildren && (
        <>
          <Tooltip label={t('data-catalog:hierarchy.maxDepthTooltip')} events={TOOLTIP_EVENTS}>
            <div>
              <Select
                aria-label={t('data-catalog:hierarchy.maxDepthTooltip')}
                data={depthData}
                value={maxDepth}
                onChange={(value) => value && onMaxDepthChange(value)}
                allowDeselect={false}
                size="xs"
                w={110}
                leftSection={<Layers aria-hidden size={12} />}
              />
            </div>
          </Tooltip>
          <div className={classes.viewToggle}>
            <ActionIcon
              variant={viewMode === 'tree' ? 'light' : 'subtle'}
              color="gray"
              size={26}
              aria-label={t('data-catalog:hierarchy.treeView')}
              title={t('data-catalog:hierarchy.treeView')}
              aria-pressed={viewMode === 'tree'}
              onClick={() => onViewModeChange('tree')}
            >
              <ListTree aria-hidden size={14} />
            </ActionIcon>
            <ActionIcon
              variant={viewMode === 'graph' ? 'light' : 'subtle'}
              color="gray"
              size={26}
              aria-label={t('data-catalog:hierarchy.graphView')}
              title={t('data-catalog:hierarchy.graphView')}
              aria-pressed={viewMode === 'graph'}
              onClick={() => onViewModeChange('graph')}
            >
              <GitFork aria-hidden size={14} />
            </ActionIcon>
          </div>
        </>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate(getEntityRoute(displayNode.entity_type, displayNode.entity_id))}
      >
        <ExternalLink aria-hidden />
        {t('data-catalog:hierarchy.viewDetail')}
      </Button>
    </>
  );

  return (
    <Pane
      aria-label={paneLabel}
      className={classes.detailPane}
      title={displayNode.name}
      titleTooltip
      actions={actions}
      flush
    >
      <div className={classes.detail}>
        <div className={classes.meta}>
          <EntityIcon icon={node.icon} className={classes.metaIcon} />
          <Badge variant="outline">{displayNode.entity_type}</Badge>
          {displayNode.status && (
            <Badge variant={STATUS_VARIANT[displayNode.status] ?? 'outline'}>{displayNode.status}</Badge>
          )}
          {displayNode.child_count > 0 && (
            <span className={classes.muted}>
              {t('data-catalog:hierarchy.childCount', { count: displayNode.child_count })}
            </span>
          )}
        </div>

        {displayNode.description && <p className={classes.description}>{displayNode.description}</p>}

        {/* Entity type filter chips */}
        {allTypes.size > 1 && (
          <div className={classes.chips}>
            <span className={classes.muted}>{t('data-catalog:hierarchy.show')}</span>
            {Array.from(allTypes).map((type) => {
              const active = visibleTypes.size === 0 || visibleTypes.has(type);
              return (
                <UnstyledButton
                  key={type}
                  className={classes.chip}
                  data-active={active || undefined}
                  aria-pressed={active}
                  onClick={() => toggleType(type)}
                >
                  {type}
                </UnstyledButton>
              );
            })}
            {visibleTypes.size > 0 && visibleTypes.size < allTypes.size && (
              <UnstyledButton className={classes.textButton} onClick={() => onVisibleTypesChange(new Set())}>
                {t('data-catalog:hierarchy.showAll')}
              </UnstyledButton>
            )}
          </div>
        )}

        {/* Children visualization */}
        {hasChildren ? (
          viewMode === 'graph' ? (
            <div className={classes.graph}>
              <HierarchyGraphView rootNode={displayNode} />
            </div>
          ) : (
            <div className={classes.children}>
              <h3 className={classes.heading}>{t('data-catalog:hierarchy.heading')}</h3>
              <div className={classes.treeBox} role="tree" aria-label={t('data-catalog:hierarchy.heading')}>
                <div className={classes.rootRow}>
                  <EntityIcon icon={node.icon} className={classes.rootIcon} />
                  <span className={classes.rootName} title={displayNode.name}>{displayNode.name}</span>
                </div>
                {children.map((child) => (
                  <HierarchyTreeNode
                    key={`${child.entity_type}-${child.entity_id}`}
                    node={child}
                    depth={1}
                    isLazy
                  />
                ))}
              </div>
            </div>
          )
        ) : (
          <div className={classes.note}>
            <Box aria-hidden className={classes.noteIcon} />
            <p>{t('data-catalog:hierarchy.noChildren')}</p>
          </div>
        )}
      </div>
    </Pane>
  );
}

export default function HierarchyBrowserView() {
  const [rootGroups, setRootGroups] = useState<HierarchyRootGroup[]>([]);
  const [rootsLoading, setRootsLoading] = useState(true);
  const [rootsError, setRootsError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<InstanceHierarchyNode | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [detailNode, setDetailNode] = useState<InstanceHierarchyNode | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailViewMode, setDetailViewMode] = useState<DetailViewMode>('tree');
  const [maxDepth, setMaxDepth] = useState('4');
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());

  const [treeFilter, setTreeFilter] = useState('');
  const [enabledRootTypes, setEnabledRootTypes] = useState<Set<string>>(
    () => new Set(ALL_ROOT_TYPES),
  );

  // A newer request drops an older one's answer
  const rootsSeq = useRef(0);
  const detailSeq = useRef(0);

  const [searchParams, setSearchParams] = useSearchParams();

  const { t } = useTranslation(['data-catalog', 'common']);
  const { get: apiGet } = useApi();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const formatLabel = useFormatLabel();
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((state) => state.setDynamicTitle);

  const featureId = 'assets';
  const canRead = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.READ_ONLY);

  useEffect(() => {
    setStaticSegments([]);
    setDynamicTitle(t('data-catalog:hierarchy.browserTitle'));
    return () => { setStaticSegments([]); setDynamicTitle(null); };
  }, [setStaticSegments, setDynamicTitle, t]);

  const fetchRoots = useCallback(async () => {
    const seq = ++rootsSeq.current;
    setRootsLoading(true);
    setRootsError(null);
    try {
      const response = await apiGet<HierarchyRootGroup[]>(
        '/api/entity-hierarchy/roots?types=System,DataDomain,DataProduct'
      );
      if (seq !== rootsSeq.current) return;
      if (response.error) throw new Error(response.error);
      setRootGroups(Array.isArray(response.data) ? response.data : []);
    } catch (err: unknown) {
      if (seq !== rootsSeq.current) return;
      setRootsError((err instanceof Error && err.message) || t('data-catalog:hierarchy.rootsLoadFailed'));
    } finally {
      if (seq === rootsSeq.current) setRootsLoading(false);
    }
  }, [apiGet, t]);

  useEffect(() => { fetchRoots(); }, [fetchRoots]);

  const fetchDetail = useCallback(async (entityType: string, entityId: string, depth: string) => {
    const seq = ++detailSeq.current;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await apiGet<InstanceHierarchyNode>(
        `/api/entity-hierarchy/${entityType}/${entityId}?max_depth=${depth}`
      );
      if (seq !== detailSeq.current) return;
      if (!response.error && response.data) {
        setDetailNode(response.data);
        setVisibleTypes(new Set());
      } else {
        setDetailNode(null);
        setDetailError(response.error || '');
      }
    } catch (err: unknown) {
      if (seq !== detailSeq.current) return;
      setDetailNode(null);
      setDetailError(err instanceof Error ? err.message : '');
    } finally {
      if (seq === detailSeq.current) setDetailLoading(false);
    }
  }, [apiGet]);

  const handleSelectNode = useCallback(async (node: InstanceHierarchyNode) => {
    selectedRef.current = node.entity_id;
    setSelectedNode(node);
    setVisibleTypes(new Set());
    setSearchParams({ type: node.entity_type, id: node.entity_id }, { replace: true });
    fetchDetail(node.entity_type, node.entity_id, maxDepth);
  }, [setSearchParams, fetchDetail, maxDepth]);

  // Auto-select from URL params (initial load only)
  useEffect(() => {
    const type = searchParams.get('type');
    const id = searchParams.get('id');
    if (type && id && !selectedRef.current) {
      handleSelectNode({ entity_type: type, entity_id: id, name: '', child_count: 0, children: [] });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMaxDepthChange = useCallback((depth: string) => {
    setMaxDepth(depth);
    if (selectedNode) {
      fetchDetail(selectedNode.entity_type, selectedNode.entity_id, depth);
    }
  }, [selectedNode, fetchDetail]);

  const retryDetail = useCallback(() => {
    if (selectedNode) fetchDetail(selectedNode.entity_type, selectedNode.entity_id, maxDepth);
  }, [selectedNode, fetchDetail, maxDepth]);

  const toggleRootType = useCallback((type: string) => {
    setEnabledRootTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const filteredGroups = useMemo(() => {
    let groups = rootGroups
      .filter((g) => enabledRootTypes.has(g.entity_type))
      .map((g) => ({ ...g, roots: Array.isArray(g.roots) ? g.roots : [] }));
    if (treeFilter.trim()) {
      const q = treeFilter.toLowerCase();
      groups = groups.map((group) => ({
        ...group,
        roots: group.roots.filter((root) => (root.name || '').toLowerCase().includes(q)),
      })).filter((group) => group.roots.length > 0);
    }
    return groups;
  }, [rootGroups, treeFilter, enabledRootTypes]);

  const title = t('data-catalog:hierarchy.browserTitle');

  if (!canRead && !permissionsLoading) {
    return (
      <PageLayout header={<PageHeader title={title} />}>
        <div className={classes.denied}>
          <Alert color="red" variant="light" icon={<AlertCircle />} title={t('data-catalog:hierarchy.permissionDenied')}>
            {t('data-catalog:hierarchy.noAccess')}
          </Alert>
        </div>
      </PageLayout>
    );
  }

  const browseLabel = t('data-catalog:hierarchy.browse');
  const refreshLabel = t('common:actions.refresh');
  const filterPlaceholder = t('data-catalog:hierarchy.filterPlaceholder');

  return (
    <PageLayout
      stackBelow="lg"
      header={
        <>
          <PageHeader title={title} />
          <p className={classes.subtitle}>{t('data-catalog:hierarchy.browserSubtitle')}</p>
        </>
      }
    >
      {/* Left pane: the tree browser; its tools stay put while the tree scrolls */}
      <Pane
        title={browseLabel}
        className={classes.browsePane}
        flush
        actions={
          <Tooltip label={refreshLabel} events={TOOLTIP_EVENTS}>
            <ActionIcon variant="subtle" color="gray" size={26} aria-label={refreshLabel} onClick={fetchRoots}>
              <RefreshCw aria-hidden size={14} />
            </ActionIcon>
          </Tooltip>
        }
      >
        <div className={classes.browse}>
          <div className={classes.browseTools}>
            {/* Root type filter chips */}
            <div className={classes.chips}>
              {ALL_ROOT_TYPES.map((type) => {
                const active = enabledRootTypes.has(type);
                const group = rootGroups.find((g) => g.entity_type === type);
                const count = Array.isArray(group?.roots) ? group.roots.length : 0;
                return (
                  <UnstyledButton
                    key={type}
                    className={classes.chip}
                    data-active={active || undefined}
                    aria-pressed={active}
                    onClick={() => toggleRootType(type)}
                  >
                    {type === 'DataDomain' ? t('data-catalog:hierarchy.rootType.domain') : type === 'DataProduct' ? t('data-catalog:hierarchy.rootType.product') : type}
                    {count > 0 && <span className={classes.chipCount}> {count}</span>}
                  </UnstyledButton>
                );
              })}
            </div>
            <TextInput
              placeholder={filterPlaceholder}
              // The field was named by its placeholder; it keeps that name
              aria-label={filterPlaceholder}
              value={treeFilter}
              onChange={(e) => setTreeFilter(e.currentTarget.value)}
              leftSection={<Search aria-hidden size={14} />}
            />
          </div>

          <div className={classes.tree} role="tree" aria-label={browseLabel}>
            {rootsLoading ? (
              <HierarchyTreeSkeleton groups={3} itemsPerGroup={3} />
            ) : rootsError !== null ? (
              <div className={classes.state}>
                <Alert color="red" variant="light" icon={<AlertCircle />} title={t('common:states.error')} className={classes.alert}>
                  <span className={classes.alertMessage}>{rootsError}</span>
                </Alert>
                <Button variant="outline" onClick={fetchRoots}>{t('common:retry')}</Button>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className={classes.note}>
                <Network aria-hidden className={classes.noteIcon} />
                <p>
                  {treeFilter ? t('data-catalog:hierarchy.noMatches') : t('data-catalog:hierarchy.noRoots')}
                </p>
              </div>
            ) : (
              filteredGroups.map((group) => {
                return (
                  <div key={group.entity_type} className={classes.group}>
                    <div className={classes.groupHead}>
                      <EntityIcon icon={group.icon} className={classes.groupIcon} />
                      <span className={classes.groupLabel}>{formatLabel(group.label)}</span>
                      <span className={classes.groupCount}>{group.roots.length}</span>
                    </div>
                    {group.roots.map((root) => (
                      <HierarchyTreeNode
                        key={`${root.entity_type}-${root.entity_id}`}
                        node={root}
                        depth={0}
                        selectedId={selectedNode?.entity_id}
                        onSelect={handleSelectNode}
                        isLazy
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Pane>

      {/* Right pane: the detail / subtree view */}
      <DetailPanel
        paneLabel={t('data-catalog:hierarchy.detailPane')}
        node={selectedNode}
        loading={detailLoading}
        error={detailError}
        onRetry={retryDetail}
        detailNode={detailNode}
        viewMode={detailViewMode}
        onViewModeChange={setDetailViewMode}
        maxDepth={maxDepth}
        onMaxDepthChange={handleMaxDepthChange}
        visibleTypes={visibleTypes}
        onVisibleTypesChange={setVisibleTypes}
      />
    </PageLayout>
  );
}

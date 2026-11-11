import { createElement, useState, useCallback, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Loader, Tooltip, UnstyledButton } from '@mantine/core';
import {
  ChevronRight, ChevronDown, ExternalLink,
  Box, Table2, Eye, Columns2, LayoutDashboard, Globe, FileCode, Brain,
  Activity, Server, Shield, BookOpen, Database, FolderOpen, Shapes, Network,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import type { InstanceHierarchyNode } from '@/types/ontology-schema';
import classes from './hierarchy-tree-node.module.css';

const ICON_MAP: Record<string, React.ElementType> = {
  Table2, Eye, Columns2, LayoutDashboard, Globe, FileCode, Brain, Activity,
  Server, Shield, BookOpen, Database, FolderOpen, Shapes, Box, Network,
};

const TYPE_ROUTE_MAP: Record<string, string> = {
  DataProduct: '/data-products',
  DataContract: '/data-contracts',
  DataDomain: '/data-domains',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  active: 'default',
  deprecated: 'secondary',
  archived: 'destructive',
};

// Tooltips open on keyboard focus too
const TOOLTIP_EVENTS = { hover: true, focus: true, touch: false };

function getIconComponent(iconName?: string | null): React.ElementType {
  if (!iconName) return Box;
  return ICON_MAP[iconName] || Box;
}

function getEntityRoute(entityType: string, entityId: string): string {
  const base = TYPE_ROUTE_MAP[entityType];
  if (base) return `${base}/${entityId}`;
  return `/assets/${entityId}`;
}

interface HierarchyTreeNodeProps {
  node: InstanceHierarchyNode;
  depth: number;
  selectedId?: string | null;
  onSelect?: (node: InstanceHierarchyNode) => void;
  isLazy?: boolean;
}

/**
 * One row of the Hierarchy Browser's trees (wave 2 Task 13c): the toggle,
 * the type icon, the name (one line, its title in full), the status, the
 * child count and the entity's page; its children load the first time it
 * opens. A failed load shows an error with Retry in place of the children.
 */
export function HierarchyTreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  isLazy = false,
}: HierarchyTreeNodeProps) {
  const { t } = useTranslation(['data-catalog', 'semantic-models', 'common']);
  const [expanded, setExpanded] = useState(depth < 1);
  const [children, setChildren] = useState<InstanceHierarchyNode[]>(
    Array.isArray(node.children) ? node.children : [],
  );
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loaded, setLoaded] = useState(!isLazy || (Array.isArray(node.children) && node.children.length > 0));

  const navigate = useNavigate();
  const { get: apiGet } = useApi();

  const hasChildren = node.child_count > 0 || children.length > 0;
  const isSelected = selectedId === node.entity_id;
  const paddingLeft = depth * 16 + 8;

  const fetchChildren = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    let failed = false;
    try {
      const response = await apiGet<InstanceHierarchyNode>(
        `/api/entity-hierarchy/${node.entity_type}/${node.entity_id}?max_depth=2`
      );
      if (!response.error && response.data) {
        setChildren(Array.isArray(response.data.children) ? response.data.children : []);
      } else {
        failed = true;
      }
    } catch {
      failed = true;
    } finally {
      setLoading(false);
      setLoaded(true);
      setLoadFailed(failed);
    }
  }, [apiGet, node.entity_type, node.entity_id]);

  const loadChildren = useCallback(() => {
    if (loaded || loading) return;
    fetchChildren();
  }, [fetchChildren, loaded, loading]);

  const handleToggle = useCallback(() => {
    if (!expanded && isLazy && !loaded) {
      loadChildren();
    }
    setExpanded(!expanded);
  }, [expanded, isLazy, loaded, loadChildren]);

  const handleClick = useCallback(() => {
    onSelect?.(node);
  }, [onSelect, node]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (!expanded) handleToggle();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (expanded) setExpanded(false);
    }
  }, [handleClick, handleToggle, expanded]);

  const toggleLabel = expanded
    ? t('semantic-models:collectionTree.collapse', { name: node.name })
    : t('semantic-models:collectionTree.expand', { name: node.name });
  const viewDetails = t('data-catalog:hierarchy.viewDetails');

  return (
    <div role="treeitem" aria-expanded={expanded} aria-selected={onSelect ? isSelected : undefined}>
      <div className={classes.row} data-selected={isSelected || undefined} style={{ paddingLeft }}>
        {/* Expand/collapse toggle */}
        <UnstyledButton
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          className={classes.toggle}
          aria-label={toggleLabel}
        >
          {loading ? (
            <Loader size={12} color="gray" aria-hidden />
          ) : hasChildren ? (
            expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />
          ) : (
            <span className={classes.toggleSpacer} />
          )}
        </UnstyledButton>

        {/* Entity icon */}
        {createElement(getIconComponent(node.icon), { 'aria-hidden': true, className: classes.icon })}

        {/* Name: one line, in full in its title; clickable for selection */}
        <UnstyledButton onClick={handleClick} className={classes.name} title={node.name}>
          {node.name}
        </UnstyledButton>

        {/* Status badge */}
        {node.status && (
          <span className={classes.status}>
            <Badge variant={STATUS_VARIANT[node.status] ?? 'outline'}>{node.status}</Badge>
          </span>
        )}

        {/* Child count */}
        {node.child_count > 0 && <span className={classes.count}>{node.child_count}</span>}

        {/* Navigate to detail */}
        <Tooltip label={viewDetails} position="right" events={TOOLTIP_EVENTS}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={20}
            className={classes.open}
            aria-label={viewDetails}
            onClick={(e) => {
              e.stopPropagation();
              navigate(getEntityRoute(node.entity_type, node.entity_id));
            }}
          >
            <ExternalLink aria-hidden size={12} />
          </ActionIcon>
        </Tooltip>
      </div>

      {/* Children */}
      {expanded && (
        <div role="group">
          {children.map((child) => (
            <HierarchyTreeNode
              key={`${child.entity_type}-${child.entity_id}`}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              isLazy={isLazy}
            />
          ))}
          {loading && (
            <div className={classes.note} style={{ paddingLeft: paddingLeft + 16 }}>
              <Loader size={12} color="gray" aria-hidden />
              <span>{t('common:states.loading')}</span>
            </div>
          )}
          {!loading && loadFailed && (
            <div className={classes.failed} style={{ paddingLeft: paddingLeft + 24 }} role="alert">
              <span>{t('data-catalog:hierarchy.childrenLoadFailed')}</span>
              <UnstyledButton className={classes.retry} onClick={fetchChildren}>
                {t('common:retry')}
              </UnstyledButton>
            </div>
          )}
          {!loading && !loadFailed && loaded && children.length === 0 && hasChildren && (
            <div className={classes.empty} style={{ paddingLeft: paddingLeft + 24 }}>
              {t('data-catalog:hierarchy.noChildrenFound')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

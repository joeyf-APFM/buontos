import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
// @ts-expect-error - react-cytoscapejs doesn't have type declarations
import CytoscapeComponent from 'react-cytoscapejs';
import type { Core, ElementDefinition, LayoutOptions } from 'cytoscape';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Select } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, AlertCircle, ZoomIn, ZoomOut, Maximize, RotateCcw,
  Group, Ungroup,
} from 'lucide-react';
import type { LineageGraph, LineageGraphNode } from '@/types/ontology-schema';
import { useFormatLabel } from '@/lib/format-label';
import { cn } from '@/lib/utils';
import classes from './business-lineage-graph.module.css';

// ─── Shared color map — re-exported from lineage constants for backward compat
export { TYPE_COLOR, DEFAULT_HEX, hexForType } from '@/components/lineage/constants';
import { hexForType } from '@/components/lineage/constants';

// ─── Route helpers ──────────────────────────────────────────────────────

const TYPE_ROUTE_MAP: Record<string, string> = {
  DataProduct: '/data-products',
  DataContract: '/data-contracts',
  DataDomain: '/data-domains',
};

function getEntityRoute(entityType: string, entityId: string): string {
  const base = TYPE_ROUTE_MAP[entityType];
  if (base) return `${base}/${entityId}`;
  return `/assets/${entityId}`;
}

function humanizeType(type: string): string {
  return type.replace(/([A-Z])/g, ' $1').trim();
}

// ─── Data conversion ────────────────────────────────────────────────────

function relationshipsToGraph(raw: any, entityType: string, entityId: string, entityName?: string): LineageGraph {
  const nodes: LineageGraphNode[] = [];
  const edges: LineageGraph['edges'] = [];
  const seen = new Set<string>();

  const centerId = `${entityType}:${entityId}`;
  nodes.push({
    id: centerId, entity_type: entityType, entity_id: entityId,
    name: entityName || raw.entity_name || entityType,
    icon: null, status: null, is_center: true,
  });
  seen.add(centerId);

  for (const rel of (raw.outgoing || [])) {
    const nid = `${rel.target_type}:${rel.target_id}`;
    if (!seen.has(nid)) {
      seen.add(nid);
      nodes.push({
        id: nid, entity_type: rel.target_type, entity_id: rel.target_id,
        name: rel.target_name || rel.target_id, icon: null, status: null, is_center: false,
      });
    }
    edges.push({ source: centerId, target: nid, relationship_type: rel.relationship_type, label: rel.relationship_label || rel.relationship_type });
  }

  for (const rel of (raw.incoming || [])) {
    const nid = `${rel.source_type}:${rel.source_id}`;
    if (!seen.has(nid)) {
      seen.add(nid);
      nodes.push({
        id: nid, entity_type: rel.source_type, entity_id: rel.source_id,
        name: rel.source_name || rel.source_id, icon: null, status: null, is_center: false,
      });
    }
    edges.push({ source: nid, target: centerId, relationship_type: rel.relationship_type, label: rel.relationship_label || rel.relationship_type });
  }

  return { center_entity_type: entityType, center_entity_id: entityId, nodes, edges };
}

// ─── Cytoscape elements builder ─────────────────────────────────────────

function buildElements(data: LineageGraph, grouped: boolean, formatLabel: (s: string | null | undefined) => string): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const center = data.nodes.find(n => n.is_center);
  if (!center) return elements;

  const typeGroups: Record<string, LineageGraphNode[]> = {};
  for (const n of data.nodes) {
    if (n.is_center) continue;
    (typeGroups[n.entity_type] ??= []).push(n);
  }

  // Compound group nodes (type containers)
  if (grouped) {
    for (const [type, members] of Object.entries(typeGroups)) {
      elements.push({
        data: {
          id: `group:${type}`,
          label: `${humanizeType(type)} (${members.length})`,
          entityType: type,
          color: hexForType(type),
        },
        classes: 'type-group',
      });
    }
  }

  // Center node
  elements.push({
    data: {
      id: center.id,
      label: center.name,
      entityType: center.entity_type,
      entityId: center.entity_id,
      color: hexForType(center.entity_type),
    },
    classes: 'entity-node center-node',
  });

  // Entity nodes
  for (const n of data.nodes) {
    if (n.is_center) continue;
    const nodeData: any = {
      id: n.id,
      label: n.name,
      entityType: n.entity_type,
      entityId: n.entity_id,
      color: hexForType(n.entity_type),
    };
    if (grouped && typeGroups[n.entity_type]) {
      nodeData.parent = `group:${n.entity_type}`;
    }
    elements.push({ data: nodeData, classes: 'entity-node' });
  }

  // Edges
  for (const e of data.edges) {
    elements.push({
      data: {
        id: `e:${e.source}:${e.target}:${e.relationship_type || ''}`,
        source: e.source,
        target: e.target,
        label: formatLabel(e.label || e.relationship_type) || '',
      },
      classes: 'rel-edge',
    });
  }

  return elements;
}

// ─── Layout configs ─────────────────────────────────────────────────────

type LayoutType = 'cose' | 'concentric' | 'circle' | 'breadthfirst';

function getLayoutConfig(name: LayoutType, animate = true): LayoutOptions {
  const base = { fit: true, padding: 60, animate, animationDuration: animate ? 500 : 0 };

  switch (name) {
    case 'cose':
      return {
        name: 'cose', ...base,
        idealEdgeLength: () => 120,
        nodeOverlap: 30,
        nodeRepulsion: () => 600000,
        edgeElasticity: () => 100,
        nestingFactor: 5,
        gravity: 60,
        numIter: animate ? 1000 : 500,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
        randomize: false,
      };
    case 'concentric':
      return {
        name: 'concentric', ...base,
        avoidOverlap: true,
        minNodeSpacing: 30,
        concentric: (node: any) => node.hasClass('center-node') ? 100 : 1,
        levelWidth: () => 1,
      };
    case 'circle':
      return { name: 'circle', ...base, avoidOverlap: true, spacingFactor: 1.5 };
    case 'breadthfirst':
      return { name: 'breadthfirst', ...base, directed: true, spacingFactor: 1.5, avoidOverlap: true };
    default:
      return { name: 'cose', ...base };
  }
}

// ─── Main Component ─────────────────────────────────────────────────────

interface BusinessLineageGraphProps {
  entityType: string;
  entityId: string;
  entityName?: string;
  className?: string;
  mode?: 'lineage' | 'impact';
  maxDepth?: number;
  source?: 'lineage' | 'relationships';
}

export function BusinessLineageGraph({
  entityType,
  entityId,
  entityName,
  className,
  mode = 'lineage',
  maxDepth = 3,
  source = 'lineage',
}: BusinessLineageGraphProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const cyRef = useRef<Core | null>(null);
  const layoutRef = useRef<any>(null);
  const initialLayoutDoneRef = useRef(false);

  const formatLabel = useFormatLabel();
  const [graphData, setGraphData] = useState<LineageGraph | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutType>('concentric');
  const [showGroups, setShowGroups] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  // Watch dark mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Fetch data
  const fetchGraph = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    initialLayoutDoneRef.current = false;
    try {
      if (source === 'relationships') {
        const res = await fetch(`/api/entities/${entityType}/${entityId}/relationships`);
        if (!res.ok) throw new Error(t('common:businessLineage.failedLoadRelationships', { status: res.status }));
        const raw = await res.json();
        setGraphData(relationshipsToGraph(raw, entityType, entityId, entityName));
      } else {
        const suffix = mode === 'impact' ? '/impact' : '';
        const params = new URLSearchParams({ max_depth: String(maxDepth) });
        const res = await fetch(`/api/business-lineage/${entityType}/${entityId}${suffix}?${params}`);
        if (!res.ok) throw new Error(t('common:businessLineage.failedLoadLineage', { status: res.status }));
        setGraphData(await res.json());
      }
    } catch (e: any) {
      setError(e.message || t('common:businessLineage.failedLoadGraph'));
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId, entityName, mode, maxDepth, source, t]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  // Build elements
  const elements = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) return [];
    return buildElements(graphData, showGroups, formatLabel);
  }, [graphData, showGroups, formatLabel]);

  // Cytoscape stylesheet
  const stylesheet = useMemo((): any[] => {
    const textColor = isDarkMode ? '#f1f5f9' : '#1f2937';
    const textOutline = isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)';
    const edgeColor = isDarkMode ? '#71717a' : '#94a3b8';
    const groupBgOpacity = isDarkMode ? 0.15 : 0.1;

    return [
      // Base node
      {
        selector: 'node',
        style: {
          'font-family': 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          'font-size': 11,
          'font-weight': 500,
          'color': textColor,
          'text-outline-width': 2,
          'text-outline-color': textOutline,
          'text-wrap': 'ellipsis',
          'text-max-width': '120px',
        },
      },
      // Entity nodes
      {
        selector: '.entity-node',
        style: {
          'shape': 'ellipse',
          'width': 28,
          'height': 28,
          'background-color': 'data(color)',
          'border-width': 2,
          'border-color': isDarkMode ? 'rgba(30,30,30,0.8)' : 'rgba(255,255,255,0.9)',
          'label': 'data(label)',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 6,
        },
      },
      // Center node highlight
      {
        selector: '.center-node',
        style: {
          'width': 48,
          'height': 48,
          'border-width': 4,
          'border-color': '#FFD700',
          'font-size': 13,
          'font-weight': 700,
          'z-index': 10,
        },
      },
      // Hover
      {
        selector: '.entity-node.hover',
        style: {
          'width': 38,
          'height': 38,
          'border-width': 3,
          'font-size': 13,
          'font-weight': 600,
          'z-index': 999,
        },
      },
      // Center hover (keep it larger)
      {
        selector: '.center-node.hover',
        style: {
          'width': 56,
          'height': 56,
        },
      },
      // Selected
      {
        selector: '.entity-node:selected',
        style: {
          'width': 44,
          'height': 44,
          'border-width': 4,
          'border-color': '#FFD700',
          'font-size': 14,
          'font-weight': 700,
        },
      },
      // Type group compound nodes
      {
        selector: '.type-group',
        style: {
          'shape': 'round-rectangle',
          'background-color': 'data(color)',
          'background-opacity': groupBgOpacity,
          'border-width': 2,
          'border-color': 'data(color)',
          'border-opacity': 0.4,
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': 12,
          'font-weight': 600,
          'color': textColor,
          'text-margin-y': -8,
          'padding': 24,
        },
      },
      // Edges
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': edgeColor,
          'target-arrow-color': edgeColor,
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.8,
          'curve-style': 'bezier',
          'opacity': 0.6,
          'label': 'data(label)',
          'font-size': 9,
          'font-weight': 400,
          'color': isDarkMode ? '#94a3b8' : '#64748b',
          'text-rotation': 'autorotate',
          'text-outline-width': 2,
          'text-outline-color': isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)',
          'text-background-opacity': 0,
        },
      },
      // Edge hover
      {
        selector: 'edge.hover',
        style: {
          'width': 2.5,
          'opacity': 1,
          'line-color': '#FFD700',
          'target-arrow-color': '#FFD700',
          'font-size': 10,
          'font-weight': 600,
        },
      },
    ];
  }, [isDarkMode]);

  // Wire up event handlers
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.removeAllListeners();

    cy.on('tap', '.entity-node', (evt) => {
      const d = evt.target.data();
      if (d.entityId && !evt.target.hasClass('center-node')) {
        navigate(getEntityRoute(d.entityType, d.entityId));
      }
    });

    cy.on('mouseover', '.entity-node', (evt) => evt.target.addClass('hover'));
    cy.on('mouseout', '.entity-node', (evt) => evt.target.removeClass('hover'));
    cy.on('mouseover', 'edge', (evt) => evt.target.addClass('hover'));
    cy.on('mouseout', 'edge', (evt) => evt.target.removeClass('hover'));

    return () => { cy.removeAllListeners(); };
  }, [navigate, elements]);

  // Run layout when layout type or elements change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const tid = setTimeout(() => {
      const c = cyRef.current;
      if (!c || c.elements().length === 0) return;

      if (layoutRef.current) layoutRef.current.stop();
      const instance = c.layout(getLayoutConfig(layout, true));
      layoutRef.current = instance;
      instance.run();
    }, 50);

    return () => {
      clearTimeout(tid);
      if (layoutRef.current) { layoutRef.current.stop(); layoutRef.current = null; }
    };
  }, [layout, elements.length, showGroups]);

  // Toolbar actions
  const handleFit = () => cyRef.current?.fit(undefined, 60);
  const handleZoomIn = () => { const cy = cyRef.current; if (cy) cy.zoom(cy.zoom() * 1.3); };
  const handleZoomOut = () => { const cy = cyRef.current; if (cy) cy.zoom(cy.zoom() / 1.3); };
  const handleReset = () => {
    const cy = cyRef.current;
    if (!cy) return;
    if (layoutRef.current) layoutRef.current.stop();
    const instance = cy.layout(getLayoutConfig(layout, true));
    layoutRef.current = instance;
    instance.run();
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  // Without a size from the caller, the states are 256px and the graph 500px tall
  const stateClass = cn(classes.state, className || classes.stateHeight);

  if (isLoading) {
    return (
      <div className={stateClass}>
        <Loader2 className={classes.spin} />
        <span>{t('common:businessLineage.loadingRelationships')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(stateClass, classes.column)}>
        <AlertCircle className={classes.errorIcon} />
        <p className={classes.error}>{error}</p>
        <Button variant="outline" size="sm" onClick={fetchGraph}>{t('common:retry')}</Button>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className={stateClass}>
        <p className={classes.muted}>{t('common:businessLineage.noRelationshipData')}</p>
      </div>
    );
  }

  const entityCount = graphData.nodes.length;
  const edgeCount = graphData.edges.length;
  const groupLabel = showGroups ? t('common:businessLineage.ungroupByType') : t('common:businessLineage.groupByType');
  const layouts: LayoutType[] = ['concentric', 'cose', 'circle', 'breadthfirst'];

  return (
    <div className={cn(classes.root, className || classes.graphHeight)}>
      {/* Toolbar */}
      <div className={classes.toolbar}>
        <div className={classes.group}>
          <Select
            className={classes.layout}
            aria-label={t('common:businessLineage.layoutPlaceholder')}
            placeholder={t('common:businessLineage.layoutPlaceholder')}
            value={layout}
            onChange={(v) => v && setLayout(v as LayoutType)}
            allowDeselect={false}
            data={layouts.map((value) => ({ value, label: t(`common:businessLineage.layout.${value}`) }))}
          />

          <ActionIcon
            variant={showGroups ? 'light' : 'subtle'}
            color="gray"
            onClick={() => setShowGroups(g => !g)}
            title={groupLabel}
            aria-label={groupLabel}
            aria-pressed={showGroups}
          >
            {showGroups ? <Group size={16} /> : <Ungroup size={16} />}
          </ActionIcon>

          <Badge variant="secondary">
            {t('common:businessLineage.countBadge', { entities: entityCount, relationships: edgeCount })}
          </Badge>
        </div>

        <div className={classes.group}>
          <ActionIcon variant="subtle" color="gray" onClick={handleZoomOut} title={t('common:tooltips.zoomOut')} aria-label={t('common:tooltips.zoomOut')}>
            <ZoomOut size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" onClick={handleZoomIn} title={t('common:tooltips.zoomIn')} aria-label={t('common:tooltips.zoomIn')}>
            <ZoomIn size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" onClick={handleFit} title={t('common:tooltips.fitToView')} aria-label={t('common:tooltips.fitToView')}>
            <Maximize size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" onClick={handleReset} title={t('common:tooltips.resetLayout')} aria-label={t('common:tooltips.resetLayout')}>
            <RotateCcw size={16} />
          </ActionIcon>
        </div>
      </div>

      {/* Graph */}
      <div className={classes.canvas}>
        <CytoscapeComponent
          key={`rel-graph-${showGroups}`}
          cy={(cy: Core) => {
            cyRef.current = cy;
            if (!initialLayoutDoneRef.current) {
              initialLayoutDoneRef.current = true;
              setTimeout(() => {
                if (cyRef.current && cyRef.current.elements().length > 0) {
                  const instance = cyRef.current.layout(getLayoutConfig(layout, true));
                  layoutRef.current = instance;
                  instance.run();
                }
              }, 50);
            }
          }}
          elements={elements}
          stylesheet={stylesheet}
          layout={{ name: 'preset' }}
          style={{ width: '100%', height: '100%' }}
          minZoom={0.1}
          maxZoom={4}
          wheelSensitivity={0.3}
          boxSelectionEnabled={false}
          autounselectify={false}
          userPanningEnabled={true}
          userZoomingEnabled={true}
        />
      </div>
    </div>
  );
}

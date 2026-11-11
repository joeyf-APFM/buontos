import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
// @ts-expect-error - react-cytoscapejs doesn't have type declarations
import CytoscapeComponent from 'react-cytoscapejs';
import type { Core, ElementDefinition, LayoutOptions, NodeSingular } from 'cytoscape';
import type { OntologyConcept } from '@/types/ontology';
import { resolveLabel } from '@/lib/ontology-utils';
import {
  buildRelationshipEdges,
  relationshipOrder,
  selectRelationshipProperties,
} from './knowledge-graph-relationships';
import { ActionIcon, Checkbox, Popover, ScrollArea, Select, Slider } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/mantine/page';
import { ZoomIn, ZoomOut, Maximize, RotateCcw, Expand, Group, Ungroup, ChevronDown, Tag, Workflow, CircleDot, MoveHorizontal } from 'lucide-react';
import { DISPLAY_FONT } from '@/mantine/theme';
import { useGlossaryPreferencesStore } from '@/stores/glossary-preferences-store';
import classes from './knowledge-graph.module.css';

// Domain colors from app.py
const DOMAIN_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
  '#FF7F50', '#9FE2BF', '#DE3163', '#40E0D0', '#CCCCFF', '#FFB347',
  '#77DD77', '#AEC6CF', '#FDFD96', '#836953', '#C23B22', '#779ECB', '#966FD6',
];

// Threshold for switching from badges to dropdown
const ROOT_BADGE_THRESHOLD = 10;

// Stable default so the graph memo does not recompute on every render when no relationships are passed.
const EMPTY_RELATIONSHIPS: OntologyConcept[] = [];

// Layouts position nodes from hierarchy edges only: relationship edges (object properties) are drawn
// on top so they never reshape the class hierarchy (e.g. breadthfirst would push a range a level down).
const layoutElements = (cy: Core) => cy.elements().not('edge.relationship-edge');

export type LayoutType = 'circle' | 'cose' | 'grid' | 'breadthfirst' | 'concentric';

// Props for the RootNodeFilter component
interface RootNodeFilterProps {
  rootNodes: OntologyConcept[];
  rootColors: Map<string, string>;
  hiddenRoots: Set<string>;
  onToggleRoot: (iri: string) => void;
  getRootDescendants: (rootIri: string) => Set<string>;
  selectedLanguage: string;
}

// Internal component for filtering root nodes - handles both badge and dropdown modes
const RootNodeFilter: React.FC<RootNodeFilterProps> = ({
  rootNodes,
  rootColors,
  hiddenRoots,
  onToggleRoot,
  getRootDescendants,
  selectedLanguage,
}) => {
  const { t } = useTranslation(['semantic-models', 'common']);
  const visibleCount = rootNodes.filter(r => !hiddenRoots.has(r.iri)).length;
  const totalCount = rootNodes.length;

  // Show all roots
  const handleShowAll = () => {
    rootNodes.forEach(root => {
      if (hiddenRoots.has(root.iri)) {
        onToggleRoot(root.iri);
      }
    });
  };

  // Hide all roots
  const handleHideAll = () => {
    rootNodes.forEach(root => {
      if (!hiddenRoots.has(root.iri)) {
        onToggleRoot(root.iri);
      }
    });
  };

  // Badge mode: render clickable badge buttons (when <= threshold)
  if (rootNodes.length <= ROOT_BADGE_THRESHOLD) {
    return (
      <div className={classes.roots}>
        {rootNodes.map(root => {
          const color = rootColors.get(root.iri) || '#64748b';
          const label = resolveLabel(root, selectedLanguage);
          const isHidden = hiddenRoots.has(root.iri);
          const descendants = getRootDescendants(root.iri);

          return (
            <button
              key={root.iri}
              type="button"
              onClick={() => onToggleRoot(root.iri)}
              className={classes.root}
              data-hidden={isHidden || undefined}
              aria-pressed={!isHidden}
              // The root's own colour, from the data
              style={{ borderColor: color, backgroundColor: isHidden ? undefined : `${color}15` }}
              title={isHidden
                ? t('semantic-models:knowledgeGraph.rootFilter.show', { label, count: descendants.size })
                : t('semantic-models:knowledgeGraph.rootFilter.hide', { label, count: descendants.size })}
            >
              <span aria-hidden className={classes.dot} style={{ backgroundColor: color }} />
              <span className={classes.rootLabel}>{label}</span>
              <span className={classes.muted}>({descendants.size})</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Dropdown mode: render a popover with checkboxes (when > threshold)
  return (
    <div className={classes.rootsLine}>
      <Popover position="bottom-start" withinPortal trapFocus shadow="md">
        <Popover.Target>
          <Button variant="outline" size="sm">
            {t('semantic-models:knowledgeGraph.rootFilter.sourcesVisible', { visible: visibleCount, total: totalCount })}
            <ChevronDown aria-hidden />
          </Button>
        </Popover.Target>
        <Popover.Dropdown className={classes.rootsDropdown}>
          <div className={classes.rootsHead}>
            <span className={classes.strong}>{t('semantic-models:knowledgeGraph.rootFilter.filterSources')}</span>
            <div className={classes.inline}>
              <Button variant="ghost" size="sm" onClick={handleShowAll}>
                {t('semantic-models:knowledgeGraph.rootFilter.showAll')}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleHideAll}>
                {t('semantic-models:knowledgeGraph.rootFilter.hideAll')}
              </Button>
            </div>
          </div>
          <ScrollArea.Autosize mah={300}>
            <div className={classes.rootsList}>
              {rootNodes.map(root => {
                const color = rootColors.get(root.iri) || '#64748b';
                const label = resolveLabel(root, selectedLanguage);
                const isVisible = !hiddenRoots.has(root.iri);
                const descendants = getRootDescendants(root.iri);

                return (
                  <Checkbox
                    key={root.iri}
                    size="xs"
                    className={classes.rootOption}
                    data-hidden={!isVisible || undefined}
                    checked={isVisible}
                    onChange={() => onToggleRoot(root.iri)}
                    label={
                      <span className={classes.rootOptionLabel}>
                        <span aria-hidden className={classes.dot} style={{ backgroundColor: color }} />
                        <span className={classes.rootLabel}>{label}</span>
                        <span className={classes.muted}>({descendants.size})</span>
                      </span>
                    }
                  />
                );
              })}
            </div>
          </ScrollArea.Autosize>
        </Popover.Dropdown>
      </Popover>
      <span className={classes.muted}>
        {t('semantic-models:knowledgeGraph.rootFilter.toggleHint')}
      </span>
    </div>
  );
};

/** A zoom control: an icon button named by its label (also its tooltip). */
function ZoomButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <ActionIcon variant="subtle" size={26} aria-label={label} title={label} onClick={onClick}>
      {icon}
    </ActionIcon>
  );
}

interface KnowledgeGraphProps {
  concepts: OntologyConcept[];
  /** Object properties drawn as edges even when property nodes are hidden (see collectRelationshipConcepts). */
  relationships?: OntologyConcept[];
  hiddenRoots: Set<string>;
  onToggleRoot: (rootIri: string) => void;
  onNodeClick: (concept: OntologyConcept) => void;
  showRootBadges?: boolean;
  selectedLanguage?: string;
}

interface GraphData {
  elements: ElementDefinition[];
  rootNodes: OntologyConcept[];
  rootColors: Map<string, string>;
  getRootDescendants: (rootIri: string) => Set<string>;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  concepts,
  relationships = EMPTY_RELATIONSHIPS,
  hiddenRoots,
  onToggleRoot,
  onNodeClick,
  showRootBadges = true,
  selectedLanguage = 'en',
}) => {
  const { t } = useTranslation(['semantic-models', 'common']);
  const cyRef = useRef<Core | null>(null);
  const fullscreenCyRef = useRef<Core | null>(null);
  const layoutRef = useRef<{ stop: () => void } | null>(null);
  const initialLayoutDoneRef = useRef(false);
  const fullscreenInitialLayoutDoneRef = useRef(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // User-facing display options are persisted (survive reloads) in the
  // glossary preferences store; transient state above stays local.
  const layout = useGlossaryPreferencesStore((s) => s.graphLayout);
  const showDomainBoxes = useGlossaryPreferencesStore((s) => s.graphShowDomainBoxes);
  const showNodeLabels = useGlossaryPreferencesStore((s) => s.graphShowNodeLabels);
  const showEdgeLabels = useGlossaryPreferencesStore((s) => s.graphShowEdgeLabels);
  const nodeSize = useGlossaryPreferencesStore((s) => s.graphNodeSize);
  const spacing = useGlossaryPreferencesStore((s) => s.graphSpacing);
  const setGraphOption = useGlossaryPreferencesStore((s) => s.setGraphOption);
  const setLayout = useCallback((v: LayoutType) => setGraphOption('graphLayout', v), [setGraphOption]);
  const setShowDomainBoxes = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => setGraphOption('graphShowDomainBoxes', v),
    [setGraphOption],
  );
  const setShowNodeLabels = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => setGraphOption('graphShowNodeLabels', v),
    [setGraphOption],
  );
  const setShowEdgeLabels = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => setGraphOption('graphShowEdgeLabels', v),
    [setGraphOption],
  );
  const setNodeSize = useCallback((v: number) => setGraphOption('graphNodeSize', v), [setGraphOption]);
  const setSpacing = useCallback((v: number) => setGraphOption('graphSpacing', v), [setGraphOption]);
  
  // Handler for toggling domain boxes
  const handleToggleDomainBoxes = useCallback(() => {
    setShowDomainBoxes(prev => !prev);
  }, [setShowDomainBoxes]);

  // Reset layout done ref when showDomainBoxes changes (component will remount)
  useEffect(() => {
    initialLayoutDoneRef.current = false;
    fullscreenInitialLayoutDoneRef.current = false;
  }, [showDomainBoxes]);

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    checkDarkMode();
    
    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  // Cleanup cytoscape and layouts on unmount
  useEffect(() => {
    return () => {
      // Stop any running layout
      if (layoutRef.current) {
        layoutRef.current.stop();
        layoutRef.current = null;
      }
      // Remove all listeners from cytoscape
      if (cyRef.current) {
        cyRef.current.removeAllListeners();
        cyRef.current = null;
      }
    };
  }, []);

  // Transform concepts to Cytoscape elements
  const graphData = useMemo((): GraphData => {
    // Object properties whose domain AND range are classes/concepts in this graph are drawn as
    // labelled relationship edges (domain -> range) instead of standalone property nodes.
    const relationshipProps = selectRelationshipProperties(
      Array.from(new Map([...concepts, ...relationships].map((c) => [c.iri, c])).values())
    );
    const relationshipIris = new Set(relationshipProps.map((c) => c.iri));
    // Sibling order for the hierarchical layout: follow relationship direction (see relationshipOrder).
    const relOrder = relationshipOrder(relationshipProps);

    // Include classes, concepts, and properties (matching the tree view), minus edge-drawn relationships
    const visibleConcepts = concepts.filter(
      (c) =>
        (c.concept_type === 'class' || c.concept_type === 'concept' || c.concept_type === 'property') &&
        !relationshipIris.has(c.iri)
    );

    // Build concept map for fast lookups
    const conceptMap = new Map(visibleConcepts.map(c => [c.iri, c]));

    // Identify root nodes: no parents, OR all parents are outside the visible set
    const rootNodes = visibleConcepts.filter((c) => {
      if (!c.parent_concepts || c.parent_concepts.length === 0) return true;
      return c.parent_concepts.every(parentIri => !conceptMap.has(parentIri));
    });

    // Generate colors for each root
    const rootColors = new Map<string, string>();
    rootNodes.forEach((root, index) => {
      rootColors.set(root.iri, DOMAIN_COLORS[index % DOMAIN_COLORS.length]);
    });

    const nodeToRoot = new Map<string, string>();

    const findRoot = (iri: string, visited = new Set<string>()): string | null => {
      if (visited.has(iri)) return null;
      visited.add(iri);
      
      const concept = conceptMap.get(iri);
      if (!concept) return null;
      
      if (!concept.parent_concepts || concept.parent_concepts.length === 0) {
        return iri;
      }

      // All parents external → this is a root in the visible set
      if (concept.parent_concepts.every(p => !conceptMap.has(p))) {
        return iri;
      }
      
      for (const parentIri of concept.parent_concepts) {
        const root = findRoot(parentIri, visited);
        if (root) return root;
      }
      
      return null;
    };

    visibleConcepts.forEach(concept => {
      const root = findRoot(concept.iri);
      if (root) {
        nodeToRoot.set(concept.iri, root);
      }
    });

    // Get all descendants of a root (including the root itself)
    const getRootDescendants = (rootIri: string): Set<string> => {
      const descendants = new Set<string>([rootIri]);
      const queue = [rootIri];
      
      while (queue.length > 0) {
        const currentIri = queue.shift()!;
        const concept = conceptMap.get(currentIri);
        
        if (concept?.child_concepts) {
          concept.child_concepts.forEach(childIri => {
            if (!descendants.has(childIri) && conceptMap.has(childIri)) {
              descendants.add(childIri);
              queue.push(childIri);
            }
          });
        }
      }
      
      return descendants;
    };

    // Filter nodes based on hidden roots
    const visibleNodeIris = new Set<string>();
    rootNodes.forEach(root => {
      if (!hiddenRoots.has(root.iri)) {
        const descendants = getRootDescendants(root.iri);
        descendants.forEach(iri => visibleNodeIris.add(iri));
      }
    });

    const filteredConcepts = visibleConcepts.filter(c => visibleNodeIris.has(c.iri));

    // Build elements array
    const elements: ElementDefinition[] = [];

    // Add domain compound nodes (parents) if enabled
    if (showDomainBoxes) {
      rootNodes.forEach(root => {
        if (!hiddenRoots.has(root.iri)) {
          elements.push({
            data: {
              id: `domain_${root.iri}`,
              label: resolveLabel(root, selectedLanguage),
              type: 'domain',
              color: rootColors.get(root.iri),
            },
            classes: 'domain-node',
          });
        }
      });
    }

    // Add concept nodes
    filteredConcepts.forEach(concept => {
      const rootIri = nodeToRoot.get(concept.iri) || concept.iri;
      const color = rootColors.get(rootIri) || '#64748b';
      
      const isProperty = concept.concept_type === 'property';
      const nodeData: ElementDefinition = {
        data: {
          id: concept.iri,
          label: resolveLabel(concept, selectedLanguage),
          type: 'concept',
          conceptType: concept.concept_type,
          color: color,
          conceptData: concept,
          sourceContext: concept.source_context,
          childCount: concept.child_concepts?.length || 0,
          parentCount: concept.parent_concepts?.length || 0,
          relOrder: relOrder.get(concept.iri) ?? Number.MAX_SAFE_INTEGER,
        },
        classes: isProperty ? 'concept-node property-node' : 'concept-node',
      };

      // Add parent reference for compound nodes
      if (showDomainBoxes && !hiddenRoots.has(rootIri)) {
        nodeData.data.parent = `domain_${rootIri}`;
      }

      elements.push(nodeData);
    });

    // Add edges for parent-child relationships
    filteredConcepts.forEach(concept => {
      concept.child_concepts.forEach(childIri => {
        const childExists = filteredConcepts.some(c => c.iri === childIri);
        if (childExists) {
          elements.push({
            data: {
              id: `edge_${concept.iri}_${childIri}`,
              source: concept.iri,
              target: childIri,
              // Generic hierarchy relation; future: derive from RDF predicate when typed edges land.
              label: 'subClassOf',
            },
            classes: 'hierarchy-edge',
          });
        }
      });
    });

    // Add edges for relationships (object properties), only when both ends are visible
    elements.push(
      ...buildRelationshipEdges(
        relationshipProps,
        new Set(filteredConcepts.map((c) => c.iri)),
        (prop) => resolveLabel(prop, selectedLanguage)
      )
    );

    return { elements, rootNodes, rootColors, getRootDescendants };
  }, [concepts, relationships, hiddenRoots, showDomainBoxes, selectedLanguage]);

  // Create stylesheet based on dark mode
  // Cytoscape stylesheet - using any[] due to complex type definitions
  const stylesheet = useMemo((): any[] => {
    const textColor = isDarkMode ? '#f1f5f9' : '#1f2937';
    const textOutlineColor = isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)';
    const edgeColor = isDarkMode ? '#71717a' : '#64748b';
    const relationshipColor = isDarkMode ? '#a78bfa' : '#7c3aed';
    const domainBgOpacity = isDarkMode ? 0.15 : 0.12;
    
    return [
      // Base node styles
      {
        selector: 'node',
        style: {
          'font-family': DISPLAY_FONT,
          'font-size': 11,
          'font-weight': 500,
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 8,
          'color': textColor,
          'text-outline-width': 2,
          'text-outline-color': textOutlineColor,
        },
      },
      // Concept nodes
      {
        selector: '.concept-node',
        style: {
          'shape': 'ellipse',
          'width': nodeSize,
          'height': nodeSize,
          'background-color': 'data(color)',
          'border-width': 2,
          'border-color': isDarkMode ? 'rgba(30,30,30,0.8)' : 'rgba(255,255,255,0.9)',
          'label': showNodeLabels ? 'data(label)' : '',
        },
      },
      // Concept node hover
      {
        selector: '.concept-node.hover',
        style: {
          'width': nodeSize * 1.33,
          'height': nodeSize * 1.33,
          'border-width': 3,
          'label': 'data(label)',
          'font-size': 13,
          'font-weight': 600,
          'z-index': 999,
        },
      },
      // Concept node selected
      {
        selector: '.concept-node:selected',
        style: {
          'width': nodeSize * 1.67,
          'height': nodeSize * 1.67,
          'border-width': 4,
          'border-color': '#FFD700',
          'label': 'data(label)',
          'font-size': 14,
          'font-weight': 700,
        },
      },
      // Property nodes (diamond shape to distinguish from class/concept ellipses)
      {
        selector: '.property-node',
        style: {
          'shape': 'diamond',
          'width': nodeSize * 0.83,
          'height': nodeSize * 0.83,
        },
      },
      {
        selector: '.property-node.hover',
        style: {
          'width': nodeSize * 1.17,
          'height': nodeSize * 1.17,
        },
      },
      {
        selector: '.property-node:selected',
        style: {
          'width': nodeSize * 1.5,
          'height': nodeSize * 1.5,
        },
      },
      // Domain compound nodes (no label to avoid redundancy with contained nodes)
      {
        selector: '.domain-node',
        style: {
          'shape': 'round-rectangle',
          'background-color': 'data(color)',
          'background-opacity': domainBgOpacity,
          'border-width': 2,
          'border-color': 'data(color)',
          'border-opacity': 0.4,
          'label': '',
          'padding': 30,
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
          'label': showEdgeLabels ? 'data(label)' : '',
          'font-size': 9,
          'font-family': DISPLAY_FONT,
          'color': textColor,
          'text-outline-width': 1,
          'text-outline-color': textOutlineColor,
          'text-rotation': 'autorotate',
          'text-background-opacity': 0,
        },
      },
      // Relationship edges (object properties): dashed and curved so they read as links, not hierarchy,
      // and arc clear of sibling nodes laid out on the same row. Labels follow the edge-labels toggle.
      {
        selector: 'edge.relationship-edge',
        style: {
          'line-style': 'dashed',
          'line-color': relationshipColor,
          'target-arrow-color': relationshipColor,
          'target-arrow-shape': 'triangle',
          'curve-style': 'unbundled-bezier',
          'control-point-distances': [-40],
          'control-point-weights': [0.5],
          'opacity': 0.85,
          'color': relationshipColor,
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
        },
      },
    ];
  }, [isDarkMode, showNodeLabels, showEdgeLabels, nodeSize]);

  // Layout configurations
  const getLayoutConfig = useCallback((layoutName: LayoutType, animate = true): LayoutOptions => {
    const baseConfig = {
      fit: true,
      padding: 60,
      animate: animate,
      animationDuration: animate ? 500 : 0,
    };

    // Scale layout-level spacing knobs from the single user slider (default 80).
    const spacingFactor = (spacing / 80) * 1.5;

    switch (layoutName) {
      case 'circle':
        return {
          name: 'circle',
          ...baseConfig,
          avoidOverlap: true,
          spacingFactor,
        };
      case 'cose':
        return {
          name: 'cose',
          ...baseConfig,
          idealEdgeLength: () => spacing,
          nodeOverlap: 20,
          // Preserves 80 → 400000 ratio so default behavior matches pre-slider.
          nodeRepulsion: () => spacing * 5000,
          edgeElasticity: () => 100,
          nestingFactor: 5,
          gravity: 80,
          numIter: animate ? 1000 : 500,
          initialTemp: 200,
          coolingFactor: 0.95,
          minTemp: 1.0,
          randomize: false,
        };
      case 'grid':
        return {
          name: 'grid',
          ...baseConfig,
          avoidOverlap: true,
          avoidOverlapPadding: Math.max(4, spacing / 8),
          condense: false,
        };
      case 'breadthfirst':
        return {
          name: 'breadthfirst',
          ...baseConfig,
          directed: true,
          spacingFactor,
          avoidOverlap: true,
          maximal: false,
          // Within a level, place relationship chains in their direction (domain before range), then by label,
          // so e.g. stages linked by "precedes" read left to right instead of crossing.
          depthSort: (a: NodeSingular, b: NodeSingular) =>
            (a.data('relOrder') ?? Number.MAX_SAFE_INTEGER) - (b.data('relOrder') ?? Number.MAX_SAFE_INTEGER) ||
            String(a.data('label') ?? '').localeCompare(String(b.data('label') ?? '')),
        } as LayoutOptions;
      case 'concentric':
        return {
          name: 'concentric',
          ...baseConfig,
          avoidOverlap: true,
          minNodeSpacing: Math.max(8, spacing / 4),
          concentric: (node: any) => node.degree(),
          levelWidth: () => 2,
        };
      default:
        return { name: 'circle', ...baseConfig };
    }
  }, [spacing]);

  // Wire up event handlers
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Clear existing handlers
    cy.removeAllListeners();

    // Node click handler
    cy.on('tap', 'node.concept-node', (evt) => {
      const nodeData = evt.target.data();
      if (nodeData.conceptData) {
        onNodeClick(nodeData.conceptData);
      }
    });

    // Hover handlers
    cy.on('mouseover', 'node.concept-node', (evt) => {
      evt.target.addClass('hover');
    });

    cy.on('mouseout', 'node.concept-node', (evt) => {
      evt.target.removeClass('hover');
    });

    cy.on('mouseover', 'edge', (evt) => {
      evt.target.addClass('hover');
    });

    cy.on('mouseout', 'edge', (evt) => {
      evt.target.removeClass('hover');
    });

    // Cleanup
    return () => {
      cy.removeAllListeners();
    };
  }, [onNodeClick]);

  // Run layout when layout type changes or when elements change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    
    // Small delay to ensure cytoscape is fully initialized
    const timeoutId = setTimeout(() => {
      const currentCy = cyRef.current;
      if (!currentCy || currentCy.elements().length === 0) return;

      // Stop any running layout first
      if (layoutRef.current) {
        layoutRef.current.stop();
      }

      const layoutConfig = getLayoutConfig(layout, true);
      const layoutInstance = layoutElements(currentCy).layout(layoutConfig);
      layoutRef.current = layoutInstance;
      layoutInstance.run();
    }, 50);

    // Cleanup: stop layout on unmount or before re-running
    return () => {
      clearTimeout(timeoutId);
      if (layoutRef.current) {
        layoutRef.current.stop();
        layoutRef.current = null;
      }
    };
  }, [layout, getLayoutConfig, graphData.elements.length]);

  // Control handlers
  const handleFit = () => {
    cyRef.current?.fit(undefined, 60);
  };

  const handleZoomIn = () => {
    const cy = cyRef.current;
    if (cy) {
      cy.zoom(cy.zoom() * 1.3);
    }
  };

  const handleZoomOut = () => {
    const cy = cyRef.current;
    if (cy) {
      cy.zoom(cy.zoom() / 1.3);
    }
  };

  const handleReset = () => {
    const cy = cyRef.current;
    if (cy) {
      // Stop any running layout first
      if (layoutRef.current) {
        layoutRef.current.stop();
      }
      const layoutConfig = getLayoutConfig(layout);
      const layoutInstance = layoutElements(cy).layout(layoutConfig);
      layoutRef.current = layoutInstance;
      layoutInstance.run();
    }
  };

  const conceptCount = graphData.elements.filter(e => e.classes?.includes('concept-node')).length;
  const layouts = [
    { value: 'circle', label: t('semantic-models:knowledgeGraph.layouts.circular') },
    { value: 'cose', label: t('semantic-models:knowledgeGraph.layouts.forceDirected') },
    { value: 'grid', label: t('semantic-models:knowledgeGraph.layouts.grid') },
    { value: 'breadthfirst', label: t('semantic-models:knowledgeGraph.layouts.hierarchical') },
    { value: 'concentric', label: t('semantic-models:knowledgeGraph.layouts.concentric') },
  ];

  // The display options, the same in the pane and in the fullscreen view.
  // Their popovers trap focus, so Escape closes only them (also inside the
  // fullscreen Dialog).
  const displayOptions = (align: 'start' | 'end') => (
    <div className={classes.options}>
      <Select
        aria-label={t('semantic-models:knowledgeGraph.layout.placeholder')}
        placeholder={t('semantic-models:knowledgeGraph.layout.placeholder')}
        data={layouts}
        value={layout}
        onChange={(v) => v && setLayout(v as LayoutType)}
        allowDeselect={false}
        className={classes.layout}
      />

      <Button
        variant={showDomainBoxes ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={showDomainBoxes}
        onClick={handleToggleDomainBoxes}
        title={showDomainBoxes ? t('semantic-models:knowledgeGraph.toolbar.hideDomainGroups') : t('semantic-models:knowledgeGraph.toolbar.showDomainGroups')}
      >
        {showDomainBoxes ? <Group aria-hidden /> : <Ungroup aria-hidden />}
        {t('semantic-models:knowledgeGraph.toolbar.groups')}
      </Button>

      <Button
        variant={showNodeLabels ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={showNodeLabels}
        onClick={() => setShowNodeLabels(prev => !prev)}
        title={showNodeLabels ? t('semantic-models:knowledgeGraph.toolbar.hideNodeLabels') : t('semantic-models:knowledgeGraph.toolbar.showNodeLabels')}
      >
        <Tag aria-hidden />
        {t('semantic-models:knowledgeGraph.toolbar.nodeLabels')}
      </Button>

      <Button
        variant={showEdgeLabels ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={showEdgeLabels}
        onClick={() => setShowEdgeLabels(prev => !prev)}
        title={showEdgeLabels ? t('semantic-models:knowledgeGraph.toolbar.hideEdgeLabels') : t('semantic-models:knowledgeGraph.toolbar.showEdgeLabels')}
      >
        <Workflow aria-hidden />
        {t('semantic-models:knowledgeGraph.toolbar.edgeLabels')}
      </Button>

      <Popover position={align === 'start' ? 'bottom-start' : 'bottom-end'} withinPortal trapFocus shadow="md">
        <Popover.Target>
          <Button variant="ghost" size="sm" title={t('semantic-models:knowledgeGraph.toolbar.nodeSize')}>
            <CircleDot aria-hidden />
            {t('semantic-models:knowledgeGraph.toolbar.size')}
          </Button>
        </Popover.Target>
        <Popover.Dropdown className={classes.sliderDropdown}>
          <div className={classes.sliderHead}>
            <span className={classes.strong}>{t('semantic-models:knowledgeGraph.toolbar.nodeSize')}</span>
            <div className={classes.inline}>
              <span className={classes.value}>{nodeSize}</span>
              <Button variant="ghost" size="sm" onClick={() => setNodeSize(24)}>
                {t('common:actions.reset')}
              </Button>
            </div>
          </div>
          <Slider
            value={nodeSize}
            onChange={setNodeSize}
            min={12}
            max={48}
            step={2}
            label={null}
            thumbLabel={t('semantic-models:knowledgeGraph.toolbar.nodeSize')}
          />
        </Popover.Dropdown>
      </Popover>

      <Popover position={align === 'start' ? 'bottom-start' : 'bottom-end'} withinPortal trapFocus shadow="md">
        <Popover.Target>
          <Button variant="ghost" size="sm" title={t('semantic-models:knowledgeGraph.toolbar.nodeSpacing')}>
            <MoveHorizontal aria-hidden />
            {t('semantic-models:knowledgeGraph.toolbar.spacing')}
          </Button>
        </Popover.Target>
        <Popover.Dropdown className={classes.sliderDropdown}>
          <div className={classes.sliderHead}>
            <span className={classes.strong}>{t('semantic-models:knowledgeGraph.toolbar.spacing')}</span>
            <div className={classes.inline}>
              <span className={classes.value}>{spacing}</span>
              <Button variant="ghost" size="sm" onClick={() => setSpacing(80)}>
                {t('common:actions.reset')}
              </Button>
            </div>
          </div>
          <Slider
            value={spacing}
            onChange={setSpacing}
            min={40}
            max={240}
            step={10}
            label={null}
            thumbLabel={t('semantic-models:knowledgeGraph.toolbar.nodeSpacing')}
          />
          <p className={classes.hint}>{t('semantic-models:knowledgeGraph.toolbar.spacingHint')}</p>
        </Popover.Dropdown>
      </Popover>

      <Badge variant="secondary">
        {t('semantic-models:knowledgeGraph.toolbar.conceptCount', { count: conceptCount })}
      </Badge>
    </div>
  );

  const legend = showRootBadges && (
    <div className={classes.legend}>
      <RootNodeFilter
        rootNodes={graphData.rootNodes}
        rootColors={graphData.rootColors}
        hiddenRoots={hiddenRoots}
        onToggleRoot={onToggleRoot}
        getRootDescendants={graphData.getRootDescendants}
        selectedLanguage={selectedLanguage}
      />
    </div>
  );

  return (
    <div className={classes.graph}>
      {/* Legend with toggleable roots - shown when Group by Source is OFF */}
      {legend}

      {/* Toolbar */}
      <div className={classes.toolbar}>
        {displayOptions('start')}
        <div className={classes.zoom}>
          <ZoomButton label={t('common:tooltips.zoomOut')} icon={<ZoomOut aria-hidden size={14} />} onClick={handleZoomOut} />
          <ZoomButton label={t('common:tooltips.zoomIn')} icon={<ZoomIn aria-hidden size={14} />} onClick={handleZoomIn} />
          <ZoomButton label={t('common:tooltips.fitToView')} icon={<Maximize aria-hidden size={14} />} onClick={handleFit} />
          <ZoomButton label={t('common:tooltips.resetLayout')} icon={<RotateCcw aria-hidden size={14} />} onClick={handleReset} />
          <span aria-hidden className={classes.divider} />
          <ZoomButton label={t('common:tooltips.openFullscreen')} icon={<Expand aria-hidden size={14} />} onClick={() => setIsFullscreen(true)} />
        </div>
      </div>

      {/* Graph */}
      <div className={classes.canvas}>
        <CytoscapeComponent
          key={`graph-${showDomainBoxes}`}
          cy={(cy: Core) => {
            cyRef.current = cy;
            // Run initial layout only once after mounting
            if (!initialLayoutDoneRef.current) {
              initialLayoutDoneRef.current = true;
              setTimeout(() => {
                if (cyRef.current && cyRef.current.elements().length > 0) {
                  const layoutConfig = getLayoutConfig(layout, true);
                  layoutElements(cyRef.current).layout(layoutConfig).run();
                }
              }, 50);
            }
          }}
          elements={graphData.elements}
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

      {/* Fullscreen view, on the kit Dialog */}
      <Dialog
        opened={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        size="full"
        height="95vh"
        title={t('common:labels.viewGraph')}
        description={t('semantic-models:knowledgeGraph.fullscreen.hint')}
        footer={
          <>
            <ZoomButton label={t('common:tooltips.zoomOut')} icon={<ZoomOut aria-hidden size={14} />} onClick={() => fullscreenCyRef.current?.zoom((fullscreenCyRef.current?.zoom() || 1) / 1.3)} />
            <ZoomButton label={t('common:tooltips.zoomIn')} icon={<ZoomIn aria-hidden size={14} />} onClick={() => fullscreenCyRef.current?.zoom((fullscreenCyRef.current?.zoom() || 1) * 1.3)} />
            <ZoomButton label={t('common:tooltips.fitToView')} icon={<Maximize aria-hidden size={14} />} onClick={() => fullscreenCyRef.current?.fit(undefined, 60)} />
            <ZoomButton label={t('common:tooltips.resetLayout')} icon={<RotateCcw aria-hidden size={14} />} onClick={() => {
              const cy = fullscreenCyRef.current;
              if (cy) {
                const layoutConfig = getLayoutConfig(layout, true);
                layoutElements(cy).layout(layoutConfig).run();
              }
            }} />
          </>
        }
      >
        {displayOptions('end')}
        {/* Legend in the dialog - shown when Group by Source is OFF */}
        {legend}

        {/* Fullscreen Graph */}
        <div className={classes.fullscreenCanvas}>
          {isFullscreen && (
            <CytoscapeComponent
              key={`fullscreen-graph-${showDomainBoxes}`}
              cy={(cy: Core) => {
                fullscreenCyRef.current = cy;
                // Run layout only once after mounting in fullscreen
                if (!fullscreenInitialLayoutDoneRef.current) {
                  fullscreenInitialLayoutDoneRef.current = true;
                  const timeoutId = setTimeout(() => {
                    if (fullscreenCyRef.current && fullscreenCyRef.current.elements().length > 0) {
                      const layoutConfig = getLayoutConfig(layout, true);
                      layoutElements(fullscreenCyRef.current).layout(layoutConfig).run();
                    }
                  }, 150);
                  // Store cleanup
                  cy.scratch('_layoutTimeout', timeoutId);
                }
              }}
              elements={graphData.elements}
              stylesheet={stylesheet}
              layout={{ name: 'preset' }}
              style={{ width: '100%', height: '100%' }}
              minZoom={0.05}
              maxZoom={5}
              wheelSensitivity={0.3}
              boxSelectionEnabled={false}
              autounselectify={false}
              userPanningEnabled={true}
              userZoomingEnabled={true}
            />
          )}
        </div>
      </Dialog>
    </div>
  );
};

export default KnowledgeGraph;


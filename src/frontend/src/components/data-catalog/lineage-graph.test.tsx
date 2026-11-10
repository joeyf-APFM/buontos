/**
 * The Data Catalog lineage graph takes what the lineage endpoint returned; a
 * body without a nodes array (such as the e2e fallback `[]`) shows the empty
 * state instead of crashing, as business-lineage-view does.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import type { LineageGraph } from '@/types/data-catalog';
import LineageGraphComponent from './lineage-graph';

const renderGraph = (graph: unknown) =>
  renderWithMantine(
    <LineageGraphComponent graph={graph as LineageGraph} direction="both" onDirectionChange={vi.fn()} />,
  );

describe('lineage graph', () => {
  it.each([
    ['an array', []],
    ['an object without nodes', {}],
    ['nodes that are not an array', { nodes: 'x', edges: [] }],
  ])('shows the empty state for %s', (_name, graph) => {
    renderGraph(graph);
    expect(screen.getByText('No lineage information available')).toBeInTheDocument();
  });

  it('draws nodes when edges are missing', () => {
    renderGraph({
      root_table: 'main.sales.orders',
      nodes: [
        { id: 'main.sales.orders', name: 'orders', type: 'table', catalog: 'main', schema: 'sales', is_root: true, depth: 0 },
        { id: 'main.sales.raw', name: 'raw_orders', type: 'table', catalog: 'main', schema: 'sales', is_root: false, depth: -1 },
      ],
      upstream_count: 1,
      downstream_count: 0,
      external_count: 0,
    });
    expect(screen.getByText('raw_orders')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Lineage direction' })).toBeInTheDocument();
  });
});

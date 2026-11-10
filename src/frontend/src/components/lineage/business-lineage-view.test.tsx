import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import BusinessLineageView from './business-lineage-view';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('BusinessLineageView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A response that isn't a lineage graph (a fixture's [], an empty object, a
  // graph without nodes or edges) is no lineage, not a crash
  it.each([
    ['an array', []],
    ['an empty object', {}],
    ['a graph without nodes', { center_entity_type: 'Table', center_entity_id: 'a1', edges: [] }],
    ['a graph with nodes but no edges', { center_entity_type: 'Table', center_entity_id: 'a1', nodes: [] }],
  ])('shows the empty state for %s', async (_name, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(body)));
    renderWithMantine(<BusinessLineageView entityType="Table" entityId="a1" />);
    expect(await screen.findByText('No lineage data available')).toBeInTheDocument();
  });
});

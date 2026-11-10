/**
 * The shared panels' opt-in `pane` mode (Task 11): a page-kit Pane in place
 * of the Card, which still takes the caller's className.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import kit from '@/mantine/page/page.module.css';
import { EntityTreePanel } from './entity-tree-panel';
import { RatingPanel } from '@/components/ratings';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('pane mode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/relationships')
        ? json({ outgoing: [], incoming: [], total: 0 })
        : json({ average_rating: 0, total_ratings: 0, distribution: {} }),
    ));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('EntityTreePanel keeps the caller className on its pane, loading and loaded', async () => {
    renderWithMantine(<EntityTreePanel entityType="Table" entityId="a1" title="Relationships" className="mine" pane />);
    const loading = screen.getByRole('region', { name: 'Relationships' });
    expect(loading).toHaveClass(kit.pane, 'mine');
    await screen.findByText('No relationships found');
    expect(screen.getByRole('region', { name: 'Relationships' })).toHaveClass(kit.pane, 'mine');
  });

  it('RatingPanel keeps the caller className on its pane', async () => {
    renderWithMantine(<RatingPanel entityType="asset" entityId="a1" title="Ratings" className="mine" pane />);
    expect(await screen.findByRole('region', { name: 'Ratings' })).toHaveClass(kit.pane, 'mine');
  });
});

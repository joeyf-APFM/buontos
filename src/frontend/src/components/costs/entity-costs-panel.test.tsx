/**
 * Wave 2 Task 11c fix round 1 (R45): the costs panel's Add expense, Edit and
 * Delete are for a user who may write on the host page and on data-domains
 * (the cost routes' feature). The host says so with `canEdit`; without it
 * the panel is read-only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import EntityCostsPanel from './entity-costs-panel';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/cost-items/summary')) return json({ total_cents: 1200, currency: 'USD', by_center: { STORAGE: 1200 } });
    if (url.includes('/cost-items')) {
      return json([{ id: 'c1', title: 'Warehouse', cost_center: 'STORAGE', amount_cents: 1200, currency: 'USD', start_month: '2026-11' }]);
    }
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('entity costs panel permission', () => {
  it('entity costs panel: canEdit shows Add expense, Edit and Delete', async () => {
    renderWithMantine(<EntityCostsPanel entityId="a1" entityType="asset" pane canEdit />);
    await screen.findByText('Warehouse');
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  });

  it('entity costs panel: canEdit false hides Add expense, Edit and Delete', async () => {
    renderWithMantine(<EntityCostsPanel entityId="a1" entityType="asset" pane canEdit={false} />);
    await screen.findByText('Warehouse');
    expect(screen.queryByRole('button', { name: 'Add expense' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it('entity costs panel: without canEdit it is read-only', async () => {
    renderWithMantine(<EntityCostsPanel entityId="a1" entityType="asset" pane />);
    await screen.findByText('Warehouse');
    expect(screen.queryByRole('button', { name: 'Add expense' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

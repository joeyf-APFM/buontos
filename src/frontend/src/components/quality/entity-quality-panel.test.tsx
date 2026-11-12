/**
 * Wave 2 Task 11c: the quality panel's Add, Edit and Delete are for a user
 * who may write on the page that hosts it. The host says so with `canEdit`;
 * without it (a new caller that forgot) the panel is read-only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithMantine } from '@/test/utils';
import EntityQualityPanel from './entity-quality-panel';

const STAMP = '2026-11-01T00:00:00Z';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/quality-items/summary')) {
      return json({ overall_score_percent: 80, items_count: 1, by_dimension: { completeness: 80 }, measured_at: STAMP });
    }
    if (url.includes('/quality-items')) {
      return json([{ id: 'q1', title: 'Nulls', dimension: 'completeness', source: 'manual', score_percent: 80, measured_at: STAMP }]);
    }
    return json([]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const panel = async () => {
  const quality = await screen.findByRole('region', { name: 'Data Quality' });
  await within(quality).findByText('Nulls');
  return quality;
};

describe('entity quality panel permission', () => {
  it('entity quality panel: canEdit shows Add, Edit and Delete', async () => {
    renderWithMantine(<EntityQualityPanel entityId="p1" entityType="data_product" flush canEdit />);
    const quality = await panel();
    expect(within(quality).getByRole('button', { name: 'Add measurement' })).toBeEnabled();
    expect(within(quality).getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(within(quality).getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(within(quality).getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  });

  it('entity quality panel: canEdit false hides Add, Edit and Delete', async () => {
    renderWithMantine(<EntityQualityPanel entityId="p1" entityType="data_product" flush canEdit={false} />);
    const quality = await panel();
    expect(within(quality).queryByRole('button', { name: 'Add measurement' })).toBeNull();
    expect(within(quality).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(quality).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(quality).queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    // Reading stays: the refresh, the score and the rows
    expect(within(quality).getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(within(quality).getAllByRole('row')).toHaveLength(2);
  });

  it('entity quality panel: without canEdit it is read-only', async () => {
    renderWithMantine(<EntityQualityPanel entityId="p1" entityType="data_product" />);
    await screen.findByText('Nulls');
    expect(screen.queryByRole('button', { name: 'Add measurement' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

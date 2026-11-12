/**
 * Wave 2 Task 13b: the UC asset lookup (opened from the Search page's Assign
 * dialogs) on the kit Dialog. The tree's long names and Escape over the
 * Assign dialog are measured in a real browser in
 * tests/e2e/concepts-search.spec.ts (ruling R10).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import { UCAssetType } from '@/types/uc-asset';
import UCAssetLookupDialog from './uc-asset-lookup-dialog';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LONG = `orders_${'x'.repeat(190)}`;

let catalogsStatus = 200;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  catalogsStatus = 200;
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/api/catalogs') {
      return catalogsStatus === 200
        ? json([{ id: 'main', name: 'main', hasChildren: true, children: [] }])
        : json({ detail: 'down' }, catalogsStatus);
    }
    if (path === '/api/catalogs/main/schemas') return json([{ id: 'main.sales', name: 'sales', hasChildren: true, children: [] }]);
    if (path === '/api/catalogs/main/schemas/sales/objects') {
      return json([
        { id: 'main.sales.orders', name: 'orders', type: 'table' },
        { id: `main.sales.${LONG}`, name: LONG, type: 'view' },
      ]);
    }
    if (path === '/api/catalogs/main/schemas/sales/objects/orders/columns') return json([{ id: 'main.sales.orders.price', name: 'price', type: 'double' }]);
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderLookup(props: Partial<Parameters<typeof UCAssetLookupDialog>[0]> = {}) {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  renderWithMantine(
    <UCAssetLookupDialog isOpen onOpenChange={onOpenChange} onSelect={onSelect} title="Select UC Table" {...props} />,
  );
  return { onSelect, onOpenChange };
}

describe('the UC asset lookup on the kit Dialog', () => {
  it('renders on the kit Dialog with its named controls', async () => {
    renderLookup();
    const dialog = await screen.findByRole('dialog', { name: 'Select UC Table' });
    expectKitDialog(dialog);
    expect(within(dialog).getByRole('textbox', { name: 'Search: t:catalog.schema.table' })).toBeInTheDocument();
    expect(within(dialog).getByText('Type prefix for filtering: t:table, v:view, f:function, m:model, vol:volume')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Select' })).toBeDisabled();
    // The expand marks are named and say whether they're open
    const expand = await within(dialog).findByRole('button', { name: 'Expand main' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expectNoOldMarkup(dialog);
    expect(dialog.querySelector('[class*="text-blue"], [class*="text-orange"], .h-4, .w-4')).toBeNull();
  });

  it('expands the tree and selects a table by its row, a long name keeping its title', async () => {
    const user = userEvent.setup();
    const { onSelect, onOpenChange } = renderLookup();
    const dialog = await screen.findByRole('dialog', { name: 'Select UC Table' });
    await user.click(await within(dialog).findByRole('button', { name: 'Expand main' }));
    expect(within(dialog).getByRole('button', { name: 'Collapse main' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(await within(dialog).findByRole('button', { name: 'Expand sales' }));
    expect(await within(dialog).findByText(LONG)).toHaveAttribute('title', LONG);
    // A selectable row is reachable by keyboard
    const orders = within(dialog).getByRole('button', { name: 'orders' });
    orders.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'main.sales.orders', asset_type: UCAssetType.TABLE }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('the dot search highlights a match, and Enter or Select accepts it', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderLookup();
    const dialog = await screen.findByRole('dialog', { name: 'Select UC Table' });
    await within(dialog).findByText('main');
    const search = within(dialog).getByRole('textbox', { name: 'Search: t:catalog.schema.table' });
    await user.type(search, 'main.sales.ord');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Select' })).toBeEnabled());
    await user.click(within(dialog).getByRole('button', { name: 'Select' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'main.sales.orders' }));
  });

  it('with columns, a table expands into its columns and a column is selectable', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderLookup({ includeColumns: true, title: 'Select UC Column' });
    const dialog = await screen.findByRole('dialog', { name: 'Select UC Column' });
    await user.click(await within(dialog).findByRole('button', { name: 'Expand main' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Expand sales' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Expand orders' }));
    await user.click(await within(dialog).findByRole('button', { name: 'price' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'main.sales.orders.price', column_name: 'price' }));
  });

  it('a failed catalog load shows the error with Retry, not "No matching items"', async () => {
    catalogsStatus = 500;
    const user = userEvent.setup();
    renderLookup();
    const dialog = await screen.findByRole('dialog', { name: 'Select UC Table' });
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load catalogs');
    expect(within(dialog).queryByText('No matching items found')).toBeNull();
    catalogsStatus = 200;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await within(dialog).findByRole('button', { name: 'Expand main' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('Close closes it', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderLookup();
    const dialog = await screen.findByRole('dialog', { name: 'Select UC Table' });
    const closes = within(dialog).getAllByRole('button', { name: 'Close' });
    await user.click(closes[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

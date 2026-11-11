/**
 * Wave 2 Task 11 fix round 1 (ruling R39): the shared asset selector on the
 * kit Dialog. Its callers (a deliverable's Link Asset, the schema importer's
 * preview, and the contract's Infer from Asset) keep their props. The search
 * and browse modes, the chosen assets and the confirm payload are the Radix
 * dialog's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import { AssetSelector } from './asset-selector';
import InferFromAssetDialog from '@/components/data-contracts/infer-from-asset-dialog';

const { apiGet, toast } = vi.hoisted(() => ({ apiGet: vi.fn(), toast: vi.fn() }));
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ get: apiGet }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const TYPES = [
  { id: 't-1', name: 'Table', category: 'data', status: 'active', asset_count: 2, icon: 'Table2' },
  { id: 't-2', name: 'Dashboard', category: 'analytics', status: 'active', asset_count: 1, icon: 'LayoutDashboard' },
];
const ORDERS = { id: 'a-1', name: 'orders', asset_type_name: 'Table', location: 'main.sales.orders' };
const RETURNS = { id: 'a-2', name: 'returns', asset_type_name: 'Table', location: 'main.sales.returns' };

beforeEach(() => {
  apiGet.mockReset();
  toast.mockClear();
  apiGet.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/asset-types')) return { data: TYPES, error: null };
    if (url.includes('asset_type_id=t-1')) return { data: { items: [ORDERS, RETURNS], total: 2 }, error: null };
    if (url.includes('name=or')) return { data: { items: [ORDERS], total: 1 }, error: null };
    return { data: { items: [], total: 0 }, error: null };
  });
});

describe('asset selector', () => {
  const render = (props: Partial<Parameters<typeof AssetSelector>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    renderWithMantine(<AssetSelector isOpen onOpenChange={onOpenChange} onConfirm={onConfirm} relationshipType="hasDeliverable" {...props} />);
    return { onOpenChange, onConfirm };
  };

  it('asset selector renders on the kit Dialog', async () => {
    render({ title: 'Link to existing asset' });
    const dialog = await screen.findByRole('dialog', { name: 'Link to existing asset' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Search and select assets to link via "hasDeliverable"');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Table/ })).toBeInTheDocument());
  });

  it('asset selector keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onConfirm, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Link Assets' });
    // Browse by default: the types by category, then a type's assets
    expect(within(dialog).getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByText('Select an asset type to browse')).toBeInTheDocument();
    const table = await within(dialog).findByRole('button', { name: /Table/ });
    expect(within(dialog).getByText('Data Assets')).toBeInTheDocument();
    expect(within(dialog).getByText('Analytics')).toBeInTheDocument();
    await user.click(table);
    expect(table).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('textbox', { name: 'Filter Table...' })).toBeInTheDocument();
    const orders = await within(dialog).findByRole('button', { name: /orders/ });
    expect(orders).toHaveAttribute('aria-pressed', 'false');
    await user.click(orders);
    expect(orders).toHaveAttribute('aria-pressed', 'true');
    // The chosen asset shows as a badge, with a named remove
    expect(within(dialog).getByRole('button', { name: 'Remove orders' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);

    // Search mode: at least two letters
    await user.click(within(dialog).getByRole('tab', { name: 'Search' }));
    const search = within(dialog).getByRole('textbox', { name: 'Search assets by name...' });
    expect(within(dialog).getByText('Type at least 2 characters to search')).toBeInTheDocument();
    await user.type(search, 'or');
    expect(await within(dialog).findByRole('button', { name: /main\.sales\.orders/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(dialog).getByRole('button', { name: 'Link 1 Asset' }));
    expect(onConfirm).toHaveBeenCalledWith([{ ...ORDERS, relationshipType: 'hasDeliverable' }]);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('asset selector stays open after confirm when asked, with its own label', async () => {
    const user = userEvent.setup();
    const { onConfirm, onOpenChange } = render({ closeOnConfirm: false, confirmLabel: 'Use selected', targetAssetTypes: ['Table'] });
    const dialog = await screen.findByRole('dialog', { name: 'Link Assets' });
    // A narrow type filter starts in search
    expect(within(dialog).getByRole('tab', { name: 'Search' })).toHaveAttribute('aria-selected', 'true');
    const use = within(dialog).getByRole('button', { name: 'Use selected' });
    expect(use).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Search assets by name...' }), 'or');
    await user.click(await within(dialog).findByRole('button', { name: /main\.sales\.orders/ }));
    await user.click(use);
    expect(onConfirm).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('infer from asset dialog', () => {
  it('infer from asset dialog renders on the kit Dialog, through the asset selector', async () => {
    const user = userEvent.setup();
    const onInfer = vi.fn();
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [{ name: 'orders', properties: [] }] }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithMantine(<InferFromAssetDialog isOpen onOpenChange={onOpenChange} onInfer={onInfer} />);
    const dialog = await screen.findByRole('dialog', { name: 'Infer Schema from Assets' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Search for existing assets and import their structure as contract schemas.');
    await user.click(await within(dialog).findByRole('button', { name: /Table/ }));
    await user.click(await within(dialog).findByRole('button', { name: /orders/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Infer Schema' }));
    await waitFor(() => expect(onInfer).toHaveBeenCalledWith([{ name: 'orders', properties: [] }]));
    expect(fetchMock).toHaveBeenCalledWith('/api/assets/a-1/infer-schema');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    vi.unstubAllGlobals();
  });
});

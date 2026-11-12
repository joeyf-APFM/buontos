/**
 * Wave 2 Task 8a: the ODPS import/export dialog on the kit Dialog, with kit
 * Tabs. The validation, the import call, the export download and every toast
 * are the Radix dialog's; a failed import shows no success toast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import type { DataProduct } from '@/types/data-product';
import ImportExportDialog from './import-export-dialog';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const PRODUCT = { id: 'p-1', name: 'Orders', status: 'draft', version: '1.0.0', apiVersion: 'v1.0.0', kind: 'DataProduct' } as unknown as DataProduct;
const VALID = JSON.stringify({ apiVersion: 'v1.0.0', kind: 'DataProduct', id: 'p-2', status: 'draft' });

beforeEach(() => toast.mockClear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render(props: Partial<Parameters<typeof ImportExportDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onImportSuccess = vi.fn();
  renderWithMantine(<ImportExportDialog isOpen onOpenChange={onOpenChange} onImportSuccess={onImportSuccess} currentProduct={PRODUCT} {...props} />);
  return { onOpenChange, onImportSuccess };
}

const TITLE = 'ODPS v1.0.0 Import/Export';
const paste = (dialog: HTMLElement, text: string) =>
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Paste ODPS v1.0.0 JSON' }), { target: { value: text } });

describe('import export dialog', () => {
  it('import export dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Import or export data products in Open Data Product Standard v1.0.0 JSON format');
  });

  it('import export dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    const tabs = within(dialog).getByRole('tablist');
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Import', 'Export']);
    expect(within(tabs).getByRole('tab', { name: 'Import' })).toHaveAttribute('aria-selected', 'true');

    const box = within(dialog).getByRole('textbox', { name: 'Paste ODPS v1.0.0 JSON' });
    expect(box).toHaveProperty('tagName', 'TEXTAREA');
    expect(box).toHaveAttribute('rows', '15');
    expect(within(dialog).getByRole('button', { name: 'Validate' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Import' })).toBeDisabled();
    paste(dialog, '{');
    expect(within(dialog).getByRole('button', { name: 'Validate' })).toBeEnabled();

    await user.click(within(tabs).getByRole('tab', { name: 'Export' }));
    const panel = within(dialog).getByRole('tabpanel');
    expect(panel).toHaveTextContent('Current Product: Orders (ID: p-1)');
    expect(panel).toHaveTextContent('Status: draft');
    expect(within(panel).getByRole('button', { name: 'Export as JSON' })).toBeInTheDocument();

    // The footer's Close, beside the kit's corner close
    const closes = within(dialog).getAllByRole('button', { name: 'Close' });
    expect(closes).toHaveLength(2);
    await user.click(closes[0]);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expectNoOldMarkup(dialog);
  });

  it('import export dialog lists the validation errors', async () => {
    const user = userEvent.setup();
    render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    paste(dialog, JSON.stringify({ apiVersion: 'v2.0.0', kind: 'Thing' }));
    await user.click(within(dialog).getByRole('button', { name: 'Validate' }));
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('Validation Errors:');
    expect(within(alert).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Missing required field: id',
      'Missing required field: status',
      'Invalid apiVersion: v2.0.0. Must be v1.x.x for ODPS v1.0.0 compatibility',
      "Invalid kind: Thing. Must be 'DataProduct'",
    ]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Validation Failed', variant: 'destructive' }));

    paste(dialog, VALID);
    await user.click(within(dialog).getByRole('button', { name: 'Validate' }));
    expect(toast).toHaveBeenLastCalledWith({ title: 'Validation Passed', description: 'JSON is valid ODPS v1.0.0 format' });
  });

  it('import export dialog imports the product, and shows no success toast when the import fails', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: 'Already exists' }), { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    const { onOpenChange, onImportSuccess } = render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    paste(dialog, VALID);
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Import Failed', description: 'Already exists', variant: 'destructive' })));
    expect(toast.mock.calls.filter(([arg]) => arg.title === 'Import Successful')).toHaveLength(0);
    expect(onImportSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'p-2', name: 'Imported' }), { status: 200 }));
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(onImportSuccess).toHaveBeenCalledWith({ id: 'p-2', name: 'Imported' }));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/data-products', expect.objectContaining({ method: 'POST', body: VALID }));
    expect(toast).toHaveBeenCalledWith({ title: 'Import Successful', description: 'Data product "Imported" imported successfully' });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('import export dialog says so when there is no product to export', async () => {
    const user = userEvent.setup();
    render({ currentProduct: null });
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    await user.click(within(dialog).getByRole('tab', { name: 'Export' }));
    expect(within(dialog).getByRole('tabpanel')).toHaveTextContent('No product selected. Open this dialog from a product details page to export.');
    expect(within(dialog).queryByRole('button', { name: 'Export as JSON' })).toBeNull();
  });
});

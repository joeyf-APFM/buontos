/**
 * Task 14: the asset type form on a Mantine Modal with Mantine fields, in
 * both modes. The look (28px fields, the 512px dialog, the error colour) and
 * focus are measured in a real browser in tests/e2e/asset-types.spec.ts
 * (ruling R10); these tests check every field, the validation, the payloads
 * and the disabled and loading states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import type { AssetTypeRead } from '@/types/asset';
import { AssetTypeFormDialog } from './asset-type-form-dialog';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const TYPE: AssetTypeRead = {
  id: 't-report', name: 'Report', description: 'A published report', category: 'analytics', icon: 'BarChart',
  required_fields: null, optional_fields: null, allowed_relationships: null, is_system: false,
  status: 'deprecated', asset_count: 3, created_by: 'x', created_at: '2026-10-01T09:00:00Z', updated_at: '2026-11-02T15:30:00Z',
} as AssetTypeRead;

let fetchMock: ReturnType<typeof vi.fn>;
let respond: () => Promise<Response>;

beforeEach(() => {
  respond = async () => json({ ...TYPE });
  fetchMock = vi.fn(() => respond());
  vi.stubGlobal('fetch', fetchMock);
  toast.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const sent = () =>
  fetchMock.mock.calls.map(([input, init]) => ({
    url: String(input), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }));

function renderDialog(assetType: AssetTypeRead | null = null) {
  const onOpenChange = vi.fn();
  const onSubmitSuccess = vi.fn();
  const view = renderWithMantine(
    <AssetTypeFormDialog isOpen onOpenChange={onOpenChange} assetType={assetType} onSubmitSuccess={onSubmitSuccess} />,
  );
  return { ...view, onOpenChange, onSubmitSuccess };
}

/**
 * A Mantine Select's field: a text input that pops up a listbox (jsdom gives
 * it the textbox role; the restyle check records it as a combobox, R3).
 */
const selectField = (dialog: HTMLElement, name: string) => {
  const field = within(dialog).getByRole('textbox', { name });
  expect(field).toHaveAttribute('aria-haspopup', 'listbox');
  return field;
};

/**
 * The options of a Select's own list. jsdom can't place the dropdown, so
 * Mantine leaves it display: none: hence hidden: true.
 */
const optionNames = (field: HTMLElement) => {
  const list = document.getElementById(field.getAttribute('aria-controls') ?? '') as HTMLElement;
  return within(list).getAllByRole('option', { hidden: true }).map((o) => o.textContent);
};

async function pick(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, option: string) {
  await user.click(field);
  await user.click(await screen.findByRole('option', { name: option, hidden: true }));
}

describe('asset type form on Mantine', () => {
  it('asset type form keeps every control: create', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Create Asset Type' });
    expect(dialog).toHaveClass('mantine-Modal-content');
    expect(dialog).toHaveAccessibleDescription('Add a new asset type template.');

    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('');
    expect(name).toHaveAttribute('placeholder', 'e.g., Dashboard');
    const description = within(dialog).getByRole('textbox', { name: 'Description' });
    expect(description.tagName).toBe('TEXTAREA');
    expect(description).toHaveAttribute('placeholder', 'Describe this asset type...');
    expect(within(dialog).getByRole('textbox', { name: 'Icon' })).toHaveAttribute('placeholder', 'e.g., BarChart');
    const category = selectField(dialog, 'Category');
    expect(category).toHaveValue('No category');
    expect(category).toHaveAttribute('aria-haspopup', 'listbox');
    const status = selectField(dialog, 'Status');
    expect(status).toHaveValue('Active');

    // Exactly these buttons: the corner close, Cancel and Create
    expect(within(dialog).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Close', 'Cancel', 'Create',
    ]);
    expect(within(dialog).getByRole('button', { name: 'Create' })).toHaveAttribute('type', 'submit');

    await user.click(category);
    expect(optionNames(category)).toEqual(['No category', 'Data', 'Analytics', 'Integration', 'System', 'Custom']);
    await user.click(screen.getByRole('option', { name: 'Data', hidden: true }));
    expect(category).toHaveValue('Data');
    await user.click(status);
    expect(optionNames(status)).toEqual(['Active', 'Deprecated']);
  });

  it('asset type form keeps every control: edit', async () => {
    renderDialog(TYPE);
    const dialog = await screen.findByRole('dialog', { name: 'Edit Asset Type' });
    expect(dialog).toHaveAccessibleDescription('Update the details of this asset type.');
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Report');
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue('A published report');
    expect(within(dialog).getByRole('textbox', { name: 'Icon' })).toHaveValue('BarChart');
    expect(selectField(dialog, 'Category')).toHaveValue('Analytics');
    expect(selectField(dialog, 'Status')).toHaveValue('Deprecated');
    expect(within(dialog).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Close', 'Cancel', 'Save Changes',
    ]);
  });

  it('asset type form requires a name, with the message on the field', async () => {
    const user = userEvent.setup();
    const { onSubmitSuccess } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Create Asset Type' });
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'));
    expect(name).toHaveAccessibleDescription('Name is required');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSubmitSuccess).not.toHaveBeenCalled();

    // Typing a name and submitting clears it
    await user.type(name, 'Dashboard');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSubmitSuccess).toHaveBeenCalledTimes(1));
    expect(within(dialog).queryByText('Name is required')).toBeNull();
  });

  it('asset type form posts the create payload, then closes', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSubmitSuccess } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Create Asset Type' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Dashboard');
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'A BI dashboard');
    await pick(user, selectField(dialog, 'Category'), 'Analytics');
    await user.type(within(dialog).getByRole('textbox', { name: 'Icon' }), 'LayoutDashboard');
    await pick(user, selectField(dialog, 'Status'), 'Deprecated');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(sent()).toEqual([{
      url: '/api/asset-types', method: 'POST',
      body: { name: 'Dashboard', description: 'A BI dashboard', category: 'analytics', icon: 'LayoutDashboard', status: 'deprecated' },
    }]);
    expect(onSubmitSuccess).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ title: 'Asset Type Created', description: '"Dashboard" has been created.' });
  });

  it('asset type form puts the edit payload, with No category sent as none', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog(TYPE);
    const dialog = await screen.findByRole('dialog', { name: 'Edit Asset Type' });
    await pick(user, selectField(dialog, 'Category'), 'No category');
    await user.clear(within(dialog).getByRole('textbox', { name: 'Icon' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(sent()).toEqual([{
      url: '/api/asset-types/t-report', method: 'PUT',
      body: { name: 'Report', description: 'A published report', status: 'deprecated' },
    }]);
    expect(toast).toHaveBeenCalledWith({ title: 'Asset Type Updated', description: '"Report" has been updated.' });
  });

  it('asset type form disables its buttons and shows a loader while saving', async () => {
    const user = userEvent.setup();
    let release: (r: Response) => void = () => {};
    respond = () => new Promise<Response>((resolve) => { release = resolve; });
    const { onOpenChange } = renderDialog(TYPE);
    const dialog = await screen.findByRole('dialog', { name: 'Edit Asset Type' });
    const save = within(dialog).getByRole('button', { name: 'Save Changes' });
    await user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(save.querySelector('.mantine-Loader-root')).not.toBeNull();

    release(json({ ...TYPE }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(save).toBeEnabled();
    expect(save.querySelector('.mantine-Loader-root')).toBeNull();
  });

  it('asset type form stays open and says so when saving fails', async () => {
    const user = userEvent.setup();
    respond = async () => json({ detail: 'Name already taken' }, 409);
    // useApi logs the failed POST
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { onOpenChange, onSubmitSuccess } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Create Asset Type' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Table');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({
      variant: 'destructive', title: 'Failed to Create', description: 'Name already taken',
    }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSubmitSuccess).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeEnabled();
    expect(logged).toHaveBeenCalledWith('[useApi] POST error response from', '/api/asset-types', '(', 409, '):', { detail: 'Name already taken' });
    logged.mockRestore();
  });

  it('asset type form Cancel and the corner close ask to close', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Create Asset Type' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asset type form shows a category it does not know, once, and keeps it on save', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog({ ...TYPE, category: 'machine-learning-feature-store' as AssetTypeRead['category'] });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Asset Type' });
    const category = selectField(dialog, 'Category');
    expect(category).toHaveValue('machine-learning-feature-store');
    await user.click(category);
    expect(optionNames(category)).toEqual([
      'No category', 'Data', 'Analytics', 'Integration', 'System', 'Custom', 'machine-learning-feature-store',
    ]);
    await user.keyboard('{Escape}');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(sent()[0].body.category).toBe('machine-learning-feature-store');
  });

  it('asset type form resets to the asset type it opens on', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = renderWithMantine(
      <AssetTypeFormDialog isOpen onOpenChange={onOpenChange} assetType={TYPE} onSubmitSuccess={vi.fn()} />,
    );
    expect(within(await screen.findByRole('dialog', { name: 'Edit Asset Type' })).getByRole('textbox', { name: 'Name' })).toHaveValue('Report');
    rerender(<AssetTypeFormDialog isOpen={false} onOpenChange={onOpenChange} assetType={null} onSubmitSuccess={vi.fn()} />);
    rerender(<AssetTypeFormDialog isOpen onOpenChange={onOpenChange} assetType={null} onSubmitSuccess={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: 'Create Asset Type' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(selectField(dialog, 'Category')).toHaveValue('No category');
    expect(selectField(dialog, 'Status')).toHaveValue('Active');
  });
});

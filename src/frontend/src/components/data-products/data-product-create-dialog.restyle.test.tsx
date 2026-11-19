/**
 * Wave 2 Task 4: the data product create/edit dialog on the kit Dialog, with
 * Mantine fields, and the consumer groups picker it holds. The look is
 * measured in tests/e2e/data-products.spec.ts (ruling R10); these tests
 * check every field, the options, the validation, the payload, the discard
 * confirm and the picker's late answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import dialogKit from '@/mantine/page/dialog.module.css';
import type { DataProduct } from '@/types/data-product';
import DataProductCreateDialog from './data-product-create-dialog';
import { ConsumerGroupsPicker } from './consumer-groups-picker';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

vi.mock('@/hooks/use-teams', () => ({
  useTeams: () => ({
    teams: [
      { id: 't-1', name: 'Sales Analytics', description: 'Sales' },
      // The same team twice must not break the field
      { id: 't-1', name: 'Sales Analytics', description: 'Sales' },
      { id: 't-2', name: 'Finance', description: 'Money' },
    ],
    loading: false,
  }),
}));

vi.mock('@/stores/project-store', () => ({
  useProjectContext: () => ({
    currentProject: null,
    availableProjects: [{ id: 'proj-1', name: 'Revenue', team_count: 2 }],
    isLoading: false,
    fetchUserProjects: vi.fn(),
  }),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/workspace/groups')) return json([{ id: 'g1', display_name: 'analytics-readers' }]);
    if (init?.method === 'POST' || init?.method === 'PUT') return json({ id: 'new-id', ...JSON.parse(String(init.body)) });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  toast.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const PRODUCT: DataProduct = {
  id: 'prod-1', apiVersion: 'v1.0.0', kind: 'DataProduct', name: 'Existing Product', version: '1.0.0', status: 'active',
  inputPorts: [], outputPorts: [], managementPorts: [], support: [], authoritativeDefinitions: [],
  customProperties: [{ property: 'productType', value: 'aggregate' }], tags: [], owner_team_id: 't-2',
};

/** A Mantine Select's field (jsdom gives it the textbox role; the restyle check records it as a combobox, R3). */
const selectField = (dialog: HTMLElement, name: RegExp) => {
  const field = within(dialog).getByRole('textbox', { name });
  expect(field).toHaveAttribute('aria-haspopup', 'listbox');
  return field;
};
/** A Select's options, read with its list open (jsdom leaves it display: none: hence hidden). */
async function optionNames(user: ReturnType<typeof userEvent.setup>, field: HTMLElement) {
  await user.click(field);
  const list = document.getElementById(field.getAttribute('aria-controls') ?? '') as HTMLElement;
  const names = within(list).getAllByRole('option', { hidden: true }).map((o) => o.textContent);
  await user.click(field);
  return names;
}

/** Creating hides the optional fields behind "Add details". */
async function openDetails(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('button', { name: 'Add details' }));
  // The collapse opens on the next animation frame
  await within(dialog).findByRole('textbox', { name: /Version/ });
}

function renderDialog(props: Partial<Parameters<typeof DataProductCreateDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  const view = renderWithMantine(
    <DataProductCreateDialog open onOpenChange={onOpenChange} onSuccess={onSuccess} mode="create" {...props} />,
  );
  return { ...view, onOpenChange, onSuccess };
}

describe('data product create dialog on the kit Dialog', () => {
  it('data product create dialog keeps every field', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Create Data Product' });
    expect(dialog).toHaveClass('mantine-Modal-content', dialogKit.content);
    expect(dialog).toHaveAccessibleDescription(/Name it, choose the team that owns it/);

    expect(within(dialog).getByRole('textbox', { name: /Product Name/ })).toHaveValue('');
    expect(within(dialog).getByRole('textbox', { name: /Purpose/ })).toHaveProperty('tagName', 'TEXTAREA');
    // Only what a new product needs is shown; the rest waits behind "Add details", with what it starts as
    const toggle = within(dialog).getByRole('button', { name: 'Add details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).getByText(/Starts as Draft, version 0\.0\.1/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: /Version/ })).toBeNull();
    await openDetails(user, dialog);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByRole('textbox', { name: /Version/ })).toHaveValue('0.0.1');
    expect(within(dialog).getByRole('textbox', { name: 'Tenant/Organization' })).toBeInTheDocument();
    for (const name of ['Limitations', 'Usage']) {
      expect(within(dialog).getByRole('textbox', { name })).toHaveProperty('tagName', 'TEXTAREA');
    }

    const status = selectField(dialog, /Status/);
    expect(status).toBeEnabled();
    expect(status).toHaveValue('Draft');
    expect(await optionNames(user, selectField(dialog, /Product Type/)))
      .toEqual(['Source', 'Source Aligned', 'Aggregate', 'Consumer Aligned', 'Sink']);
    // One option per team, the repeated one dropped
    expect(await optionNames(user, selectField(dialog, /Owner Team/))).toEqual(['Sales Analytics', 'Finance']);
    const project = selectField(dialog, /Project/);
    expect(project).toHaveValue('None');
    expect(await optionNames(user, project)).toEqual(['None', 'Revenue (2 teams)']);

    expect(within(dialog).getByText('Consumer Groups')).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText(/Search workspace groups/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create Product' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('data product create dialog validates, then posts the product', async () => {
    const user = userEvent.setup();
    const { onSuccess, onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Create Data Product' });
    await user.click(within(dialog).getByRole('button', { name: 'Create Product' }));
    expect(await within(dialog).findByText('Product name is required')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /Product Name/ })).toHaveAttribute('aria-invalid', 'true');

    await user.type(within(dialog).getByRole('textbox', { name: /Product Name/ }), 'Orders');
    await openDetails(user, dialog);
    await user.click(selectField(dialog, /Product Type/));
    await user.click(await screen.findByRole('option', { name: 'Aggregate', hidden: true }));
    await user.click(within(dialog).getByRole('button', { name: 'Create Product' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(post[0]).toBe('/api/data-products');
    const body = JSON.parse(String(post[1]!.body));
    expect(body).toMatchObject({ name: 'Orders', version: '0.0.1', status: 'draft', customProperties: [{ property: 'productType', value: 'aggregate' }] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('data product edit dialog keeps the status read-only and fills the fields', async () => {
    renderDialog({ mode: 'edit', product: PRODUCT });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Data Product Metadata' });
    expect(selectField(dialog, /Status/)).toBeDisabled();
    expect(within(dialog).getByText(/The status changes with Change Status on the page/)).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /Product Name/ })).toHaveValue('Existing Product');
    expect(selectField(dialog, /Product Type/)).toHaveValue('Aggregate');
    expect(selectField(dialog, /Owner Team/)).toHaveValue('Finance');
    expect(within(dialog).getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });

  it('data product create dialog asks before discarding a change made only in a Select', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Create Data Product' });
    await openDetails(user, dialog);
    await user.click(selectField(dialog, /Product Type/));
    await user.click(await screen.findByRole('option', { name: 'Aggregate', hidden: true }));

    // The first close asks, in an alertdialog stacked over the open dialog
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' });
    expect(confirm).toHaveClass(dialogKit.content);
    expect(screen.getByRole('dialog', { name: 'Create Data Product' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    // Escape closes only the confirm
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();

    // Continue Editing keeps the input
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Continue Editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(selectField(dialog, /Product Type/)).toHaveValue('Aggregate');
    expect(onOpenChange).not.toHaveBeenCalled();

    // Discard closes the dialog
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard Changes' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('data product create dialog asks before discarding a typed name, on the first close', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Create Data Product' });
    await user.type(within(dialog).getByRole('textbox', { name: /Product Name/ }), 'Orders');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('data product create dialog closes from Cancel, Escape and the corner close', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Create Data Product' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

describe('consumer groups picker', () => {
  it('consumer groups picker adds from the list and by typing, and removes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = renderWithMantine(<ConsumerGroupsPicker value={[]} onChange={onChange} />);
    await user.click(await screen.findByRole('button', { name: 'analytics-readers' }));
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'group', value: 'analytics-readers' }]);

    await user.type(screen.getByPlaceholderText(/Search workspace groups/), 'ops-users');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'group', value: 'ops-users' }]);

    rerender(<ConsumerGroupsPicker value={[{ type: 'group', value: 'ops-users' }]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Remove ops-users' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('consumer groups picker drops a late answer to an earlier search', async () => {
    const pending: Record<string, (r: Response) => void> = {};
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const q = new URL(String(input), 'http://localhost').searchParams.get('search') ?? '';
      return new Promise<Response>((resolve) => { pending[q] = resolve; });
    });
    const user = userEvent.setup();
    renderWithMantine(<ConsumerGroupsPicker value={[]} onChange={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/Search workspace groups/), 'b');
    await waitFor(() => expect(pending.b).toBeDefined());

    await act(async () => { pending.b(json([{ id: 'g2', display_name: 'billing' }])); });
    expect(await screen.findByRole('button', { name: 'billing' })).toBeInTheDocument();
    // The first (unfiltered) load answers last: it is dropped
    await act(async () => { pending[''](json([{ id: 'g9', display_name: 'everyone' }])); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(screen.queryByRole('button', { name: 'everyone' })).toBeNull();
    expect(screen.getByRole('button', { name: 'billing' })).toBeInTheDocument();
  });
});

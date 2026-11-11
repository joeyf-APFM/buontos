/**
 * Wave 2 Task 4: Data Products (/data-products) on the page kit. Pixel values
 * that depend on the cascade (the full-bleed fill, row heights, the long-name
 * wrap and the page's horizontal scroll) are measured in a real browser in
 * tests/e2e/data-products.spec.ts (ruling R10); these tests check the
 * structure, every control for both personas, the two view modes, and the
 * empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { useProjectStore } from '@/stores/project-store';
import { FeatureAccessLevel } from '@/types/settings';
import DataProducts from './data-products';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const product = (id: string, name: string, status: string, extra: Record<string, unknown> = {}) => ({
  apiVersion: 'v1.0.0', kind: 'DataProduct', id, name, status, version: '1.0.0', domain_ids: [], domains: [], tags: [],
  inputPorts: [], managementPorts: [], support: [], customProperties: [], authoritativeDefinitions: [],
  outputPorts: [{ id: `${id}-out`, name: `${name} output`, version: '1.0.0', type: 'table' }],
  team: { name: 'Sales', members: [{ username: 'rita@example.com', name: 'Rita', role: 'owner' }] },
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-11-02T15:30:00Z',
  ...extra,
});
const PRODUCTS = [
  product('p-1', 'Sales orders', 'active'),
  product('p-2', 'Customer 360', 'draft', { draftOwnerId: 'rita@example.com' }),
];

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend(list: unknown = PRODUCTS, status = 200) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/data-products' && method === 'GET') return json(list, status);
    if (url.pathname.startsWith('/api/data-products/') && method === 'DELETE') return new Response(null, { status: 204 });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string, pathname: string) =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === pathname && (init?.method ?? 'GET') === method);

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'data-products': level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = () =>
  renderWithMantine(
    <Routes>
      <Route path="/data-products" element={<DataProducts />} />
      <Route path="/data-products/:productId" element={<p>detail page</p>} />
    </Routes>,
    { route: '/data-products' },
  );

const loaded = () => screen.findByText('Sales orders', { exact: true });
const pane = () => screen.getByRole('region', { name: 'Data product list' });
const rowOf = (text: string) => screen.getByText(text, { exact: true }).closest('tr') as HTMLElement;
// The accessible name: a label, else the text, else the title (icon buttons)
const names = (els: HTMLElement[]) =>
  els.map((el) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || el.getAttribute('title')));
const sorted = (list: (string | null | undefined)[]) => [...list].sort();

const HEADERS = ['Title', 'Owner', 'Version', 'Type', 'Status', 'Created', 'Updated'];
const PAGER = ['Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page'];

describe('data products on the page kit', () => {
  let confirmSpy: MockInstance<(message?: string) => boolean>;
  let errorSpy: MockInstance<(...args: unknown[]) => void>;
  beforeEach(() => {
    // The grid's search column, 'info.title', is not one of its column ids
    // (TanStack makes it 'info_title'): a warning the page has always had,
    // kept out of the output
    const log = console.error.bind(console);
    errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (String(args[0]).startsWith("[Table] Column with id 'info.title'")) return;
      log(...args);
    });
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    toast.mockClear();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    useProjectStore.setState({ currentProject: null });
    vi.unstubAllGlobals();
    confirmSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('data products renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/data-products')).toBe(true);
    expect(container.querySelector(`.${kit.page}`)).toHaveAttribute('data-full-bleed');
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();

    const heading = screen.getByRole('heading', { level: 1, name: 'Data Products' });
    expect(heading.parentElement).toHaveClass(kit.header);
    // The view switch sits at the end of the header
    expect(within(heading.parentElement!).getByRole('button', { name: 'Graph View' })).toBeInTheDocument();

    // One flush kit pane, holding the shared DataTable
    expect(pane()).toHaveClass(kit.pane);
    expect(within(pane()).getAllByRole('table')).toHaveLength(1);

    // No layout padding, shadcn Card or Alert, or Tailwind class in the page's own markup
    expect(container.querySelector('.py-6, .p-6, .mb-6, .text-3xl, .space-y-4, .space-y-1, div.font-medium')).toBeNull();
    expect(container.querySelector('.bg-card, .rounded-lg.border, .flex.space-x-1, .gap-2.h-9, .border-r.border-border')).toBeNull();
    expect(screen.getByRole('switch', { name: 'Show all versions' })).toHaveClass('mantine-Switch-input');
  });

  it('data products keeps every control', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    expect(sorted(names(screen.getAllByRole('button', { hidden: true })))).toEqual(sorted([
      'Table View', 'Graph View', 'Columns', 'My Subscriptions', 'Create Product', 'Upload File', ...HEADERS,
      'Preview Metadata', 'Edit', 'Delete', 'Preview Metadata', 'Edit', 'Delete', ...PAGER,
    ]));
    expect(screen.getByRole('switch', { name: 'Show all versions' })).not.toBeChecked();
    expect(screen.getByPlaceholderText('Filter info > titles...').tagName).toBe('INPUT');
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(2);
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    for (const name of ['Create Product', 'Upload File', 'My Subscriptions']) {
      expect(screen.getByRole('button', { name })).toBeEnabled();
    }
    // Cells: the status, the personal draft, the owner, the version and the type
    expect(within(rowOf('Customer 360')).getByText('Personal Draft')).toBeInTheDocument();
    expect(within(rowOf('Sales orders')).getByText('Rita')).toBeInTheDocument();
    expect(within(rowOf('Sales orders')).getByText('table')).toBeInTheDocument();

    // Selecting rows shows the bulk actions
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: /Request Access/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Genie Space/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Delete Selected/ })).toBeEnabled();

    // Show all versions reloads with the history
    await user.click(screen.getByRole('switch', { name: 'Show all versions' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/data-products?include_history=true')).toBe(true));
    await loaded();

    // My Subscriptions filters to the user's subscriptions (none here)
    await user.click(screen.getByRole('button', { name: 'My Subscriptions' }));
    expect(await screen.findByText('No results.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My Subscriptions (0)' })).toBeInTheDocument();
  });

  it('data products keeps every control for a consumer, disabled where it needs more access', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    await loaded();

    expect(sorted(names(screen.getAllByRole('button', { hidden: true })))).toEqual(sorted([
      'Table View', 'Graph View', 'Columns', 'My Subscriptions', 'Create Product', 'Upload File', ...HEADERS,
      'Preview Metadata', 'Edit (Permission Denied)', 'Delete (Permission Denied)',
      'Preview Metadata', 'Edit (Permission Denied)', 'Delete (Permission Denied)', ...PAGER,
    ]));
    expect(screen.getByRole('button', { name: 'Create Product' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Upload File' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Edit (Permission Denied)' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Delete (Permission Denied)' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Preview Metadata' })[0]).toBeEnabled();
    expect(screen.getByRole('button', { name: 'My Subscriptions' })).toBeEnabled();
  });

  it('data products: row actions preview, edit and delete', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(within(rowOf('Sales orders')).getByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('dialog', { name: 'Edit Data Product Metadata' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Product Name/)).toHaveValue('Sales orders');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Data Product Metadata' })).toBeNull());

    confirmSpy.mockReturnValueOnce(false);
    await user.click(within(rowOf('Sales orders')).getByRole('button', { name: 'Delete' }));
    expect(calls('DELETE', '/api/data-products/p-1')).toHaveLength(0);
    await user.click(within(rowOf('Sales orders')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls('DELETE', '/api/data-products/p-1')).toHaveLength(1));
    await waitFor(() => expect(calls('GET', '/api/data-products')).toHaveLength(2));

    // The row opens the product
    await user.click(screen.getByText('Customer 360', { exact: true }));
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('data products: both view modes keep row actions and the mode persists', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    expect(within(rowOf('Sales orders')).getAllByRole('button').map((b) => b.getAttribute('title')))
      .toEqual(['Preview Metadata', 'Edit', 'Delete']);

    // The graph (its nodes, which jsdom can't lay out, are checked in
    // tests/e2e/data-products.spec.ts)
    await user.click(screen.getByRole('button', { name: 'Graph View' }));
    expect(screen.queryByRole('table')).toBeNull();
    const graph = () => pane().querySelector('.react-flow');
    expect(graph()).not.toBeNull();
    // The page's view switch stays in the header, and the graph has its own
    expect(screen.getByRole('button', { name: 'Table View' })).toBeInTheDocument();
    expect(within(pane()).getByRole('button', { name: 'Switch to Table View' })).toBeInTheDocument();

    // A reload (a project switch) keeps the graph
    act(() => {
      useProjectStore.setState({ currentProject: { id: 'proj-1', name: 'Sales', title: 'Sales' } as never });
    });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/data-products?project_id=proj-1')).toBe(true));
    await waitFor(() => expect(graph()).not.toBeNull());
    expect(screen.queryByRole('table')).toBeNull();

    // The graph's own switch brings the table back, with its row actions
    await user.click(within(pane()).getByRole('button', { name: 'Switch to Table View' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(within(rowOf('Sales orders')).getAllByRole('button').map((b) => b.getAttribute('title')))
      .toEqual(['Preview Metadata', 'Edit', 'Delete']);

    // And the header's switch, too
    await user.click(screen.getByRole('button', { name: 'Graph View' }));
    await user.click(screen.getByRole('button', { name: 'Table View' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('data products empty and error states keep their actions', async () => {
    mockBackend([]);
    const { unmount } = renderPage();
    expect(await screen.findByText('No results.')).toBeInTheDocument();
    for (const name of ['Create Product', 'Upload File', 'My Subscriptions', 'Graph View']) {
      expect(screen.getByRole('button', { name })).toBeEnabled();
    }
    expect(screen.getByRole('switch', { name: 'Show all versions' })).toBeEnabled();
    unmount();

    // A failed load: the error shows in the pane, dismissible, over the empty
    // table and its actions
    mockBackend({ detail: 'Backend exploded' }, 500);
    errorSpy.mockImplementation(() => {});
    const user = userEvent.setup();
    renderPage();
    const alert = await within(await screen.findByRole('region', { name: 'Data product list' })).findByRole('alert');
    expect(alert).toHaveTextContent('Products fetch failed: Backend exploded');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(screen.getByRole('button', { name: 'Create Product' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Upload File' })).toBeEnabled();
    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();

    // Create still opens its dialog
    await user.click(screen.getByRole('button', { name: 'Create Product' }));
    expect(await screen.findByRole('dialog', { name: 'Create Data Product (ODPS v1.0.0)' })).toBeInTheDocument();
  });

  it('data products tells a user without read access, in a kit alert', async () => {
    grant(FeatureAccessLevel.NONE);
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You do not have permission to view data products.');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(calls('GET', '/api/data-products')).toHaveLength(0);
  });
});

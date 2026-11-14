/**
 * Wave 3 Task 5: Entitlements Sync (/entitlements-sync) on the page kit. Pixel
 * values that depend on the cascade (the full-bleed fill, the long-name wrap,
 * the page's horizontal scroll) and the Escape layering in a real browser are
 * measured in tests/e2e/entitlements-sync.spec.ts (ruling R10); these tests
 * check the structure, every control for both personas, the dialog and its
 * payloads, the delete confirm, and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import EntitlementsSync from './entitlements-sync';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const CONFIGS = [
  {
    id: 'sync-1', name: 'Nightly workspace sync', connection: 'conn-1', schedule: '0 2 * * *', enabled: true,
    catalogs: ['main'], lastSync: { status: 'success', timestamp: '2026-11-08 02:00' },
  },
  {
    id: 'sync-2', name: 'Weekly partner sync', connection: 'conn-1', schedule: '0 3 * * 0', enabled: false,
    catalogs: ['finance', 'sales'],
  },
];
const CONNECTIONS = [{ id: 'conn-1', name: 'Workspace catalog' }, { id: 'conn-2', name: 'Partner workspace' }];
const CATALOGS = ['main', 'finance', 'sales'];
const LONG_NAME = `Sync every partner workspace nightly ${'and report on each catalog '.repeat(8)}`.slice(0, 199) + '.';

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response | undefined> | undefined;

function mockBackend(list: unknown = CONFIGS, status = 200, extra: Handler = () => undefined, connections: unknown = CONNECTIONS) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const answer = await extra(url, init);
    if (answer) return answer;
    if (url.pathname === '/api/entitlements-sync/configs' && method === 'GET') return json(list, status);
    if (url.pathname === '/api/entitlements-sync/configs' && method === 'POST') return json({ ...CONFIGS[0], id: 'sync-new' });
    if (url.pathname.startsWith('/api/entitlements-sync/configs/') && method === 'PUT') return json(CONFIGS[0]);
    if (url.pathname.startsWith('/api/entitlements-sync/configs/') && method === 'DELETE') return new Response(null, { status: 204 });
    if (url.pathname === '/api/entitlements-sync/connections') return json(connections);
    if (url.pathname === '/api/entitlements-sync/catalogs') return json(CATALOGS);
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string, pathname: string) =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === pathname && (init?.method ?? 'GET') === method);

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'entitlements-sync': level },
    appliedRoleId: null,
    isLoading: false,
    isReady: true,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = () =>
  renderWithMantine(
    <Routes>
      <Route path="/entitlements-sync" element={<EntitlementsSync />} />
    </Routes>,
    { route: '/entitlements-sync' },
  );

const loaded = () => screen.findByText('Nightly workspace sync', { exact: true });
const pane = () => screen.getByRole('region', { name: 'Sync configuration list' });
const rowOf = (text: string) => screen.getByText(text, { exact: true }).closest('tr') as HTMLElement;
const editOf = (name: string) => within(rowOf(name)).getAllByRole('button')[0];
const deleteOf = (name: string) => within(rowOf(name)).getAllByRole('button')[1];
const names = (els: HTMLElement[]) =>
  els.map((el) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || el.getAttribute('title') || ''));
const sorted = (list: string[]) => [...list].sort();

// The control inventory of /entitlements-sync in the Task 1 baselines (both
// personas): an unnamed edit and delete button per row, the table's toolbar and
// paging, and New Configuration
const BUTTONS = [
  '', '', '', '', 'Columns', 'Go to first page', 'Go to last page', 'Go to next page', 'Go to previous page',
  'New Configuration',
];

describe('entitlements sync on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    toast.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('entitlements sync renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/entitlements-sync')).toBe(true);
    expect(container.querySelector(`.${kit.page}`)).toHaveAttribute('data-full-bleed');
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();

    const heading = screen.getByRole('heading', { level: 1, name: 'Entitlements Sync' });
    expect(heading.parentElement).toHaveClass(kit.header);
    // New Configuration sits in the header's actions
    expect(within(heading.parentElement as HTMLElement).getByRole('button', { name: 'New Configuration' })).toBeInTheDocument();

    // One flush kit pane holding the table
    expect(pane()).toHaveClass(kit.pane);
    expect(within(pane()).getAllByRole('table')).toHaveLength(1);
    expect(within(pane()).getAllByRole('columnheader').map((h) => h.textContent))
      .toEqual(expect.arrayContaining(['Name', 'Connection', 'Schedule', 'Status', 'Last Sync']));

    // No layout padding, Tailwind class or shadcn Card in the page's own markup
    expect(container.querySelector('.py-6, .p-6, .mb-6, .mb-8, .text-3xl, .space-y-4, .space-y-2, .w-8')).toBeNull();
    expect(container.querySelector('[class*="text-green-"], [class*="text-gray-"], [class*="text-red-"], [class*="text-blue-"]')).toBeNull();
    expect(container.querySelector('[data-slot="card"], .rounded-xl.border')).toBeNull();
  });

  it.each([
    ['an admin', FeatureAccessLevel.ADMIN],
    ['a read-only user', FeatureAccessLevel.READ_ONLY],
  ])('entitlements sync keeps every control for %s', async (_who, level) => {
    // The page has never gated its controls: the baselines of both personas
    // show the same inventory
    grant(level);
    renderPage();
    await loaded();

    expect(sorted(names(screen.getAllByRole('button', { hidden: true })))).toEqual(sorted(BUTTONS));
    expect(screen.getByPlaceholderText('Filter names...')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(within(rowOf('Nightly workspace sync')).getAllByRole('button')).toHaveLength(2);

    // Cells
    const row = rowOf('Nightly workspace sync');
    expect(within(row).getByText('conn-1')).toBeInTheDocument();
    expect(within(row).getByText('0 2 * * *')).toBeInTheDocument();
    expect(within(row).getByText('Enabled')).toBeInTheDocument();
    expect(within(row).getByText('2026-11-08 02:00')).toBeInTheDocument();
    const other = rowOf('Weekly partner sync');
    expect(within(other).getByText('Disabled')).toBeInTheDocument();
    expect(within(other).getByText('Never')).toBeInTheDocument();
  });

  it('entitlements sync: New Configuration saves a new configuration, once', async () => {
    // The answer takes a moment, as a network one does, so the second click lands while it is out
    mockBackend(CONFIGS, 200, async (_url, init) => {
      if (init?.method !== 'POST') return undefined;
      await new Promise((r) => setTimeout(r, 150));
      return json({ ...CONFIGS[0], id: 'sync-new' });
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'New Configuration' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Configuration' });
    expect(dialog).toHaveClass('mantine-Modal-content');
    // The connections and catalogs load when it opens
    await waitFor(() => expect(calls('GET', '/api/entitlements-sync/connections')).toHaveLength(1));
    expect(calls('GET', '/api/entitlements-sync/catalogs')).toHaveLength(1);

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Finance sync');
    await user.click(within(dialog).getByRole('textbox', { name: 'Connection' }));
    await user.click(await screen.findByRole('option', { name: 'Partner workspace', hidden: true }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Schedule (Cron)' }), '0 4 * * *');
    await user.click(within(dialog).getByRole('textbox', { name: 'Catalogs' }));
    await user.click(await screen.findByRole('option', { name: 'finance', hidden: true }));
    await user.click(within(dialog).getByRole('switch', { name: 'Enabled' }));
    await user.dblClick(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls('POST', '/api/entitlements-sync/configs')).toHaveLength(1));
    expect(JSON.parse(String(calls('POST', '/api/entitlements-sync/configs')[0][1]?.body))).toEqual({
      name: 'Finance sync', connection: 'conn-2', schedule: '0 4 * * *', enabled: true, catalogs: ['finance'],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Configuration' })).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success', description: 'Configuration created successfully' }));
    await waitFor(() => expect(calls('GET', '/api/entitlements-sync/configs')).toHaveLength(2));
    expect(calls('POST', '/api/entitlements-sync/configs')).toHaveLength(1);
  });

  it('entitlements sync: a new configuration with nothing chosen sends no catalog, a disabled switch and an empty connection', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'New Configuration' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Configuration' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Bare');
    await user.type(within(dialog).getByRole('textbox', { name: 'Schedule (Cron)' }), '* * * * *');
    expect(within(dialog).getByRole('switch', { name: 'Enabled' })).not.toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('POST', '/api/entitlements-sync/configs')).toHaveLength(1));
    expect(JSON.parse(String(calls('POST', '/api/entitlements-sync/configs')[0][1]?.body))).toEqual({
      name: 'Bare', connection: '', schedule: '* * * * *', enabled: false, catalogs: [],
    });
  });

  it('entitlements sync: Edit fills the dialog and PUTs the configuration, keeping its other catalogs', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(editOf('Weekly partner sync'));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Configuration' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Weekly partner sync');
    expect(within(dialog).getByRole('textbox', { name: 'Schedule (Cron)' })).toHaveValue('0 3 * * 0');
    expect(within(dialog).getByRole('switch', { name: 'Enabled' })).not.toBeChecked();
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Connection' })).toHaveValue('Workspace catalog'));
    expect(within(dialog).getByRole('textbox', { name: 'Catalogs' })).toHaveValue('finance');

    await user.clear(within(dialog).getByRole('textbox', { name: 'Name' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Weekly sync');
    await user.click(within(dialog).getByRole('switch', { name: 'Enabled' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('PUT', '/api/entitlements-sync/configs/sync-2')).toHaveLength(1));
    // The Select shows the first catalog; saving without touching it does not drop the others
    expect(JSON.parse(String(calls('PUT', '/api/entitlements-sync/configs/sync-2')[0][1]?.body))).toEqual({
      name: 'Weekly sync', connection: 'conn-1', schedule: '0 3 * * 0', enabled: true, catalogs: ['finance', 'sales'],
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Configuration updated successfully' }));
  });

  it('entitlements sync: clearing the catalog sends none (the no-catalog sentinel)', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(editOf('Nightly workspace sync'));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Configuration' });
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Catalogs' })).toHaveValue('main'));
    await user.click(within(dialog).getByRole('textbox', { name: 'Catalogs' }));
    // Choosing the chosen option again clears it
    await user.click(await screen.findByRole('option', { name: 'main', hidden: true }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('PUT', '/api/entitlements-sync/configs/sync-1')).toHaveLength(1));
    expect(JSON.parse(String(calls('PUT', '/api/entitlements-sync/configs/sync-1')[0][1]?.body)).catalogs).toEqual([]);
  });

  it('entitlements sync: New Configuration after a cancelled Edit opens an empty form', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(editOf('Nightly workspace sync'));
    const edit = await screen.findByRole('dialog', { name: 'Edit Configuration' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(edit).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New Configuration' }));
    const add = await screen.findByRole('dialog', { name: 'New Configuration' });
    expect(within(add).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(within(add).getByRole('textbox', { name: 'Schedule (Cron)' })).toHaveValue('');
    expect(within(add).getByRole('switch', { name: 'Enabled' })).not.toBeChecked();
  });

  it('entitlements sync: Escape in an open Select closes only the Select, in jsdom', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'New Configuration' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Configuration' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Keep me');
    const connection = within(dialog).getByRole('textbox', { name: 'Connection' });
    await user.click(connection);
    expect(connection).toHaveAttribute('aria-haspopup', 'listbox');
    await user.keyboard('{Escape}');
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole('dialog', { name: 'New Configuration' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Keep me');
  });

  it('entitlements sync: a failed save keeps the dialog and says why', async () => {
    mockBackend(CONFIGS, 200, (_url, init) => (init?.method === 'POST' ? json({ detail: 'nope' }, 500) : undefined));
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'New Configuration' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Configuration' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Keep me');
    await user.type(within(dialog).getByRole('textbox', { name: 'Schedule (Cron)' }), '* * * * *');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Failed to save configuration', variant: 'destructive' })));
    expect(screen.getByRole('dialog', { name: 'New Configuration' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Keep me');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('entitlements sync: a failed connections load says so and keeps the saved connection selectable', async () => {
    mockBackend(CONFIGS, 200, (url) => (url.pathname === '/api/entitlements-sync/connections' ? json({ detail: 'x' }, 500) : undefined));
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(editOf('Nightly workspace sync'));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Configuration' });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Failed to load connections', variant: 'destructive' })));
    expect(within(dialog).getByRole('textbox', { name: 'Connection' })).toHaveValue('conn-1');
  });

  it('entitlements sync: connections that are not an array show as none', async () => {
    mockBackend(CONFIGS, 200, () => undefined, { oops: true });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'New Configuration' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Configuration' });
    await user.click(within(dialog).getByRole('textbox', { name: 'Connection' }));
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });

  it('entitlements sync delete confirm is an alertdialog, sends once and returns focus', async () => {
    let release: (r: Response) => void = () => {};
    mockBackend(CONFIGS, 200, (_url, init) =>
      init?.method === 'DELETE'
        ? new Promise<Response>((resolve) => { release = resolve; })
        : undefined);
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(deleteOf('Nightly workspace sync'));
    const confirm = await screen.findByRole('alertdialog', { name: /Delete/ });
    // Nothing is sent until it's confirmed; its description names the configuration
    expect(confirm).toHaveTextContent('Nightly workspace sync');
    expect(calls('DELETE', '/api/entitlements-sync/configs/sync-1')).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();

    // Cancel sends nothing and focus goes back to the row's delete button
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(deleteOf('Nightly workspace sync')));
    expect(calls('DELETE', '/api/entitlements-sync/configs/sync-1')).toHaveLength(0);

    // Confirm with a double click: one request
    await user.click(deleteOf('Nightly workspace sync'));
    const confirm2 = await screen.findByRole('alertdialog');
    await user.dblClick(within(confirm2).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls('DELETE', '/api/entitlements-sync/configs/sync-1')).toHaveLength(1));

    // The list reloads without the row; focus lands on New Configuration, a control that is still there
    mockBackend(CONFIGS.slice(1));
    release(new Response(null, { status: 204 }));
    await waitFor(() => expect(screen.queryByText('Nightly workspace sync', { exact: true })).toBeNull());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New Configuration' })));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Configuration deleted successfully' }));
  });

  it('entitlements sync: a failed delete keeps the row and says why', async () => {
    mockBackend(CONFIGS, 200, (_url, init) => (init?.method === 'DELETE' ? json({ detail: 'nope' }, 500) : undefined));
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(deleteOf('Nightly workspace sync'));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Failed to delete configuration', variant: 'destructive' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('Nightly workspace sync', { exact: true })).toBeInTheDocument();
  });

  it('entitlements sync: a long name and connection wrap and carry a title', async () => {
    const connection = 'c'.repeat(200);
    mockBackend([...CONFIGS, { ...CONFIGS[0], id: 'sync-long', name: LONG_NAME, connection }]);
    renderPage();
    await loaded();
    expect(screen.getByText(LONG_NAME, { exact: true })).toHaveAttribute('title', LONG_NAME);
    expect(screen.getByText(connection, { exact: true })).toHaveAttribute('title', connection);
  });

  it('entitlements sync empty and error states keep their message and actions', async () => {
    mockBackend([]);
    const user = userEvent.setup();
    const { unmount } = renderPage();
    expect(await screen.findByText('No results.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Configuration' })).toBeEnabled();
    unmount();

    // A failed load: the error shows in the pane with a Retry, and a toast
    mockBackend({ detail: 'Backend exploded' }, 500);
    renderPage();
    const alert = await within(await screen.findByRole('region', { name: 'Sync configuration list' })).findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load configurations');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Failed to load configurations', variant: 'destructive' }));
    expect(screen.getByRole('button', { name: 'New Configuration' })).toBeEnabled();

    mockBackend();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('entitlements sync: a list that is not an array shows as empty', async () => {
    mockBackend({ configs: 'unexpected' });
    renderPage();
    expect(await screen.findByText('No results.')).toBeInTheDocument();
  });

  it('entitlements sync: an older answer does not replace a newer one', async () => {
    let first: (r: Response) => void = () => {};
    let n = 0;
    mockBackend(CONFIGS, 200, (url, init) => {
      if (url.pathname === '/api/entitlements-sync/configs' && (init?.method ?? 'GET') === 'GET' && ++n === 1) {
        return new Promise<Response>((resolve) => { first = resolve; });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    // The first load hangs; a save reloads the list, and that answer is the newer one
    await user.click(await screen.findByRole('button', { name: 'New Configuration' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Configuration' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'x');
    await user.type(within(dialog).getByRole('textbox', { name: 'Schedule (Cron)' }), '* * * * *');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await loaded();
    first(json([{ ...CONFIGS[0], id: 'stale', name: 'Stale answer' }]));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Stale answer')).toBeNull();
    expect(screen.getByText('Nightly workspace sync', { exact: true })).toBeInTheDocument();
  });
});

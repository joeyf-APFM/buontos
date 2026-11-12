/**
 * Wave 2 Task 6: Data Contracts (/data-contracts) on the page kit. Pixel
 * values that depend on the cascade (the full-bleed fill, row heights, the
 * long-name wrap and the page's horizontal scroll) and the Escape layering in
 * the create dialog are measured in a real browser in
 * tests/e2e/data-contracts.spec.ts (ruling R10); these tests check the
 * structure, every control for both personas, the upload dialog's behaviour,
 * and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import dialogKit from '@/mantine/page/dialog.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { useProjectStore } from '@/stores/project-store';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { FeatureAccessLevel } from '@/types/settings';
import DataContracts from './data-contracts';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const contract = (id: string, name: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, name, status, version: '1.0.0', owner_team_name: 'Sales', tags: [], domainIds: [],
  created: '2026-10-01T09:00:00Z', updated: '2026-11-02T15:30:00Z',
  ...extra,
});
const CONTRACTS = [
  contract('c-1', 'Orders contract', 'active', { versionCount: 3 }),
  contract('c-2', 'Customer contract', 'draft', { draftOwnerId: 'rita@example.com' }),
];

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined;

function mockBackend(list: unknown = CONTRACTS, status = 200, extra: Handler = () => undefined) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const answer = await extra(url, init);
    if (answer) return answer;
    if (url.pathname === '/api/data-contracts' && method === 'GET') return json(list, status);
    if (url.pathname.startsWith('/api/data-contracts/') && method === 'DELETE') return new Response(null, { status: 204 });
    // The preview's rating summary
    if (url.pathname.endsWith('/ratings')) {
      return json({ average_rating: 0, total_ratings: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, user_current_rating: null });
    }
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string, pathname: string) =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === pathname && (init?.method ?? 'GET') === method);

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'data-contracts': level },
    appliedRoleId: null,
    isLoading: false,
    isReady: true,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = (route = '/data-contracts') =>
  renderWithMantine(
    <Routes>
      <Route path="/data-contracts" element={<DataContracts />} />
      <Route path="/data-contracts/:contractId" element={<p>detail page</p>} />
    </Routes>,
    { route },
  );

const loaded = () => screen.findByText('Orders contract', { exact: true });
const pane = () => screen.getByRole('region', { name: 'Data contract list' });
const rowOf = (text: string) => screen.getByText(text, { exact: true }).closest('tr') as HTMLElement;
// The accessible name: a label, else the text, else the title (icon buttons)
const names = (els: HTMLElement[]) =>
  els.map((el) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || el.getAttribute('title')));
const sorted = (list: (string | null | undefined)[]) => [...list].sort();

const HEADERS = ['Name', 'Owner', 'Version', 'Status', 'Created', 'Updated'];
const PAGER = ['Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page'];
const UPLOAD_TITLE = 'Upload Data Contract';

describe('data contracts on the page kit', () => {
  let confirmSpy: MockInstance<(message?: string) => boolean>;
  let errorSpy: MockInstance<(...args: unknown[]) => void>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error');
    localStorage.removeItem('data-contracts-sort');
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    toast.mockClear();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => {
    const tableErrors = errorSpy.mock.calls.map((a) => String(a[0])).filter((m) => m.startsWith('[Table]'));
    cleanup();
    useProjectStore.setState({ currentProject: null });
    vi.unstubAllGlobals();
    confirmSpy.mockRestore();
    errorSpy.mockRestore();
    expect(tableErrors).toEqual([]);
  });

  it('data contracts renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/data-contracts')).toBe(true);
    // A contract is full bleed too since wave 2 Task 9 (its panes stacked at their own height)
    expect(isFullBleed('/data-contracts/c-1')).toBe(true);
    expect(container.querySelector(`.${kit.page}`)).toHaveAttribute('data-full-bleed');
    // The shell draws the breadcrumb: the page only names itself in the store
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    expect(useBreadcrumbStore.getState().dynamicTitle).toBe('Data Contracts');

    const heading = screen.getByRole('heading', { level: 1, name: 'Data Contracts' });
    expect(heading.parentElement).toHaveClass(kit.header);

    // One flush kit pane, holding the shared DataTable
    expect(pane()).toHaveClass(kit.pane);
    expect(within(pane()).getAllByRole('table')).toHaveLength(1);

    // No layout padding, shadcn Card or Alert, or Tailwind class in the page's own markup
    expect(container.querySelector('.py-6, .p-6, .mb-6, .text-3xl, .space-y-1, div.font-medium')).toBeNull();
    expect(container.querySelector('.bg-card, .rounded-lg.border, .flex.space-x-1, .gap-2.h-9, .border-r.border-border')).toBeNull();
    expect(container.querySelector('[class*="bg-yellow-"], [class*="bg-green-"], [class*="bg-amber-"], .flex.flex-wrap')).toBeNull();
    expect(screen.getByRole('switch', { name: 'Show all versions' })).toHaveClass('mantine-Switch-input');
  });

  it('data contracts keeps every control', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    expect(sorted(names(screen.getAllByRole('button', { hidden: true })))).toEqual(sorted([
      'Columns', 'New Contract', 'Upload File', ...HEADERS, '3 versions',
      'Preview Metadata', 'Edit', 'Delete', 'Preview Metadata', 'Edit', 'Delete', ...PAGER,
    ]));
    expect(screen.getByRole('switch', { name: 'Show all versions' })).not.toBeChecked();
    expect(screen.getByPlaceholderText('Filter names...').tagName).toBe('INPUT');
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(2);
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    // Cells: the owner, the version, the status and the personal draft
    expect(within(rowOf('Orders contract')).getByText('Sales')).toBeInTheDocument();
    expect(within(rowOf('Orders contract')).getByText('1.0.0')).toBeInTheDocument();
    expect(within(rowOf('Orders contract')).getByText('active')).toBeInTheDocument();
    expect(within(rowOf('Customer contract')).getByText('Personal')).toBeInTheDocument();

    // Selecting rows shows the bulk actions
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: /Request Access \(2\)/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Delete Selected \(2\)/ })).toBeEnabled();

    // Show all versions reloads with the history
    await user.click(screen.getByRole('switch', { name: 'Show all versions' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/data-contracts?include_history=true')).toBe(true));
    await loaded();

    // The filter box filters by name
    await user.type(screen.getByPlaceholderText('Filter names...'), 'custom');
    await waitFor(() => expect(screen.queryByText('Orders contract', { exact: true })).toBeNull());
    expect(screen.getByText('Customer contract', { exact: true })).toBeInTheDocument();
  });

  it('data contracts keeps every control for a consumer, without create or upload', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    await loaded();

    expect(sorted(names(screen.getAllByRole('button', { hidden: true })))).toEqual(sorted([
      'Columns', ...HEADERS, '3 versions',
      'Preview Metadata', 'Edit', 'Delete', 'Preview Metadata', 'Edit', 'Delete', ...PAGER,
    ]));
    expect(screen.queryByRole('button', { name: 'New Contract' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload File' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Show all versions' })).toBeEnabled();
  });

  it('data contracts: row actions preview, edit, delete, and the version badge', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(within(rowOf('Orders contract')).getByRole('button', { name: 'Preview Metadata' }));
    expect(await screen.findByRole('dialog', { name: /Orders contract/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Orders contract/ })).toBeNull());

    confirmSpy.mockReturnValueOnce(false);
    await user.click(within(rowOf('Orders contract')).getByRole('button', { name: 'Delete' }));
    expect(calls('DELETE', '/api/data-contracts/c-1')).toHaveLength(0);
    await user.click(within(rowOf('Orders contract')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls('DELETE', '/api/data-contracts/c-1')).toHaveLength(1));
    await waitFor(() => expect(calls('GET', '/api/data-contracts')).toHaveLength(2));

    await user.click(within(rowOf('Customer contract')).getByRole('button', { name: 'Edit' }));
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('data contracts: the version badge and the row open the contract', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: '3 versions' }));
    expect(await screen.findByText('detail page')).toBeInTheDocument();
    unmount();

    renderPage();
    await loaded();
    await user.click(screen.getByText('Customer contract', { exact: true }));
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('data contracts keeps focus on a row button when the page re-renders', async () => {
    renderPage();
    await loaded();
    const edit = within(rowOf('Orders contract')).getByRole('button', { name: 'Edit' });
    edit.focus();
    act(() => {
      usePermissionsStore.setState({ permissions: { 'data-contracts': FeatureAccessLevel.ADMIN } });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(document.activeElement).toBe(edit);
  });

  it('data contracts empty and error states keep their actions', async () => {
    mockBackend([]);
    const user = userEvent.setup();
    const { unmount } = renderPage();
    expect(await screen.findByText('No results.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Contract' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Upload File' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Show all versions' })).toBeEnabled();
    unmount();

    // A failed load: the error shows in the pane with a Retry, over the
    // empty table and its actions
    mockBackend({ detail: 'Backend exploded' }, 500);
    renderPage();
    const alert = await within(await screen.findByRole('region', { name: 'Data contract list' })).findByRole('alert');
    expect(alert).toHaveTextContent('Failed to fetch data contracts');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(screen.getByRole('button', { name: 'New Contract' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Upload File' })).toBeEnabled();

    // Retry loads again; a good answer clears the error
    mockBackend();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(calls('GET', '/api/data-contracts')).toHaveLength(1);

    // Create still opens its dialog
    await user.click(screen.getByRole('button', { name: 'New Contract' }));
    expect(await screen.findByRole('dialog', { name: 'Create New Data Contract' })).toBeInTheDocument();
  });

  it('data contracts: a failed delete shows a dismissible error', async () => {
    mockBackend(CONTRACTS, 200, (_url, init) =>
      init?.method === 'DELETE' ? new Response('nope', { status: 500 }) : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(rowOf('Orders contract')).getByRole('button', { name: 'Delete' }));
    const alert = await within(pane()).findByRole('alert');
    expect(alert).toHaveTextContent('Failed to delete data contract');
    // An action's error has no Retry: the dismiss closes it
    expect(within(alert).queryByRole('button', { name: 'Retry' })).toBeNull();
    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('data contracts drops a late answer from before a project switch', async () => {
    let releaseFirst: (r: Response) => void = () => {};
    fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== '/api/data-contracts') return Promise.resolve(json([]));
      if (!url.searchParams.has('project_id')) return new Promise<Response>((resolve) => { releaseFirst = resolve; });
      return Promise.resolve(json([CONTRACTS[0]]));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await waitFor(() => expect(calls('GET', '/api/data-contracts')).toHaveLength(1));
    act(() => {
      useProjectStore.setState({ currentProject: { id: 'proj-1', name: 'Sales', title: 'Sales' } as never });
    });
    expect(await loaded()).toBeInTheDocument();

    const late = json(CONTRACTS);
    const body = vi.spyOn(late, 'json');
    releaseFirst(late);
    await waitFor(() => expect(body).toHaveBeenCalledTimes(1));
    await act(async () => {
      await body.mock.results[0].value;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByText('Customer contract', { exact: true })).toBeNull();
    expect(screen.getByText('Orders contract', { exact: true })).toBeInTheDocument();
  });

  it('data contracts: a list that is not an array shows as empty', async () => {
    mockBackend({ items: 'unexpected' });
    renderPage();
    expect(await screen.findByText('No results.')).toBeInTheDocument();
  });

  describe('the upload dialog', () => {
    const openUpload = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: 'Upload File' }));
      return screen.findByRole('dialog', { name: UPLOAD_TITLE });
    };

    it('data contracts upload dialog is the kit Dialog with Mantine switches', async () => {
      const user = userEvent.setup();
      renderPage();
      await loaded();
      const dialog = await openUpload(user);
      expect(dialog).toHaveClass('mantine-Modal-content', dialogKit.content);
      expect(dialog).toHaveAccessibleDescription(/Select one or more ODCS files/);
      for (const name of ['Create missing domains', 'Adopt IDs from file', 'Import duplicate IDs as new copies']) {
        const toggle = within(dialog).getByRole('switch', { name });
        expect(toggle).toHaveClass('mantine-Switch-input');
        expect(toggle).not.toBeChecked();
      }
      expect(within(dialog).getByText('Drag and drop contract file(s) here, or click to select')).toBeInTheDocument();
      expect(within(dialog).getByRole('textbox', { name: 'Or paste ODCS JSON' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Import JSON' })).toBeDisabled();
      expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
      expect(dialog.querySelector('.border-dashed, .rounded-md, .text-muted-foreground')).toBeNull();
    });

    it('data contracts upload dialog resets its toggles and paste each time it opens', async () => {
      const user = userEvent.setup();
      renderPage();
      await loaded();
      let dialog = await openUpload(user);
      await user.click(within(dialog).getByRole('switch', { name: 'Create missing domains' }));
      await user.click(within(dialog).getByRole('switch', { name: 'Adopt IDs from file' }));
      await user.type(within(dialog).getByRole('textbox', { name: 'Or paste ODCS JSON' }), 'abc');
      expect(within(dialog).getByRole('switch', { name: 'Create missing domains' })).toBeChecked();
      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: UPLOAD_TITLE })).toBeNull());

      dialog = await openUpload(user);
      expect(within(dialog).getByRole('switch', { name: 'Create missing domains' })).not.toBeChecked();
      expect(within(dialog).getByRole('switch', { name: 'Adopt IDs from file' })).not.toBeChecked();
      expect(within(dialog).getByRole('textbox', { name: 'Or paste ODCS JSON' })).toHaveValue('');
    });

    it('data contracts upload applies the import toggles to the files, and hints at ODPS on an error', async () => {
      mockBackend(CONTRACTS, 200, (url, init) =>
        url.pathname === '/api/data-contracts/upload' && init?.method === 'POST'
          ? json({ detail: { message: 'Invalid ODCS', error: "unexpected key 'outputPorts'" } }, 422)
          : undefined);
      const user = userEvent.setup();
      renderPage();
      await loaded();
      const dialog = await openUpload(user);
      await user.click(within(dialog).getByRole('switch', { name: 'Create missing domains' }));
      await user.click(within(dialog).getByRole('switch', { name: 'Import duplicate IDs as new copies' }));
      const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(input, new File(['{}'], 'product.json', { type: 'application/json' }));

      await waitFor(() => expect(calls('POST', '/api/data-contracts/upload')).toHaveLength(1));
      const form = calls('POST', '/api/data-contracts/upload')[0][1]!.body as FormData;
      expect(form.get('create_missing_domains')).toBe('true');
      expect(form.get('adopt_ids')).toBe('false');
      expect(form.get('on_duplicate')).toBe('new');
      expect((form.get('files') as File).name).toBe('product.json');

      // The error stays in the dialog, with the ODPS hint and the details behind a toggle
      const alert = await within(dialog).findByRole('alert');
      expect(alert).toHaveClass('mantine-Alert-root');
      expect(alert).toHaveTextContent('Invalid ODCS');
      expect(alert).toHaveTextContent(/please use the Data Products page instead/);
      expect(within(alert).queryByText("unexpected key 'outputPorts'")).toBeNull();
      await user.click(within(alert).getByRole('button', { name: 'Technical details' }));
      expect(within(alert).getByText("unexpected key 'outputPorts'")).toBeInTheDocument();
      expect(toast).not.toHaveBeenCalled();
      await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
      expect(within(dialog).queryByRole('alert')).toBeNull();
    });

    it('data contracts upload sums up a partial import, and closes on a full one', async () => {
      let answer = { created: 1, skipped: 1, failed: 0, items: [
        { index: 0, status: 'created', name: 'A' },
        { index: 1, status: 'skipped', name: 'B', message: 'already exists' },
      ] };
      mockBackend(CONTRACTS, 200, (url) => (url.pathname === '/api/data-contracts/upload' ? json(answer) : undefined));
      const user = userEvent.setup();
      renderPage();
      await loaded();
      const dialog = await openUpload(user);
      const input = () => dialog.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(input(), new File(['{}'], 'a.json', { type: 'application/json' }));
      const alert = await within(dialog).findByRole('alert');
      await user.click(within(alert).getByRole('button', { name: 'Technical details' }));
      expect(alert).toHaveTextContent('B: already exists');
      expect(toast).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog', { name: UPLOAD_TITLE })).toBeInTheDocument();

      answer = { created: 2, skipped: 0, failed: 0, items: [] };
      await user.upload(input(), new File(['{}'], 'b.json', { type: 'application/json' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: UPLOAD_TITLE })).toBeNull());
      expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: '2 contracts imported successfully' }));
    });

    it('data contracts imports pasted ODCS JSON with the toggles, keeping the text on a failure', async () => {
      let ok = false;
      mockBackend(CONTRACTS, 200, (url) => {
        if (url.pathname !== '/api/data-contracts/odcs/import') return undefined;
        return ok ? json({ created: 1, skipped: 0, failed: 0, items: [] }) : json({ detail: 'Bad ODCS' }, 400);
      });
      const user = userEvent.setup();
      renderPage();
      await loaded();
      const dialog = await openUpload(user);
      await user.click(within(dialog).getByRole('switch', { name: 'Adopt IDs from file' }));
      const paste = within(dialog).getByRole('textbox', { name: 'Or paste ODCS JSON' });
      await user.click(paste);
      await user.paste('{"name":"x"}');
      await user.click(within(dialog).getByRole('button', { name: 'Import JSON' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Bad ODCS');
      const url = new URL(String(calls('POST', '/api/data-contracts/odcs/import')[0][0]), 'http://localhost');
      expect(url.searchParams.get('create_missing_domains')).toBe('false');
      expect(url.searchParams.get('adopt_ids')).toBe('true');
      expect(url.searchParams.get('on_duplicate')).toBe('skip');
      expect(paste).toHaveValue('{"name":"x"}');
      expect(toast).not.toHaveBeenCalled();

      ok = true;
      await user.click(within(dialog).getByRole('button', { name: 'Import JSON' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: UPLOAD_TITLE })).toBeNull());
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Imported' }));
    });
  });
});

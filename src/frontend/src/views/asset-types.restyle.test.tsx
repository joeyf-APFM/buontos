/**
 * Task 14: Settings → Asset Types (/settings/asset-types) on the page kit.
 * Pixel values that depend on the cascade (row heights, the full-bleed fill,
 * the header labels, the menu and dialog looks, focus) are measured in a real
 * browser in tests/e2e/asset-types.spec.ts (ruling R10); these tests check
 * the structure, every control, the permission gates, the API calls and the
 * guards against odd or late responses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import i18n from '@/i18n/config';
import SettingsPageWrapper from '@/components/settings/settings-page-wrapper';
import AssetTypesView from './asset-types';
import classes from './asset-types.module.css';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const TYPE = {
  icon: null, required_fields: null, optional_fields: null, allowed_relationships: null,
  created_by: 'x', created_at: '2026-10-01T09:00:00Z', updated_at: '2026-11-02T15:30:00Z',
};
const TYPES = [
  { ...TYPE, id: 't-table', name: 'Table', description: 'A table in a data platform', category: 'data', is_system: true, status: 'active', asset_count: 12 },
  { ...TYPE, id: 't-report', name: 'Report', description: null, category: null, is_system: false, status: 'deprecated', asset_count: 3 },
];

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend(list: unknown = TYPES) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/asset-types' && (!init?.method || init.method === 'GET')) return json(list);
    if (url.pathname.startsWith('/api/asset-types/') && init?.method === 'DELETE') return json({});
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string, pathname: string) =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === pathname && (init?.method ?? 'GET') === method);

function grant(level: FeatureAccessLevel, extra: Record<string, FeatureAccessLevel> = {}) {
  usePermissionsStore.setState({
    permissions: {
      settings: FeatureAccessLevel.READ_ONLY,
      'settings-asset-types': FeatureAccessLevel.READ_ONLY,
      assets: level,
      ...extra,
    },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = () =>
  renderWithMantine(
    <Routes>
      <Route path="/settings/asset-types" element={<AssetTypesView />} />
    </Routes>,
    { route: '/settings/asset-types' },
  );

const loaded = () => screen.findByText('Report', { exact: true });
const pane = () => screen.getByRole('region', { name: 'Asset type list' });
const rowOf = (name: string) => screen.getByText(name, { exact: true }).closest('tr') as HTMLElement;
const names = (els: HTMLElement[]) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim());

describe('asset types on the page kit', () => {
  beforeEach(() => {
    grant(FeatureAccessLevel.ADMIN);
    mockBackend();
    toast.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asset types renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    // Full bleed in the Settings layout: the page draws the breadcrumb
    expect(isFullBleed('/settings/asset-types')).toBe(true);
    // Its neighbours in the Settings area keep the layout's padding (wave 4)
    expect(isFullBleed('/settings/teams')).toBe(false);
    expect(isFullBleed('/settings')).toBe(false);
    expect(container.querySelector(`.${kit.page}`)).toHaveAttribute('data-full-bleed');
    const crumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(crumb.closest(`.${kit.crumb}`)).not.toBeNull();
    expect(crumb).toHaveTextContent('/Asset Types');

    const heading = screen.getByRole('heading', { level: 1, name: 'Asset Types' });
    expect(heading.parentElement).toHaveClass(kit.header);
    expect(screen.getByText('Reusable templates that define how different kinds of assets are structured.')).toHaveClass(classes.subtitle);

    // One kit pane, holding the shared DataTable
    expect(pane()).toHaveClass(kit.pane);
    expect(within(pane()).getAllByRole('table')).toHaveLength(1);

    // No layout padding, shadcn Card, Radix menu trigger or Tailwind class in the page's own markup
    expect(container.querySelector('.p-6, .mb-6, .text-3xl')).toBeNull();
    expect(container.querySelector('.bg-card, .rounded-lg.border')).toBeNull();
    // (the DataTable's own Columns menu is shared, and stays Radix: R15)
    for (const button of screen.getAllByRole('button', { name: 'Open menu' })) {
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
      expect(button).not.toHaveAttribute('data-state');
    }
  });

  it('asset types keeps every control', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    // The DataTable's toolbar, header, rows and pager, as the inventory has them
    // (jsdom doesn't name a field by its placeholder; the browser does, and
    // the restyle check's inventory has it as textbox "Filter names...")
    const filter = screen.getByPlaceholderText('Filter names...');
    expect(filter.tagName).toBe('INPUT');
    expect(filter).not.toHaveAttribute('aria-haspopup');
    expect(screen.getByRole('button', { name: 'Columns' })).toBeInTheDocument();
    const add = screen.getByRole('button', { name: 'Add Asset Type' });
    expect(add).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Name' })).toHaveClass(classes.sort);
    expect(screen.getByRole('button', { name: 'Last Updated' })).toHaveClass(classes.sort);
    expect(screen.getAllByRole('button', { name: 'Open menu' })).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(2);
    // Exactly these buttons, in order (hidden: true takes in the first and
    // last page buttons, which show from lg, a width jsdom's CSS never matches)
    expect(names(screen.getAllByRole('button', { hidden: true }))).toEqual([
      'Columns', 'Add Asset Type', 'Name', 'Last Updated', 'Open menu', 'Open menu',
      'Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page',
    ]);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    // The unnamed Home link (R16), the only link
    expect(screen.getAllByRole('link')).toHaveLength(1);

    // Cells: the system badge, the category and status, the count
    expect(within(rowOf('Table')).getByText('System')).toBeInTheDocument();
    expect(within(rowOf('Table')).getByText('Data')).toBeInTheDocument();
    expect(within(rowOf('Report')).getByText('Deprecated')).toBeInTheDocument();
    expect(within(rowOf('Report')).getAllByText('-')).toHaveLength(2);

    // The row menu: a label, Edit, a divider, Delete
    await user.click(within(rowOf('Report')).getByRole('button', { name: 'Open menu' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Actions')).toBeInTheDocument();
    expect(names(within(menu).getAllByRole('menuitem'))).toEqual(['Edit Asset Type', 'Delete Asset Type']);
    expect(within(menu).getAllByRole('separator')).toHaveLength(1);
    expect(within(menu).getByRole('menuitem', { name: 'Edit Asset Type' })).toBeEnabled();
    expect(within(menu).getByRole('menuitem', { name: 'Delete Asset Type' })).toBeEnabled();

    // Edit opens the form in edit mode, on that row
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit Asset Type' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit Asset Type' });
    expect(within(edit).getByRole('textbox', { name: 'Name' })).toHaveValue('Report');
    await user.click(within(edit).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Add opens it in create mode
    await user.click(add);
    const create = await screen.findByRole('dialog', { name: 'Create Asset Type' });
    expect(within(create).getByRole('textbox', { name: 'Name' })).toHaveValue('');
  });

  it('asset types deletes from the row menu after the confirmation, then reloads', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    expect(calls('GET', '/api/asset-types')).toHaveLength(1);

    await user.click(within(rowOf('Report')).getByRole('button', { name: 'Open menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Asset Type' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Asset Type?' });
    // An alertdialog, as the Radix AlertDialog was, and modal
    expect(confirm).toHaveAttribute('aria-modal', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(confirm).toHaveAccessibleDescription('This action cannot be undone. Existing assets of this type may become orphaned.');
    expect(names(within(confirm).getAllByRole('button'))).toEqual(['Cancel', 'Delete']);

    // Cancel: nothing deleted
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls('DELETE', '/api/asset-types/t-report')).toHaveLength(0);

    await user.click(within(rowOf('Report')).getByRole('button', { name: 'Open menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Asset Type' }));
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Delete Asset Type?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls('DELETE', '/api/asset-types/t-report')).toHaveLength(1));
    await waitFor(() => expect(calls('GET', '/api/asset-types')).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(toast).toHaveBeenLastCalledWith({ title: 'Asset Type Deleted', description: 'The asset type was successfully deleted.' });
  });

  it('asset types gates every action on the assets permission', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    expect(screen.getByRole('button', { name: 'Add Asset Type' })).toBeDisabled();
    await user.click(within(rowOf('Report')).getByRole('button', { name: 'Open menu' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Edit Asset Type' })).toBeDisabled();
    expect(within(menu).getByRole('menuitem', { name: 'Delete Asset Type' })).toBeDisabled();
  });

  it('asset types lets Read/Write edit but not delete', async () => {
    grant(FeatureAccessLevel.READ_WRITE);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    expect(screen.getByRole('button', { name: 'Add Asset Type' })).toBeEnabled();
    await user.click(within(rowOf('Report')).getByRole('button', { name: 'Open menu' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Edit Asset Type' })).toBeEnabled();
    expect(within(menu).getByRole('menuitem', { name: 'Delete Asset Type' })).toBeDisabled();
  });

  it('asset types shows a denied notice without the assets permission, in the pane', async () => {
    grant(FeatureAccessLevel.NONE);
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Permission Denied');
    expect(alert).toHaveTextContent('You do not have permission to view asset types.');
    expect(pane()).toContainElement(alert);
    expect(screen.queryByRole('table')).toBeNull();
    expect(calls('GET', '/api/asset-types')).toHaveLength(0);
  });

  it('asset types shows a load error in the pane', async () => {
    fetchMock.mockImplementation(async () => json({ detail: 'Backend exploded' }, 500));
    // useApi logs the failed GET
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    const alert = await within(await screen.findByRole('region', { name: 'Asset type list' })).findByRole('alert');
    expect(alert).toHaveTextContent('Error Loading Data');
    expect(alert).toHaveTextContent('Backend exploded');
    expect(toast).toHaveBeenCalledWith({ variant: 'destructive', title: 'Error fetching asset types', description: 'Backend exploded' });
    expect(logged).toHaveBeenCalledWith('[useApi] GET error response from', '/api/asset-types', '(', 500, '):', { detail: 'Backend exploded' });
    logged.mockRestore();
  });

  it('asset types treats a non-array response as an empty list', async () => {
    mockBackend({ items: TYPES });
    renderPage();
    expect(await screen.findByText('No results.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Open menu' })).toHaveLength(0);
  });

  it('asset types drops a late response from an earlier load', async () => {
    let releaseFirst: (r: Response) => void = () => {};
    let first = true;
    fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== '/api/asset-types') return Promise.resolve(json([]));
      if (first) {
        first = false;
        return new Promise<Response>((resolve) => { releaseFirst = resolve; });
      }
      return Promise.resolve(json([TYPES[1]]));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await waitFor(() => expect(calls('GET', '/api/asset-types')).toHaveLength(1));

    // A language switch gives the page a new `t`, so it loads again
    try {
      await act(async () => { await i18n.changeLanguage('de'); });
      await waitFor(() => expect(calls('GET', '/api/asset-types')).toHaveLength(2));
      expect(await screen.findByText('Report', { exact: true })).toBeInTheDocument();

      // The first load answers last, with a list the page no longer wants.
      // Wait until the page has read that answer's body (useApi awaits
      // response.json()) and every continuation after it has run, so a
      // missing guard would have set the list by now
      const late = json(TYPES);
      const body = vi.spyOn(late, 'json');
      releaseFirst(late);
      await waitFor(() => expect(body).toHaveBeenCalledTimes(1));
      await act(async () => {
        await body.mock.results[0].value;
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(screen.queryByText('Table', { exact: true })).toBeNull();
      expect(screen.getByText('Report', { exact: true })).toBeInTheDocument();
    } finally {
      await act(async () => { await i18n.changeLanguage('en'); });
    }
  });
});

describe('the Settings wrapper around a full-bleed page', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('frames its access-denied notice with the breadcrumb and the layout padding', async () => {
    mockBackend();
    usePermissionsStore.setState({
      permissions: { settings: FeatureAccessLevel.READ_ONLY, assets: FeatureAccessLevel.ADMIN },
      appliedRoleId: null, isLoading: false, _initAttempted: true, _isInitializing: false,
    });
    const { container } = renderPage();
    const denied = await screen.findByText('Access Denied');
    const frame = container.querySelector('[data-settings-state]') as HTMLElement;
    expect(frame).toContainElement(denied);
    expect(within(frame).getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('/Asset Types');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('keeps the other Settings pages\' states as they were (no fullBleed)', async () => {
    usePermissionsStore.setState({
      permissions: { settings: FeatureAccessLevel.READ_ONLY },
      appliedRoleId: null, isLoading: false, _initAttempted: true, _isInitializing: false,
    });
    const { container } = renderWithMantine(
      <SettingsPageWrapper title="Teams" permissionId="settings-teams">
        <p>page</p>
      </SettingsPageWrapper>,
    );
    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
    expect(container.querySelector('[data-settings-state]')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull();
    expect(screen.queryByText('page')).toBeNull();
  });
});

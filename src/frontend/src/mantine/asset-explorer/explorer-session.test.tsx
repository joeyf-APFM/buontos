import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { useHelixStore } from '@/mantine/helix/helix-store';
import ExplorerPage from './explorer-page';
import { useExplorerStore } from './explorer-store';
import { TREE, calledUrls, json, mockBackend, summary } from './test-fixtures';

type User = ReturnType<typeof userEvent.setup>;

function FullPage() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Back</button>;
}

/** The explorer among other routes, with a menu link back to it. */
function App() {
  return (
    <>
      <nav>
        <Link to="/other">Other page</Link>
        <Link to="/assets">Assets menu</Link>
      </nav>
      <Routes>
        <Route path="/assets" element={<ExplorerPage />} />
        <Route path="/assets/:assetId" element={<FullPage />} />
        <Route path="/other" element={<p>Somewhere else</p>} />
      </Routes>
    </>
  );
}

const treeRow = async (name: string) =>
  (await screen.findAllByRole('treeitem', { name: new RegExp(`^${name}(?![a-z_.])`) }))[0];
const clickTreeRow = async (user: User, name: string) => user.click((await treeRow(name)).firstElementChild!);
const grid = () => screen.findByRole('treegrid');
const gridRow = async (name: string, level = 1) => {
  const g = await grid();
  const cells = await within(g).findAllByText(name, { selector: '[data-name]' });
  return cells.map((c) => c.closest('tr')!).find((tr) => tr.getAttribute('aria-level') === String(level))!;
};

const treeCalls = (fetchMock: ReturnType<typeof mockBackend>) =>
  calledUrls(fetchMock).filter((u) => u.pathname === '/api/assets/tree').length;
const listCalls = (fetchMock: ReturnType<typeof mockBackend>) =>
  calledUrls(fetchMock).filter((u) => u.pathname === '/api/assets').length;
/** A restore asks for no tree level again, and refreshes the grid page once (R23). */
const counts = (fetchMock: ReturnType<typeof mockBackend>) => ({ tree: treeCalls(fetchMock), list: listCalls(fetchMock) });
const oneRefresh = (before: { tree: number; list: number }) => ({ tree: before.tree, list: before.list + 1 });

describe('The explorer keeps its state when the user clicks away', () => {
  let fetchMock: ReturnType<typeof mockBackend>;

  beforeEach(() => {
    useExplorerStore.getState().actions.reset();
    usePermissionsStore.setState({
      permissions: { assets: FeatureAccessLevel.READ_WRITE },
      appliedRoleId: null,
      isLoading: false,
      _initAttempted: true,
      _isInitializing: false,
    });
    useHelixStore.setState({ isOpen: false, context: null });
    fetchMock = mockBackend();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A schema selected, a tree node and a grid row open, and a row's details showing. */
  async function browseState(user: User) {
    await clickTreeRow(user, 'insights');
    await clickTreeRow(user, 'referrals');
    // Unfold the table in the tree with its chevron (it stays unselected)
    await user.click((await treeRow('leads')).querySelector('[data-chevron]')!);
    await treeRow('lead_id');
    const leads = await gridRow('insights.referrals.leads');
    await user.click(within(leads).getByRole('button', { name: 'Expand insights.referrals.leads' }));
    await screen.findByRole('table', { name: 'Columns of insights.referrals.leads' });
    await user.click(within(await gridRow('insights.referrals.referrals_daily')).getByText('insights.referrals.referrals_daily'));
    await screen.findByRole('complementary', { name: 'insights.referrals.referrals_daily' });
  }

  async function expectBrowseState() {
    expect(await screen.findByRole('heading', { name: 'insights.referrals' })).toBeInTheDocument();
    expect(await treeRow('referrals')).toHaveAttribute('aria-selected', 'true');
    expect(await treeRow('lead_id')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Columns of insights.referrals.leads' })).toBeInTheDocument();
    expect(await gridRow('insights.referrals.leads')).toHaveAttribute('aria-expanded', 'true');
    const details = screen.getByRole('complementary', { name: 'insights.referrals.referrals_daily' });
    expect(within(details).getByRole('link', { name: 'Open full page' })).toBeInTheDocument();
    expect(useHelixStore.getState().context).toBe('insights.referrals.referrals_daily');
  }

  it('restores everything after Open full page and Back, refreshing only the grid page', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />, { route: '/assets' });
    await browseState(user);
    const before = counts(fetchMock);

    await user.click(screen.getByRole('link', { name: 'Open full page' }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));

    await expectBrowseState();
    await waitFor(() => expect(counts(fetchMock)).toEqual(oneRefresh(before)));
  });

  it('restores everything after another page and the menu', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />, { route: '/assets' });
    await browseState(user);
    const before = counts(fetchMock);

    await user.click(screen.getByRole('link', { name: 'Other page' }));
    expect(await screen.findByText('Somewhere else')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Assets menu' }));

    await expectBrowseState();
    await waitFor(() => expect(counts(fetchMock)).toEqual(oneRefresh(before)));
  });

  it('restores the filters, the page and the selected row', async () => {
    const matches = Array.from({ length: 60 }, (_, i) =>
      summary({ id: `f${i}`, name: `insights.match_${String(i).padStart(2, '0')}` }),
    );
    fetchMock = mockBackend((url) => {
      if (url.pathname !== '/api/assets' || url.searchParams.get('node') !== 'asset:cat1') return undefined;
      const skip = Number(url.searchParams.get('skip'));
      return json({ items: matches.slice(skip, skip + 50), total: 60, skip, limit: 50 });
    });
    const user = userEvent.setup();
    renderWithMantine(<App />, { route: '/assets' });
    await clickTreeRow(user, 'insights');
    await user.type(screen.getByRole('textbox', { name: 'Filter assets' }), 'match');
    await gridRow('insights.match_00');
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(within(await gridRow('insights.match_55')).getByText('insights.match_55'));
    await screen.findByRole('complementary', { name: 'insights.match_55' });
    const before = counts(fetchMock);

    await user.click(screen.getByRole('link', { name: 'Open full page' }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('textbox', { name: 'Filter assets' })).toHaveValue('match');
    expect(screen.getByText('Showing matches under insights; clear filters to browse')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('data-active');
    expect(await gridRow('insights.match_55')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('complementary', { name: 'insights.match_55' })).toBeInTheDocument();
    await waitFor(() => expect(counts(fetchMock)).toEqual(oneRefresh(before)));
  });

  it('falls back to the nearest ancestor when the selected node was deleted meanwhile', async () => {
    let deleted = false;
    fetchMock = mockBackend((url) => {
      if (!deleted) return undefined;
      if (url.pathname === '/api/assets/sch1') return json({ detail: 'Asset not found' }, 404);
      if (url.pathname === '/api/assets/tree' && url.searchParams.get('parent') === 'asset:cat1') {
        return json(TREE['asset:cat1'].filter((n) => (n as { key: string }).key !== 'asset:sch1'));
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderWithMantine(<App />, { route: '/assets' });
    await clickTreeRow(user, 'insights');
    await clickTreeRow(user, 'referrals');
    await user.click(within(await gridRow('insights.referrals.leads')).getByText('insights.referrals.leads'));
    await screen.findByRole('complementary');

    await user.click(screen.getByRole('link', { name: 'Open full page' }));
    deleted = true;
    await user.click(await screen.findByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('heading', { name: 'insights' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
    expect(await treeRow('insights')).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.queryByRole('treeitem', { name: /^referrals(?![a-z_.])/ })).toBeNull());
  });

  it('shows what changed on the full page once the refresh is in', async () => {
    let edited = false;
    fetchMock = mockBackend((url) => {
      if (!edited) return undefined;
      if (url.pathname === '/api/assets/v1') {
        return json({ ...summary({ id: 'v1', name: 'insights.referrals.daily_v2', asset_type_name: 'View' }), status: 'deprecated', relationships: [] });
      }
      if (url.pathname === '/api/assets/sch1') return json({ ...summary({ id: 'sch1', name: 'insights.referrals' }), status: 'draft', relationships: [] });
      if (url.pathname === '/api/assets' && url.searchParams.get('parent') === 'asset:sch1') {
        // The view was renamed and deprecated; the volume (not selected) was deleted
        const rows = [
          { ...summary({ id: 't1', name: 'insights.referrals.leads' }), has_children: true },
          { ...summary({ id: 'v1', name: 'insights.referrals.daily_v2', asset_type_name: 'View' }), status: 'deprecated' as const },
        ];
        return json({ items: rows, total: 2, skip: 0, limit: 50 });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderWithMantine(<App />, { route: '/assets' });
    await clickTreeRow(user, 'insights');
    await clickTreeRow(user, 'referrals');
    await user.click(within(await gridRow('insights.referrals.referrals_daily')).getByText('insights.referrals.referrals_daily'));
    await screen.findByRole('complementary', { name: 'insights.referrals.referrals_daily' });
    expect(await gridRow('insights.referrals.raw_exports')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open full page' }));
    edited = true;
    await user.click(await screen.findByRole('button', { name: 'Back' }));

    const details = await screen.findByRole('complementary', { name: 'insights.referrals.daily_v2' });
    expect(within(details).getByText('deprecated')).toBeInTheDocument();
    expect(await gridRow('insights.referrals.daily_v2')).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.queryAllByText('insights.referrals.raw_exports', { selector: '[data-name]' })).toHaveLength(0));
    const header = screen.getByRole('heading', { name: 'insights.referrals' }).parentElement!;
    await waitFor(() => expect(within(header).getByText('draft')).toBeInTheDocument());
  });

  it('keeps a node the user picked while the deleted-node check was out', async () => {
    let deleted = false;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    fetchMock = mockBackend((url) =>
      deleted && url.pathname === '/api/assets/sch1'
        ? (held.then(() => json({ detail: 'Asset not found' }, 404)) as unknown as Response)
        : undefined,
    );
    const user = userEvent.setup();
    renderWithMantine(<App />, { route: '/assets' });
    await clickTreeRow(user, 'insights');
    await clickTreeRow(user, 'referrals');
    await screen.findByRole('heading', { name: 'insights.referrals' });

    await user.click(screen.getByRole('link', { name: 'Other page' }));
    deleted = true;
    await user.click(await screen.findByRole('link', { name: 'Assets menu' }));
    await clickTreeRow(user, 'Unity Catalog');
    await screen.findByRole('heading', { name: 'Unity Catalog' });
    await act(async () => release());

    expect(screen.getByRole('heading', { name: 'Unity Catalog' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'insights' })).toBeNull();
  });

  it('falls back to the first branch when Unity Catalog isn’t in the saved tree', async () => {
    fetchMock = mockBackend((url) => {
      if (url.pathname === '/api/assets/tree' && !url.searchParams.get('parent')) {
        return json([
          { key: 'branch:external', label: 'External', kind: 'branch', count: 1, has_children: true },
          { key: 'branch:uc', label: 'Unity Catalog', kind: 'branch', count: 12, has_children: true },
        ]);
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderWithMantine(<App />, { route: '/assets' });
    await clickTreeRow(user, 'insights');
    await user.click(within(await gridRow('insights.referrals')).getByText('insights.referrals'));
    await screen.findByRole('complementary', { name: 'insights.referrals' });
    await user.click(screen.getByRole('link', { name: 'Other page' }));
    // The node is gone and has no ancestor to fall back to (saved without
    // any), and the saved root level no longer has Unity Catalog
    const { tree, page } = useExplorerStore.getState();
    useExplorerStore.setState({
      tree: { ...tree!, children: { ...tree!.children, '': tree!.children[''].filter((n) => n.key !== 'branch:uc') } },
      page: { ...page!, selection: { ...page!.selection!, ancestors: [] } },
    });
    fetchMock = mockBackend((url) => (url.pathname === '/api/assets/cat1' ? json({ detail: 'Asset not found' }, 404) : undefined));

    await user.click(screen.getByRole('link', { name: 'Assets menu' }));

    expect(await screen.findByRole('heading', { name: 'External' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('forgets the saved state when the applied role changes', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />, { route: '/assets' });
    await clickTreeRow(user, 'insights');
    await screen.findByRole('heading', { name: 'insights' });
    await user.click(screen.getByRole('link', { name: 'Other page' }));

    act(() => usePermissionsStore.setState({ appliedRoleId: 'role-consumer' }));
    expect(useExplorerStore.getState().page).toBeNull();
    expect(useExplorerStore.getState().tree).toBeNull();
    // Back to the user's own role (whose permissions this test grants), and to the page
    act(() => usePermissionsStore.setState({ appliedRoleId: null }));
    await user.click(screen.getByRole('link', { name: 'Assets menu' }));

    expect(await screen.findByRole('heading', { name: 'Unity Catalog' })).toBeInTheDocument();
  });
});

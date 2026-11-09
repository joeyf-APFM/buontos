import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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

/** Requests to the tree and to the listings, which a restore must not repeat. */
const dataCalls = (fetchMock: ReturnType<typeof mockBackend>) =>
  calledUrls(fetchMock).filter((u) => u.pathname === '/api/assets/tree' || u.pathname === '/api/assets').length;

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

  it('restores everything after Open full page and Back, without refetching', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />, { route: '/assets' });
    await browseState(user);
    const before = dataCalls(fetchMock);

    await user.click(screen.getByRole('link', { name: 'Open full page' }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));

    await expectBrowseState();
    expect(dataCalls(fetchMock)).toBe(before);
  });

  it('restores everything after another page and the menu', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />, { route: '/assets' });
    await browseState(user);
    const before = dataCalls(fetchMock);

    await user.click(screen.getByRole('link', { name: 'Other page' }));
    expect(await screen.findByText('Somewhere else')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Assets menu' }));

    await expectBrowseState();
    expect(dataCalls(fetchMock)).toBe(before);
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
    const before = dataCalls(fetchMock);

    await user.click(screen.getByRole('link', { name: 'Open full page' }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('textbox', { name: 'Filter assets' })).toHaveValue('match');
    expect(screen.getByText('Showing matches under insights; clear filters to browse')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('data-active');
    expect(await gridRow('insights.match_55')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('complementary', { name: 'insights.match_55' })).toBeInTheDocument();
    expect(dataCalls(fetchMock)).toBe(before);
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
});

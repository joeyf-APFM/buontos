import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { useHelixStore } from '@/mantine/helix/helix-store';
import ExplorerPage from './explorer-page';
import { LEADS, calledUrls, json, mockBackend } from './test-fixtures';

// The create dialog has its own tests; here it only has to open
vi.mock('@/components/common/asset-form-dialog', () => ({
  AssetFormDialog: ({ isOpen, assetTypeName, defaultDataBranch }: { isOpen: boolean; assetTypeName: string; defaultDataBranch?: string }) =>
    isOpen ? <div role="dialog">{`create ${assetTypeName} in ${defaultDataBranch}`}</div> : null,
}));

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { assets: level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const row = (name: string) => screen.findByRole('treeitem', { name: new RegExp(`^${name}`) });
/** Clicks a tree row as a pointer would: on the row's content, not its list item. */
const clickRow = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click((await row(name)).firstElementChild!);
const assetCalls = (fetchMock: ReturnType<typeof mockBackend>) =>
  calledUrls(fetchMock).filter((u) => u.pathname === '/api/assets');
const lastAssetCall = (fetchMock: ReturnType<typeof mockBackend>) => assetCalls(fetchMock).slice(-1)[0];
const table = () => screen.findByRole('table');

async function openSchema(user: ReturnType<typeof userEvent.setup>) {
  await clickRow(user, 'insights');
  await clickRow(user, 'referrals');
}

describe('ExplorerPage', () => {
  let fetchMock: ReturnType<typeof mockBackend>;

  beforeEach(() => {
    grant(FeatureAccessLevel.READ_WRITE);
    useHelixStore.setState({ isOpen: false, context: null });
    fetchMock = mockBackend();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('lists the assets of Unity Catalog at first', async () => {
    renderWithMantine(<ExplorerPage />, { route: '/assets' });

    expect(await within(await table()).findByText('leads')).toBeInTheDocument();
    expect(assetCalls(fetchMock)[0].searchParams.get('node')).toBe('branch:uc');
    expect(assetCalls(fetchMock)[0].searchParams.get('limit')).toBe('50');
    expect(screen.getByRole('heading', { name: 'Unity Catalog' })).toBeInTheDocument();
  });

  it('lists a schema’s assets when its node is selected', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await openSchema(user);

    await waitFor(() => expect(lastAssetCall(fetchMock).searchParams.get('node')).toBe('asset:sch1'));
    expect(await screen.findByRole('heading', { name: 'referrals' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumbs).toHaveTextContent('Unity Catalog');
    expect(crumbs).toHaveTextContent('insights');
    const t = await table();
    expect(within(t).getByText('leads')).toBeInTheDocument();
    expect(within(t).getByText('data-eng +2')).toBeInTheDocument();
    expect(useHelixStore.getState().context).toBe('referrals');
  });

  it('shows none of the previous node’s rows while the next node loads', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    fetchMock = mockBackend((url) => {
      if (url.pathname !== '/api/assets' || url.searchParams.get('node') !== 'asset:cat1') return undefined;
      // Held until the test releases it
      return held.then(() => json({ items: [LEADS], total: 1, skip: 0, limit: 50 })) as unknown as Response;
    });
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await within(await table()).findByText('lead_events');
    expect(screen.getByText('2 assets')).toBeInTheDocument();

    await clickRow(user, 'insights');
    expect(await screen.findByRole('heading', { name: 'insights' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('leads')).toBeNull();
    expect(within(screen.getByRole('table')).queryByText('lead_events')).toBeNull();
    expect(screen.queryByText('2 assets')).toBeNull();

    release();
    expect(await within(await table()).findByText('leads')).toBeInTheDocument();
    expect(screen.getByText('1 asset')).toBeInTheDocument();
  });

  it('drops the name filter at once when the node changes', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await within(await table()).findByText('leads');

    await user.type(screen.getByRole('textbox', { name: 'Filter assets' }), 'events');
    await waitFor(() => expect(lastAssetCall(fetchMock).searchParams.get('name')).toBe('events'));
    await clickRow(user, 'insights');
    await within(await table()).findByText('leads');
    await new Promise((r) => setTimeout(r, 350));

    const forInsights = assetCalls(fetchMock).filter((u) => u.searchParams.get('node') === 'asset:cat1');
    expect(forInsights.map((u) => u.searchParams.get('name'))).toEqual([null]);
  });

  it('filters by concept on the server', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await within(await table()).findByText('leads');

    await user.type(screen.getByRole('textbox', { name: 'Concept' }), 'Lea');
    // In jsdom the open dropdown stays display: none, so its options count as hidden
    await user.click(await screen.findByRole('option', { name: 'Lead', hidden: true }));

    await waitFor(() =>
      expect(lastAssetCall(fetchMock).searchParams.get('concept_iri')).toBe('http://ontos.app/apfm#Lead'),
    );
    expect(lastAssetCall(fetchMock).searchParams.get('skip')).toBe('0');
    expect(await screen.findByText('37 assets')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('lead_events')).toBeNull();
  });

  it('debounces the text filter into the name parameter', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await within(await table()).findByText('leads');

    await user.type(screen.getByRole('textbox', { name: 'Filter assets' }), 'events');

    await waitFor(() => expect(lastAssetCall(fetchMock).searchParams.get('name')).toBe('events'));
    const names = assetCalls(fetchMock).map((u) => u.searchParams.get('name'));
    expect(names.filter((n) => n && n !== 'events')).toEqual([]);
    await waitFor(() => expect(within(screen.getByRole('table')).queryByText('leads')).toBeNull());
  });

  it('opens the details panel for a clicked row, and hides it while Helix is open', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });

    await user.click(await within(await table()).findByText('leads'));

    const details = await screen.findByRole('complementary', { name: 'leads' });
    expect(within(details).getByText('insights.referrals.leads')).toBeInTheDocument();
    expect(within(details).getByText('Referrals')).toBeInTheDocument();
    expect(within(details).getByText('24')).toBeInTheDocument();
    expect(within(details).getByRole('link', { name: 'Open full page' })).toHaveAttribute('href', '/assets/a1');
    expect(useHelixStore.getState().context).toBe('insights.referrals.leads');

    act(() => useHelixStore.getState().actions.open());
    expect(screen.queryByRole('complementary', { name: 'leads' })).toBeNull();
    act(() => useHelixStore.getState().actions.close());
    expect(screen.getByRole('complementary', { name: 'leads' })).toBeInTheDocument();
  });

  it('shows the empty state for a node with no assets', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await clickRow(user, 'insights');
    await clickRow(user, 'empty_schema');

    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
  });

  it('shows Retry when the list fails, and Retry fetches again', async () => {
    let fail = true;
    fetchMock = mockBackend((url) =>
      url.pathname === '/api/assets' && fail ? json({ detail: 'boom' }, 500) : undefined,
    );
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });

    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    const before = assetCalls(fetchMock).length;
    fail = false;
    await user.click(retry);

    expect(await within(await table()).findByText('leads')).toBeInTheDocument();
    expect(assetCalls(fetchMock).length).toBe(before + 1);
  });

  it('opens the create dialog preset to the node’s branch and type', async () => {
    fetchMock = mockBackend((url) =>
      url.pathname === '/api/asset-types'
        ? json([{ id: 't-dash', name: 'Dashboard', is_system: true, status: 'active', asset_count: 4, created_at: '', updated_at: '' }])
        : undefined,
    );
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await clickRow(user, 'Dashboards');

    await user.click(await screen.findByRole('button', { name: 'New asset' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('create Dashboard in undefined');
  });

  it('asks for the type when the node has none, and presets the branch', async () => {
    fetchMock = mockBackend((url) =>
      url.pathname === '/api/asset-types'
        ? json([{ id: 't-table', name: 'Table', is_system: true, status: 'active', asset_count: 2, created_at: '', updated_at: '' }])
        : undefined,
    );
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await within(await table()).findByText('leads');

    await user.click(screen.getByRole('button', { name: 'New asset' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Table' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('create Table in uc');
  });

  it('hides New asset without write access', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await within(await table()).findByText('leads');

    expect(screen.queryByRole('button', { name: 'New asset' })).toBeNull();
  });

  it('shows a permission message without read access', async () => {
    grant(FeatureAccessLevel.NONE);
    renderWithMantine(<ExplorerPage />, { route: '/assets' });

    expect(await screen.findByText('You don’t have access to assets.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

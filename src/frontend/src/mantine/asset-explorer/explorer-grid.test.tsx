import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { useHelixStore } from '@/mantine/helix/helix-store';
import ExplorerPage from './explorer-page';
import { calledUrls, json, mockBackend, summary, treeCalls } from './test-fixtures';
import { useExplorerStore } from '@/mantine/asset-explorer/explorer-store';

type User = ReturnType<typeof userEvent.setup>;

// The first match: an open node's rows come before its later siblings
const treeRow = async (name: string) =>
  (await screen.findAllByRole('treeitem', { name: new RegExp(`^${name}(?![a-z_.])`) }))[0];
const clickTreeRow = async (user: User, name: string) => user.click((await treeRow(name)).firstElementChild!);
const grid = () => screen.findByRole('treegrid');

/** The grid row whose Name cell reads `name`, at `level` (1 is the top). */
async function gridRow(name: string, level = 1) {
  const g = await grid();
  await within(g).findAllByText(name, { selector: '[data-name]' });
  const rows = within(g)
    .getAllByText(name, { selector: '[data-name]' })
    .map((el) => el.closest('tr')!)
    .filter((tr) => tr.getAttribute('aria-level') === String(level));
  expect(rows).toHaveLength(1);
  return rows[0];
}
const nestedRows = (name: string) =>
  screen.queryAllByText(name, { selector: '[data-name]' }).filter((el) => el.closest('tr')!.getAttribute('aria-level') !== '1');

/** Direct-children listings of `parent`. */
const listCalls = (fetchMock: ReturnType<typeof mockBackend>, parent: string) =>
  calledUrls(fetchMock).filter((u) => u.pathname === '/api/assets' && u.searchParams.get('parent') === parent);

/** Whether `url` is the direct-children listing of `parent`. */
const listingOf = (parent: string, url: URL) =>
  url.pathname === '/api/assets' && url.searchParams.get('parent') === parent;

const lastCall = (fetchMock: ReturnType<typeof mockBackend>) =>
  calledUrls(fetchMock).filter((u) => u.pathname === '/api/assets').slice(-1)[0];

async function openCatalog(user: User) {
  await clickTreeRow(user, 'insights');
  return gridRow('insights.referrals');
}

async function expandSchema(user: User) {
  const schema = await openCatalog(user);
  await user.click(within(schema).getByRole('button', { name: 'Expand insights.referrals' }));
  return schema;
}

describe('Nested rows in the asset grid', () => {
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

  it('expands a schema row into its direct children, indented, with one list call', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    const schema = await openCatalog(user);
    expect(schema).toHaveAttribute('aria-expanded', 'false');

    await user.click(within(schema).getByRole('button', { name: 'Expand insights.referrals' }));

    const leads = await gridRow('leads', 2);
    expect(schema).toHaveAttribute('aria-expanded', 'true');
    expect(leads.querySelector('td')!.style.paddingLeft).toBe('26px');
    for (const name of ['referrals_daily', 'referral_kpis', 'raw_exports']) expect(await gridRow(name, 2)).toBeInTheDocument();
    // The listing holds the schema itself; it isn't one of its own children
    expect(nestedRows('insights.referrals')).toHaveLength(0);
    expect(listCalls(fetchMock, 'asset:sch1')).toHaveLength(1);
    expect(treeCalls(fetchMock, 'asset:sch1')).toBe(0);
  });

  it('gives a chevron only to rows that have children', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    const schema = await openCatalog(user);

    expect(within(schema).getByRole('button', { name: 'Expand insights.referrals' })).toBeInTheDocument();
    const empty = await gridRow('insights.empty_schema');
    expect(within(empty).queryByRole('button')).toBeNull();
    expect(empty).not.toHaveAttribute('aria-expanded');
  });

  it('lists only the direct children of the selected node', async () => {
    renderWithMantine(<ExplorerPage />, { route: '/assets' });

    // Unity Catalog: its catalog and the two loose tables, not what is inside the catalog
    expect(await gridRow('insights')).toBeInTheDocument();
    expect(await gridRow('leads')).toBeInTheDocument();
    expect(screen.queryAllByText('insights.referrals', { selector: '[data-name]' })).toHaveLength(0);
    expect(screen.getByText('3 assets')).toBeInTheDocument();
  });

  it('expands a table row into a sub-grid of its columns', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await expandSchema(user);
    const leads = await gridRow('leads', 2);
    expect(leads).toHaveAttribute('aria-expanded', 'false');

    await user.click(within(leads).getByRole('button', { name: 'Expand insights.referrals.leads' }));

    const sub = await screen.findByRole('table', { name: 'Columns of insights.referrals.leads' });
    expect(within(sub).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Column', 'Data type', 'Nullable', 'Description', 'Concepts',
    ]);
    const [, first, second] = within(sub).getAllByRole('row');
    expect(within(first).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'lead_id', 'bigint', 'No', 'The lead’s id, unique across every lead source we ingest.', 'Lead',
    ]);
    expect(within(first).getByText('The lead’s id, unique across every lead source we ingest.')).toHaveAttribute(
      'title', 'The lead’s id, unique across every lead source we ingest.',
    );
    expect(within(second).getAllByRole('cell').map((c) => c.textContent)).toEqual(['event_ts', 'timestamp', 'Yes', '', '']);
    expect(within(sub).getAllByRole('row')).toHaveLength(3); // the table itself isn't a column
    expect(leads).toHaveAttribute('aria-expanded', 'true');
    expect(listCalls(fetchMock, 'asset:t1')).toHaveLength(1);
  });

  it('expands on the chevron without selecting; a row click selects', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await expandSchema(user);
    expect(screen.queryByRole('complementary')).toBeNull();

    const daily = await gridRow('referrals_daily', 2);
    await user.click(within(daily).getByText('referrals_daily'));

    expect(await screen.findByRole('complementary', { name: 'insights.referrals.referrals_daily' })).toBeInTheDocument();
    expect(daily).toHaveAttribute('aria-selected', 'true');
    expect(useHelixStore.getState().context).toBe('insights.referrals.referrals_daily');
  });

  it('shows the first 50 children and pages the rest with Show more', async () => {
    const tables = Array.from({ length: 60 }, (_, i) =>
      summary({ id: `m${i}`, name: `insights.referrals.t${String(i).padStart(2, '0')}`, location: `insights.referrals.t${i}` }),
    );
    fetchMock = mockBackend((url) => {
      if (!listingOf('asset:sch1', url)) return undefined;
      const skip = Number(url.searchParams.get('skip'));
      return json({ items: tables.slice(skip, skip + 50), total: 60, skip, limit: 50 });
    });
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await expandSchema(user);

    await gridRow('t49', 2);
    expect(nestedRows('t50')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Show more (10 left)' }));

    expect(await gridRow('t59', 2)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
    expect(listCalls(fetchMock, 'asset:sch1').map((u) => u.searchParams.get('skip'))).toEqual(['0', '50']);
  });

  it('shows an expansion error with Retry, and Retry fetches again', async () => {
    let fail = true;
    fetchMock = mockBackend((url) => (listingOf('asset:sch1', url) && fail ? json({ detail: 'boom' }, 500) : undefined));
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await expandSchema(user);

    const g = await grid();
    expect(await within(g).findByText(/boom/)).toBeInTheDocument();
    fail = false;
    await user.click(within(g).getByRole('button', { name: 'Retry' }));

    expect(await gridRow('leads', 2)).toBeInTheDocument();
    expect(listCalls(fetchMock, 'asset:sch1')).toHaveLength(2);
  });

  it('collapses everything when the tree selection changes', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await expandSchema(user);
    await gridRow('referrals_daily', 2);

    await clickTreeRow(user, 'Unity Catalog');
    await clickTreeRow(user, 'insights');

    const schema = await gridRow('insights.referrals');
    expect(schema).toHaveAttribute('aria-expanded', 'false');
    expect(nestedRows('referrals_daily')).toHaveLength(0);
  });

  it('ignores the answer of an expansion that was collapsed or replaced', async () => {
    const releases: (() => void)[] = [];
    fetchMock = mockBackend((url) => {
      if (!listingOf('asset:sch1', url) || releases.length) return undefined; // later calls answer at once
      const held = new Promise<void>((resolve) => releases.push(resolve));
      return held.then(() => json({ items: [summary({ id: 'old', name: 'insights.referrals.stale' })], total: 1, skip: 0, limit: 50 })) as unknown as Response;
    });
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    const schema = await expandSchema(user);

    // Collapse while the first answer is out, then expand again: the new answer lands
    await user.click(within(schema).getByRole('button', { name: 'Collapse insights.referrals' }));
    await user.click(within(schema).getByRole('button', { name: 'Expand insights.referrals' }));
    await gridRow('referrals_daily', 2);

    // The first answer, arriving late, replaces nothing
    await act(async () => releases[0]());
    expect(nestedRows('stale')).toHaveLength(0);
    expect(nestedRows('referrals_daily')).toHaveLength(1);
  });

  it('shows the flat matches, without nesting, while a filter is active', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await openCatalog(user);
    expect(screen.queryByText(/Showing matches under/)).toBeNull();

    await user.type(screen.getByRole('textbox', { name: 'Filter assets' }), 'insights');

    expect(await screen.findByText('Showing matches under insights; clear filters to browse')).toBeInTheDocument();
    await waitFor(() => expect(lastCall(fetchMock).searchParams.get('node')).toBe('asset:cat1'));
    expect(lastCall(fetchMock).searchParams.get('parent')).toBeNull();
    // The catalog itself matches, but the server leaves it out of its own matches
    expect(lastCall(fetchMock).searchParams.get('exclude_self')).toBe('true');
    const schema = await gridRow('insights.referrals');
    expect(screen.queryAllByText('insights', { selector: '[data-name]' })).toHaveLength(0);
    expect(within(schema).queryByRole('button')).toBeNull();
    expect(screen.getByText('1 asset')).toBeInTheDocument();
  });

  it('counts the filtered matches as the server does, on every page', async () => {
    const matches = Array.from({ length: 60 }, (_, i) =>
      summary({ id: `f${i}`, name: `insights.match_${String(i).padStart(2, '0')}` }),
    );
    fetchMock = mockBackend((url) => {
      if (url.pathname !== '/api/assets' || url.searchParams.get('node') !== 'asset:cat1') return undefined;
      // A server that didn't honour exclude_self would list the catalog too
      if (url.searchParams.get('exclude_self') !== 'true') {
        return json({ items: [summary({ id: 'cat1', name: 'insights' })], total: 61, skip: 0, limit: 50 });
      }
      const skip = Number(url.searchParams.get('skip'));
      return json({ items: matches.slice(skip, skip + 50), total: 60, skip, limit: 50 });
    });
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await openCatalog(user);
    await user.type(screen.getByRole('textbox', { name: 'Filter assets' }), 'match');

    await gridRow('insights.match_00');
    expect(screen.getByText('60 assets')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '2' }));
    await gridRow('insights.match_59');
    expect(screen.getByText('60 assets')).toBeInTheDocument();
    expect(screen.queryAllByText('insights', { selector: '[data-name]' })).toHaveLength(0);
  });

  it('names the schema in full in the matches hint and the header', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await clickTreeRow(user, 'insights');
    await clickTreeRow(user, 'referrals');
    await user.type(screen.getByRole('textbox', { name: 'Filter assets' }), 'leads');

    expect(await screen.findByText('Showing matches under insights.referrals; clear filters to browse')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'insights.referrals' })).toBeInTheDocument();
  });

  it('closes every row after a filter is set and cleared', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await expandSchema(user);
    await gridRow('referrals_daily', 2);

    const filter = screen.getByRole('textbox', { name: 'Filter assets' });
    await user.type(filter, 'ref');
    await screen.findByText(/Showing matches under/);
    await user.clear(filter);
    await waitFor(() => expect(screen.queryByText(/Showing matches under/)).toBeNull());

    expect(await gridRow('insights.referrals')).toHaveAttribute('aria-expanded', 'false');
    expect(nestedRows('referrals_daily')).toHaveLength(0);
  });

  it('closes every row after paging away and back', async () => {
    const schemas = Array.from({ length: 60 }, (_, i) =>
      summary({ id: `s${i}`, name: `insights.s${String(i).padStart(2, '0')}`, asset_type_name: 'Schema' }),
    );
    fetchMock = mockBackend((url) => {
      if (listingOf('asset:cat1', url)) {
        const skip = Number(url.searchParams.get('skip'));
        return json({ items: schemas.slice(skip, skip + 50).map((a) => ({ ...a, has_children: true })), total: 60, skip, limit: 50 });
      }
      return url.pathname === '/api/assets' && url.searchParams.get('parent')?.startsWith('asset:s')
        ? json({ items: [summary({ id: 'kid', name: 'kid_table' })], total: 1, skip: 0, limit: 50 })
        : undefined;
    });
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await clickTreeRow(user, 'insights');
    const first = await gridRow('insights.s00');
    await user.click(within(first).getByRole('button', { name: 'Expand insights.s00' }));
    await gridRow('kid_table', 2);

    await user.click(screen.getByRole('button', { name: '2' }));
    await gridRow('insights.s50');
    await user.click(screen.getByRole('button', { name: '1' }));

    expect(await gridRow('insights.s00')).toHaveAttribute('aria-expanded', 'false');
    expect(nestedRows('kid_table')).toHaveLength(0);
  });

  it('drops an answer that was in flight when the scope changed', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    fetchMock = mockBackend((url) =>
      listingOf('asset:sch1', url)
        ? (held.then(() => json({ items: [summary({ id: 'late', name: 'insights.referrals.late' })], total: 1, skip: 0, limit: 50 })) as unknown as Response)
        : undefined,
    );
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await expandSchema(user);

    // Away to a filter and back while the expansion's answer is out
    const filter = screen.getByRole('textbox', { name: 'Filter assets' });
    await user.type(filter, 'ref');
    await screen.findByText(/Showing matches under/);
    await user.clear(filter);
    await waitFor(() => expect(screen.queryByText(/Showing matches under/)).toBeNull());
    await act(async () => release());

    expect(await gridRow('insights.referrals')).toHaveAttribute('aria-expanded', 'false');
    expect(nestedRows('late')).toHaveLength(0);
  });

  it('keeps a column’s full name as Helix context after its details close', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await clickTreeRow(user, 'insights');
    await clickTreeRow(user, 'referrals');
    await clickTreeRow(user, 'leads');
    await clickTreeRow(user, 'event_ts');
    await waitFor(() => expect(useHelixStore.getState().context).toBe('insights.referrals.leads.event_ts'));

    await user.click(within(await gridRow('event_ts')).getByText('event_ts'));
    await user.click(await screen.findByRole('button', { name: 'Close details' }));

    expect(useHelixStore.getState().context).toBe('insights.referrals.leads.event_ts');
  });
});

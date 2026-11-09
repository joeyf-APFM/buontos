import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { useHelixStore } from '@/mantine/helix/helix-store';
import ExplorerPage from './explorer-page';
import { TREE, calledUrls, json, mockBackend, summary, treeCalls } from './test-fixtures';

type User = ReturnType<typeof userEvent.setup>;

const treeRow = (name: string) => screen.findByRole('treeitem', { name: new RegExp(`^${name}(?![a-z_.])`) });
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

const listCalls = (fetchMock: ReturnType<typeof mockBackend>, node: string) =>
  calledUrls(fetchMock).filter((u) => u.pathname === '/api/assets' && u.searchParams.get('node') === node);

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

  it('expands a schema row into its tables, indented, with one tree call and one list call', async () => {
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
    expect(treeCalls(fetchMock, 'asset:sch1')).toBe(1);
    const lists = listCalls(fetchMock, 'asset:sch1');
    expect(lists).toHaveLength(1);
    expect(lists[0].searchParams.get('asset_type_names')!.split(',').sort()).toEqual(['Metric View', 'Table', 'View', 'Volume']);
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
      if (url.pathname === '/api/assets/tree' && url.searchParams.get('parent') === 'asset:sch1') {
        return json(tables.map((t) => ({ key: `asset:${t.id}`, label: t.name, kind: 'asset', asset_id: t.id, asset_type_name: 'Table', count: 0, has_children: false })));
      }
      if (url.pathname === '/api/assets' && url.searchParams.get('node') === 'asset:sch1' && url.searchParams.get('asset_type_names')) {
        const skip = Number(url.searchParams.get('skip'));
        return json({ items: tables.slice(skip, skip + 50), total: 60, skip, limit: 50 });
      }
      return undefined;
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
    fetchMock = mockBackend((url) =>
      url.pathname === '/api/assets/tree' && url.searchParams.get('parent') === 'asset:sch1' && fail
        ? json({ detail: 'boom' }, 500)
        : undefined,
    );
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await expandSchema(user);

    const g = await grid();
    expect(await within(g).findByText(/boom/)).toBeInTheDocument();
    fail = false;
    await user.click(within(g).getByRole('button', { name: 'Retry' }));

    expect(await gridRow('leads', 2)).toBeInTheDocument();
    expect(treeCalls(fetchMock, 'asset:sch1')).toBe(2);
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
      if (url.pathname !== '/api/assets/tree' || url.searchParams.get('parent') !== 'asset:sch1') return undefined;
      if (releases.length) return undefined; // later calls answer at once
      const held = new Promise<void>((resolve) => releases.push(resolve));
      return held.then(() => json(TREE['asset:sch1'])) as unknown as Response;
    });
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    const schema = await expandSchema(user);

    // Collapse while the first answer is out: it must not land
    await user.click(within(schema).getByRole('button', { name: 'Collapse insights.referrals' }));
    await act(async () => releases[0]());
    expect(nestedRows('referrals_daily')).toHaveLength(0);
    expect(schema).toHaveAttribute('aria-expanded', 'false');

    // Expanded again, the new answer lands once
    await user.click(within(schema).getByRole('button', { name: 'Expand insights.referrals' }));
    await gridRow('referrals_daily', 2);
    expect(nestedRows('referrals_daily')).toHaveLength(1);
  });

  it('says that filters apply to the top-level rows only', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });
    await openCatalog(user);
    expect(screen.queryByText(/Filters apply to the top-level rows/)).toBeNull();

    await user.type(screen.getByRole('textbox', { name: 'Filter assets' }), 'ref');

    expect(await screen.findByText('Filters apply to the top-level rows; nested rows show everything under them.')).toBeInTheDocument();
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

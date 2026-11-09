import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { AssetTree, type TreeSelection } from './asset-tree';
import { calledUrls, json, mockBackend, treeCalls } from './test-fixtures';

function Harness({ onSelect }: { onSelect: (s: TreeSelection) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <AssetTree
      selectedKey={selected}
      onSelect={(s) => {
        setSelected(s.node.key);
        onSelect(s);
      }}
    />
  );
}

// A row's accessible name is its label then its count (and, when open, its children)
// The first match: an open node's rows come before its later siblings
const row = async (name: string) =>
  (await screen.findAllByRole('treeitem', { name: new RegExp(`^${name}(?![a-z_.])`) }))[0];
/** Clicks a tree row as a pointer would: on the row's content, not its list item. */
const clickRow = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click((await row(name)).firstElementChild!);

describe('AssetTree', () => {
  let fetchMock: ReturnType<typeof mockBackend>;

  beforeEach(() => {
    fetchMock = mockBackend();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the Data Assets branches with their counts and the category sections', async () => {
    renderWithMantine(<Harness onSelect={() => {}} />);

    const uc = await row('Unity Catalog');
    expect(uc).toHaveTextContent('12');
    expect(screen.getByText('Data Assets')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(await row('Dashboards')).toHaveTextContent('4');
  });

  it('selects Unity Catalog and expands it at first', async () => {
    const onSelect = vi.fn();
    renderWithMantine(<Harness onSelect={onSelect} />);

    expect(await row('insights')).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ node: expect.objectContaining({ key: 'branch:uc' }) }));
    expect(await row('Unity Catalog')).toHaveAttribute('aria-selected', 'true');
  });

  it('loads a node’s children on first expand only', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness onSelect={() => {}} />);

    await clickRow(user, 'insights');
    expect(await row('referrals')).toBeInTheDocument();
    expect(treeCalls(fetchMock, 'asset:cat1')).toBe(1);

    // A second click on the selected node folds it; a third unfolds it from the cache
    await clickRow(user, 'insights');
    await waitFor(() => expect(screen.queryByRole('treeitem', { name: /^referrals/ })).toBeNull());
    await clickRow(user, 'insights');
    expect(await row('referrals')).toBeInTheDocument();
    expect(treeCalls(fetchMock, 'asset:cat1')).toBe(1);
  });

  it('passes the ancestors of the selected node', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithMantine(<Harness onSelect={onSelect} />);

    await clickRow(user, 'insights');
    await clickRow(user, 'referrals');

    const last = onSelect.mock.lastCall![0] as TreeSelection;
    expect(last.node.key).toBe('asset:sch1');
    expect(last.ancestors.map((n) => n.label)).toEqual(['Unity Catalog', 'insights']);
  });

  it('refetches a failed level only on Retry', async () => {
    let fail = true;
    fetchMock = mockBackend((url) =>
      url.pathname === '/api/assets/tree' && url.searchParams.get('parent') === 'asset:cat1' && fail
        ? json({ detail: 'boom' }, 500)
        : undefined,
    );
    const user = userEvent.setup();
    renderWithMantine(<Harness onSelect={() => {}} />);

    await clickRow(user, 'insights');
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(treeCalls(fetchMock, 'asset:cat1')).toBe(1);

    // Expanding something else leaves the failed level alone
    await clickRow(user, 'External');
    await waitFor(() => expect(treeCalls(fetchMock, 'branch:external')).toBe(1));
    expect(treeCalls(fetchMock, 'asset:cat1')).toBe(1);

    fail = false;
    await user.click(retry);
    expect(await row('referrals')).toBeInTheDocument();
    expect(treeCalls(fetchMock, 'asset:cat1')).toBe(2);
  });

  const iconOf = async (name: string) =>
    (await row(name)).firstElementChild!.querySelector('[data-icon]')!.getAttribute('data-icon');

  async function openToColumns(user: ReturnType<typeof userEvent.setup>) {
    await clickRow(user, 'insights');
    await clickRow(user, 'referrals');
    await clickRow(user, 'leads');
    await row('lead_id');
  }

  it('gives each kind of node its own icon', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness onSelect={() => {}} />);
    await openToColumns(user);

    const expected: Record<string, string> = {
      'Unity Catalog': 'branch:uc',
      Internal: 'branch:internal',
      External: 'branch:external',
      Unsorted: 'branch:unsorted',
      insights: 'Catalog',
      referrals: 'Schema',
      leads: 'Table',
      referrals_daily: 'View',
      referral_kpis: 'Metric View',
      raw_exports: 'Volume',
      lead_id: 'Column',
      System: 'System',
      Dashboards: 'fallback',
    };
    for (const [name, icon] of Object.entries(expected)) expect(await iconOf(name)).toBe(icon);
  });

  it('falls back for other asset types and for a stray group node', async () => {
    fetchMock = mockBackend((url) =>
      url.pathname === '/api/assets/tree' && url.searchParams.get('parent') === 'asset:sch1'
        ? json([
            { key: 'asset:nb1', label: 'insights.referrals.nb', kind: 'asset', asset_id: 'nb1', asset_type_name: 'Notebook', count: 1, has_children: false },
            { key: 'group:sch1:Table', label: 'Tables', kind: 'group', asset_id: 'sch1', asset_type_name: 'Table', count: 2, has_children: false },
          ])
        : undefined,
    );
    const user = userEvent.setup();
    renderWithMantine(<Harness onSelect={() => {}} />);
    await clickRow(user, 'insights');
    await clickRow(user, 'referrals');

    expect(await iconOf('nb')).toBe('fallback');
    expect(await iconOf('Tables')).toBe('fallback');
  });

  it('expands a table into its columns, which are leaves', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness onSelect={() => {}} />);
    await openToColumns(user);

    expect((await row('leads')).firstElementChild!.querySelector('[data-chevron] svg')).not.toBeNull();
    for (const column of ['lead_id', 'event_ts']) {
      expect((await row(column)).firstElementChild!.querySelector('[data-chevron]')).toBeNull();
    }
    expect(treeCalls(fetchMock, 'asset:t1')).toBe(1);
    expect(calledUrls(fetchMock).some((u) => (u.searchParams.get('parent') ?? '').startsWith('group:'))).toBe(false);
  });

  it('shows names without their parent’s prefix', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness onSelect={() => {}} />);
    await openToColumns(user);

    const label = async (name: string) => (await row(name)).firstElementChild!.querySelector('[title]')!;
    expect(await label('referrals')).toHaveTextContent(/^referrals$/);
    expect(await label('referrals')).toHaveAttribute('title', 'insights.referrals');
    expect(await label('leads')).toHaveAttribute('title', 'insights.referrals.leads');
    expect(await label('lead_id')).toHaveTextContent(/^lead_id$/);
    // A column already short keeps its name
    expect(await label('event_ts')).toHaveAttribute('title', 'event_ts');
  });
});

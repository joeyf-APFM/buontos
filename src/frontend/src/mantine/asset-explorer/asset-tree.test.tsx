import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { AssetTree, type TreeSelection } from './asset-tree';
import { mockBackend, treeCalls } from './test-fixtures';

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

const row = (name: string) => screen.findByRole('treeitem', { name: new RegExp(`^${name}`) });
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
});

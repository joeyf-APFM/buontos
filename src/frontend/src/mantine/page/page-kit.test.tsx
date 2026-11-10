import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { useHelixStore } from '@/mantine/helix/helix-store';
import { useExplorerStore } from '@/mantine/asset-explorer/explorer-store';
import ExplorerPage from '@/mantine/asset-explorer/explorer-page';
import { mockBackend } from '@/mantine/asset-explorer/test-fixtures';
import panel from '@/components/common/panel.module.css';
import { Breadcrumb, DetailsGrid, FilterBar, PageHeader, PageLayout, Pane, PaneStack, Tabs } from '.';
import classes from './page.module.css';

vi.mock('@/components/common/asset-form-dialog', () => ({ AssetFormDialog: () => null }));

describe('page kit', () => {
  it('page layout renders a one-line header, filters and panes with shared borders', () => {
    renderWithMantine(
      <PageLayout
        header={
          <PageHeader
            title="Orders"
            titleId="orders-title"
            badges={<span>Table</span>}
            actions={<button type="button">New asset</button>}
          />
        }
        filters={
          <FilterBar hint="2 assets">
            <input aria-label="Filter assets" />
          </FilterBar>
        }
        aside={<aside aria-label="Details">details</aside>}
      >
        <Pane title="Columns" actions={<button type="button">Refresh</button>}>
          grid
        </Pane>
        <Pane aria-label="Preview">preview</Pane>
      </PageLayout>,
    );

    // The header, then the filters, then the panes, in that order (the shell draws the breadcrumb)
    const heading = screen.getByRole('heading', { level: 1, name: 'Orders' });
    const filter = screen.getByRole('textbox', { name: 'Filter assets' });
    const columns = screen.getByRole('region', { name: 'Columns' });
    const preview = screen.getByRole('region', { name: 'Preview' });
    const order = [heading, filter, columns, preview];
    order.slice(1).forEach((el, i) =>
      expect(order[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(),
    );

    // One line: the title, its badges and its actions share one row; the title doesn't wrap
    const header = heading.parentElement!;
    expect(header).toHaveClass(classes.header);
    expect(heading).toHaveAttribute('id', 'orders-title');
    expect(within(header).getByText('Table')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'New asset' })).toBeInTheDocument();
    expect(getComputedStyle(heading).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(heading).fontSize).toBe('16px');

    // The filter bar carries its controls and its hint
    const bar = filter.closest(`.${classes.bar}`)!;
    expect(bar).not.toBeNull();
    expect(within(bar as HTMLElement).getByText('2 assets')).toBeInTheDocument();

    // Panes sit side by side in one row, so neighbours share one border
    expect(columns.parentElement).toBe(preview.parentElement);
    expect(columns.nextElementSibling).toBe(preview);
    expect(columns).toHaveClass(classes.pane);
    expect(preview).toHaveClass(classes.pane);
    expect(within(columns).getByRole('heading', { name: 'Columns' })).toBeInTheDocument();
    expect(within(columns).getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    // The aside sits beside the main column
    expect(screen.getByRole('complementary', { name: 'Details' })).toBeInTheDocument();
  });

  it('breadcrumb: Home as a named link, ">" separators hidden from assistive tech, the current page as text', () => {
    renderWithMantine(
      <Breadcrumb
        label="Breadcrumb"
        items={[
          { label: 'Home', to: '/', home: true },
          { label: 'Discover', to: '/marketplace', state: { nav: 'crumb', crumbIndex: 1 } },
          { label: 'Data Catalog', to: '/data-catalog' },
          { label: 'orders', to: '/data-catalog/orders' },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveClass(classes.crumbTrail);
    const links = within(nav).getAllByRole('link');
    // Home is named (R16), with its icon before the word
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Home', '/'],
      ['Discover', '/marketplace'],
      ['Data Catalog', '/data-catalog'],
    ]);
    expect(screen.getByRole('link', { name: 'Home' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // One list item per crumb; each after the first behind a hidden ">"
    const items = within(nav).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    const separators = nav.querySelectorAll('[data-crumb-separator]');
    expect(Array.from(separators).map((s) => [s.textContent, s.getAttribute('aria-hidden')])).toEqual(
      Array(3).fill(['>', 'true']),
    );
    // The current page is plain text, marked current, with its full label as a title
    const current = within(items[3]).getByText('orders');
    expect(current.tagName).toBe('SPAN');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).toHaveAttribute('title', 'orders');
    expect(current).toHaveClass(classes.crumbCurrent);
    expect(links[2]).toHaveClass(classes.crumbLink);
  });

  it('breadcrumb: a crumb with an action is a button, one with neither is plain text', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithMantine(
      <Breadcrumb label="Breadcrumb" items={[{ label: 'Home', to: '/', home: true }, { label: 'Settings' }, { label: 'Unity Catalog', onSelect }, { label: 'insights' }]} />,
    );
    expect(screen.getByText('Settings').tagName).toBe('SPAN');
    expect(screen.getByText('Settings')).not.toHaveAttribute('aria-current');
    await user.click(screen.getByRole('button', { name: 'Unity Catalog' }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('breadcrumb: the "…" button is reached from the keyboard, and its links carry their router state', async () => {
    const user = userEvent.setup();
    const items = [
      { label: 'Home', to: '/', home: true, state: { nav: 'crumb', crumbIndex: 0 } },
      ...Array.from({ length: 7 }, (_, i) => ({ label: `Level ${i + 1}`, to: `/l${i + 1}`, state: { nav: 'crumb', crumbIndex: i + 1 } })),
    ];
    let seen: unknown = null;
    function Where() {
      seen = useLocation().state;
      return null;
    }
    renderWithMantine(
      <>
        <Breadcrumb label="Breadcrumb" moreLabel="Show the hidden levels" items={items} />
        <Where />
      </>,
    );
    await user.tab();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveFocus();
    await user.tab();
    const more = screen.getByRole('button', { name: 'Show the hidden levels' });
    expect(more).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: 'Level 2', hidden: true }));
    expect(seen).toEqual({ nav: 'crumb', crumbIndex: 2 });
  });

  it('breadcrumb: a long trail collapses its middle crumbs into "…", listing them in a menu', async () => {
    const user = userEvent.setup();
    const items = [{ label: 'Home', to: '/', home: true }, ...Array.from({ length: 7 }, (_, i) => ({ label: `Level ${i + 1}`, to: `/l${i + 1}` }))];
    renderWithMantine(<Breadcrumb label="Breadcrumb" moreLabel="Show the hidden levels" items={items} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    // Home, "…", then the last four
    expect(within(nav).getAllByRole('listitem').map((li) => li.textContent?.replace('>', ''))).toEqual([
      'Home', '…', 'Level 4', 'Level 5', 'Level 6', 'Level 7',
    ]);
    await user.click(within(nav).getByRole('button', { name: 'Show the hidden levels' }));
    expect(within(nav).getByRole('button', { name: 'Show the hidden levels' })).toHaveAttribute('aria-expanded', 'true');
    // (Mantine's dropdown is still in its opening transition, display: none, in jsdom)
    expect((await screen.findAllByRole('menuitem', { hidden: true })).map((m) => [m.textContent, m.getAttribute('href')])).toEqual([
      ['Level 1', '/l1'], ['Level 2', '/l2'], ['Level 3', '/l3'],
    ]);
  });

  it('details grid renders label/value rows', () => {
    renderWithMantine(
      <DetailsGrid
        rows={[
          { label: 'Type', value: 'Table' },
          { label: 'Owner', value: <strong>Sales Analytics</strong> },
        ]}
      />,
    );

    const terms = screen.getAllByRole('term');
    const definitions = screen.getAllByRole('definition');
    expect(terms.map((t) => t.textContent)).toEqual(['Type', 'Owner']);
    expect(definitions.map((d) => d.textContent)).toEqual(['Table', 'Sales Analytics']);
    // The same label/value module as the shared panels, so the two can't drift
    expect(terms[0].parentElement).toHaveClass(panel.kv);
    expect(terms[0].nextElementSibling).toBe(definitions[0]);
  });

  it('tabs switch with arrow keys', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <Tabs defaultValue="details">
        <Tabs.List>
          <Tabs.Tab value="details">Details</Tabs.Tab>
          <Tabs.Tab value="lineage">Lineage</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="details">Details panel</Tabs.Panel>
        <Tabs.Panel value="lineage">Lineage panel</Tabs.Panel>
      </Tabs>,
    );

    const details = screen.getByRole('tab', { name: 'Details' });
    expect(details).toHaveAttribute('aria-selected', 'true');
    expect(details).toHaveClass(classes.tab);
    expect(screen.getByRole('tablist')).toHaveClass(classes.tabList);
    await user.click(details);
    await user.keyboard('{ArrowRight}');
    const lineage = screen.getByRole('tab', { name: 'Lineage' });
    expect(lineage).toHaveFocus();
    expect(lineage).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Lineage panel');
    await user.keyboard('{ArrowLeft}');
    expect(details).toHaveAttribute('aria-selected', 'true');
  });

  it('tabs unmount inactive panels, as Radix Tabs do, unless kept mounted', () => {
    const { unmount } = renderWithMantine(
      <Tabs defaultValue="details">
        <Tabs.List>
          <Tabs.Tab value="details">Details</Tabs.Tab>
          <Tabs.Tab value="lineage">Lineage</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="details">Details panel</Tabs.Panel>
        <Tabs.Panel value="lineage">Lineage panel</Tabs.Panel>
      </Tabs>,
    );
    expect(screen.getByText('Details panel')).toBeInTheDocument();
    expect(screen.queryByText('Lineage panel')).toBeNull();
    unmount();

    renderWithMantine(
      <Tabs defaultValue="details" keepMounted>
        <Tabs.List>
          <Tabs.Tab value="details">Details</Tabs.Tab>
          <Tabs.Tab value="lineage">Lineage</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="details">Details panel</Tabs.Panel>
        <Tabs.Panel value="lineage">Lineage panel</Tabs.Panel>
      </Tabs>,
    );
    expect(screen.getByText('Lineage panel')).toBeInTheDocument();
  });
});

it('a pane title gets a title attribute only when the caller asks (titleTooltip)', () => {
  const long = 'Workspace catalog with a very long name that will not fit in the pane head — Resources';
  renderWithMantine(
    <PageLayout header={<PageHeader title="Orders" />}>
      <Pane title="Details">details</Pane>
      <Pane title={long} titleTooltip>body</Pane>
    </PageLayout>,
  );
  // By default no tooltip repeats the title
  expect(screen.getByRole('heading', { level: 2, name: 'Details' })).not.toHaveAttribute('title');
  const heading = screen.getByRole('heading', { level: 2, name: long });
  expect(heading).toHaveAttribute('title', long);
  // The pane is still named by its heading's text
  expect(screen.getByRole('region', { name: long })).toContainElement(heading);
});

it('page layout stacks its panes below lg only when asked (stackBelow)', () => {
  const { unmount } = renderWithMantine(
    <PageLayout header={<PageHeader title="Orders" />}>
      <Pane title="A">a</Pane>
      <Pane title="B">b</Pane>
    </PageLayout>,
  );
  // Off by default: the pages before Task 13 keep their row at every width
  expect(screen.getByRole('region', { name: 'A' }).parentElement).not.toHaveAttribute('data-stack-below');
  unmount();
  renderWithMantine(
    <PageLayout header={<PageHeader title="Orders" />} stackBelow="lg">
      <Pane title="A">a</Pane>
      <Pane title="B">b</Pane>
    </PageLayout>,
  );
  const row = screen.getByRole('region', { name: 'A' }).parentElement!;
  expect(row).toHaveClass(classes.content);
  expect(row).toHaveAttribute('data-stack-below', 'lg');
});

it('pane stack lays panes out in one column, each at its own height', () => {
  renderWithMantine(
    <PageLayout header={<PageHeader title="Orders" />}>
      <PaneStack>
        <Pane title="Details">details</Pane>
        <Pane title="Owners">owners</Pane>
      </PaneStack>
    </PageLayout>,
  );
  const details = screen.getByRole('region', { name: 'Details' });
  const owners = screen.getByRole('region', { name: 'Owners' });
  const stack = details.parentElement!;
  expect(stack).toHaveClass(classes.stack);
  expect(owners.parentElement).toBe(stack);
  // The stack is the content row's one child, so it takes the row's width
  expect(stack.parentElement).toHaveClass(classes.content);
});

it('tabs keep the kit look with a caller’s classNames and unstyled=false', () => {
  renderWithMantine(
    <Tabs defaultValue="a" unstyled={false} classNames={{ tab: 'mine', list: 'my-list' }}>
      <Tabs.List>
        <Tabs.Tab value="a">A</Tabs.Tab>
      </Tabs.List>
    </Tabs>,
  );
  const tab = screen.getByRole('tab', { name: 'A' });
  expect(tab).toHaveClass(classes.tab, 'mine');
  expect(screen.getByRole('tablist')).toHaveClass(classes.tabList, 'my-list');
  // Still unstyled: none of Mantine's own Tabs module classes
  expect(tab.className.split(' ').filter((c) => c.startsWith('m_'))).toEqual([]);
});

describe('the explorer on the page kit', () => {
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
    mockBackend();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the explorer still renders its header via PageHeader', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExplorerPage />, { route: '/assets' });

    const grid = await screen.findByRole('treegrid');
    await within(grid).findByText('leads');
    const heading = screen.getByRole('heading', { name: 'Unity Catalog' });
    expect(heading.parentElement).toHaveClass(classes.header);
    expect(within(heading.parentElement!).getByRole('button', { name: 'New asset' })).toBeInTheDocument();
    // The filters sit in the kit's filter bar, the count as its hint
    const bar = screen.getByRole('textbox', { name: 'Filter assets' }).closest(`.${classes.bar}`) as HTMLElement;
    expect(bar).not.toBeNull();
    expect(within(bar).getByText('3 assets')).toHaveClass(classes.hint);

    // The details panel lists its fields in the kit's details grid
    await user.click(within(grid).getByText('leads'));
    const details = await screen.findByRole('complementary', { name: 'leads' });
    const terms = within(details).getAllByRole('term');
    expect(terms[0]).toHaveTextContent('Type');
    expect(terms[0].parentElement).toHaveClass(panel.kv);
    expect(terms[0].nextElementSibling).toHaveTextContent('Table');
  });
});

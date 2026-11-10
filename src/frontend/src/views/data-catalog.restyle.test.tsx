/**
 * Task 12: the Data Catalog list (/data-catalog) on the page kit, with the
 * Asset Explorer's grid. Pixel values that depend on the cascade (row height,
 * the sticky header, the focus highlight) are measured in a real browser in
 * tests/e2e/data-catalog.spec.ts (ruling R10); these tests check the
 * structure, the controls, the API calls and the keyboard paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import explorer from '@/mantine/asset-explorer/explorer.module.css';
import DataCatalog from './data-catalog';

const COLUMN = {
  column_label: null, nullable: false, is_primary_key: false, classification: null, position: 0,
  table_name: 'orders', table_full_name: 'main.sales.orders', schema_name: 'sales', catalog_name: 'main',
  table_type: 'TABLE', source: 'asset', asset_id: null, system_name: null, contract_id: null,
  contract_name: null, contract_version: null, contract_status: null, business_terms: [],
};

const COLUMNS = [
  { ...COLUMN, column_name: 'order_id', column_type: 'BIGINT', description: 'Order key' },
  {
    ...COLUMN, column_name: 'amount', column_label: 'Amount', column_type: 'DECIMAL', description: null,
    asset_id: 'a1', business_terms: [{ iri: 'http://ontos.app/apfm#Revenue', label: 'Revenue' }],
  },
  {
    ...COLUMN, column_name: 'customer', column_type: 'STRING', description: null, table_name: 'contract_orders',
    table_full_name: 'orders_contract.orders', table_type: 'CONTRACT', source: 'contract', contract_id: 'c1',
  },
];

const HIERARCHY = { asset_types: ['table', 'view'], systems: ['Databricks'], catalogs: ['main'], schemas: ['sales'] };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend({ hasMore = false, total = COLUMNS.length, hierarchy = HIERARCHY as unknown } = {}) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/data-catalog/hierarchy') return json(hierarchy);
    if (url.pathname === '/api/data-catalog/columns/search') {
      return json({ query: url.searchParams.get('q'), total_count: 1, columns: [COLUMNS[0]], has_more: false, offset: 0, limit: 50, filters_applied: {} });
    }
    if (url.pathname === '/api/data-catalog/columns') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return json({ table_count: 2, column_count: total, columns: COLUMNS, offset, limit: 50, has_more: hasMore && offset === 0 });
    }
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const columnCalls = () =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((u) => u.pathname === '/api/data-catalog/columns');

const lastColumnCall = () => {
  const all = columnCalls();
  return all[all.length - 1];
};

function Where() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname + location.search}</output>;
}

const renderPage = () =>
  renderWithMantine(
    <>
      <Routes>
        <Route path="/data-catalog" element={<DataCatalog />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { route: '/data-catalog' },
  );

// A Mantine Select's visible field (it keeps its value in a hidden input as well)
const pageSizeField = () => screen.getAllByDisplayValue('50').find((el) => el.getAttribute('aria-haspopup') === 'listbox')!;
/**
 * Waits until no request is in flight and the pager is shown: the call count
 * holds across one poll, longer than the search's 300ms debounce.
 */
const settled = async () => {
  let seen = -1;
  await waitFor(
    () => {
      const n = fetchMock.mock.calls.length;
      const stable = n === seen;
      seen = n;
      expect(stable).toBe(true);
      expect(screen.getByText(/^Showing /)).toBeInTheDocument();
    },
    { interval: 350, timeout: 3000 },
  );
};
const findGrid = () => screen.findByRole('table');
const rowOf = async (text: string) => (await screen.findAllByText(text, { selector: 'td, td *' }))[0].closest('tr')!;

describe('data catalog on the page kit', () => {
  beforeEach(() => mockBackend());
  afterEach(() => vi.unstubAllGlobals());

  it('data catalog renders with the page kit', async () => {
    const { container } = renderPage();
    const grid = await findGrid();

    // A full-bleed route: the page draws its own breadcrumb and padding
    expect(isFullBleed('/data-catalog')).toBe(true);

    const heading = screen.getByRole('heading', { level: 1, name: 'Data Catalog' });
    const header = heading.parentElement!;
    expect(header).toHaveClass(kit.header);
    expect(await within(header).findByText('(2 Tables)')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Refresh' })).toBeInTheDocument();

    // The layout breadcrumb's trail: Home icon, Home, Data Catalog
    const crumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(crumb.closest(`.${kit.crumb}`)).not.toBeNull();
    expect(within(crumb).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(crumb).getByRole('link', { name: 'Data Catalog' })).toHaveAttribute('href', '/data-catalog');

    // The filters sit in the kit's filter bar
    expect(screen.getByPlaceholderText('Search columns...').closest(`.${kit.bar}`)).not.toBeNull();

    // The grid is the explorer's, in a flush kit pane
    expect(grid).toHaveClass(explorer.table);
    const pane = screen.getByRole('region', { name: 'Catalog columns' });
    expect(pane).toHaveClass(kit.pane);
    expect(pane).toContainElement(grid);
    // Names in monospace
    expect(within(await rowOf('Order key')).getByText('order_id', { selector: 'code' })).toHaveClass(explorer.mono);
    expect(within(await rowOf('Order key')).getByText('BIGINT')).toHaveClass(explorer.mono);

    // No layout padding and no shadcn Card or table in the page tree
    expect(container.querySelector('.p-6')).toBeNull();
    expect(container.querySelector('.mantine-Paper-root')).toBeNull();
    expect(container.querySelector('[data-slot="table"], .rounded-md.border')).toBeNull();
  });

  it('data catalog keeps every control', async () => {
    const user = userEvent.setup();
    renderPage();
    await findGrid();

    // Filters: type, system, catalog, schema (Mantine Selects), and search
    for (const value of ['All Types', 'All Systems', 'All Catalogs', 'All Schemas']) {
      expect(screen.getByDisplayValue(value)).toBeInTheDocument();
    }
    expect(screen.getByPlaceholderText('Search columns...')).toBeInTheDocument();
    // Per page, previous and next
    expect(pageSizeField()).toBeInTheDocument();
    expect(screen.getByText('Showing 1–3 of 3 columns')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();

    // A filter sends its value to the server and shows Clear
    await user.click(screen.getByDisplayValue('All Catalogs'));
    await user.click(await screen.findByRole('option', { name: 'main', hidden: true }));
    await waitFor(() => expect(lastColumnCall().searchParams.get('catalog')).toBe('main'));
    const clear = await screen.findByRole('button', { name: 'Clear' });
    await user.click(clear);
    await waitFor(() => expect(lastColumnCall().searchParams.get('catalog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    // The pager is back once the page has loaded (it unmounts while loading)
    await settled();

    // The page size goes to the server
    await user.click(pageSizeField());
    await user.click(await screen.findByRole('option', { name: '100', hidden: true }));
    await waitFor(() => expect(lastColumnCall().searchParams.get('limit')).toBe('100'));

    // Search uses the search endpoint
    await user.type(screen.getByPlaceholderText('Search columns...'), 'order');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/data-catalog/columns/search?') && String(u).includes('q=order'))).toBe(true),
    );
    expect(await screen.findByText(/matching "order"/)).toBeInTheDocument();

    // Refresh clears the search and refetches
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Search columns...')).toHaveValue(''));
  });

  it('data catalog sends the type, system and schema filters to the server', async () => {
    const user = userEvent.setup();
    renderPage();
    await findGrid();

    const choose = async (value: string, option: string) => {
      await settled();
      const field = screen.getByDisplayValue(value);
      await user.click(field);
      const list = await waitFor(() => document.getElementById(field.getAttribute('aria-controls')!)!);
      await user.click(within(list).getByRole('option', { name: option, hidden: true }));
    };
    await choose('All Types', 'view');
    await waitFor(() => expect(lastColumnCall().searchParams.get('asset_type')).toBe('view'));
    await choose('All Systems', 'Databricks');
    await waitFor(() => expect(lastColumnCall().searchParams.get('system')).toBe('Databricks'));
    await choose('All Schemas', 'sales');
    await waitFor(() => expect(lastColumnCall().searchParams.get('schema')).toBe('sales'));
    // All three together, and no catalog
    const params = lastColumnCall().searchParams;
    expect([params.get('asset_type'), params.get('system'), params.get('schema'), params.get('catalog')]).toEqual([
      'view', 'Databricks', 'sales', null,
    ]);
  });

  it('data catalog filters a value named "all" like any other', async () => {
    mockBackend({ hierarchy: { asset_types: ['all', 'table'], systems: ['all'], catalogs: ['all', 'main'], schemas: ['all'] } });
    const user = userEvent.setup();
    renderPage();
    await findGrid();

    // The page renders (Mantine Select rejects duplicate values) with "All Catalogs" chosen
    expect(screen.getByDisplayValue('All Catalogs')).toBeInTheDocument();
    expect(lastColumnCall().searchParams.get('catalog')).toBeNull();
    await settled();
    const catalogField = screen.getByDisplayValue('All Catalogs');
    await user.click(catalogField);
    // Every filter has an "all" option now; take the open catalog list's
    const list = await waitFor(() => document.getElementById(catalogField.getAttribute('aria-controls')!)!);
    await user.click(within(list).getByRole('option', { name: 'all', hidden: true }));
    await waitFor(() => expect(lastColumnCall().searchParams.get('catalog')).toBe('all'));
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('data catalog pages with previous and next', async () => {
    mockBackend({ hasMore: true, total: 120 });
    const user = userEvent.setup();
    renderPage();
    await findGrid();
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();

    // The pager's two unnamed icon buttons (R16), around the page count
    const pagerButtons = async (page: string) => within((await screen.findByText(page)).parentElement!).getAllByRole('button');
    let [prev, next] = await pagerButtons('Page 1 of 3');
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();
    await user.click(next);
    await waitFor(() => expect(lastColumnCall().searchParams.get('offset')).toBe('50'));
    [prev, next] = await pagerButtons('Page 2 of 3');
    expect(next).toBeDisabled();
    await user.click(prev);
    await waitFor(() => expect(lastColumnCall().searchParams.get('offset')).toBe('0'));
  });

  it('data catalog sorts within the page from the column headers', async () => {
    const user = userEvent.setup();
    renderPage();
    const grid = await findGrid();
    const names = () =>
      within(grid).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[2].textContent);

    // Column name, ascending by default
    expect(names()).toEqual(['amount', 'customer', 'order_id']);
    const header = (name: string) => within(grid).getByRole('columnheader', { name });
    expect(header('Column Name')).toHaveAttribute('aria-sort', 'ascending');
    await user.click(header('Column Name'));
    expect(names()).toEqual(['order_id', 'customer', 'amount']);
    expect(header('Column Name')).toHaveAttribute('aria-sort', 'descending');

    await user.click(header('Table'));
    expect(header('Table')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Column Name')).not.toHaveAttribute('aria-sort');
    // The label falls back to the column name
    await user.click(header('Label'));
    expect(names()).toEqual(['amount', 'customer', 'order_id']);
  });

  it('data catalog rows open their table, asset or contract, by click or Enter', async () => {
    const user = userEvent.setup();
    renderPage();
    await findGrid();
    const where = screen.getByRole('status', { name: 'location' });

    // A row with no asset or contract opens the table's details
    await user.click(await rowOf('order_id'));
    expect(where).toHaveTextContent('/data-catalog/main.sales.orders');
    window.history.back();

    // An asset's column opens the asset
    await user.click(await rowOf('Amount'));
    expect(where).toHaveTextContent('/assets/a1');
    window.history.back();

    // Rows are in the tab order, as in the explorer; Enter opens a contract's
    const contractRow = await rowOf('customer');
    expect(contractRow).toHaveAttribute('tabindex', '0');
    contractRow.focus();
    await user.keyboard('{Enter}');
    expect(where).toHaveTextContent('/data-contracts/c1');
  });

  it('data catalog business terms open their concept, not the row', async () => {
    const user = userEvent.setup();
    renderPage();
    await findGrid();
    const where = screen.getByRole('status', { name: 'location' });

    await user.click(within(await rowOf('Amount')).getByText('Revenue'));
    expect(where).toHaveTextContent('/semantic-models?concept=http%3A%2F%2Fontos.app%2Fapfm%23Revenue');
  });
});

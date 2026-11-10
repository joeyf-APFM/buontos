/**
 * Task 12: a Data Catalog table (/data-catalog/*) on the page kit. Pixel
 * values that depend on the cascade (the panes' shared borders, the grid's
 * row height) are measured in a real browser in tests/e2e/data-catalog.spec.ts
 * (ruling R10); these tests check the structure, the controls, the API calls
 * and the keyboard paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import panel from '@/components/common/panel.module.css';
import explorer from '@/mantine/asset-explorer/explorer.module.css';
import DataCatalogDetails from './data-catalog-details';

const TABLE = {
  full_name: 'main.sales.orders',
  name: 'orders',
  schema_name: 'sales',
  catalog_name: 'main',
  table_type: 'MANAGED',
  owner: 'e2e.user@example.com',
  comment: 'One row per customer order',
  created_at: '2026-10-01T09:00:00Z',
  updated_at: '2026-11-02T15:30:00Z',
  created_by: 'creator@example.com',
  updated_by: 'updater@example.com',
  storage_location: 's3://bucket/orders',
  data_source_format: 'DELTA',
  row_count: 1200,
  size_bytes: 2048,
  tags: { pii: 'false' },
  columns: [
    { name: 'order_id', type_text: 'bigint', position: 0, nullable: false, comment: 'Order key', partition_index: null },
    { name: 'order_date', type_text: 'date', position: 1, nullable: true, comment: null, partition_index: 0 },
  ],
};

const LINEAGE = {
  root_table: 'main.sales.orders',
  nodes: [
    { id: 'main.sales.orders', name: 'orders', type: 'table', catalog: 'main', schema: 'sales', is_root: true, depth: 0 },
    { id: 'main.sales.raw_orders', name: 'raw_orders', type: 'table', catalog: 'main', schema: 'sales', is_root: false, depth: -1 },
  ],
  edges: [{ source: 'main.sales.raw_orders', target: 'main.sales.orders' }],
  upstream_count: 1,
  downstream_count: 0,
  external_count: 0,
};

const IMPACT = {
  source_table: 'main.sales.orders',
  impacted_tables: [{ id: 'main.sales.daily' }],
  impacted_views: [],
  impacted_external: [],
  total_impacted_count: 1,
  affected_owners: ['owner@example.com'],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend({ table = TABLE as unknown, status = 200 } = {}) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const base = `/api/data-catalog/tables/${encodeURIComponent('main.sales.orders')}`;
    if (url.pathname === base) return json(table, status);
    if (url.pathname === `${base}/lineage`) return json(LINEAGE);
    if (url.pathname === `${base}/impact`) return json(IMPACT);
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (suffix: string) =>
  fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes(suffix));

function Where() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname + location.search}</output>;
}

const renderPage = (fqn = 'main.sales.orders') =>
  renderWithMantine(
    <>
      <Routes>
        <Route path="/data-catalog/*" element={<DataCatalogDetails />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { route: `/data-catalog/${fqn}` },
  );

const findHeading = () => screen.findByRole('heading', { level: 1, name: 'orders' });

describe('data catalog details on the page kit', () => {
  beforeEach(() => mockBackend());
  afterEach(() => vi.unstubAllGlobals());

  it('data catalog details renders with the page kit', async () => {
    const { container } = renderPage();
    const heading = await findHeading();

    expect(isFullBleed('/data-catalog/main.sales.orders')).toBe(true);

    // The kit's one-line header: the title, its type, and Back to List
    const header = heading.parentElement!;
    expect(header).toHaveClass(kit.header);
    expect(within(header).getByText('MANAGED')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Back to List' })).toBeInTheDocument();

    // The layout breadcrumb's trail, ending with the table
    const crumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(crumb.closest(`.${kit.crumb}`)).not.toBeNull();
    expect(within(crumb).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(crumb).getByRole('link', { name: 'Data Catalog' })).toHaveAttribute('href', '/data-catalog');
    expect(within(crumb).getByText('orders')).toBeInTheDocument();

    // The full name, in monospace, under the header
    expect(screen.getByText('main.sales.orders', { selector: 'code' })).toHaveClass(explorer.mono);

    // Overview: kit panes in one stack, label/value rows in the shared details grid
    const basic = screen.getByRole('region', { name: 'Basic Information' });
    const storage = screen.getByRole('region', { name: 'Storage & Statistics' });
    for (const region of [basic, storage, screen.getByRole('region', { name: 'Description' }), screen.getByRole('region', { name: 'Tags' })]) {
      expect(region).toHaveClass(kit.pane);
      expect(region.parentElement).toHaveClass(kit.stack);
    }
    const term = within(basic).getByText('Owner', { selector: 'dt' });
    expect(term.closest('dl')).toHaveClass(panel.kv);
    expect(within(basic).getByText('e2e.user@example.com')).toBeInTheDocument();
    expect(within(basic).getByText('by creator@example.com')).toBeInTheDocument();
    expect(within(storage).getByText('1,200')).toBeInTheDocument();
    expect(within(storage).getByText('2.0 KB')).toBeInTheDocument();
    expect(within(storage).getByText('s3://bucket/orders')).toHaveClass(explorer.mono);
    expect(screen.getByText('pii: false')).toBeInTheDocument();

    // No layout padding and no shadcn Card or Radix tabs in the page tree
    expect(container.querySelector('.p-6')).toBeNull();
    expect(container.querySelector('.mantine-Paper-root')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveClass(kit.tab);
  });

  it('data catalog details keeps every control', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    await findHeading();

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Overview', 'Data Details', 'Lineage']);

    // The copy button next to the full name (unnamed, as before: R16)
    const code = screen.getByText('main.sales.orders', { selector: 'code' });
    await user.click(within(code.parentElement!).getByRole('button'));
    expect(writeText).toHaveBeenCalledWith('main.sales.orders');

    // Back to List goes to the list path, as before
    await user.click(screen.getByRole('button', { name: 'Back to List' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/data-catalog/main.sales.orders');
  });

  it('data catalog details tabs switch with arrow keys', async () => {
    const user = userEvent.setup();
    renderPage();
    await findHeading();

    const overview = screen.getByRole('tab', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-selected', 'true');
    await user.click(overview);

    // Data Details: the columns in the explorer's grid, in a flush pane
    await user.keyboard('{ArrowRight}');
    const columnsTab = screen.getByRole('tab', { name: 'Data Details' });
    expect(columnsTab).toHaveAttribute('aria-selected', 'true');
    expect(columnsTab).toHaveFocus();
    const pane = await screen.findByRole('region', { name: 'Columns' });
    expect(pane).toHaveClass(kit.pane);
    const grid = within(pane).getByRole('table');
    expect(grid).toHaveClass(explorer.table);
    expect(within(grid).getByText('order_id')).toHaveClass(explorer.mono);
    expect(within(grid).getByText('Partition 0')).toBeInTheDocument();
    // The column count, in the pane's head
    expect(within(within(pane).getByRole('heading', { name: 'Columns' }).parentElement!).getByText('2')).toBeInTheDocument();
    // The inactive panel is unmounted, as with Radix Tabs
    expect(screen.queryByRole('region', { name: 'Basic Information' })).toBeNull();
    expect(calls('/lineage')).toHaveLength(0);

    // Lineage: fetched when its tab opens, with the impact summary
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Lineage' })).toHaveAttribute('aria-selected', 'true');
    const lineage = await screen.findByRole('region', { name: 'Data Lineage' });
    expect(lineage).toHaveClass(kit.pane);
    expect(await within(lineage).findByText('raw_orders')).toBeInTheDocument();
    expect(calls('/lineage?direction=both')).toHaveLength(1);
    expect(calls('/impact')).toHaveLength(1);
    const impact = await screen.findByRole('region', { name: 'Impact Summary' });
    expect(within(impact).getByText('1 table')).toBeInTheDocument();
    expect(within(impact).getByText(/owner@example.com/)).toBeInTheDocument();

    // The direction refetches; it is a Mantine Select now
    await user.click(within(lineage).getByRole('textbox', { name: 'Lineage direction' }));
    await user.click(await screen.findByRole('option', { name: 'Upstream Only', hidden: true }));
    await waitFor(() => expect(calls('/lineage?direction=upstream')).toHaveLength(1));

    // Back to Overview, wrapping around
    screen.getByRole('tab', { name: 'Lineage' }).focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true'));
  });

  it('data catalog details shows an error with Back and Retry', async () => {
    mockBackend({ table: { detail: 'missing' }, status: 404 });
    const user = userEvent.setup();
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Table not found');
    expect(screen.getByRole('button', { name: 'Back to List' })).toBeInTheDocument();
    const before = calls('/api/data-catalog/tables/').length;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(calls('/api/data-catalog/tables/').length).toBe(before + 1));
  });
});

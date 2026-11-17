/**
 * Task 13: the Schema Importer (/schema-importer, and /concepts/import inside
 * the Concepts layout) on the page kit. Pixel values that depend on the
 * cascade (row heights, borders, the full-bleed fill, the dialog stacking)
 * are measured in a real browser in tests/e2e/schema-importer.spec.ts (ruling
 * R10); these tests check the structure, every wizard step's controls, the
 * gating, the API calls and the guards against odd responses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import explorer from '@/mantine/asset-explorer/explorer.module.css';
import SchemaBrowser from '@/components/schema-importer/schema-browser';
import browserClasses from '@/components/schema-importer/schema-browser.module.css';
import dialogClasses from '@/components/schema-importer/import-preview-dialog.module.css';
import SchemaImporterView from './schema-importer';

// The store fetches its settings when it loads, before fetch is mocked
vi.mock('@/stores/ui-customization-store', () => ({
  useUICustomizationStore: (select: (s: { getAppName: () => string }) => unknown) => select({ getAppName: () => 'Nucleus' }),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const connection = (id: string, name: string, extra = {}) => ({
  id, name, connector_type: 'databricks', description: null, config: {}, enabled: true, is_default: false,
  system_asset_id: null, data_branch: 'uc', created_by: 'x', created_at: null, updated_at: null, ...extra,
});

const node = (name: string, nodeType: string, path: string, hasChildren: boolean) => ({
  name, node_type: nodeType, path, has_children: hasChildren, description: null, asset_type: null, connector_type: 'databricks',
});

const BROWSE: Record<string, unknown[]> = {
  '': [node('main', 'catalog', 'main', true), node('finance', 'catalog', 'finance', true)],
  main: [node('sales', 'schema', 'main.sales', true)],
  'main.sales': [node('orders', 'table', 'main.sales.orders', false), node('order_lines', 'table', 'main.sales.order_lines', false)],
};

const PREVIEW = [
  { path: 'main', name: 'main', asset_type: 'Catalog', will_create: true, existing_asset_id: null, parent_path: null, is_ancestor: true },
  { path: 'main.sales', name: 'sales', asset_type: 'Schema', will_create: true, existing_asset_id: null, parent_path: 'main', is_ancestor: true },
  { path: 'main.sales.orders', name: 'orders', asset_type: 'Table', will_create: true, existing_asset_id: null, parent_path: 'main.sales', is_ancestor: false },
];

const RESULT = {
  created: 3, skipped: 0, errors: 0, error_messages: [], system_asset_id: null,
  items: PREVIEW.map((p) => ({ path: p.path, name: p.name, asset_type: p.asset_type, action: 'created', asset_id: null, error: null, parent_path: p.parent_path })),
};

interface Backend {
  connections?: unknown;
  preview?: unknown;
  result?: unknown;
  threshold?: number;
  run?: unknown;
}

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend({
  connections = [connection('c1', 'Workspace catalog')],
  preview = PREVIEW,
  result = RESULT,
  threshold,
  run = { id: 'r1', status: 'running', processed_items: 1, total_items: 3, created_count: 1, skipped_count: 0, error_count: 0 },
}: Backend = {}) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const p = url.pathname;
    if (p === '/api/connections') return json(connections);
    if (p.startsWith('/api/schema-import/browse/')) {
      const path = url.searchParams.get('path') ?? '';
      return json({ connection_id: 'c1', path: path || null, nodes: BROWSE[path] ?? [], truncated: false });
    }
    if (p === '/api/schema-import/preview') return json(preview);
    if (p === '/api/schema-import/import') return json(result);
    if (p === '/api/schema-import/import-async') return json({ run_id: 'r1', status: 'pending' });
    if (p === '/api/schema-import/runs/r1') return json(run);
    if (p === '/api/settings') return json(threshold ? { schema_import_async_threshold: threshold } : {});
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (pathname: string) =>
  fetchMock.mock.calls
    .filter(([input]) => new URL(String(input), 'http://localhost').pathname === pathname)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));

function Where() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname + location.search}</output>;
}

const renderPage = (route = '/schema-importer') =>
  renderWithMantine(
    <>
      <Routes>
        <Route path="/schema-importer" element={<SchemaImporterView />} />
        <Route path="/concepts/import" element={<SchemaImporterView />} />
      </Routes>
      <Where />
    </>,
    { route },
  );

const optionsPane = () => screen.getByRole('region', { name: 'Import options' });
const resourcesPane = () => screen.getByRole('region', { name: 'Workspace catalog — Resources' });
/** A schema-browser row: the element holding the label's checkbox. */
const rowOf = (name: string) => screen.getByText(name, { exact: true }).closest('[data-tree-row]') as HTMLElement;
/**
 * The result's Close, in its footer. The dialog's corner close button is
 * named Close too, as the Radix dialog's was: both are there.
 */
const closeButton = (dialog: HTMLElement) => {
  const closes = within(dialog).getAllByRole('button', { name: 'Close' });
  expect(closes).toHaveLength(2);
  return closes[1];
};
const treeLoaded = () => screen.findByText('finance', { exact: true });

async function selectOrders(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('main', { exact: true }));
  await user.click(await screen.findByText('sales', { exact: true }));
  await screen.findByText('orders', { exact: true });
  await user.click(within(rowOf('orders')).getByRole('checkbox'));
}

describe('schema importer on the page kit', () => {
  beforeEach(() => mockBackend());
  afterEach(() => vi.unstubAllGlobals());

  it('schema importer renders with the page kit', async () => {
    const { container } = renderPage();
    await treeLoaded();

    // Its own route is full bleed: it draws the padding, under the shell's breadcrumb
    expect(isFullBleed('/schema-importer')).toBe(true);
    // No breadcrumb of its own: the shell draws the one breadcrumb (Task 16d)
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    expect(container.querySelector(`.${kit.page}`)).toHaveAttribute('data-full-bleed');

    const heading = screen.getByRole('heading', { level: 1, name: 'Schema Importer' });
    expect(heading.parentElement).toHaveClass(kit.header);

    // Two kit panes: the options and the resources (with the tree)
    expect(optionsPane()).toHaveClass(kit.pane);
    expect(resourcesPane()).toHaveClass(kit.pane);
    expect(within(optionsPane()).getByText('databricks')).toBeInTheDocument();
    // The tree rows are the explorer's
    expect(rowOf('main')).toHaveClass(explorer.treeRow);
    expect(within(rowOf('main')).getByText('main')).toHaveClass(explorer.treeLabel);

    // No layout padding, no shadcn Card or ScrollArea in the page tree
    expect(container.querySelector('.p-6')).toBeNull();
    expect(container.querySelector('.bg-card, .rounded-lg.border')).toBeNull();
    expect(container.querySelector('[data-radix-scroll-area-viewport]')).toBeNull();
  });

  it('schema importer renders inside the Concepts layout without a breadcrumb of its own', async () => {
    const { container } = renderPage('/concepts/import');
    await treeLoaded();
    // The Concepts layout keeps the shell's padding
    expect(isFullBleed('/concepts/import')).toBe(false);
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    expect(container.querySelector(`.${kit.page}`)).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Schema Importer' }).parentElement).toHaveClass(kit.header);
    // The same panes, side by side in the kit's content row
    expect(optionsPane().parentElement).toHaveClass(kit.content);
    expect(resourcesPane().parentElement).toBe(optionsPane().parentElement);
  });

  it('schema importer keeps every control: step 1, connection, depth and browse', async () => {
    const user = userEvent.setup();
    renderPage();
    await treeLoaded();

    // The one connection is picked; the field is a Mantine Select
    const select = within(optionsPane()).getByDisplayValue('Workspace catalog');
    expect(select).toHaveAttribute('aria-haspopup', 'listbox');
    // Depth: three radios with their hints in their names; full recursive by default
    const full = screen.getByRole('radio', { name: 'Full recursive Everything nested below selected nodes' });
    expect(full).toBeChecked();
    const one = screen.getByRole('radio', { name: 'One level Selected items + immediate children' });
    screen.getByRole('radio', { name: 'Selected only Import only the selected items' });
    await user.click(one);
    expect(one).toBeChecked();

    // Nothing selected yet: both actions are gated
    expect(screen.getByRole('button', { name: 'Preview (0 selected)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();

    // The browser: search, then one expand button and one checkbox per row
    // (jsdom doesn't name a field by its placeholder; the browser does, and
    // the restyle check's inventory holds it as 'textbox "Search: …"')
    expect(screen.getByPlaceholderText('Search: t:catalog.schema.table')).not.toHaveAttribute('aria-haspopup');
    expect(within(resourcesPane()).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(rowOf('main')).getByRole('button')).toBeInTheDocument();
  });

  it('schema importer keeps every control: step 2, tree expand, select and search', async () => {
    const user = userEvent.setup();
    renderPage();
    await treeLoaded();

    await selectOrders(user);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('path=main.sales'))).toBe(true);
    expect(within(rowOf('orders')).getByRole('checkbox')).toBeChecked();
    expect(within(resourcesPane()).getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview (1 selected)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();

    // Collapse and expand keep the loaded children and the selection
    await user.click(within(rowOf('sales')).getByRole('button'));
    expect(screen.queryByText('orders', { exact: true })).toBeNull();
    await user.click(within(rowOf('sales')).getByRole('button'));
    expect(within(rowOf('orders')).getByRole('checkbox')).toBeChecked();

    // Search highlights its target and filters; the clear button empties it
    const search = screen.getByPlaceholderText('Search: t:catalog.schema.table');
    await user.type(search, 'main.sales.order_l');
    await waitFor(() => expect(rowOf('order_lines')).toHaveAttribute('data-selected'));
    expect(screen.queryByText('finance', { exact: true })).toBeNull();
    await user.click(within(search.closest('.mantine-TextInput-root') as HTMLElement).getByRole('button'));
    expect(search).toHaveValue('');
    expect(await screen.findByText('finance', { exact: true })).toBeInTheDocument();
    expect(within(rowOf('orders')).getByRole('checkbox')).toBeChecked();
  });

  it('schema importer keeps every control: step 3, the preview dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    await treeLoaded();
    await selectOrders(user);

    await user.click(screen.getByRole('button', { name: 'Preview (1 selected)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import Preview' });
    await within(dialog).findByText('orders');
    expect(within(dialog).getByText('3 to create, 0 already exist')).toBeInTheDocument();
    // The summary describes the dialog, as Radix's DialogDescription did
    expect(dialog).toHaveAccessibleDescription('3 to create, 0 already exist');
    expect(calls('/api/schema-import/preview')).toEqual([
      { connection_id: 'c1', selected_paths: ['main.sales.orders'], depth: 'full_recursive', dry_run: true },
    ]);

    // Ancestors (main, sales): a checkbox, a collapse toggle and a link
    // button each; the table (orders) none. Those are the dialog's only
    // unnamed buttons (R16).
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(dialog).getAllByRole('button', { name: '' })).toHaveLength(4);
    for (const name of ['main', 'sales']) {
      const row = within(dialog).getByText(name, { exact: true }).closest('[data-tree-row]') as HTMLElement;
      const [toggle, link, ...rest] = within(row).getAllByRole('button');
      expect(rest).toEqual([]);
      expect(toggle).toHaveClass(dialogClasses.toggle);
      expect(link).toHaveClass(dialogClasses.iconButton);
      expect(link.querySelector('svg.lucide-link-2')).not.toBeNull();
    }
    const ordersRow = within(dialog).getByText('orders', { exact: true }).closest('[data-tree-row]') as HTMLElement;
    expect(within(ordersRow).queryAllByRole('button')).toEqual([]);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Import 3 assets' })).toBeEnabled();
    // Below the background threshold there is no Run in background
    expect(within(dialog).queryByRole('button', { name: 'Run in background' })).toBeNull();

    // Unchecking the schema skips it: one fewer to create, and it is sent as excluded
    const [, schemaCheckbox] = within(dialog).getAllByRole('checkbox');
    await user.click(schemaCheckbox);
    expect(within(dialog).getByText('2 to create, 0 already exist')).toBeInTheDocument();
    expect(within(dialog).getByText('skip')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Import 3 assets' })).toBeNull();
    const importTwo = within(dialog).getByRole('button', { name: 'Import 2 assets' });
    expect(importTwo).toBeEnabled();
    await user.click(importTwo);

    // Step 5: the result, with only Close
    const results = await screen.findByRole('dialog', { name: 'Import Results' });
    expect(calls('/api/schema-import/import')).toEqual([
      { connection_id: 'c1', selected_paths: ['main.sales.orders'], depth: 'full_recursive', excluded_paths: ['main.sales'] },
    ]);
    expect(within(results).getByText('3 created, 0 skipped, 0 errors')).toBeInTheDocument();
    expect(within(results).getAllByText('created')).toHaveLength(3);
    await user.click(closeButton(results));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('schema importer keeps every control: the preview cancels, closes on Escape and gates an empty import', async () => {
    mockBackend({ preview: [{ ...PREVIEW[2], will_create: false }] });
    const user = userEvent.setup();
    renderPage();
    await treeLoaded();
    await selectOrders(user);

    await user.click(screen.getByRole('button', { name: 'Import' }));
    let dialog = await screen.findByRole('dialog', { name: 'Import Preview' });
    await within(dialog).findByText('exists');
    // Nothing to create: the import is gated
    expect(within(dialog).getByRole('button', { name: 'Import 0 assets' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Reopening runs a fresh preview; Escape closes it
    await user.click(screen.getByRole('button', { name: 'Preview (1 selected)' }));
    dialog = await screen.findByRole('dialog', { name: 'Import Preview' });
    await within(dialog).findByText('exists');
    expect(calls('/api/schema-import/preview')).toHaveLength(2);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('schema importer keeps every control: step 4, a background run', async () => {
    mockBackend({ threshold: 1 });
    const user = userEvent.setup();
    renderPage();
    await treeLoaded();
    await selectOrders(user);

    await user.click(screen.getByRole('button', { name: 'Preview (1 selected)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import Preview' });
    const background = await within(dialog).findByRole('button', { name: 'Run in background' });
    await user.click(background);
    expect(await within(dialog).findByText('Pending')).toBeInTheDocument();
    expect(calls('/api/schema-import/import-async')).toHaveLength(1);
    // While it runs: cancel the run, or close and keep it running
    await user.click(within(dialog).getByRole('button', { name: 'Cancel import' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/runs/r1/cancel'))).toBe(true));
    await user.click(within(dialog).getByRole('button', { name: 'Close (keep running)' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('schema importer keeps every control: a link to an existing asset opens the shared selector', async () => {
    const user = userEvent.setup();
    renderPage();
    await treeLoaded();
    await selectOrders(user);
    await user.click(screen.getByRole('button', { name: 'Preview (1 selected)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import Preview' });
    await within(dialog).findByText('orders');

    const mainRow = within(dialog).getByText('main').closest('[data-tree-row]') as HTMLElement;
    const buttons = within(mainRow).getAllByRole('button');
    // The collapse toggle, then the link button
    await user.click(buttons[buttons.length - 1]);
    const selector = await screen.findByRole('dialog', { name: 'Link to existing asset' });
    expect(within(selector).getByRole('button', { name: 'Use selected' })).toBeInTheDocument();
    // Escape closes the selector alone
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Link to existing asset' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Import Preview' })).toBeInTheDocument();
  });

  it('schema importer reopens a finished run from ?runId= and drops it on close', async () => {
    mockBackend({ run: { id: 'r1', status: 'completed', processed_items: 3, created_count: 3, skipped_count: 0, error_count: 0, result: RESULT } });
    const user = userEvent.setup();
    renderPage('/schema-importer?runId=r1');
    const results = await screen.findByRole('dialog', { name: 'Import Results' });
    expect(within(results).getByText('3 created, 0 skipped, 0 errors')).toBeInTheDocument();
    await user.click(closeButton(results));
    await waitFor(() => expect(screen.getByLabelText('location')).toHaveTextContent(/^\/schema-importer$/));
  });

  it('schema importer changing the connection clears the selection, without crashing on duplicate ids', async () => {
    mockBackend({
      connections: [
        connection('c1', 'Workspace catalog'),
        connection('c1', 'Workspace catalog (again)'),
        connection('c2', 'Other workspace'),
        connection('c3', 'Disabled', { enabled: false }),
      ],
    });
    const user = userEvent.setup();
    renderPage();
    const select = await screen.findByPlaceholderText('Choose connection...');
    // Several connections: none is picked, and the browser says so
    expect(screen.getByText('Select a connection to browse its resources')).toBeInTheDocument();
    await user.click(select);
    const listbox = await screen.findByRole('listbox', { hidden: true });
    const names = within(listbox).getAllByRole('option', { hidden: true }).map((o) => o.textContent);
    expect(names).toEqual(['Workspace catalogdatabricks', 'Other workspacedatabricks']);
    await user.click(within(listbox).getByRole('option', { name: /Workspace catalog/, hidden: true }));
    await treeLoaded();
    await selectOrders(user);
    expect(screen.getByRole('button', { name: 'Preview (1 selected)' })).toBeEnabled();

    await user.click(screen.getByDisplayValue('Workspace catalog'));
    await user.click(await screen.findByRole('option', { name: /Other workspace/, hidden: true }));
    expect(await screen.findByRole('button', { name: 'Preview (0 selected)' })).toBeDisabled();
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/browse/c2'))).toBe(true));
  });

  it('schema importer survives empty and malformed responses', async () => {
    mockBackend({ connections: { detail: 'odd' } });
    const { unmount } = renderPage();
    expect(await screen.findByText('No connections configured. Add one in Settings > Connectors.')).toBeInTheDocument();
    unmount();

    // A preview that is not a list
    mockBackend({ preview: { detail: 'odd' } });
    const user = userEvent.setup();
    const second = renderPage();
    await treeLoaded();
    await selectOrders(user);
    await user.click(screen.getByRole('button', { name: 'Preview (1 selected)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import Preview' });
    expect(await within(dialog).findByText('No importable resources found at the selected paths')).toBeInTheDocument();
    second.unmount();

    // A finished run whose result has no item list
    mockBackend({ run: { id: 'r1', status: 'completed', processed_items: 0, created_count: 0, skipped_count: 0, error_count: 0, result: { created: 0, skipped: 0, errors: 0 } } });
    renderPage('/schema-importer?runId=r1');
    const results = await screen.findByRole('dialog', { name: 'Import Results' });
    expect(within(results).getByText('No items in import result')).toBeInTheDocument();
  });

  it('the schema browser keeps its Tailwind look without `pane`, for the other pages that use it', async () => {
    const { container } = renderWithMantine(
      <SchemaBrowser connectionId="c1" selectedPaths={new Set(['main'])} onSelectionChange={() => {}} />,
    );
    await treeLoaded();
    // The ontology generator's and the infer-from-catalog dialog's look: a
    // Radix ScrollArea, the Tailwind rows, none of the pane classes
    expect(container.querySelector('[data-radix-scroll-area-viewport]')).not.toBeNull();
    expect(rowOf('main')).toHaveClass('flex', 'items-center', 'py-1', 'px-2');
    expect(rowOf('main')).toHaveStyle({ paddingLeft: '8px' });
    expect(rowOf('main')).not.toHaveClass(explorer.treeRow);
    expect(container.querySelector(`.${browserClasses.browser}`)).toBeNull();
    expect(within(rowOf('main')).getByRole('checkbox')).toBeChecked();
  });

  it('the schema browser shows a connection error in a Mantine Alert, its detail in a Collapse', async () => {
    fetchMock.mockImplementation(async () =>
      json({ connection_id: 'c1', path: null, nodes: [], error: 'Cannot reach the workspace', error_detail: 'Traceback: timeout' }),
    );
    const user = userEvent.setup();
    renderWithMantine(<SchemaBrowser pane connectionId="c1" selectedPaths={new Set()} onSelectionChange={() => {}} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(within(alert).getByText('Connection Error')).toBeInTheDocument();
    expect(within(alert).getByText('Cannot reach the workspace')).toBeInTheDocument();
    // No shadcn or Radix pieces in pane mode
    expect(alert.closest(`.${browserClasses.errorState}`)).not.toBeNull();
    expect(document.querySelector('[data-state][data-radix-collection-item], [data-state="closed"]')).toBeNull();

    const toggle = within(alert).getByRole('button', { name: 'Show details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const detail = within(alert).getByText('Traceback: timeout');
    expect(toggle).toHaveAttribute('aria-controls', detail.id);
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(detail).toBeVisible());
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

/**
 * Wave 2 Task 10: the Data Contract page's sections from Schemas to
 * Authoritative Definitions (/data-contracts/:id) as kit panes, in the one
 * stack with the Details and Description panes and the shared panels. The
 * schema switch is kit Tabs (2 to 6 schemas) or a Mantine Select (more), the
 * DQX hint opens on hover and on focus, every icon-only button is named, and
 * the Domain and Data Product values are links. Geometry (a 60-column schema
 * scrolling in its pane, long text wrapping) is measured in a real browser in
 * tests/e2e/data-contract-details.spec.ts (ruling R10).
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { useUserStore } from '@/stores/user-store';
import { useJobCapabilitiesStore } from '@/stores/job-capabilities-store';
import { FeatureAccessLevel } from '@/types/settings';
import DataContractDetails from './data-contract-details';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const EMPTY = {
  id: 'c-1', name: 'Orders contract', version: '1.0.0', status: 'draft', apiVersion: 'v3.0.2', kind: 'DataContract',
  schema: [], tags: [], customProperties: {}, team: [], description: { purpose: 'Orders for reporting' },
  created: '2026-10-01T09:00:00Z', updated: '2026-11-02T15:30:00Z',
};

// Every section filled in: two schemas (tabs), a rule, a member, SLA, a server,
// access control, two custom properties, support and a contract definition
const FULL = {
  ...EMPTY,
  domainId: 'd-1', domain: 'Sales', dataProductId: 'p-1', dataProductName: 'Sales orders',
  schema: [
    { name: 'orders', physicalName: 'main.sales.orders', properties: [] },
    { name: 'customers', properties: [] },
  ],
  qualityRules: [{ name: 'Order id is never null', dimension: 'completeness', severity: 'error', type: 'library' }],
  team: [{ role: 'owner', name: 'Ada Lovelace' }],
  sla: { uptimeTarget: 99.9, maxDowntimeMinutes: 30 },
  servers: [{ server: 'prod-warehouse', type: 'databricks', environment: 'prod', host: 'dbc.example.com' }],
  accessControl: { classification: 'internal', containsPii: false },
  customProperties: { retention: '30d', owners: '["a","b"]' },
  support: { slack: 'https://slack.example.com/orders' },
};

const EXTRA: Record<string, unknown> = {
  '/api/data-contracts/c-1/authoritative-definitions': [{ id: 'ad-1', type: 'businessDefinition', url: 'https://wiki.example.com/orders' }],
  '/api/data-contracts/c-1/schemas/orders/authoritative-definitions': [{ id: 'sad-1', type: 'tableDefinition', url: 'https://wiki.example.com/orders-table' }],
  '/api/data-contracts/c-1/schemas/orders/properties': {
    total: 1, items: [{ name: 'order_id', logicalType: 'string', required: true, unique: true, description: 'The order' }],
  },
  '/api/semantic-links/entity/data_contract_schema/c-1%23orders': [{ id: 'l-1', iri: 'https://example.com/onto#Order', label: 'Order' }],
  '/api/semantic-links/entity-prefix/data_contract_property/c-1%23orders%23': [
    { id: 'l-2', entity_id: 'c-1#orders#order_id', iri: 'https://example.com/onto#OrderId', label: 'urn:x:OrderId' },
  ],
  '/api/data-products/by-contract/c-1': [{ id: 'p-9', name: 'Orders mart', version: '1.0.0', status: 'active', outputPorts: [] }],
  '/api/data-contracts/c-1/schemas/customers/properties': {
    total: 1, items: [{ name: 'customer_id', logicalType: 'string', required: true, unique: false }],
  },
};

const MATURITY = { achieved_level_order: null, achieved_level_name: null, total_levels: 0, gates_passed: 0, gates_total: 0, levels: [] };

function mockBackend(contract: unknown, extra: Record<string, unknown> = EXTRA) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { pathname } = new URL(String(input), 'http://localhost');
    if (pathname === '/api/data-contracts/c-1' && (init?.method ?? 'GET') === 'GET') return json(contract);
    if (pathname === '/api/data-contracts/c-1/maturity') return json(MATURITY);
    if (pathname in extra) return json(extra[pathname]);
    return json([]);
  }));
}

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'data-contracts': level, 'data-products': level, 'semantic-models': level },
    availableRoles: [], appliedRoleId: null, isLoading: false, _initAttempted: true, _isInitializing: false,
  });
}

const asConsumer = () => {
  grant(FeatureAccessLevel.READ_ONLY);
  useUserStore.setState({ userInfo: { email: 'e2e.consumer@example.com', username: 'c', user: 'C', ip: '', groups: ['users'] } as never });
};

const renderPage = () =>
  renderWithMantine(
    <Routes>
      <Route path="/data-contracts/:contractId" element={<DataContractDetails />} />
      <Route path="/settings/data-domains/:domainId" element={<p>domain page</p>} />
      <Route path="/data-products/:productId" element={<p>product page</p>} />
    </Routes>,
    { route: '/data-contracts/c-1' },
  );

/** The secondary panes (Team Metadata, SLA, Access Control, Support) start folded: open them to look inside. */
function expandPanes() {
  for (const fold of document.querySelectorAll<HTMLButtonElement>('h2 button[aria-expanded="false"]')) {
    act(() => fold.click());
  }
}
const loaded = async () => {
  const heading = await screen.findByRole('heading', { level: 1, name: 'Orders contract' });
  expandPanes();
  return heading;
};
const pane = (name: RegExp | string) => screen.getByRole('region', { name });

// The section panes, by their titles
const SECTIONS: RegExp[] = [
  /^Schemas \(/, /^Linked Data Products \(/, /^Quality Rules \(/, /^ODCS Team Metadata$/, /^SLA & Infrastructure$/,
  /^Access Control$/, /^Custom Properties \(/, /^Support$/, /^Authoritative Definitions$/,
];

describe('data contract details sections on the page kit', () => {
  let confirmSpy: MockInstance<(message?: string) => boolean>;
  beforeEach(() => {
    localStorage.setItem('data-contract-view-mode', 'large');
    grant(FeatureAccessLevel.ADMIN);
    useUserStore.setState({ userInfo: { email: 'e2e.user@example.com', username: 'e2e', user: 'E2E', ip: '', groups: ['admins'] } as never });
    useJobCapabilitiesStore.setState({ installed: {}, enablementRequestsAllowed: false, isLoaded: false, isLoading: false });
    toast.mockClear();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    confirmSpy.mockRestore();
    localStorage.removeItem('data-contract-view-mode');
  });

  it('data contract details sections render as kit panes in one stack', async () => {
    mockBackend(FULL);
    renderPage();
    await loaded();
    await screen.findByText('Ada Lovelace');

    const stack = pane('Details').parentElement as HTMLElement;
    expect(stack).toHaveClass(kit.stack);
    for (const name of SECTIONS) {
      const section = pane(name);
      expect(section).toHaveClass(kit.pane);
      // One stack: the sections sit with Details and the shared panels
      expect(section.parentElement).toBe(stack);
      // No shadcn Card, nor the old cards' Tailwind layout (the full scan is
      // data-contract-details.markup.test.tsx)
      expect(section.querySelector('.p-6, .bg-card, .border-dashed, .space-y-4, .space-y-2, .grid-cols-2, .text-xl, .mb-4, .pl-4')).toBeNull();
    }
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'Owners' }).some((r) => r.parentElement === stack)).toBe(true));
    // The lead line keeps the old card's subtitle
    expect(within(pane(/^Schemas/)).getByText('Database schema definitions')).toBeInTheDocument();
  });

  it('data contract details sections keep every control for an admin', async () => {
    mockBackend(FULL);
    renderPage();
    await loaded();
    await screen.findByText('Ada Lovelace');

    const schemas = pane(/^Schemas/);
    for (const name of ['Profile with DQX', 'Infer from Catalog', 'Infer from Asset', 'Add Schema']) {
      expect(within(schemas).getByRole('button', { name })).toBeInTheDocument();
    }
    // 2 to 6 schemas: kit tabs, the first one selected
    const tabs = within(schemas).getAllByRole('tab');
    // The counts come from the loaded columns, else the schema's own count (as before)
    expect(tabs.map((tab) => tab.textContent)).toEqual(['orders(1)', 'customers(0)']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    // The selected schema's icon buttons are named
    expect(within(schemas).getByRole('button', { name: 'Edit orders' })).toBeEnabled();
    expect(within(schemas).getByRole('button', { name: 'Delete orders' })).toBeEnabled();
    expect(within(schemas).getByRole('link', { name: 'main.sales.orders' })).toHaveAttribute('href', '/catalog-commander?table=main.sales.orders');
    // Its definitions, with an Add and named edit and delete
    expect(await within(schemas).findByRole('button', { name: 'Edit https://wiki.example.com/orders-table' })).toBeEnabled();
    expect(within(schemas).getByRole('button', { name: 'Delete https://wiki.example.com/orders-table' })).toBeEnabled();
    expect(within(schemas).getByRole('button', { name: 'Add' })).toBeEnabled();

    // Link and create are gated by status: a draft has them disabled
    const products = pane(/^Linked Data Products/);
    expect(within(products).getByRole('button', { name: 'Link to Existing Product' })).toBeDisabled();
    expect(within(products).getAllByRole('button', { name: 'Create Data Product' })[0]).toBeDisabled();

    const rules = pane(/^Quality Rules/);
    expect(within(rules).getByRole('button', { name: 'Add Rule' })).toBeEnabled();
    expect(within(rules).getByRole('button', { name: 'Edit Order id is never null' })).toBeEnabled();
    expect(within(rules).getByRole('button', { name: 'Delete Order id is never null' })).toBeEnabled();

    const sla = pane('SLA & Infrastructure');
    for (const name of ['Edit SLA', 'Add Server', 'Edit prod-warehouse', 'Delete prod-warehouse']) {
      expect(within(sla).getByRole('button', { name })).toBeEnabled();
    }
    const custom = pane(/^Custom Properties/);
    for (const name of ['Add Property', 'Edit retention', 'Delete retention', 'Edit owners', 'Delete owners']) {
      expect(within(custom).getByRole('button', { name })).toBeEnabled();
    }
    const defs = pane('Authoritative Definitions');
    for (const name of ['Add Definition', 'Edit https://wiki.example.com/orders', 'Delete https://wiki.example.com/orders']) {
      expect(await within(defs).findByRole('button', { name })).toBeEnabled();
    }
    expect(within(pane('Support')).getByRole('link', { name: 'https://slack.example.com/orders' })).toHaveAttribute('target', '_blank');

    // No unnamed button anywhere in the sections
    for (const name of SECTIONS) {
      for (const button of within(pane(name)).queryAllByRole('button')) {
        const accessible = button.getAttribute('aria-label') || button.textContent?.trim() || button.getAttribute('title');
        expect(accessible, button.outerHTML).toBeTruthy();
      }
    }
  });

  it('data contract details sections: the named icon buttons keep their actions', async () => {
    const user = userEvent.setup();
    mockBackend(FULL);
    renderPage();
    await loaded();
    // Edit opens the rule's dialog; delete asks first (and is declined here)
    await user.click(within(pane(/^Quality Rules/)).getByRole('button', { name: 'Edit Order id is never null' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(within(pane('SLA & Infrastructure')).getByRole('button', { name: 'Delete prod-warehouse' }));
    expect(confirmSpy).toHaveBeenCalled();
  });

  it('data contract details sections: the schema tabs switch the schema shown', async () => {
    const user = userEvent.setup();
    mockBackend(FULL);
    renderPage();
    await loaded();
    const schemas = pane(/^Schemas/);
    expect(await within(schemas).findByText('order_id')).toBeInTheDocument();
    await user.click(within(schemas).getByRole('tab', { name: /customers/ }));
    expect(within(schemas).getByRole('tab', { name: /customers/ })).toHaveAttribute('aria-selected', 'true');
    expect(await within(schemas).findByText('customer_id')).toBeInTheDocument();
    expect(within(schemas).getByRole('button', { name: 'Edit customers' })).toBeInTheDocument();
  });

  it('data contract details sections: more than six schemas pick from a named Mantine Select', async () => {
    const user = userEvent.setup();
    const schema = Array.from({ length: 7 }, (_, i) => ({ name: `table_${i + 1}`, propertyCount: i + 1, properties: [] }));
    mockBackend({ ...FULL, schema });
    renderPage();
    await loaded();
    const schemas = pane(/^Schemas/);
    const select = within(schemas).getByRole('textbox', { name: 'Select Schema' });
    expect(select.closest('.mantine-Select-root')).not.toBeNull();
    expect(select).toHaveValue('table_1 (0 columns)');
    await user.click(select);
    // Mantine's dropdown transition doesn't finish in jsdom, hence hidden
    await user.click(await screen.findByRole('option', { name: 'table_3 (3 columns)', hidden: true }));
    expect(within(schemas).getByRole('button', { name: 'Edit table_3' })).toBeInTheDocument();
  });

  it('data contract details sections: the DQX hint opens on focus, with its notify action', async () => {
    const user = userEvent.setup();
    useJobCapabilitiesStore.setState({ installed: { dqx_profile_datasets: false }, enablementRequestsAllowed: true, isLoaded: true });
    mockBackend(FULL);
    renderPage();
    await loaded();
    const profile = within(pane(/^Schemas/)).getByRole('button', { name: 'Profile with DQX' });
    expect(profile).toBeDisabled();
    // The wrapper takes the focus a disabled button can't
    const wrapper = profile.parentElement as HTMLElement;
    expect(wrapper).toHaveAttribute('tabindex', '0');
    act(() => wrapper.focus());
    expect(await screen.findByText('Ask your admin to enable the background job.')).toBeInTheDocument();
    // Mantine's transition doesn't finish in jsdom, hence hidden (the browser check is in the e2e spec)
    expect(await screen.findByRole('button', { name: 'Notify admin', hidden: true })).toBeEnabled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Ask your admin to enable the background job.')).toBeNull());
  });

  it('data contract details sections: each empty state keeps its message and its Add action for an admin', async () => {
    mockBackend(EMPTY, {});
    renderPage();
    await loaded();
    const schemas = pane(/^Schemas/);
    expect(within(schemas).getByText('No schemas defined yet')).toBeInTheDocument();
    expect(within(schemas).getByText('Define the structure of your data by adding schemas')).toBeInTheDocument();
    expect(within(schemas).getByRole('button', { name: 'Add Schema Manually' })).toBeEnabled();
    expect(within(schemas).getAllByRole('button', { name: 'Infer from Catalog' })).toHaveLength(2);
    expect(within(pane(/^Linked Data Products/)).getByText('No linked data products yet')).toBeInTheDocument();
    expect(within(pane(/^Linked Data Products/)).getByText("Contract must be in 'active' or 'approved' status")).toBeInTheDocument();
    expect(within(pane(/^Quality Rules/)).getByText('No quality rules defined. Click "Add Rule" to create one.')).toBeInTheDocument();
    expect(within(pane(/^Quality Rules/)).getByRole('button', { name: 'Add Rule' })).toBeEnabled();
    const sla = pane('SLA & Infrastructure');
    expect(within(sla).getByText('No SLA requirements defined.')).toBeInTheDocument();
    expect(within(sla).getByText('No server configurations defined.')).toBeInTheDocument();
    expect(within(sla).getByRole('button', { name: 'Edit SLA' })).toBeEnabled();
    expect(within(sla).getByRole('button', { name: 'Add Server' })).toBeEnabled();
    expect(within(pane(/^Custom Properties/)).getByText('No custom properties defined. Click "Add Property" to create one.')).toBeInTheDocument();
    expect(within(pane(/^Custom Properties/)).getByRole('button', { name: 'Add Property' })).toBeEnabled();
    expect(within(pane('Authoritative Definitions')).getByText('No authoritative definitions defined yet.')).toBeInTheDocument();
    expect(within(pane('Authoritative Definitions')).getByRole('button', { name: 'Add Definition' })).toBeEnabled();
    // Sections with nothing to show stay hidden, as before
    for (const name of [/^ODCS Team Metadata$/, /^Access Control$/, /^Support$/]) {
      expect(screen.queryByRole('region', { name })).toBeNull();
    }
  });

  it('data contract details sections: the consumer has no usable Add, Edit or Delete', async () => {
    asConsumer();
    mockBackend({ ...FULL, status: 'active' });
    renderPage();
    await loaded();
    await screen.findByText('Ada Lovelace');
    for (const name of SECTIONS) {
      const section = pane(name);
      for (const button of within(section).queryAllByRole('button')) {
        const label = button.getAttribute('aria-label') || button.textContent?.trim() || '';
        expect(label, `${name}: ${label}`).not.toMatch(/^(Add|Edit|Delete|Infer)/);
      }
    }
    // What a consumer keeps: the schema tabs. DQX profiling and product links
    // need write access (Task 11c), so they're gone too
    expect(within(pane(/^Schemas/)).getAllByRole('tab')).toHaveLength(2);
    expect(within(pane(/^Schemas/)).queryByRole('button', { name: 'Profile with DQX' })).toBeNull();
    expect(within(pane(/^Linked Data Products/)).queryByRole('button', { name: 'Link to Existing Product' })).toBeNull();
    cleanup();

    // Empty, read-only: the messages, and no Add
    mockBackend({ ...EMPTY, status: 'active' }, {});
    renderPage();
    await loaded();
    expect(within(pane(/^Schemas/)).getByText('This contract has no schemas defined')).toBeInTheDocument();
    expect(within(pane(/^Schemas/)).queryByRole('button', { name: /Add|Infer/ })).toBeNull();
    expect(within(pane(/^Quality Rules/)).queryByRole('button', { name: 'Add Rule' })).toBeNull();
    // The pane's own fold button is not a control of its content
    expect(within(pane('SLA & Infrastructure')).queryAllByRole('button').filter((b) => !b.hasAttribute('aria-expanded'))).toHaveLength(0);
    expect(within(pane('Authoritative Definitions')).queryByRole('button')).toBeNull();
  });

  it('data contract details: the domain and data product values are links that Enter follows', async () => {
    const user = userEvent.setup();
    mockBackend(FULL);
    renderPage();
    await loaded();
    const details = pane('Details');
    const domain = within(details).getByRole('link', { name: 'Sales' });
    expect(domain).toHaveAttribute('href', '/settings/data-domains/d-1');
    const product = within(details).getByRole('link', { name: 'Sales orders' });
    expect(product).toHaveAttribute('href', '/data-products/p-1');
    expect(product).toHaveAttribute('title', 'Product ID: p-1');
    product.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('product page')).toBeInTheDocument();
  });

  it('data contract details: the quality panel\'s refresh button is named', async () => {
    mockBackend(FULL);
    renderPage();
    await loaded();
    const quality = (await screen.findAllByRole('region', { name: 'Data Quality' }))[0];
    expect(await within(quality).findByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it('data contract details sections: the concept links open the catalog in a new tab', async () => {
    mockBackend(FULL);
    renderPage();
    await loaded();
    const schemas = pane(/^Schemas/);
    // The schema's concept, by its label; the column's, by its IRI's last part (the label is a URN)
    for (const [name, iri, concept] of [
      ['Order', 'https://example.com/onto#Order', 'Order'],
      ['OrderId', 'https://example.com/onto#OrderId', 'OrderId'],
    ]) {
      const link = await within(schemas).findByRole('link', { name });
      expect(link).toHaveAttribute('href', `/data-catalog?concept=${encodeURIComponent(concept)}`);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('title', iri);
    }
  });

  it('data contract details sections: a linked product opens once, from its name or its row', async () => {
    const user = userEvent.setup();
    mockBackend(FULL);
    renderPage();
    await loaded();
    const products = pane(/^Linked Data Products/);
    const name = await within(products).findByRole('link', { name: 'Orders mart' });
    expect(name).toHaveAttribute('href', '/data-products/p-9');
    const before = window.history.length;
    await user.click(name);
    expect(await screen.findByText('product page')).toBeInTheDocument();
    // One history entry: the link's own, not the row's as well
    expect(window.history.length).toBe(before + 1);
    cleanup();

    mockBackend(FULL);
    renderPage();
    await loaded();
    const row = (await within(pane(/^Linked Data Products/)).findByText('active')).closest('[role="listitem"]') as HTMLElement;
    const start = window.history.length;
    await user.click(row);
    expect(await screen.findByText('product page')).toBeInTheDocument();
    expect(window.history.length).toBe(start + 1);
  });

  it('data contract details sections: the rows are lists, and custom properties keep their column headers', async () => {
    mockBackend(FULL);
    renderPage();
    await loaded();
    await screen.findByText('Ada Lovelace');
    for (const [name, count] of [[/^Quality Rules/, 1], ['ODCS Team Metadata', 1], [/^Linked Data Products/, 1]] as const) {
      const list = await within(pane(name)).findByRole('list');
      expect(within(list).getAllByRole('listitem')).toHaveLength(count);
    }
    const sla = pane('SLA & Infrastructure');
    expect(within(within(sla).getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
    const defs = pane('Authoritative Definitions');
    expect(within(await within(defs).findByRole('list')).getAllByRole('listitem')).toHaveLength(1);

    // Custom properties: a table again, with its Property, Value and Actions headers
    const custom = within(pane(/^Custom Properties/)).getByRole('table');
    expect(within(custom).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Property', 'Value', 'Actions']);
    const rows = within(custom).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['retention', 'owners']);
    expect(within(rows[0]).getByRole('button', { name: 'Edit retention' })).toBeEnabled();
  });

  // Task 11 housekeeping: the Actions header shows only with its cells
  it('data contract details sections: a reader\'s custom properties table has no Actions header', async () => {
    asConsumer();
    mockBackend({ ...FULL, status: 'active' });
    renderPage();
    await loaded();
    const custom = within(pane(/^Custom Properties/)).getByRole('table');
    expect(within(custom).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Property', 'Value']);
    // Every row has as many cells as there are headers
    for (const row of within(custom).getAllByRole('row').slice(1)) {
      expect(within(row).getAllByRole('cell')).toHaveLength(2);
    }
  });
});

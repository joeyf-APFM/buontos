/**
 * Wave 2 Task 7: Data Product details (/data-products/:id and
 * /my-products/:id) on the page kit. Pixel values that depend on the cascade
 * (the long-name truncation, the description's wrap, the page's horizontal
 * scroll and the lists that scroll inside their panes) are measured in a real
 * browser in tests/e2e/data-product-details.spec.ts (ruling R10); these tests
 * check the structure, every control for both personas, and the error and
 * empty states.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { useUserStore } from '@/stores/user-store';
import { FeatureAccessLevel } from '@/types/settings';
import DataProductDetails from './data-product-details';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const PRODUCT = {
  apiVersion: 'v1.0.0', kind: 'DataProduct', id: 'p-1', name: 'Sales orders', status: 'draft', version: '1.0.0',
  domain_ids: [], domains: [], tags: [], inputPorts: [], outputPorts: [], managementPorts: [], support: [],
  customProperties: [], authoritativeDefinitions: [], description: { purpose: 'Orders for reporting' },
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-11-02T15:30:00Z',
};

const FULL = {
  ...PRODUCT,
  status: 'active',
  outputPorts: [{ id: 'out-1', name: 'orders_gold', version: '1.0.0', type: 'table', description: 'Gold orders' }],
  inputPorts: [{ id: 'in-1', name: 'orders_raw', version: '1.0.0', contractId: 'c-1', contractName: 'Raw orders' }],
  managementPorts: [{ name: 'Ops', content: 'discoverability', url: 'https://example.com/ops' }],
  support: [{ channel: 'Slack', url: 'https://example.com/slack', tool: 'slack' }],
  team: { name: 'Sales', members: [{ username: 'rita@example.com', name: 'Rita', role: 'owner' }] },
};

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend(product: unknown = PRODUCT, status = 200) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/data-products/p-1' && method === 'GET') {
      return status === 200 ? json(product) : json({ detail: 'Backend down' }, status);
    }
    if (url.pathname === '/api/data-products/p-1' && method === 'DELETE') return json({ detail: 'Nope' }, 500);
    if (url.pathname === '/api/data-products/p-1/subscription') return json({ subscribed: false });
    if (url.pathname === '/api/data-products/p-1/subscribers') return json({ subscriber_count: 0, subscribers: [] });
    if (url.pathname === '/api/data-products/p-1/maturity') {
      return json({ achieved_level_order: null, achieved_level_name: null, total_levels: 0, gates_passed: 0, gates_total: 0, levels: [] });
    }
    if (url.pathname === '/api/data-products/p-1/quality-summary') return json(null);
    if (url.pathname.endsWith('/ratings')) {
      return json({ average_rating: 0, total_ratings: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, user_current_rating: null });
    }
    if (url.pathname.startsWith('/api/access-grants/')) return json({ grants: [], requests: [], total: 0 });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function grant(level: FeatureAccessLevel, approver = false, others: Record<string, FeatureAccessLevel> = {}) {
  usePermissionsStore.setState({
    permissions: {
      'data-products': level, 'semantic-models': level, 'data-domains': level, 'business-owners': level,
      'access-grants': level, entity_relationships: level, ...others,
    },
    availableRoles: approver
      ? [{ id: 'r-1', name: 'Approver', assigned_groups: ['admins'], feature_permissions: {}, approval_privileges: { PRODUCTS: true } } as never]
      : [],
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = (route = '/data-products/p-1') =>
  renderWithMantine(
    <Routes>
      <Route path="/data-products" element={<p>product list</p>} />
      <Route path="/data-products/:productId" element={<DataProductDetails />} />
      <Route path="/my-products" element={<p>my products</p>} />
      <Route path="/my-products/:productId" element={<DataProductDetails />} />
    </Routes>,
    { route },
  );

const loaded = (name = 'Sales orders') => screen.findByRole('heading', { level: 1, name });
const header = () => screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement;
// The accessible name: a label, else the text, else the title (icon buttons)
const names = (els: HTMLElement[]) =>
  els.map((el) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || el.getAttribute('title') || ''));
// The header's actions, in the kit's end slot (its badges hold the maturity buttons)
const actions = () => header().querySelector(`.${kit.headerEnd}`) as HTMLElement;
const headerButtons = () => names(within(actions()).getAllByRole('button')).sort();
/** The header shows a primary and a secondary action; the rest are in the More menu, opened here. */
async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(actions()).getByRole('button', { name: 'More actions' }));
  // jsdom leaves a Mantine menu display: none until its transition ends: hence hidden
  return screen.findByRole('menu', { hidden: true });
}
const menuItems = (menu: HTMLElement) => within(menu).getAllByRole('menuitem', { hidden: true });
const menuItem = (menu: HTMLElement, name: string) => within(menu).getByRole('menuitem', { name, hidden: true });
const isDisabled = (el: HTMLElement) => el.hasAttribute('data-disabled') || (el as HTMLButtonElement).disabled;

describe('data product details on the page kit', () => {
  let confirmSpy: MockInstance<(message?: string) => boolean>;
  beforeEach(() => {
    localStorage.removeItem('data-product-view-mode');
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    useUserStore.setState({ userInfo: { email: 'e2e.user@example.com', username: 'e2e', user: 'E2E', ip: '', groups: ['admins'] } as never });
    toast.mockClear();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    confirmSpy.mockRestore();
  });

  it('data product details renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    // Full bleed from both routes, as the asset detail page
    expect(isFullBleed('/data-products/p-1')).toBe(true);
    expect(isFullBleed('/my-products/p-1')).toBe(true);
    // A stacked page (natural height), not a one-pane fill
    expect(container.querySelector(`.${kit.page}`)).not.toHaveAttribute('data-full-bleed');
    // The shell owns the breadcrumb
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();

    // The kit header: the name (with its title), the status badge and the actions
    const h1 = screen.getByRole('heading', { level: 1, name: 'Sales orders' });
    expect(h1).toHaveClass(kit.title);
    expect(h1).toHaveAttribute('title', 'Sales orders');
    expect(header()).toHaveClass(kit.header);
    expect(within(header()).getByText('draft', { exact: true })).toBeInTheDocument();
    expect(within(header()).getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    expect(screen.getByText('Orders for reporting', { selector: 'p' })).toBeInTheDocument();

    // The sections are kit panes in a stack, with the details in a DetailsGrid
    const details = screen.getByRole('region', { name: 'Details' });
    expect(details).toHaveClass(kit.pane);
    expect(details.parentElement).toHaveClass(kit.stack);
    expect(within(details).getByText('Version').tagName).toBe('DT');
    expect(screen.getByRole('region', { name: 'Contacts' })).toHaveClass(kit.pane);
    expect(screen.getByRole('region', { name: /Deliverables/ })).toHaveClass(kit.pane);

    // No shadcn Card or old grid; the full Tailwind scan of the page's own markup is
    // data-product-details.markup.test.tsx
    expect(container.querySelector('.bg-card, .rounded-lg.border, .border.rounded-lg, .border.rounded, .grid')).toBeNull();
    expect(container.querySelector('.min-w-\\[4rem\\], .inline-flex.items-stretch, .mr-2.h-4.w-4, .text-\\[10px\\]')).toBeNull();
  });

  it('data product details keeps every control', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    // A draft an admin can edit: Edit is the primary action, and the rest are under More
    expect(headerButtons()).toEqual(['Back to List', 'Comments', 'Edit', 'More actions'].sort());
    for (const name of ['Back to List', 'Comments', 'Edit', 'More actions']) {
      expect(within(header()).getByRole('button', { name })).toBeEnabled();
    }
    const menu = await openMore(user);
    expect(menuItems(menu).map((el) => el.textContent?.trim())).toEqual([
      'Request...', 'Create Genie Space', 'New Version', 'Export ODPS', 'Delete',
    ]);
    for (const item of menuItems(menu)) expect(isDisabled(item)).toBe(false);
    await user.keyboard('{Escape}');
    // The detail level is named, and marks the current one
    const level = screen.getByRole('group', { name: 'Detail' });
    for (const name of ['Summary', 'Standard', 'Everything']) expect(within(level).getByRole('button', { name })).toBeInTheDocument();
    // An admin starts on Standard (computeDefaultViewMode)
    expect(['Summary', 'Standard', 'Everything'].map((name) => within(level).getByRole('button', { name }).getAttribute('aria-pressed')))
      .toEqual(['false', 'true', 'false']);
    // The maturity badge and its re-evaluate button
    expect(await screen.findByRole('button', { name: 'Not assessed Maturity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-evaluate maturity' })).toBeInTheDocument();
    // The sections' own actions; the description's icon-only edit has a name
    expect(screen.getByRole('button', { name: 'Add Deliverable' })).toBeEnabled();
    expect(within(screen.getByRole('region', { name: 'Description' })).getByRole('button', { name: 'Edit description' })).toBeEnabled();
    // Linked concepts' Add, in the details
    expect(within(screen.getByRole('region', { name: 'Details' })).getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('data product details keeps the active-product actions for an approver', async () => {
    const user = userEvent.setup();
    mockBackend({ ...PRODUCT, status: 'active' });
    grant(FeatureAccessLevel.ADMIN, true);
    renderPage();
    await loaded();
    // Active is locked for editing in place, but an admin may still edit: Edit and Publish lead
    await waitFor(() => expect(within(header()).getByRole('button', { name: 'Edit' })).toBeEnabled());
    expect(within(header()).getByRole('button', { name: 'Publish' })).toBeEnabled();
    // Subscribe and Certify are under More
    const menu = await openMore(user);
    await waitFor(() => expect(isDisabled(menuItem(menu, 'Subscribe'))).toBe(false));
    expect(isDisabled(menuItem(menu, 'Certify'))).toBe(false);
  });

  it('data product details: the consumer sees no edit, delete or certify control it can use', async () => {
    mockBackend({ ...PRODUCT, status: 'active' });
    const user = userEvent.setup();
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    await loaded();
    // A consumer: Subscribe is the primary action, with Request as the other
    await waitFor(() => expect(within(header()).getByRole('button', { name: 'Subscribe' })).toBeEnabled());

    expect(headerButtons()).toEqual(['Back to List', 'Comments', 'More actions', 'Request...', 'Subscribe'].sort());
    expect(within(header()).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(header()).queryByRole('button', { name: 'Certify' })).toBeNull();
    expect(within(header()).queryByRole('button', { name: 'Publish' })).toBeNull();
    // Delete and Genie stay in the More menu, disabled, as before
    const menu = await openMore(user);
    expect(menuItems(menu).map((el) => el.textContent?.trim())).toEqual(['Create Genie Space', 'Export ODPS', 'Delete']);
    expect(isDisabled(menuItem(menu, 'Delete'))).toBe(true);
    expect(isDisabled(menuItem(menu, 'Create Genie Space'))).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Add Deliverable' })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Details' })).queryByRole('button', { name: 'Add' })).toBeNull();
  });

  it('data product details: a long name keeps its title and the description wraps under the header', async () => {
    const name = 'N'.repeat(200);
    const purpose = 'word '.repeat(40).trim();
    mockBackend({ ...PRODUCT, name, description: { purpose } });
    renderPage();
    const h1 = await loaded(name);
    expect(h1).toHaveAttribute('title', name);
    const description = screen.getByText(purpose, { selector: 'p' });
    // Under the header, not in it
    expect(header().contains(description)).toBe(false);
  });

  it('data product details: the project and owner team are text with their ids, not links to missing routes', async () => {
    const user = userEvent.setup();
    mockBackend({ ...PRODUCT, project_id: 'pr-1', project_name: 'Revenue', owner_team_id: 't-1', owner_team_name: 'Sales Analytics' });
    renderPage();
    await loaded();
    const details = screen.getByRole('region', { name: 'Details' });
    const project = within(details).getByText('Revenue');
    const team = within(details).getByText('Sales Analytics');
    expect(project).toHaveAttribute('title', 'Project ID: pr-1');
    expect(team).toHaveAttribute('title', 'Team ID: t-1');
    for (const el of [project, team]) {
      expect(el.closest('a, button, [role="link"], [role="button"]')).toBeNull();
      await user.click(el);
    }
    // Still on the product (no /projects/:id or /teams/:id route exists)
    expect(screen.getByRole('heading', { level: 1, name: 'Sales orders' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/data-products/p-1');
  });

  it('data product details: a failed delete shows no success toast', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const menu = await openMore(user);
    await user.click(menuItem(menu, 'Delete'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' }));
    expect(screen.queryByText('product list')).toBeNull();
  });

  it('data product details: a product that fails to load shows its error and a way back', async () => {
    const user = userEvent.setup();
    mockBackend(PRODUCT, 500);
    renderPage('/my-products/p-1');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Backend down');
    await user.click(screen.getByRole('button', { name: 'Back to List' }));
    expect(await screen.findByText('my products')).toBeInTheDocument();
  });

  it('data product details: empty sections show their message and Add action for an admin', async () => {
    localStorage.setItem('data-product-view-mode', 'large');
    renderPage();
    await loaded();

    const deliverables = screen.getByRole('region', { name: /Deliverables/ });
    expect(within(deliverables).getByText(/No deliverables defined/)).toBeInTheDocument();
    expect(within(deliverables).getByRole('button', { name: 'Add Deliverable' })).toBeEnabled();

    const consumables = screen.getByRole('region', { name: /Consumables/ });
    expect(within(consumables).getByText(/No consumables/i)).toBeInTheDocument();
    expect(within(consumables).getByRole('button', { name: 'Add Consumable' })).toBeEnabled();

    const support = screen.getByRole('region', { name: /Support Channels/ });
    expect(within(support).getByText(/No support channels/i)).toBeInTheDocument();
    expect(within(support).getByRole('button', { name: 'Add Channel' })).toBeEnabled();

    // The ODPS team is read-only provenance, shown only when it has members
    expect(screen.queryByRole('region', { name: /Team Metadata/ })).toBeNull();
  });

  it('data product details: the quality panel\'s Add measurement follows the data-products write permission', async () => {
    localStorage.setItem('data-product-view-mode', 'large');
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    await loaded();
    const quality = () => screen.getAllByRole('region', { name: 'Data Quality' })[0];
    await waitFor(() => expect(within(quality()).getByRole('button', { name: 'Refresh' })).toBeInTheDocument());
    expect(within(quality()).queryByRole('button', { name: 'Add measurement' })).toBeNull();
    cleanup();

    grant(FeatureAccessLevel.READ_WRITE);
    renderPage();
    await loaded();
    expect(await within(quality()).findByRole('button', { name: 'Add measurement' })).toBeEnabled();
  });

  it('data product details: a products writer read-only on data-domains gets no notes, cost or quality edits', async () => {
    localStorage.setItem('data-product-view-mode', 'large');
    grant(FeatureAccessLevel.READ_WRITE, false, { 'data-domains': FeatureAccessLevel.READ_ONLY });
    renderPage();
    await loaded();
    const quality = () => screen.getAllByRole('region', { name: 'Data Quality' })[0];
    await waitFor(() => expect(within(quality()).getByRole('button', { name: 'Refresh' })).toBeInTheDocument());
    expect(within(quality()).queryByRole('button', { name: 'Add measurement' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add expense' })).toBeNull();
    const metadata = screen.getAllByRole('region', { name: 'Metadata' })[0];
    const writeIcons = within(metadata).queryAllByRole('button').filter((b) =>
      [...b.querySelectorAll('svg')].some((svg) => [...svg.classList].some((c) => /^lucide-(plus|share-?2|pencil|trash-?2)$/.test(c))));
    expect(writeIcons).toHaveLength(0);
    // The product itself stays editable (a draft)
    expect(within(header()).getByRole('button', { name: 'Edit' })).toBeEnabled();
    cleanup();

    // With data-domains write the panels' edits come back
    grant(FeatureAccessLevel.READ_WRITE);
    renderPage();
    await loaded();
    expect(await screen.findByRole('button', { name: 'Add expense' })).toBeEnabled();
  });

  it('data product details: the concept links need semantic-models write', async () => {
    grant(FeatureAccessLevel.READ_WRITE, false, { 'semantic-models': FeatureAccessLevel.READ_ONLY });
    renderPage();
    await loaded();
    expect(within(screen.getByRole('region', { name: 'Details' })).queryByRole('button', { name: 'Add' })).toBeNull();
    cleanup();

    grant(FeatureAccessLevel.READ_WRITE);
    renderPage();
    await loaded();
    expect(within(screen.getByRole('region', { name: 'Details' })).getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  // Ruling R66: the owner routes check business-owners write
  it('data product details: Assign Owner needs business-owners write as well', async () => {
    const owners = () => screen.getAllByRole('region', { name: 'Owners' })[0];
    localStorage.setItem('data-product-view-mode', 'large');
    // A products writer read-only on business-owners
    grant(FeatureAccessLevel.READ_WRITE, false, { 'business-owners': FeatureAccessLevel.READ_ONLY });
    renderPage();
    await loaded();
    await within(owners()).findByText('No owners assigned');
    expect(within(owners()).queryByRole('button', { name: 'Assign Owner' })).toBeNull();
    cleanup();

    // A reader: none
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    await loaded();
    await within(owners()).findByText('No owners assigned');
    expect(within(owners()).queryByRole('button', { name: 'Assign Owner' })).toBeNull();
    cleanup();

    // An admin (business-owners write too): Assign Owner
    grant(FeatureAccessLevel.ADMIN);
    renderPage();
    await loaded();
    expect(await within(owners()).findByRole('button', { name: 'Assign Owner' })).toBeEnabled();
  });

  it('data product details: the shared panels sit flush in untitled panes', async () => {
    localStorage.setItem('data-product-view-mode', 'large');
    mockBackend(FULL);
    renderPage();
    await loaded();

    // Each panel names its own section too, so the kit pane is the outer one
    for (const label of ['Owners', 'Metadata', 'Ratings & Reviews', 'Data Quality']) {
      await waitFor(() => expect(screen.getAllByRole('region', { name: label }).length).toBeGreaterThan(0));
      const panes = screen.getAllByRole('region', { name: label }).filter((r) => r.classList.contains(kit.pane));
      expect(panes).toHaveLength(1);
      expect(panes[0].querySelector('h2')).toBeNull();
      expect(panes[0].querySelector('[data-flush]')).not.toBeNull();
    }
    // Lists: the ports, team and support, each in its own pane
    expect(within(screen.getByRole('region', { name: /Deliverables/ })).getByText('orders_gold')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /Consumables/ })).getByText(/orders_raw/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /Team Metadata/ })).getByText('Rita')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /Support Channels/ })).getByText('Slack')).toBeInTheDocument();
    // The icon-only row actions have names
    const support = screen.getByRole('region', { name: /Support Channels/ });
    expect(within(support).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(support).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    // Access grants is a kit pane of its own
    expect(await screen.findByRole('region', { name: /Access Grants/ })).toHaveClass(kit.pane);
  });

  // The final review's Important 1: the grants and relationships routes check their own features
  describe('the grants, relationships and lineage controls follow their own features', () => {
    const STAMP = '2026-11-01T00:00:00Z';
    const GRANT = {
      id: 'g-1', grantee_email: 'gina@example.com', entity_type: 'data_product', entity_id: 'p-1', permission_level: 'READ',
      granted_at: STAMP, expires_at: '2026-12-01T00:00:00Z', days_until_expiry: 20, granted_by: 'ann@example.com', status: 'active', is_active: true,
    };
    const REQUEST = {
      id: 'rq-1', requester_email: 'rob@example.com', entity_type: 'data_product', entity_id: 'p-1', requested_duration_days: 30,
      permission_level: 'READ', status: 'pending', created_at: STAMP,
    };
    const RELATION = {
      id: 'rel-1', source_type: 'DataProduct', source_id: 'p-1', target_type: 'DataContract', target_id: 'c-9',
      target_name: 'Linked contract', relationship_type: 'hasContract', created_at: STAMP,
    };

    function mockPanels() {
      const base = fetchMock;
      fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const { pathname } = new URL(String(input), 'http://localhost');
        if (pathname === '/api/access-grants/entity/data_product/p-1') return json({ grants: [GRANT], total: 1 });
        if (pathname === '/api/access-grants/entity/data_product/p-1/requests') return json({ requests: [REQUEST], total: 1 });
        if (pathname === '/api/entities/DataProduct/p-1/relationships') {
          return json({ entity_type: 'DataProduct', entity_id: 'p-1', outgoing: [RELATION], incoming: [], total: 1 });
        }
        return base(input, init);
      });
      vi.stubGlobal('fetch', fetchMock);
    }

    const grantsPane = () => screen.getAllByRole('region', { name: /Access Grants/ })[0];
    const relatedPane = () => screen.getAllByRole('region', { name: /Related Entities/ })[0];
    const lineagePane = () => screen.getByRole('region', { name: 'Business Lineage' });
    const trashButtons = (scope: HTMLElement) => within(scope).queryAllByRole('button').filter((b) =>
      [...b.querySelectorAll('svg')].some((svg) => [...svg.classList].some((c) => /^lucide-trash-?2$/.test(c))));

    async function openAs(others: Record<string, FeatureAccessLevel> = {}) {
      localStorage.setItem('data-product-view-mode', 'large');
      grant(FeatureAccessLevel.READ_WRITE, false, others);
      mockBackend();
      mockPanels();
      renderPage();
      await loaded();
      // Both panels have loaded their rows
      await within(await screen.findByRole('region', { name: /Access Grants/ })).findByText('gina@example.com');
      await within(relatedPane()).findByText('Linked contract');
    }

    const grantControls = () => ({
      revoke: within(grantsPane()).queryAllByRole('button', { name: 'Revoke' }).length,
      review: within(grantsPane()).queryAllByRole('button', { name: 'Review' }).length,
    });
    const relationControls = () => ({
      add: within(relatedPane()).queryAllByRole('button', { name: 'Add' }).length,
      remove: trashButtons(relatedPane()).length,
      lineage: within(lineagePane()).queryAllByRole('button', { name: /Manage Lineage/ }).length,
    });

    it('a products writer with access-grants write has Revoke and the pending requests\' Review', async () => {
      await openAs();
      await waitFor(() => expect(grantControls()).toEqual({ revoke: 1, review: 1 }));
    });

    it('a products writer read-only on access-grants gets no Revoke or Review', async () => {
      await openAs({ 'access-grants': FeatureAccessLevel.READ_ONLY });
      expect(grantControls()).toEqual({ revoke: 0, review: 0 });
      expect(within(grantsPane()).queryByText('rob@example.com')).toBeNull();
      // The relationships follow their own feature, which this writer has
      expect(relationControls()).toEqual({ add: 1, remove: 1, lineage: 1 });
    });

    it('a products writer with entity_relationships write has Add, Remove and Manage Lineage', async () => {
      await openAs();
      expect(relationControls()).toEqual({ add: 1, remove: 1, lineage: 1 });
    });

    it('a products writer read-only on entity_relationships gets no Add, Remove or Manage Lineage', async () => {
      await openAs({ entity_relationships: FeatureAccessLevel.READ_ONLY });
      expect(relationControls()).toEqual({ add: 0, remove: 0, lineage: 0 });
      // The product itself stays editable (a draft), and the grants follow their own feature
      expect(within(header()).getByRole('button', { name: 'Edit' })).toBeEnabled();
      await waitFor(() => expect(grantControls()).toEqual({ revoke: 1, review: 1 }));
    });
  });
});

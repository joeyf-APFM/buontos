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
import classes from './data-product-details.module.css';

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

function grant(level: FeatureAccessLevel, approver = false) {
  usePermissionsStore.setState({
    permissions: { 'data-products': level, 'semantic-models': level },
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
// The header's actions (its badges hold the maturity buttons)
const actions = () => header().querySelector(`.${classes.actions}`) as HTMLElement;
const headerButtons = () => names(within(actions()).getAllByRole('button')).sort();

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
    expect(within(header()).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByText('Orders for reporting', { selector: 'p' })).toBeInTheDocument();

    // The sections are kit panes in a stack, with the details in a DetailsGrid
    const details = screen.getByRole('region', { name: 'Details' });
    expect(details).toHaveClass(kit.pane);
    expect(details.parentElement).toHaveClass(kit.stack);
    expect(within(details).getByText('Version').tagName).toBe('DT');
    expect(screen.getByRole('region', { name: 'Contacts' })).toHaveClass(kit.pane);
    expect(screen.getByRole('region', { name: /Deliverables/ })).toHaveClass(kit.pane);

    // No layout padding, shadcn Card or Alert, or Tailwind class in the page's own markup: the
    // header and the page's own panes (consumed panels, such as the relationships tree, keep theirs)
    const own = [header(), details, screen.getByRole('region', { name: 'Contacts' }), screen.getByRole('region', { name: /Deliverables/ })];
    for (const el of own) {
      expect(el.querySelector('.py-6, .space-y-6, .space-y-3, .space-y-4, .space-y-2, .text-2xl, .p-6')).toBeNull();
    }
    expect(container.querySelector('.bg-card, .rounded-lg.border, .border.rounded-lg, .border.rounded, .grid')).toBeNull();
    expect(container.querySelector('.min-w-\\[4rem\\], .inline-flex.items-stretch, .mr-2.h-4.w-4, .text-\\[10px\\]')).toBeNull();
  });

  it('data product details keeps every control', async () => {
    renderPage();
    await loaded();

    expect(headerButtons()).toEqual([
      'Back to List', 'Comments', 'Create Genie Space', 'Delete', 'Edit', 'Export ODPS', 'New Version', 'Request...',
    ].sort());
    for (const name of ['Back to List', 'Comments', 'Create Genie Space', 'Delete', 'Edit', 'Export ODPS', 'New Version', 'Request...']) {
      expect(within(header()).getByRole('button', { name })).toBeEnabled();
    }
    // The view sizes, still named S, M and L, mark the current one
    for (const name of ['S', 'M', 'L']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    // An admin starts on M (computeDefaultViewMode)
    expect(['S', 'M', 'L'].map((name) => screen.getByRole('button', { name }).getAttribute('aria-pressed')))
      .toEqual(['false', 'true', 'false']);
    // The maturity badge and its re-evaluate button
    expect(await screen.findByRole('button', { name: 'Not assessed Maturity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-evaluate maturity' })).toBeInTheDocument();
    // The sections' own actions
    expect(screen.getByRole('button', { name: 'Add Deliverable' })).toBeEnabled();
    // Linked concepts' Add, in the details
    expect(within(screen.getByRole('region', { name: 'Details' })).getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('data product details keeps the active-product actions for an approver', async () => {
    mockBackend({ ...PRODUCT, status: 'active' });
    grant(FeatureAccessLevel.ADMIN, true);
    renderPage();
    await loaded();
    await waitFor(() => expect(within(header()).getByRole('button', { name: 'Subscribe' })).toBeEnabled());
    expect(within(header()).getByRole('button', { name: 'Certify' })).toBeEnabled();
    expect(within(header()).getByRole('button', { name: 'Publish' })).toBeEnabled();
    // Active is locked for editing in place, but an admin may still edit; New Version gives way to Clone
    expect(within(header()).getByRole('button', { name: 'Edit' })).toBeEnabled();
  });

  it('data product details: the consumer sees no edit, delete or certify control it can use', async () => {
    mockBackend({ ...PRODUCT, status: 'active' });
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    await loaded();
    await waitFor(() => expect(within(header()).getByRole('button', { name: 'Subscribe' })).toBeEnabled());

    expect(headerButtons()).toEqual([
      'Back to List', 'Comments', 'Create Genie Space', 'Delete', 'Export ODPS', 'Request...', 'Subscribe',
    ].sort());
    expect(within(header()).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(header()).queryByRole('button', { name: 'Certify' })).toBeNull();
    expect(within(header()).queryByRole('button', { name: 'Publish' })).toBeNull();
    // Delete and Genie stay in place, disabled, as before
    expect(within(header()).getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(within(header()).getByRole('button', { name: 'Create Genie Space' })).toBeDisabled();
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

  it('data product details: a failed delete shows no success toast', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(header()).getByRole('button', { name: 'Delete' }));
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
});

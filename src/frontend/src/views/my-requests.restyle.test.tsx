/**
 * Wave 2 Task 5: My Requests (/my-requests) on the page kit. The long-name
 * wrap and the page's horizontal scroll are measured in a real browser in
 * tests/e2e/requests-owners.spec.ts (ruling R10); these tests check the
 * structure, every control, the tabs' keyboard path, and the empty and error
 * states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useParams } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import grid from '@/mantine/asset-explorer/explorer.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import MyRequests from './my-requests';
import classes from './my-requests.module.css';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const request = (id: string, name: string, status: string, entityType = 'data_product') => ({
  id, requester_email: 'rita@example.com', entity_type: entityType, entity_id: `${id}-entity`, entity_name: name,
  requested_duration_days: 30, permission_level: 'READ', reason: null, status,
  created_at: `2026-11-0${id.slice(1)}T09:00:00Z`, handled_at: status === 'pending' ? null : '2026-11-05T09:00:00Z',
  handled_by: null, admin_message: null,
});
const REQUESTS = [
  request('r1', 'Sales orders', 'pending'),
  request('r2', 'Orders contract', 'approved', 'data_contract'),
  request('r3', 'Store visits', 'pending'),
  request('r4', 'A notebook', 'denied', 'notebook'),
];

let fetchMock: ReturnType<typeof vi.fn>;

const subscription = (id: string, name: string, status: string) => ({
  apiVersion: 'v1.0.0', kind: 'DataProduct', id, name, status, version: '1.2.0', domain: 'Sales',
});
const SUBSCRIPTIONS = [subscription('s1', 'Sales orders feed', 'active'), subscription('s2', 'Churn scores', 'draft')];

interface Backend {
  /** The subscriptions answer: a list, or an HTTP status for a failure. */
  subscriptions?: unknown[] | number;
  /** The cancel's HTTP status. */
  deleteStatus?: number;
}

function mockBackend(requests: unknown[] = REQUESTS, status = 200, { subscriptions = [], deleteStatus = 204 }: Backend = {}) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/access-grants/my-requests') {
      return status === 200 ? json({ requests, total: requests.length }) : json({ detail: 'down' }, status);
    }
    if (url.pathname.startsWith('/api/access-grants/requests/') && method === 'DELETE') {
      return deleteStatus < 300 ? new Response(null, { status: deleteStatus }) : json({ detail: 'Request is locked' }, deleteStatus);
    }
    if (url.pathname === '/api/data-products/my-subscriptions') {
      return typeof subscriptions === 'number' ? json({ detail: 'Subscriptions are down' }, subscriptions) : json(subscriptions);
    }
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string, pathname: string) =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === pathname && (init?.method ?? 'GET') === method);

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'my-requests': level, 'access-grants': level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

function IdPage({ label }: { label: string }) {
  const { id } = useParams();
  return <p>{label} {id}</p>;
}

const renderPage = () =>
  renderWithMantine(
    <Routes>
      <Route path="/my-requests" element={<MyRequests />} />
      <Route path="/data-products/:id" element={<IdPage label="product page" />} />
      <Route path="/data-contracts/:id" element={<IdPage label="contract page" />} />
      <Route path="/my-products/:id" element={<IdPage label="my product" />} />
    </Routes>,
    { route: '/my-requests' },
  );

const loaded = () => screen.findByRole('link', { name: 'Sales orders' });
const requestsTab = () => screen.getByRole('tab', { name: /Access Requests/ });
const subscriptionsTab = () => screen.getByRole('tab', { name: /My Subscriptions/ });
const requestsPane = () => screen.getByRole('region', { name: 'Access Requests' });
const rowOf = (text: string) => screen.getByText(text, { exact: true }).closest('tr') as HTMLElement;

describe('my requests on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    toast.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('my requests renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/my-requests')).toBe(true);
    expect(container.querySelector(`.${kit.page}`)).not.toHaveAttribute('data-full-bleed');
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    const heading = screen.getByRole('heading', { level: 1, name: 'My Requests' });
    expect(heading.parentElement).toHaveClass(kit.header);
    expect(screen.getByText(/Requests you have created that require approval/)).toHaveClass(classes.subtitle);

    // The three counts, in one strip
    const stats = screen.getByRole('group', { name: 'Summary' });
    expect(within(stats).getByText('Pending Requests').nextSibling).toHaveTextContent('2');
    expect(within(stats).getByText('Total Requests').nextSibling).toHaveTextContent('4');
    expect(within(stats).getByText('Active Subscriptions').nextSibling).toHaveTextContent('0');
    // A label that a translation makes too long is cut off, with its title
    expect(within(stats).getByText('Pending Requests')).toHaveAttribute('title', 'Pending Requests');

    // The kit tabs, over a flush pane holding the explorer grid
    expect(screen.getByRole('tablist')).toHaveClass(kit.tabList);
    expect(requestsTab()).toHaveClass(kit.tab);
    expect(requestsPane()).toHaveClass(kit.pane);
    expect(within(requestsPane()).getByRole('table')).toHaveClass(grid.table);

    // No layout padding, shadcn Card or Table, or Tailwind class in the page's own markup
    expect(container.querySelector('.p-4, .gap-4, .text-2xl, .grid, .pt-6, .mt-4, .ml-2, .rounded-md, .rounded-lg, .border')).toBeNull();
    expect(container.querySelector('.text-muted-foreground, .text-destructive, .font-medium, .bg-card, .rounded-xl')).toBeNull();
    expect(container.querySelector('[data-slot], .animate-pulse')).toBeNull();
  });

  it.each([
    ['an admin', FeatureAccessLevel.ADMIN],
    ['a consumer', FeatureAccessLevel.READ_ONLY],
  ])('my requests keeps every control for %s', async (_who, level) => {
    grant(level);
    const user = userEvent.setup();
    renderPage();
    await loaded();

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Access Requests2', 'My Subscriptions']);
    expect(requestsTab()).toHaveAttribute('aria-selected', 'true');

    // The newest first; the detail links where the type has a page: a request
    // is for a product or contract the user may not hold yet (R31)
    const pane = requestsPane();
    expect(within(pane).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Store visits', '/data-products/r3-entity'],
      ['Orders contract', '/data-contracts/r2-entity'],
      ['Sales orders', '/data-products/r1-entity'],
    ]);
    expect(within(rowOf('A notebook')).queryByRole('link')).toBeNull();
    expect(within(pane).getAllByRole('columnheader').map((h) => h.textContent))
      .toEqual(['Asset Type', 'Name', 'Permission', 'Status', 'Requested', 'Resolved', '']);
    expect(within(rowOf('Orders contract')).getByText('Data Contract')).toBeInTheDocument();
    expect(within(rowOf('Orders contract')).getByText('approved')).toBeInTheDocument();

    // Cancel, on the pending rows only
    expect(within(pane).getAllByRole('button', { name: 'Cancel' })).toHaveLength(2);
    expect(within(rowOf('Orders contract')).queryByRole('button')).toBeNull();
    await user.click(within(rowOf('Sales orders')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(calls('DELETE', '/api/access-grants/requests/r1')).toHaveLength(1));
    await waitFor(() => expect(calls('GET', '/api/access-grants/my-requests')).toHaveLength(2));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Request cancelled' }));

    // A name link opens its product
    await user.click(screen.getByRole('link', { name: 'Sales orders' }));
    expect(await screen.findByText('product page r1-entity')).toBeInTheDocument();
  });

  it('my requests: a failed cancel shows the error, not success', async () => {
    mockBackend(REQUESTS, 200, { deleteStatus: 409 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(rowOf('Sales orders')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Error', description: 'Request is locked', variant: 'destructive',
    }));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Request cancelled' }));
    // The button is usable again, and the list was not reloaded
    expect(within(rowOf('Sales orders')).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(calls('GET', '/api/access-grants/my-requests')).toHaveLength(1);
    vi.mocked(console.error).mockRestore();
  });

  it('my requests lists the subscriptions, which open their product', async () => {
    mockBackend(REQUESTS, 200, { subscriptions: SUBSCRIPTIONS });
    const user = userEvent.setup();
    renderPage();
    await loaded();

    expect(subscriptionsTab()).toHaveTextContent('My Subscriptions2');
    await waitFor(() =>
      expect(within(screen.getByRole('group', { name: 'Summary' })).getByText('Active Subscriptions').nextSibling).toHaveTextContent('2'));
    await user.click(subscriptionsTab());
    const pane = screen.getByRole('region', { name: 'My Subscriptions' });
    expect(within(pane).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Product', 'Domain', 'Status', 'Version']);
    expect(within(pane).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Sales orders feed', '/my-products/s1'],
      ['Churn scores', '/my-products/s2'],
    ]);
    expect(within(rowOf('Churn scores')).getByText('draft')).toBeInTheDocument();
    await user.click(within(pane).getByRole('link', { name: 'Churn scores' }));
    expect(await screen.findByText('my product s2')).toBeInTheDocument();
  });

  it('my requests: a failed subscriptions load shows its error, with Retry', async () => {
    mockBackend(REQUESTS, 200, { subscriptions: 500 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(subscriptionsTab());
    const alert = await within(screen.getByRole('region', { name: 'My Subscriptions' })).findByRole('alert');
    expect(alert).toHaveTextContent('Subscriptions are down');

    mockBackend(REQUESTS, 200, { subscriptions: SUBSCRIPTIONS });
    await user.click(within(screen.getByRole('region', { name: 'My Subscriptions' })).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'Churn scores' })).toBeInTheDocument();
    vi.mocked(console.error).mockRestore();
    vi.mocked(console.warn).mockRestore();
  });

  it('my requests: the tabs switch with the arrow keys, and each tab keeps its controls', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    // Arrow keys move between the tabs and open them
    requestsTab().focus();
    await user.keyboard('{ArrowRight}');
    expect(subscriptionsTab()).toHaveFocus();
    expect(subscriptionsTab()).toHaveAttribute('aria-selected', 'true');
    const subsPanel = screen.getByRole('tabpanel', { name: /My Subscriptions/ });
    expect(within(subsPanel).getByRole('region', { name: 'My Subscriptions' })).toHaveClass(kit.pane);
    expect(within(subsPanel).getByText("You haven't subscribed to any data products yet.")).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Access Requests' })).toBeNull();

    await user.keyboard('{ArrowLeft}');
    expect(requestsTab()).toHaveFocus();
    expect(requestsTab()).toHaveAttribute('aria-selected', 'true');
    expect(within(requestsPane()).getAllByRole('button', { name: 'Cancel' })).toHaveLength(2);
    expect(within(requestsPane()).getAllByRole('link')).toHaveLength(3);

    // The keys wrap round, as Radix's did
    await user.keyboard('{ArrowLeft}');
    expect(subscriptionsTab()).toHaveAttribute('aria-selected', 'true');
  });

  it('my requests empty and error states keep their actions', async () => {
    mockBackend([]);
    const { unmount } = renderPage();
    expect(await screen.findByText('You have not created any requests.')).toBeInTheDocument();
    expect(within(requestsPane()).queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(within(screen.getByRole('group', { name: 'Summary' })).getByText('Total Requests').nextSibling).toHaveTextContent('0');
    unmount();

    // A failed load: the error in the pane, with Retry, under the tabs
    mockBackend(REQUESTS, 500);
    const user = userEvent.setup();
    renderPage();
    const alert = await within(await screen.findByRole('region', { name: 'Access Requests' })).findByRole('alert');
    expect(alert).toHaveTextContent('HTTP 500');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(screen.getAllByRole('tab')).toHaveLength(2);

    mockBackend();
    await user.click(within(requestsPane()).getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(within(requestsPane()).queryByRole('alert')).toBeNull();
  });
});

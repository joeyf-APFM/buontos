/**
 * Wave 2 Task 5: Owner Consumers (/owner-consumers) on the page kit. The
 * long-name wrap and the page's horizontal scroll are measured in a real
 * browser in tests/e2e/requests-owners.spec.ts (ruling R10); these tests check
 * the structure, every control, the filter, late answers, and the empty and
 * error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import grid from '@/mantine/asset-explorer/explorer.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import OwnerConsumersView from './owner-consumers';
import classes from './owner-consumers.module.css';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const product = (id: string, name: string, status: string, domain?: string) => ({
  apiVersion: 'v1.0.0', kind: 'DataProduct', id, name, status, domain,
});
const PRODUCTS = [
  product('p-1', 'Sales orders', 'active', 'Sales'),
  product('p-2', 'Customer 360', 'draft'),
  product('p-3', 'Monthly revenue', 'approved'),
];
const SUBSCRIBERS: Record<string, unknown> = {
  'p-1': {
    subscribers: [
      { email: 'sam@example.com', subscribed_at: '2026-11-01T09:00:00Z', reason: 'Weekly reporting' },
      { email: 'rita@example.com', subscribed_at: '2026-11-02T09:00:00Z', reason: null },
    ],
  },
  'p-2': { subscribers: [{ email: 'lee@example.com', subscribed_at: '2026-11-03T09:00:00Z', reason: 'Churn model' }] },
  'p-3': { subscribers: [] },
};

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend(
  list: unknown = PRODUCTS,
  status = 200,
  subscribers: (id: string) => Promise<Response> | Response = (id) => json(SUBSCRIBERS[id] ?? { subscribers: [] }),
) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/data-products') return json(list, status);
    const match = url.pathname.match(/^\/api\/data-products\/([^/]+)\/subscribers$/);
    if (match) return subscribers(match[1]);
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'data-products': level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = () => renderWithMantine(<OwnerConsumersView />, { route: '/owner-consumers' });

const loaded = () => screen.findByText('sam@example.com', { exact: true });
const productsPane = () => screen.getByRole('region', { name: 'Products' });
const subscribersPane = () => screen.getByRole('region', { name: /^Subscribers|^Select a product/ });
const productButton = (name: string) => within(productsPane()).getByRole('button', { name: new RegExp(`^${name}`) });
const stat = (label: string) => within(screen.getByRole('group', { name: 'Summary' })).getByText(label).nextSibling;

describe('owner consumers on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('owner consumers renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/owner-consumers')).toBe(true);
    expect(container.querySelector(`.${kit.page}`)).not.toHaveAttribute('data-full-bleed');
    const heading = screen.getByRole('heading', { level: 1, name: 'Consumers' });
    expect(heading.parentElement).toHaveClass(kit.header);

    // The counts, then the products beside their subscribers, in kit panes
    await waitFor(() => expect(stat('Total Subscribers')).toHaveTextContent('3'));
    expect(stat('Total Products')).toHaveTextContent('3');
    expect(stat('Active Products')).toHaveTextContent('2');
    expect(productsPane()).toHaveClass(kit.pane);
    expect(subscribersPane()).toHaveClass(kit.pane);
    expect(within(subscribersPane()).getByRole('heading', { name: 'Subscribers — Sales orders' })).toHaveClass(kit.paneTitle);
    expect(within(subscribersPane()).getByRole('table')).toHaveClass(grid.table);
    expect(productButton('Sales orders')).toHaveClass(classes.product);
    expect(productButton('Sales orders')).toHaveAttribute('data-selected');

    // No layout spacing, shadcn Card, Table or Input, or Tailwind class in the page's own markup
    expect(container.querySelector('.space-y-6, .space-y-1, .grid, .gap-4, .pt-6, .pb-3, .p-2\\.5, .lg\\:col-span-2')).toBeNull();
    expect(container.querySelector('.text-muted-foreground, .text-2xl, .rounded-full, .truncate, .bg-card, .rounded-xl')).toBeNull();
    expect(container.querySelector('[data-slot], .animate-pulse')).toBeNull();
    expect(screen.getByPlaceholderText('Filter subscribers...')).toHaveClass('mantine-TextInput-input');
  });

  it.each([
    ['an admin', FeatureAccessLevel.ADMIN],
    ['a consumer', FeatureAccessLevel.READ_ONLY],
  ])('owner consumers keeps every control for %s', async (_who, level) => {
    grant(level);
    const user = userEvent.setup();
    renderPage();
    await loaded();

    // One button per product, named by its name, domain and subscriber count
    await waitFor(() => expect(productButton('Customer 360')).toHaveTextContent('1'));
    expect(within(productsPane()).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Sales ordersSales2', 'Customer 360No domain1', 'Monthly revenueNo domain0']);
    expect(screen.getAllByRole('textbox')).toEqual([screen.getByPlaceholderText('Filter subscribers...')]);
    expect(within(subscribersPane()).getAllByRole('columnheader').map((h) => h.textContent))
      .toEqual(['Subscriber', 'Subscribed', 'Reason']);
    expect(within(subscribersPane()).getByText('Weekly reporting')).toHaveAttribute('title', 'Weekly reporting');

    // The filter matches the email or the reason
    await user.type(screen.getByPlaceholderText('Filter subscribers...'), 'weekly');
    await waitFor(() => expect(screen.queryByText('rita@example.com', { exact: true })).toBeNull());
    expect(screen.getByText('sam@example.com', { exact: true })).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText('Filter subscribers...'));
    expect(await screen.findByText('rita@example.com', { exact: true })).toBeInTheDocument();

    // A product shows its own subscribers
    await user.click(productButton('Customer 360'));
    expect(await within(subscribersPane()).findByText('lee@example.com')).toBeInTheDocument();
    expect(productButton('Customer 360')).toHaveAttribute('data-selected');
    expect(productButton('Sales orders')).not.toHaveAttribute('data-selected');
    expect(within(subscribersPane()).getByRole('heading', { name: 'Subscribers — Customer 360' })).toBeInTheDocument();

    // One that has none says so, and keeps the filter
    await user.click(productButton('Monthly revenue'));
    expect(await within(subscribersPane()).findByText('No subscribers yet')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Filter subscribers...')).toBeEnabled();
  });

  it('owner consumers shows each product its own subscribers, whatever order they answer in', async () => {
    // Sales orders answers last, after Customer 360 is already picked
    let releaseFirst!: () => void;
    const first = new Promise<void>((r) => { releaseFirst = r; });
    mockBackend(PRODUCTS, 200, async (id) => {
      if (id === 'p-1') await first;
      return json(SUBSCRIBERS[id] ?? { subscribers: [] });
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(productButton('Customer 360')).toHaveTextContent('1'));
    await user.click(productButton('Customer 360'));
    expect(await within(subscribersPane()).findByText('lee@example.com')).toBeInTheDocument();

    releaseFirst();
    await waitFor(() => expect(productButton('Sales orders')).toHaveTextContent('2'));
    expect(within(subscribersPane()).getByText('lee@example.com')).toBeInTheDocument();
    expect(within(subscribersPane()).queryByText('sam@example.com')).toBeNull();
  });

  it('owner consumers empty and error states keep their actions', async () => {
    mockBackend([]);
    const { unmount } = renderPage();
    expect(await within(productsPane()).findByText('No products found')).toBeInTheDocument();
    expect(within(subscribersPane()).getByText('Select a product to view its subscribers')).toBeInTheDocument();
    expect(stat('Total Products')).toHaveTextContent('0');
    unmount();

    // A failed product load: its error and Retry in the Products pane, and no
    // false "No products found" (R31)
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    mockBackend({ detail: 'Backend exploded' }, 500);
    const { unmount: unmount2 } = renderPage();
    const productsAlert = await within(productsPane()).findByRole('alert');
    expect(productsAlert).toHaveClass('mantine-Alert-root');
    expect(productsAlert).toHaveTextContent('Backend exploded');
    expect(within(productsPane()).queryByText('No products found')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Consumers' })).toBeInTheDocument();
    mockBackend();
    await user.click(within(productsPane()).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('sam@example.com', { exact: true })).toBeInTheDocument();
    expect(within(productsPane()).queryByRole('alert')).toBeNull();
    expect(within(productsPane()).getAllByRole('button')).toHaveLength(3);
    unmount2();

    // A failed subscriber load: its error and Retry for that product, no false
    // "No subscribers yet"; the products and the filter stay
    mockBackend(PRODUCTS, 200, () => json({ detail: 'Subscribers are down' }, 500));
    renderPage();
    const subscribersAlert = await within(subscribersPane()).findByRole('alert');
    expect(subscribersAlert).toHaveTextContent('Subscribers are down');
    expect(within(subscribersPane()).queryByText('No subscribers yet')).toBeNull();
    expect(within(productsPane()).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByPlaceholderText('Filter subscribers...')).toBeEnabled();
    mockBackend();
    await user.click(within(subscribersPane()).getByRole('button', { name: 'Retry' }));
    expect(await within(subscribersPane()).findByText('sam@example.com')).toBeInTheDocument();
    // Only the chosen product is asked again
    const subscriberCalls = fetchMock.mock.calls.map(([input]) => String(input)).filter((u) => u.endsWith('/subscribers'));
    expect(subscriberCalls).toEqual(['/api/data-products/p-1/subscribers']);
    expect(within(subscribersPane()).queryByRole('alert')).toBeNull();
    vi.mocked(console.error).mockRestore();
  });
});

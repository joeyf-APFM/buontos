/**
 * Wave 2 Task 4: My Products (/my-products) on the page kit. The long-name
 * truncation and the page's horizontal scroll are measured in a real browser
 * in tests/e2e/data-products.spec.ts (ruling R10); these tests check the
 * structure, every control, the filters, and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import { useViewModeStore } from '@/stores/view-mode-store';
import MyProducts from './my-products';
import classes from './my-products.module.css';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const product = (id: string, name: string, domain: string, purpose: string) => ({
  apiVersion: 'v1.0.0', kind: 'DataProduct', id, name, status: 'active', version: '1.0.0', domain,
  description: { purpose }, team: { name: 'Sales', members: [{ username: 'rita@example.com' }] },
});
const PRODUCTS = [
  product('p-1', 'Sales orders', 'd-sales', 'Orders for reporting'),
  product('p-2', 'Store visits', 'd-retail', 'Footfall per store'),
  product('p-3', 'Payroll', 'd-hr', 'Monthly pay'),
];
const DOMAINS = [
  { id: 'd-sales', name: 'Sales', parent_id: null, description: 'Selling things', children_count: 1 },
  { id: 'd-retail', name: 'Retail', parent_id: 'd-sales', description: 'Shops', children_count: 0 },
  { id: 'd-hr', name: 'People', parent_id: null, description: null, children_count: 0 },
];

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend(list: unknown = PRODUCTS, status = 200) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/data-products/my-subscriptions') return json(list, status);
    if (url.pathname === '/api/data-domains') return json(DOMAINS);
    if (url.pathname.startsWith('/api/data-domains/')) {
      const domain = DOMAINS.find((d) => url.pathname.endsWith(`/${d.id}`));
      return json({ ...domain, children_info: [], parent_info: null });
    }
    if (url.pathname === '/api/cache-version') return json({ version: 1 });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const subscriptionLoads = () =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input), 'http://localhost').pathname === '/api/data-products/my-subscriptions');

const renderPage = () =>
  renderWithMantine(
    <Routes>
      <Route path="/" element={<p>marketplace</p>} />
      <Route path="/my-products" element={<MyProducts />} />
      <Route path="/my-products/:productId" element={<p>detail page</p>} />
    </Routes>,
    { route: '/my-products' },
  );

const loaded = () => screen.findByText('Sales orders', { exact: true });
const domainsPane = () => screen.getByRole('region', { name: 'Browse Data Domains' });
const productsPane = () => screen.getByRole('region', { name: 'Subscribed products' });
const names = (els: HTMLElement[]) =>
  els.map((el) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || el.getAttribute('title')));

describe('my products on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    useViewModeStore.setState({ domainBrowserStyle: 'pills', tilesPerRow: 4 });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('my products renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/my-products')).toBe(true);
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    const heading = screen.getByRole('heading', { level: 1, name: 'My Products' });
    expect(heading.parentElement).toHaveClass(kit.header);
    expect(screen.getByText('Data products you have subscribed to.')).toHaveClass(classes.subtitle);

    // The domain browser and the products, stacked in kit panes
    expect(domainsPane()).toHaveClass(kit.pane);
    expect(productsPane()).toHaveClass(kit.pane);
    expect(within(productsPane()).getByText('3 products available')).toBeInTheDocument();

    // No layout padding, shadcn Card, Input or Tailwind class in the page's own markup
    expect(container.querySelector('.p-4, .gap-4, .text-2xl, .grid, .rounded-full, .h-12, .text-muted-foreground')).toBeNull();
    expect(container.querySelector('.bg-card, .rounded-xl, .border-dashed')).toBeNull();
    expect(screen.getByRole('searchbox')).toHaveClass('mantine-TextInput-input');
  });

  it('my products keeps every control', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await within(domainsPane()).findByRole('button', { name: 'People' });

    expect(names(within(domainsPane()).getAllByRole('button'))).toEqual(['List', 'Graph', 'All Domains', 'People', 'Sales', 'Retail']);
    expect(names(within(productsPane()).getAllByRole('button'))).toEqual(Array(3).fill('Open in details view'));
    expect(screen.getByPlaceholderText('What can we help you find today?')).toHaveAttribute('type', 'search');
    // The tiles-per-row field, unnamed as before
    expect(screen.getByDisplayValue('4 per row')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();

    // A domain narrows the list to it and its children; exact match to it alone
    await user.click(within(domainsPane()).getByRole('button', { name: 'Sales' }));
    await waitFor(() => expect(screen.queryByText('Payroll', { exact: true })).toBeNull());
    expect(screen.getByText('Store visits', { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Exact match only' }));
    await waitFor(() => expect(screen.queryByText('Store visits', { exact: true })).toBeNull());
    expect(screen.getByText('Sales orders', { exact: true })).toBeInTheDocument();
    await user.click(within(domainsPane()).getByRole('button', { name: 'All Domains' }));
    expect(await screen.findByText('Payroll', { exact: true })).toBeInTheDocument();

    // The search, and its clear button
    await user.type(screen.getByRole('searchbox'), 'footfall');
    await waitFor(() => expect(screen.queryByText('Sales orders', { exact: true })).toBeNull());
    expect(screen.getByText('Store visits', { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByText('Sales orders', { exact: true })).toBeInTheDocument();

    // Tiles per row is kept in the view-mode store
    await user.click(screen.getByDisplayValue('4 per row'));
    await user.click(await screen.findByRole('option', { name: '2 per row', hidden: true }));
    expect(useViewModeStore.getState().tilesPerRow).toBe(2);

    // The graph style is kept too, and shows the domain graph's pane
    await user.click(within(domainsPane()).getByRole('button', { name: 'Graph' }));
    expect(useViewModeStore.getState().domainBrowserStyle).toBe('graph');
    await waitFor(() => expect(within(domainsPane()).queryByRole('button', { name: 'All Domains' })).toBeNull());

    // A card and its open button open the product
    await user.click(within(productsPane()).getAllByRole('button', { name: 'Open in details view' })[0]);
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('my products empty and error states keep their actions', async () => {
    // No subscriptions: Browse Marketplace goes to the marketplace
    mockBackend([]);
    const user = userEvent.setup();
    const { unmount } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Browse Marketplace' }));
    expect(await screen.findByText('marketplace')).toBeInTheDocument();
    unmount();

    // Filters that match nothing say so, and keep the filters
    mockBackend();
    const second = renderPage();
    await loaded();
    await user.type(screen.getByRole('searchbox'), 'nothing like this');
    expect(await screen.findByText('No data products found.')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your search or filter.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
    second.unmount();

    // A failed load: the error, and Retry loads again
    mockBackend({ detail: 'Backend exploded' }, 500);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Backend exploded');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(subscriptionLoads()).toHaveLength(1);
    mockBackend();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(subscriptionLoads()).toHaveLength(1);
    logged.mockRestore();
    warned.mockRestore();
  });
});

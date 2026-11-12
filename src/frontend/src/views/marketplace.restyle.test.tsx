/**
 * Wave 2 Task 16: Marketplace (/marketplace, components/home/marketplace-view)
 * on the page kit. Long names in every view mode, the page's horizontal
 * scroll and the mode kept across a reload are measured in a real browser in
 * tests/e2e/marketplace-search.spec.ts (ruling R10); these tests check the
 * structure, every control for a writer and a reader, the filters, the
 * dialogs it opens, and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { optionNames, pick, selectField } from '@/test/kit-dialog';
import kit from '@/mantine/page/page.module.css';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import usePermissionsStore from '@/stores/permissions-store';
import { useUserStore } from '@/stores/user-store';
import { useViewModeStore } from '@/stores/view-mode-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import MarketplaceView from '@/components/home/marketplace-view';

// The dialogs the page opens are shared, and consumed as they are: stand-ins
// record how the page opens them
vi.mock('@/components/metadata/entity-info-dialog', () => ({
  default: (p: { open: boolean; title?: string; onSubscribe?: () => void; onGoToDetails?: () => void; isSubscribed?: boolean }) =>
    p.open ? (
      <div role="dialog" aria-label={`Info: ${p.title}`}>
        {p.isSubscribed ? <span>Already Subscribed</span> : <button onClick={p.onSubscribe}>Subscribe</button>}
        <button onClick={p.onGoToDetails}>Go to details</button>
      </div>
    ) : null,
}));
vi.mock('@/components/data-products/subscribe-dialog', () => ({
  default: (p: { open: boolean; productName: string }) => (p.open ? <div role="dialog" aria-label={`Subscribe: ${p.productName}`} /> : null),
}));
vi.mock('@/components/workflows/approval-wizard-dialog', () => ({
  default: (p: { isOpen: boolean; preselectedWorkflowId: string }) =>
    p.isOpen ? <div role="dialog" aria-label={`Wizard: ${p.preselectedWorkflowId}`} /> : null,
}));
const wizard = vi.hoisted(() => ({ workflowId: null as string | null }));
vi.mock('@/hooks/use-approval-wizard-trigger', () => ({
  useApprovalWizardTrigger: () => ({ lookupWorkflowId: async () => wizard.workflowId }),
}));
vi.mock('@/components/data-domains/data-domain-mini-graph', () => ({
  DataDomainMiniGraph: (p: { currentDomain: { name: string }; onNodeClick: (id: string) => void }) => (
    <div data-testid="mini-graph">
      {p.currentDomain.name}
      <button onClick={() => p.onNodeClick('d-retail')}>Node Retail</button>
    </div>
  ),
}));
vi.mock('@/components/ratings', () => ({ RatingBadge: () => null }));
vi.mock('@/components/quality/quality-badge', () => ({ QualityBadge: () => null }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LONG_NAME = `Customer ${'lifetime-revenue-and-retention-measure '.repeat(6)}`.slice(0, 200);

const product = (id: string, name: string, domain: string, purpose: string) => ({
  id, name, status: 'active', domain, domain_ids: [domain], publication_scope: 'organization',
  description: { purpose }, team: { name: 'Sales', members: [{ username: 'rita@example.com' }] },
});
const PRODUCTS = [
  product('p-1', 'Sales orders', 'd-sales', 'Orders for reporting'),
  product('p-2', 'Store visits', 'd-retail', 'Footfall per store'),
  product('p-3', LONG_NAME, 'd-hr', 'Monthly pay'),
];
const DOMAINS = [
  { id: 'd-sales', name: 'Sales', parent_id: null, description: 'Selling things', children_count: 1 },
  { id: 'd-retail', name: 'Retail', parent_id: 'd-sales', description: 'Shops', children_count: 0 },
  { id: 'd-hr', name: 'People', parent_id: null, description: null, children_count: 0 },
];

let fetchMock: ReturnType<typeof vi.fn>;
let publishedStatus = 200;
let published: unknown = PRODUCTS;
/** A scope whose answer waits for `release` (a stale response) */
let held: { scope: string; release?: () => void } | null = null;

function mockBackend() {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    switch (url.pathname) {
      case '/api/data-products/published': {
        const scope = url.searchParams.get('scope') ?? 'all';
        if (held && held.scope === scope) {
          const hold = held;
          return new Promise<Response>((resolve) => {
            hold.release = () => resolve(json([product('p-stale', 'Stale answer', 'd-sales', '')]));
          });
        }
        if (publishedStatus !== 200) return json({ detail: 'down' }, publishedStatus);
        return json(scope === 'all' ? published : PRODUCTS.slice(0, 1));
      }
      case '/api/data-products/my-subscriptions':
        return json([PRODUCTS[0]]);
      case '/api/data-domains':
        return json(DOMAINS);
      case '/api/data-domains/d-sales':
        return json({ ...DOMAINS[0], children_info: [] });
      case '/api/data-domains/d-retail':
        return json({ ...DOMAINS[1], children_info: [] });
      case '/api/cache-version':
        return json({ version: 1 });
      default:
        return json([]);
    }
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

const renderPage = () =>
  renderWithMantine(
    <Routes>
      <Route path="/marketplace" element={<MarketplaceView />} />
      <Route path="/my-products/:id" element={<p>product page</p>} />
    </Routes>,
    { route: '/marketplace' },
  );

const pane = (name: string) => screen.getByRole('region', { name });
const published_calls = () =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((u) => u.pathname === '/api/data-products/published');

/** Classes that look like Tailwind utilities, outside the ui Button and Badge (which stay, wave 6). */
function tailwindIn(root: HTMLElement): string[] {
  const utility = /^(?:[a-z]+:)*-?(?:flex|grid|hidden|inline|block|truncate|shrink|grow|items-|justify-|self-|gap-|space-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|min-|max-|text-|font-|bg-|border|rounded|shadow|leading-|tracking-|whitespace-|cursor-|opacity-|tabular-nums|uppercase|col-span|hover:|animate-|line-clamp|transition|duration-)/;
  const found = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>('[class]')) {
    if (el.closest('.mantine-Badge-root, .mantine-Button-root')) continue;
    for (const c of el.classList) if (utility.test(c)) found.add(c);
  }
  return [...found];
}

/** A card's name: its title's text (the card is labelled by its title). */
const cardName = (card: HTMLElement) => document.getElementById(card.getAttribute('aria-labelledby') ?? '')?.textContent;

const productsLoaded = () => within(pane('Data Products')).findByRole('button', { name: 'Sales orders' });

beforeEach(() => {
  publishedStatus = 200;
  published = PRODUCTS;
  held = null;
  wizard.workflowId = null;
  mockBackend();
  grant(FeatureAccessLevel.READ_WRITE);
  useUserStore.setState({ userInfo: { user: 'Rita Example', username: 'rita@example.com', email: 'rita@example.com', ip: null, groups: [] } as never });
  useViewModeStore.setState({ domainBrowserStyle: 'pills', tilesPerRow: 4 });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('marketplace on the page kit', () => {
  it('marketplace renders with the page kit', async () => {
    const { container } = renderPage();
    await productsLoaded();

    // The shell owns the breadcrumb; the page draws the kit header, its tagline and the filter bar
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    const heading = screen.getByRole('heading', { level: 1, name: 'Hello, Rita' });
    expect(heading.parentElement).toHaveClass(kit.header);
    expect(screen.getByText(/Welcome to the Data Marketplace/)).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: 'What can we help you find today?' });
    expect(search.closest(`.${kit.bar}`)).not.toBeNull();
    expect(selectField(document.body, 'Publication scope').closest(`.${kit.bar}`)).not.toBeNull();

    // The page draws the kit's margin itself, so the shell's padding gives way
    expect(isFullBleed('/marketplace')).toBe(true);
    expect(container.querySelector(`.${kit.page}`)).not.toHaveAttribute('data-full-bleed');

    // The domain browser and the products, each a kit pane in one stack
    expect(pane('Browse Data Domains')).toHaveClass(kit.pane);
    expect(pane('Data Products')).toHaveClass(kit.pane);
    expect(pane('Data Products').parentElement).toHaveClass(kit.stack);
    expect(pane('Browse Data Domains').parentElement).toBe(pane('Data Products').parentElement);
    // Each product is a card named by its title
    expect(within(pane('Data Products')).getAllByRole('article')).toHaveLength(3);

    expect(container.querySelector('.p-6, .py-6, .rounded-xl, .rounded-lg, .bg-card, [class*="shadow"], [class*="gradient"]')).toBeNull();
    expect(tailwindIn(container)).toEqual([]);
  });

  for (const level of [FeatureAccessLevel.READ_WRITE, FeatureAccessLevel.READ_ONLY]) {
    it(`marketplace keeps every control (${level})`, async () => {
      grant(level);
      const user = userEvent.setup();
      renderPage();
      await productsLoaded();

      // The filter bar: the search with Clear, and the scope
      const search = screen.getByRole('searchbox', { name: 'What can we help you find today?' });
      await user.type(search, 'sales');
      expect(within(pane('Data Products')).getAllByRole('article')).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: 'Clear' }));
      expect(search).toHaveValue('');
      const scope = selectField(document.body, 'Publication scope');
      expect(scope).toHaveValue('All Scopes');
      expect(await optionNames(user, scope)).toEqual(['All Scopes', 'Domain', 'Organization', 'External']);

      // The domain browser: List and Graph, All Domains and a chip per domain
      const domains = pane('Browse Data Domains');
      expect(within(domains).getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
      expect(within(domains).getByRole('button', { name: 'Graph' })).toHaveAttribute('aria-pressed', 'false');
      expect(within(domains).getAllByRole('button').map((b) => b.textContent)).toEqual([
        'List', 'Graph', 'All Domains', 'People', 'Sales', 'Retail',
      ]);
      expect(within(domains).queryByRole('switch')).toBeNull();

      // The products: tiles per row, then each card's title and Open in details
      const products = pane('Data Products');
      expect(within(products).getByText('3 products available')).toBeInTheDocument();
      const tiles = selectField(products, 'Tiles per row');
      expect(await optionNames(user, tiles)).toEqual(['1 per row', '2 per row', '3 per row', '4 per row']);
      expect(within(products).getAllByRole('button', { name: 'Open in details view' })).toHaveLength(3);
      const long = within(products).getByRole('button', { name: LONG_NAME });
      expect(long).toHaveAttribute('title', LONG_NAME);
      expect(within(products).getByRole('article', { name: 'Sales orders' })).toHaveTextContent('Owner: rita@example.com');
      // The subscribed product carries its mark
      expect(within(within(products).getByRole('article', { name: 'Sales orders' })).getByLabelText('Subscribed')).toBeInTheDocument();
    });
  }

  it('a product opens its info, Subscribe goes to the subscribe dialog or the wizard, and details navigate', async () => {
    const user = userEvent.setup();
    renderPage();
    await productsLoaded();
    const products = pane('Data Products');

    // The title (or anywhere on the card) opens the info dialog; Subscribe opens the subscribe dialog
    await user.click(within(products).getByRole('button', { name: 'Store visits' }));
    const info = screen.getByRole('dialog', { name: 'Info: Store visits' });
    await user.click(within(info).getByRole('button', { name: 'Subscribe' }));
    expect(await screen.findByRole('dialog', { name: 'Subscribe: Store visits' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /^Info/ })).toBeNull();
    cleanup();

    // With a subscription workflow, Subscribe starts the wizard
    wizard.workflowId = 'wf-1';
    renderPage();
    await productsLoaded();
    await user.click(within(pane('Data Products')).getByText('Footfall per store'));
    await user.click(within(screen.getByRole('dialog', { name: 'Info: Store visits' })).getByRole('button', { name: 'Subscribe' }));
    expect(await screen.findByRole('dialog', { name: 'Wizard: wf-1' })).toBeInTheDocument();
    cleanup();

    // A subscribed product says so; Go to details navigates
    renderPage();
    await productsLoaded();
    await user.click(within(pane('Data Products')).getByRole('button', { name: 'Sales orders' }));
    const subscribed = screen.getByRole('dialog', { name: 'Info: Sales orders' });
    expect(within(subscribed).getByText('Already Subscribed')).toBeInTheDocument();
    await user.click(within(subscribed).getByRole('button', { name: 'Go to details' }));
    expect(await screen.findByText('product page')).toBeInTheDocument();
    cleanup();

    // Open in details goes straight to the product, without the dialog
    renderPage();
    await productsLoaded();
    const card = within(pane('Data Products')).getByRole('article', { name: 'Store visits' });
    await user.click(within(card).getByRole('button', { name: 'Open in details view' }));
    expect(await screen.findByText('product page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the domain chips, exact match and the scope filter the products', async () => {
    const user = userEvent.setup();
    renderPage();
    await productsLoaded();
    const domains = pane('Browse Data Domains');
    const products = pane('Data Products');
    const names = () => within(products).queryAllByRole('article').map(cardName);

    // Sales includes its child Retail, until Exact match only
    await user.click(within(domains).getByRole('button', { name: 'Sales' }));
    expect(within(domains).getByRole('button', { name: 'Sales' })).toHaveAttribute('aria-pressed', 'true');
    expect(names()).toEqual(['Sales orders', 'Store visits']);
    await user.click(within(domains).getByRole('switch', { name: 'Exact match only' }));
    expect(names()).toEqual(['Sales orders']);
    // One product: the count's singular
    expect(within(products).getByText('1 product available')).toBeInTheDocument();
    // A second chip adds to the filter; All Domains clears it
    await user.click(within(domains).getByRole('button', { name: 'People' }));
    expect(names()).toEqual(['Sales orders', LONG_NAME]);
    await user.click(within(domains).getByRole('button', { name: 'All Domains' }));
    expect(names()).toHaveLength(3);

    // The scope is a server-side filter
    await pick(user, selectField(document.body, 'Publication scope'), 'Organization');
    await waitFor(() => expect(names()).toEqual(['Sales orders']));
    expect(published_calls().slice(-1)[0].searchParams.get('scope')).toBe('organization');
  });

  it('the graph view focuses a domain, and a node adds it to the filter', async () => {
    const user = userEvent.setup();
    renderPage();
    await productsLoaded();
    const domains = pane('Browse Data Domains');
    await user.click(within(domains).getByRole('button', { name: 'Graph' }));
    expect(useViewModeStore.getState().domainBrowserStyle).toBe('graph');
    expect(within(domains).getByRole('button', { name: 'Graph' })).toHaveAttribute('aria-pressed', 'true');
    // The first root domain (People, then Sales: the list's own order) is focused
    const graph = await within(domains).findByTestId('mini-graph');
    expect(graph).toHaveTextContent('Sales');
    await user.click(within(graph).getByRole('button', { name: 'Node Retail' }));
    await waitFor(() => expect(within(domains).getByTestId('mini-graph')).toHaveTextContent('Retail'));
    expect(within(pane('Data Products')).getAllByRole('article').map(cardName)).toEqual(['Store visits']);
    // The exact-match switch shows with the selection, in this mode too
    expect(within(domains).getByRole('switch', { name: 'Exact match only' })).toBeInTheDocument();

    // Tiles per row is kept in the view-mode store (persisted)
    await pick(user, selectField(pane('Data Products'), 'Tiles per row'), '2 per row');
    expect(useViewModeStore.getState().tilesPerRow).toBe(2);
    expect(JSON.parse(localStorage.getItem('view-mode-storage')!).state).toMatchObject({ domainBrowserStyle: 'graph', tilesPerRow: 2 });
  });

  it('marketplace empty and error states keep their actions', async () => {
    const user = userEvent.setup();
    publishedStatus = 500;
    renderPage();
    const products = pane('Data Products');
    const alert = await within(products).findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load products');
    expect(alert).toHaveTextContent('HTTP error! status: 500');
    // The filters stay usable over the failure; Retry loads the list again
    expect(screen.getByRole('searchbox', { name: 'What can we help you find today?' })).toBeEnabled();
    publishedStatus = 200;
    await user.click(within(products).getByRole('button', { name: 'Retry' }));
    await productsLoaded();
    expect(within(products).queryByRole('alert')).toBeNull();
    cleanup();

    // The empty list: its line, then the hint once a filter is set
    published = [];
    renderPage();
    expect(await within(pane('Data Products')).findByText('No data products found.')).toBeInTheDocument();
    expect(within(pane('Data Products')).queryByText('Try adjusting your search or filter.')).toBeNull();
    await user.type(screen.getByRole('searchbox', { name: 'What can we help you find today?' }), 'x');
    expect(within(pane('Data Products')).getByText('Try adjusting your search or filter.')).toBeInTheDocument();
  });

  it('a slower answer for an earlier scope is dropped', async () => {
    const user = userEvent.setup();
    held = { scope: 'domain' };
    renderPage();
    await productsLoaded();
    const scope = selectField(document.body, 'Publication scope');
    await pick(user, scope, 'Domain');
    await pick(user, scope, 'Organization');
    await within(pane('Data Products')).findByRole('article', { name: 'Sales orders' });
    await waitFor(() => expect(within(pane('Data Products')).getAllByRole('article')).toHaveLength(1));
    await act(async () => {
      held!.release!();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(within(pane('Data Products')).queryByRole('article', { name: 'Stale answer' })).toBeNull();
    expect(within(pane('Data Products')).getByRole('article', { name: 'Sales orders' })).toBeInTheDocument();
  });
});

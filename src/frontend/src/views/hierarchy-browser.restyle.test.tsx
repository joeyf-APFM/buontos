/**
 * Wave 2 Task 13c: the Hierarchy Browser (/concepts/hierarchy) on the page
 * kit, with its tree rows (components/hierarchy/hierarchy-tree-node) and the
 * graph view's chrome (components/hierarchy/hierarchy-graph-view; the
 * reactflow canvas keeps its library). The look, the long labels and the deep
 * tree scrolling inside its pane are measured in a real browser in
 * tests/e2e/concepts-hierarchy.spec.ts (ruling R10); these tests check the
 * structure, every control for an admin and a reader, the keyboard, the URL,
 * stale answers, and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { pick, selectField } from '@/test/kit-dialog';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import HierarchyBrowserView from './hierarchy-browser';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LONG_LABEL = `Customer ${'lifetime-revenue-and-retention-domain-'.repeat(6)}`.slice(0, 200);

const node = (entity_type: string, entity_id: string, name: string, extra: Record<string, unknown> = {}) => ({
  entity_type, entity_id, name, child_count: 0, children: [], ...extra,
});

const ROOTS = [
  {
    entity_type: 'System', label: 'Systems', icon: 'Server',
    roots: [node('System', 's1', 'Billing System', { child_count: 2, status: 'active' })],
  },
  { entity_type: 'DataDomain', label: 'Data Domains', icon: 'FolderOpen', roots: [node('DataDomain', 'd1', LONG_LABEL)] },
  {
    entity_type: 'DataProduct', label: 'Data Products', icon: 'Box',
    roots: [node('DataProduct', 'p1', 'Sales Product', { child_count: 1, status: 'draft' })],
  },
];

const BILLING = node('System', 's1', 'Billing System', {
  status: 'active',
  description: 'Bills the customers',
  child_count: 2,
  children: [
    node('Dataset', 'ds1', 'Invoices', {
      child_count: 1,
      relationship_label: 'hasDataset',
      children: [node('Table', 't1', 'invoice_lines')],
    }),
    // Its children load when it's expanded
    node('Table', 't2', 'customers', { child_count: 1 }),
  ],
});

let fetchMock: ReturnType<typeof vi.fn>;
/** Paths (no query) that answer 500 */
let failing = new Set<string>();
let roots: unknown = ROOTS;
/** A detail path whose answer waits for `release` (a stale response) */
let held: { path: string; release?: () => void } | null = null;

function mockBackend() {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (failing.has(url.pathname)) return json({ detail: 'The graph store is down' }, 500);
    if (held && url.pathname === held.path) {
      const hold = held;
      return new Promise<Response>((resolve) => {
        hold.release = () => resolve(json(node('DataProduct', 'p1', 'Stale Product')));
      });
    }
    switch (url.pathname) {
      case '/api/entity-hierarchy/roots':
        return json(roots);
      case '/api/entity-hierarchy/System/s1':
        return json(BILLING);
      case '/api/entity-hierarchy/DataProduct/p1':
        return json(node('DataProduct', 'p1', 'Sales Product', {
          status: 'draft', child_count: 1, children: [node('DataContract', 'c1', 'Orders Contract')],
        }));
      case '/api/entity-hierarchy/DataDomain/d1':
        return json(node('DataDomain', 'd1', LONG_LABEL));
      case '/api/entity-hierarchy/Table/t2':
        return json(node('Table', 't2', 'customers', { children: [node('Column', 'col1', 'customer_id')] }));
      default:
        return json([]);
    }
  });
  vi.stubGlobal('fetch', fetchMock);
}

const gets = () =>
  fetchMock.mock.calls.map(([input]) => {
    const url = new URL(String(input), 'http://localhost');
    return `${url.pathname}${url.search}`;
  });

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { assets: level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

let location = { pathname: '', search: '' };
function Probe() {
  const l = useLocation();
  useEffect(() => {
    location = { pathname: l.pathname, search: l.search };
  });
  return null;
}

const renderPage = (route = '/concepts/hierarchy') =>
  renderWithMantine(
    <Routes>
      <Route path="/concepts/hierarchy" element={<><HierarchyBrowserView /><Probe /></>} />
      <Route path="/data-products/:id" element={<><p>product page</p><Probe /></>} />
      <Route path="/assets/:id" element={<><p>asset page</p><Probe /></>} />
    </Routes>,
    { route },
  );

const browsePane = () => screen.getByRole('region', { name: 'Browse' });
const detailPane = () => screen.getByRole('region', { name: 'Hierarchy detail' });
const loaded = () => screen.findByRole('button', { name: 'Billing System' });

/** Classes that look like Tailwind utilities, outside the ui Button and Badge (which stay, wave 6) and the reactflow canvas. */
function tailwindIn(root: HTMLElement): string[] {
  const utility = /^(?:[a-z]+:)*-?(?:flex|grid|hidden|inline|block|truncate|shrink|grow|items-|justify-|self-|gap-|space-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|min-|max-|text-|font-|bg-|border|rounded|shadow|leading-|tracking-|whitespace-|cursor-|opacity-|tabular-nums|uppercase|animate-)/;
  const found = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>('[class]')) {
    if (el.closest('.mantine-Badge-root, .mantine-Button-root, .react-flow')) continue;
    for (const c of el.classList) if (utility.test(c)) found.add(c);
  }
  return [...found];
}

function expectNoOldMarkup(root: HTMLElement) {
  // The reactflow canvas keeps its own node cards (the brief: only its chrome changes)
  const old = [...root.querySelectorAll('.p-6, .py-6, .bg-card, .rounded-lg, .shadow-sm')]
    .filter((el) => !el.closest('.react-flow'));
  expect(old).toEqual([]);
  expect(tailwindIn(root)).toEqual([]);
}

beforeEach(() => {
  failing = new Set();
  roots = ROOTS;
  held = null;
  mockBackend();
  grant(FeatureAccessLevel.READ_WRITE);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('hierarchy-browser renders with the page kit', () => {
  it('has the kit header, the Browse and detail panes, and no old markup', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await loaded();

    const h1 = screen.getByRole('heading', { level: 1, name: 'Hierarchy Browser' });
    expect(h1.parentElement).toHaveClass(kit.header);
    expect(screen.getByText('Navigate data hierarchies from systems and domains down to tables and columns')).toBeInTheDocument();
    expect(browsePane()).toHaveClass(kit.pane);
    expect(detailPane()).toHaveClass(kit.pane);
    // The panes sit side by side in the kit's content row
    expect(browsePane().parentElement).toHaveClass(kit.content);
    expect(detailPane().parentElement).toBe(browsePane().parentElement);
    // The tree is in the Browse pane, under its head
    expect(within(browsePane()).getByRole('tree', { name: 'Browse' })).toBeInTheDocument();
    expect(within(detailPane()).getByText('Select an entity')).toBeInTheDocument();
    expectNoOldMarkup(container);

    await user.click(screen.getByRole('button', { name: 'Billing System' }));
    await within(detailPane()).findByRole('heading', { level: 2, name: 'Billing System' });
    expectNoOldMarkup(container);

    await user.click(screen.getByRole('button', { name: 'Graph view' }));
    expect(await screen.findByTestId('hierarchy-graph-view')).toBeInTheDocument();
    expectNoOldMarkup(container);
  });
});

describe.each([
  ['an admin', FeatureAccessLevel.ADMIN],
  ['a reader', FeatureAccessLevel.READ_ONLY],
])('hierarchy-browser keeps every control for %s', (_who, level) => {
  beforeEach(() => grant(level));

  it('browses, filters and refreshes the roots', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const browse = within(browsePane());

    // The groups, their counts and the roots
    expect(browse.getByText('Systems')).toBeInTheDocument();
    expect(browse.getByRole('button', { name: 'Sales Product' })).toBeInTheDocument();

    // The root-type chips are toggles; the last one left can't be turned off
    const system = browse.getByRole('button', { name: /^System/ });
    const domain = browse.getByRole('button', { name: /^Domain/ });
    const product = browse.getByRole('button', { name: /^Product/ });
    expect(system).toHaveAttribute('aria-pressed', 'true');
    await user.click(system);
    expect(system).toHaveAttribute('aria-pressed', 'false');
    expect(browse.queryByRole('button', { name: 'Billing System' })).toBeNull();
    await user.click(domain);
    await user.click(product);
    expect(product).toHaveAttribute('aria-pressed', 'true');
    expect(browse.getByRole('button', { name: 'Sales Product' })).toBeInTheDocument();
    await user.click(system);
    await user.click(domain);

    // The filter narrows the roots by name
    const filter = browse.getByRole('textbox', { name: 'Filter...' });
    await user.type(filter, 'sales');
    expect(browse.queryByRole('button', { name: 'Billing System' })).toBeNull();
    expect(browse.getByRole('button', { name: 'Sales Product' })).toBeInTheDocument();
    await user.clear(filter);

    // Refresh loads the roots again
    const before = gets().filter((g) => g.startsWith('/api/entity-hierarchy/roots')).length;
    await user.click(browse.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(gets().filter((g) => g.startsWith('/api/entity-hierarchy/roots')).length).toBe(before + 1));
    expect(gets()).toContain('/api/entity-hierarchy/roots?types=System,DataDomain,DataProduct');
  });

  it('selects a root, shows its hierarchy, and keeps the depth, views, type filter and links', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Billing System' }));
    const detail = within(detailPane());
    await detail.findByRole('heading', { level: 2, name: 'Billing System' });
    expect(location.search).toBe('?type=System&id=s1');
    expect(gets()).toContain('/api/entity-hierarchy/System/s1?max_depth=4');
    expect(detail.getByText('Bills the customers')).toBeInTheDocument();
    expect(detail.getByText('2 children')).toBeInTheDocument();
    expect(detail.getByText('active')).toBeInTheDocument();

    // The depth
    const depth = selectField(detailPane(), 'Max hierarchy depth');
    expect(depth).toHaveValue('4 levels');
    await pick(user, depth, '6 levels');
    await waitFor(() => expect(gets()).toContain('/api/entity-hierarchy/System/s1?max_depth=6'));

    // Tree and graph
    const treeView = detail.getByRole('button', { name: 'Tree view' });
    const graphView = detail.getByRole('button', { name: 'Graph view' });
    expect(treeView).toHaveAttribute('aria-pressed', 'true');
    expect(detail.getByRole('heading', { level: 3, name: 'Hierarchy' })).toBeInTheDocument();
    expect(detail.getByRole('button', { name: 'Invoices' })).toBeInTheDocument();
    await user.click(graphView);
    expect(graphView).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByTestId('hierarchy-graph-view')).toBeInTheDocument();
    expect(detail.queryByRole('heading', { level: 3, name: 'Hierarchy' })).toBeNull();
    await user.click(treeView);

    // The type chips filter the hierarchy; Show all brings it back
    expect(detail.getByText('Show:')).toBeInTheDocument();
    const dataset = detail.getByRole('button', { name: 'Dataset' });
    expect(dataset).toHaveAttribute('aria-pressed', 'true');
    await user.click(dataset);
    expect(dataset).toHaveAttribute('aria-pressed', 'false');
    expect(detail.queryByRole('button', { name: 'Invoices' })).toBeNull();
    await user.click(detail.getByRole('button', { name: 'Show all' }));
    expect(detail.getByRole('button', { name: 'Invoices' })).toBeInTheDocument();
    expect(detail.queryByRole('button', { name: 'Show all' })).toBeNull();

    // View Detail opens the entity's page
    await user.click(detail.getByRole('button', { name: 'View Detail' }));
    expect(location.pathname).toBe('/assets/s1');
  });

  it('expands and collapses tree rows by mouse and keyboard, loading children when needed', async () => {
    const user = userEvent.setup();
    renderPage('/concepts/hierarchy?type=System&id=s1');
    const detail = within(await screen.findByRole('region', { name: 'Hierarchy detail' }));
    await detail.findByRole('button', { name: 'Invoices' });

    // A row with its children in hand opens without a request
    const expandInvoices = detail.getByRole('button', { name: 'Expand Invoices' });
    expect(expandInvoices.closest('[role="treeitem"]')).toHaveAttribute('aria-expanded', 'false');
    await user.click(expandInvoices);
    expect(detail.getByRole('button', { name: 'invoice_lines' })).toBeInTheDocument();
    const collapseInvoices = detail.getByRole('button', { name: 'Collapse Invoices' });
    expect(collapseInvoices.closest('[role="treeitem"]')).toHaveAttribute('aria-expanded', 'true');

    // The keyboard: ArrowLeft collapses, ArrowRight expands (and loads)
    collapseInvoices.focus();
    await user.keyboard('{ArrowLeft}');
    expect(detail.queryByRole('button', { name: 'invoice_lines' })).toBeNull();
    const expandCustomers = detail.getByRole('button', { name: 'Expand customers' });
    expandCustomers.focus();
    await user.keyboard('{ArrowRight}');
    expect(await detail.findByRole('button', { name: 'customer_id' })).toBeInTheDocument();
    expect(gets()).toContain('/api/entity-hierarchy/Table/t2?max_depth=2');

    // Each row opens its entity's page
    await user.click(detail.getAllByRole('button', { name: 'View details' })[0]);
    expect(location.pathname).toBe('/assets/ds1');
  });

  it('selects a root by keyboard from its toggle, and a product row opens its page', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const browse = within(browsePane());
    // Roots start open (nothing loaded yet), so their toggle says Collapse
    const toggle = browse.getByRole('button', { name: 'Collapse Sales Product' });
    toggle.focus();
    await user.keyboard('{Enter}');
    await within(detailPane()).findByRole('heading', { level: 2, name: 'Sales Product' });
    expect(location.search).toBe('?type=DataProduct&id=p1');
    // The selected root is marked
    expect(browse.getByRole('button', { name: 'Sales Product' }).closest('[role="treeitem"]')).toHaveAttribute('aria-selected', 'true');

    const row = browse.getByRole('button', { name: 'Sales Product' }).closest('[role="treeitem"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'View details' }));
    expect(location.pathname).toBe('/data-products/p1');
  });

  it('shows the permission notice without read access', async () => {
    grant(FeatureAccessLevel.NONE);
    renderPage();
    expect(await screen.findByText('Permission Denied')).toBeInTheDocument();
    expect(screen.getByText("You don't have access to browse the hierarchy.")).toBeInTheDocument();
  });
});

describe('hierarchy-browser long labels (Review Focus 1)', () => {
  it('puts a long label in full in the title of its tree row and the detail heading', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const row = within(browsePane()).getByRole('button', { name: LONG_LABEL });
    expect(row).toHaveAttribute('title', LONG_LABEL);
    await user.click(row);
    const heading = await within(detailPane()).findByRole('heading', { level: 2, name: LONG_LABEL });
    expect(heading).toHaveAttribute('title', LONG_LABEL);
  });
});

describe('hierarchy-browser empty and error states keep their actions', () => {
  it('no roots: the note, with Refresh and the filter kept', async () => {
    roots = [];
    renderPage();
    expect(await within(browsePane()).findByText('No root entities found')).toBeInTheDocument();
    expect(within(browsePane()).getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(within(browsePane()).getByRole('textbox', { name: 'Filter...' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('no match for the filter: the note, and clearing it brings the roots back', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const filter = within(browsePane()).getByRole('textbox', { name: 'Filter...' });
    await user.type(filter, 'zzz');
    expect(within(browsePane()).getByText('No matches found')).toBeInTheDocument();
    await user.clear(filter);
    expect(within(browsePane()).getByRole('button', { name: 'Billing System' })).toBeInTheDocument();
  });

  it('a failed roots load: an Alert with Retry, not "No root entities found"', async () => {
    const user = userEvent.setup();
    // useApi logs the failed request
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    failing = new Set(['/api/entity-hierarchy/roots']);
    renderPage();
    const alert = await within(browsePane()).findByRole('alert');
    expect(alert).toHaveTextContent('Error');
    expect(alert).toHaveTextContent('The graph store is down');
    expect(screen.queryByText('No root entities found')).toBeNull();
    failing = new Set();
    await user.click(within(browsePane()).getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a failed detail load: an Alert with Retry in the detail pane, not "No children"', async () => {
    const user = userEvent.setup();
    // useApi logs the failed request
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    failing = new Set(['/api/entity-hierarchy/System/s1']);
    renderPage();
    await user.click(await loaded());
    const alert = await within(detailPane()).findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the details.');
    expect(within(detailPane()).queryByText('No children in the hierarchy')).toBeNull();
    failing = new Set();
    await user.click(within(detailPane()).getByRole('button', { name: 'Retry' }));
    expect(await within(detailPane()).findByText('Bills the customers')).toBeInTheDocument();
    expect(within(detailPane()).queryByRole('alert')).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a failed child load: an error with Retry in the row, not "No children found"', async () => {
    const user = userEvent.setup();
    // useApi logs the failed request
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    failing = new Set(['/api/entity-hierarchy/Table/t2']);
    renderPage('/concepts/hierarchy?type=System&id=s1');
    const detail = within(await screen.findByRole('region', { name: 'Hierarchy detail' }));
    await user.click(await detail.findByRole('button', { name: 'Expand customers' }));
    expect(await detail.findByText('Could not load the children.')).toBeInTheDocument();
    expect(detail.queryByText('No children found')).toBeNull();
    failing = new Set();
    await user.click(detail.getByRole('button', { name: 'Retry' }));
    expect(await detail.findByRole('button', { name: 'customer_id' })).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('an entity with no children: the note, with View Detail kept', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await within(browsePane()).findByRole('button', { name: LONG_LABEL }));
    expect(await within(detailPane()).findByText('No children in the hierarchy')).toBeInTheDocument();
    expect(within(detailPane()).getByRole('button', { name: 'View Detail' })).toBeInTheDocument();
    // No depth or view controls without children, as before
    expect(within(detailPane()).queryByRole('button', { name: 'Graph view' })).toBeNull();
  });
});

describe('hierarchy-browser deep trees and stale answers', () => {
  it('scrolls the tree inside its pane, under the pane head and the filters', async () => {
    renderPage();
    await loaded();
    const tree = within(browsePane()).getByRole('tree', { name: 'Browse' });
    const body = browsePane().querySelector(`.${kit.paneBody}`) as HTMLElement;
    expect(body).toContainElement(tree);
    // The filter is outside the scrolling tree, so it stays in place
    expect(tree).not.toContainElement(within(browsePane()).getByRole('textbox', { name: 'Filter...' }));
  });

  it('drops a detail answer that arrives after a newer selection', async () => {
    const user = userEvent.setup();
    held = { path: '/api/entity-hierarchy/DataProduct/p1' };
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Sales Product' }));
    await user.click(screen.getByRole('button', { name: 'Billing System' }));
    await within(detailPane()).findByText('Bills the customers');
    await act(async () => held?.release?.());
    expect(within(detailPane()).getByRole('heading', { level: 2, name: 'Billing System' })).toBeInTheDocument();
    expect(screen.queryByText('Stale Product')).toBeNull();
    expect(location.search).toBe('?type=System&id=s1');
  });
});

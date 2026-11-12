/**
 * Wave 2 Task 13a: Explore (/concepts/browser) on the page kit, with its own
 * components (the filters pane, the list and tree, the graph's chrome) and
 * the concept editor on the kit Dialog. The look, the long labels, the Create
 * menu's focus and the Radix picker over the editor are measured in a real
 * browser in tests/e2e/concepts-explore.spec.ts (ruling R10); these tests
 * check the structure, every control for a writer, an admin and a reader, the
 * permission gates, and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog } from '@/test/kit-dialog';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { useGlossaryPreferencesStore } from '@/stores/glossary-preferences-store';
import { useExploreSessionStore } from '@/hooks/use-explore-concepts';
import { useKnowledgeGraphStore } from '@/stores/knowledge-graph-store';
import { useConceptMode } from '@/components/concepts/mode-switch';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import ExploreView from './explore';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

// The cytoscape canvas keeps its library; jsdom can't draw it
vi.mock('react-cytoscapejs', () => ({ default: () => <div data-testid="cytoscape" /> }));
// Task 13b's search panel, consumed as it is
vi.mock('@/components/search/kg-search', () => ({ default: () => <div data-testid="kg-search" /> }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LONG_LABEL = `Customer ${'lifetime-revenue-and-retention-measure-'.repeat(6)}`.slice(0, 200);

const scheme = (iri: string, label: string, type: string, extra: Record<string, unknown> = {}) => ({
  iri, label, collection_type: type, scope_level: 'enterprise', source_type: 'custom', is_editable: true,
  status: 'active', concept_count: 1, child_collections: [], ...extra,
});
const SCHEMES = [
  scheme('urn:glossary:finance', 'Finance Glossary', 'glossary'),
  scheme('urn:taxonomy:products', 'Product Taxonomy', 'taxonomy'),
  scheme('urn:ontology:fibo', 'FIBO', 'ontology', { source_type: 'imported', is_editable: false }),
];

const concept = (iri: string, label: string, source: string, extra: Record<string, unknown> = {}) => ({
  iri, label, comment: `${label} definition`, concept_type: 'concept', source_context: source,
  parent_concepts: [], child_concepts: [], properties: [], tagged_assets: [], synonyms: [], examples: [],
  status: 'draft', ...extra,
});
const GROUPED = {
  products: [
    concept('urn:e2e:widgets', 'Widgets', 'products'),
    concept('urn:e2e:long', LONG_LABEL, 'products'),
  ],
  fibo: [concept('urn:fibo:party', 'Party', 'fibo', { concept_type: 'class', status: 'approved' })],
};

let fetchMock: ReturnType<typeof vi.fn>;
let conceptsStatus = 200;
let grouped: Record<string, unknown[]> = GROUPED;

function mockBackend() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/knowledge/collections' && method === 'GET') return json({ collections: SCHEMES });
    if (url.pathname === '/api/semantic-models/concepts-grouped') {
      return conceptsStatus === 200
        ? json({ grouped_concepts: grouped, system_sources: [] })
        : json({ detail: 'The triple store is down' }, conceptsStatus);
    }
    if (url.pathname === '/api/semantic-models/stats') return json({ stats: null });
    if (url.pathname === '/api/semantic-links/mapping-status') return json({ statuses: {} });
    if (url.pathname.startsWith('/api/knowledge/collections/') && method === 'DELETE') return json({});
    if (url.pathname.startsWith('/api/knowledge/concepts/by-iri/')) return json({});
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === method)
    .map(([input]) => {
      const url = new URL(String(input), 'http://localhost');
      return `${url.pathname}${url.search}`;
    });

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'semantic-models': level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

let setMode: (mode: 'simple' | 'advanced') => void = () => {};
let location = { pathname: '' };
function Probe() {
  const l = useLocation();
  const [, set] = useConceptMode();
  useEffect(() => {
    setMode = set;
    location = { pathname: l.pathname };
  });
  return null;
}

const renderPage = (route = '/concepts/browser') =>
  renderWithMantine(
    <Routes>
      <Route path="/concepts/browser" element={<><ExploreView /><Probe /></>} />
      <Route path="/concepts/browser/:iri" element={<><p>concept page</p><Probe /></>} />
      <Route path="/concepts/define" element={<><p>define page</p><Probe /></>} />
    </Routes>,
    { route },
  );

const loaded = () => screen.findByText('Widgets');
const pane = (name: string) => screen.getByRole('region', { name });

/** Classes that look like Tailwind utilities, outside the ui Button and Badge (which stay, wave 6). */
function tailwindIn(root: HTMLElement): string[] {
  const utility = /^(?:[a-z]+:)*-?(?:flex|grid|hidden|inline|block|truncate|shrink|grow|items-|justify-|self-|gap-|space-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|min-|max-|text-|font-|bg-|border|rounded|shadow|leading-|tracking-|whitespace-|cursor-|opacity-|tabular-nums|uppercase)/;
  const found = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>('[class]')) {
    if (el.closest('.mantine-Badge-root, .mantine-Button-root')) continue;
    for (const c of el.classList) if (utility.test(c)) found.add(c);
  }
  return [...found];
}

/** Opens a Mantine Menu and returns its dropdown. */
async function openMenu(user: ReturnType<typeof userEvent.setup>, target: HTMLElement) {
  await user.click(target);
  await waitFor(() => expect(target).toHaveAttribute('aria-expanded', 'true'));
  return waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[role="menu"][aria-labelledby="${target.id}"]`);
    expect(found).not.toBeNull();
    return found!;
  });
}

/** Opens a Mantine Menu and returns its item names (jsdom hides the dropdown: 0×0 boxes). */
async function menuItems(user: ReturnType<typeof userEvent.setup>, target: HTMLElement) {
  const menu = await openMenu(user, target);
  return within(menu).queryAllByRole('menuitem', { hidden: true }).map((i) => i.textContent);
}

const item = (name: string | RegExp) => screen.getByRole('menuitem', { name, hidden: true });

beforeEach(() => {
  conceptsStatus = 200;
  grouped = GROUPED;
  mockBackend();
  grant(FeatureAccessLevel.READ_WRITE);
  useGlossaryPreferencesStore.setState({
    hiddenSources: [],
    groupByDimension: 'none',
    groupBySource: false,
    groupByFile: false,
    groupByDomain: false,
    showProperties: false,
    isFilterExpanded: true,
    conceptListSearch: '',
    conceptListScrollTop: 0,
    expandedConceptGroups: ['root'],
  });
  useExploreSessionStore.setState({ showSystemSources: false });
});

afterEach(() => {
  act(() => setMode('simple'));
  cleanup();
  vi.unstubAllGlobals();
  toast.mockClear();
});

describe('explore on the page kit', () => {
  it('explore renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    // The shell owns the breadcrumb; the page draws the kit header and its description
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    const heading = screen.getByRole('heading', { level: 1, name: 'Explore' });
    expect(heading.parentElement).toHaveClass(kit.header);
    expect(screen.getByText('Author, browse, and deliver your business concept schemes.')).toBeInTheDocument();

    // The filters and the views, each a kit pane, stacked
    expect(pane('Filters')).toHaveClass(kit.pane);
    expect(pane('Concepts')).toHaveClass(kit.pane);
    expect(pane('Filters').parentElement).toHaveClass(kit.stack);
    expect(pane('Concepts').parentElement).toBe(pane('Filters').parentElement);
    // The views are kit tabs, with their panel
    const tabs = within(pane('Concepts')).getByRole('tablist', { name: 'Explore views' });
    expect(tabs).toHaveClass(kit.tabList);
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['List', 'Tree', 'Graph']);
    expect(within(pane('Concepts')).getByRole('tabpanel', { name: 'List' })).toBeInTheDocument();

    expect(container.querySelector('.p-6, .rounded-xl, .rounded-lg, .bg-card, [class*="shadow"]')).toBeNull();
    expect(tailwindIn(container)).toEqual([]);
  });

  it('explore keeps every control for a writer', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    // The Create menu: the generic set (no single editable scheme in focus), then the scheme
    const create = screen.getByRole('button', { name: 'Create' });
    expect(await menuItems(user, create)).toEqual(['New Term', 'New Concept', 'New Class', 'New Concept Scheme']);
    await user.click(item('New Concept'));
    const editor = await screen.findByRole('dialog', { name: 'Create Entry' });
    expectKitDialog(editor);
    await user.click(within(editor).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create Entry' })).toBeNull());
    await menuItems(user, create);
    await user.click(item('New Concept Scheme'));
    expect(await screen.findByRole('dialog', { name: 'Create Scheme' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create Scheme' })).toBeNull());

    // The filters: the toggle, All/None, Name/Size, the search, a checkbox per scheme, Group by and Show Properties
    const filters = pane('Filters');
    expect(within(filters).getByRole('button', { name: /Filter by Source/ })).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['All', 'None', 'Name', 'Size']) expect(within(filters).getByRole('button', { name })).toBeInTheDocument();
    expect(within(filters).getByRole('textbox', { name: 'Search schemes...' })).toBeInTheDocument();
    for (const name of ['Finance Glossary', 'Product Taxonomy', 'FIBO']) {
      expect(within(filters).getByRole('checkbox', { name: new RegExp(`^${name}`) })).toBeChecked();
    }
    expect(within(filters).getByRole('textbox', { name: 'Group by' })).toHaveValue('None');
    expect(within(filters).getByRole('switch', { name: 'Show Properties' })).not.toBeChecked();
    // Scheme actions for a writer, with Delete off for an imported scheme
    expect(await menuItems(user, within(filters).getByRole('button', { name: 'Actions for Product Taxonomy' }))).toEqual(['Rename', 'Delete']);
    await user.keyboard('{Escape}');
    const fibo = await openMenu(user, within(filters).getByRole('button', { name: 'Actions for FIBO' }));
    const deleteFibo = within(fibo).getByRole('menuitem', { name: /^Delete/, hidden: true });
    expect(deleteFibo).toBeDisabled();
    expect(deleteFibo).toHaveTextContent('Imported — cannot delete');
    await user.keyboard('{Escape}');

    // The list: search, Status filter, select all, and per row Select and Edit; the pager
    const concepts = pane('Concepts');
    expect(within(concepts).getByRole('textbox', { name: 'Search concepts and terms...' })).toBeInTheDocument();
    expect(within(concepts).getByRole('button', { name: /^Status/ })).toBeInTheDocument();
    expect(within(concepts).getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
    expect(within(concepts).getAllByRole('checkbox', { name: 'Select' })).toHaveLength(3);
    expect(within(concepts).getAllByRole('button', { name: 'Edit' })).toHaveLength(3);
    expect(within(concepts).getByRole('combobox', { name: 'Rows per page' })).toBeInTheDocument();

    // A row opens its concept
    await user.click(within(concepts).getByText('Widgets'));
    expect(await screen.findByText('concept page')).toBeInTheDocument();
    expect(location.pathname).toBe(`/concepts/browser/${encodeURIComponent('urn:e2e:widgets')}`);
  });

  it('explore: the bulk Set status posts each selected concept; a writer has no Certify', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const concepts = pane('Concepts');
    await user.click(within(concepts).getAllByRole('checkbox', { name: 'Select' })[0]);
    expect(within(concepts).getByText('1 selected')).toBeInTheDocument();
    const setStatus = within(concepts).getByRole('button', { name: 'Set status' });
    const items = await menuItems(user, setStatus);
    expect(items).toEqual(['Submit for review', 'Approve', 'Publish', 'Deprecate', 'Archive']);
    await user.click(item('Approve'));
    await waitFor(() => expect(calls('POST')).toContain(`/api/knowledge/concepts/by-iri/approve?iri=${encodeURIComponent('urn:e2e:long')}`));
    await waitFor(() => expect(within(concepts).queryByText('1 selected')).toBeNull());
    // Clear empties the selection
    await user.click(within(concepts).getAllByRole('checkbox', { name: 'Select' })[1]);
    await user.click(within(concepts).getByRole('button', { name: 'Clear' }));
    expect(within(concepts).queryByText('1 selected')).toBeNull();
  });

  it('explore: an admin also gets Certify in Set status', async () => {
    grant(FeatureAccessLevel.ADMIN);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const concepts = pane('Concepts');
    await user.click(within(concepts).getAllByRole('checkbox', { name: 'Select' })[0]);
    expect(await menuItems(user, within(concepts).getByRole('button', { name: 'Set status' }))).toEqual([
      'Submit for review', 'Approve', 'Publish', 'Certify', 'Deprecate', 'Archive',
    ]);
  });

  it('explore keeps every control for a reader, without the write controls', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    await loaded();
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
    const filters = pane('Filters');
    expect(within(filters).getByRole('button', { name: /Filter by Source/ })).toBeInTheDocument();
    expect(within(filters).getByRole('checkbox', { name: /^Product Taxonomy/ })).toBeInTheDocument();
    expect(within(filters).queryByRole('button', { name: /^Actions for / })).toBeNull();
    const concepts = pane('Concepts');
    expect(within(concepts).getByRole('textbox', { name: 'Search concepts and terms...' })).toBeInTheDocument();
    expect(within(concepts).getByRole('button', { name: /^Status/ })).toBeInTheDocument();
    expect(within(concepts).getAllByRole('tab')).toHaveLength(3);
    // No bulk selection and no Edit: both write
    expect(within(concepts).queryByRole('checkbox')).toBeNull();
    expect(within(concepts).queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('explore: Advanced adds the knowledge-graph search (no longer "SPARQL", R57) and the system ontologies switch', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    expect(screen.queryByRole('button', { name: 'Knowledge graph' })).toBeNull();
    act(() => setMode('advanced'));
    const sparql = await screen.findByRole('button', { name: 'Knowledge graph' });
    expect(screen.queryByRole('button', { name: 'SPARQL' })).toBeNull();
    expect(sparql).toHaveAttribute('aria-pressed', 'false');
    expect(within(pane('Filters')).getByRole('switch', { name: 'Show system ontologies' })).not.toBeChecked();
    await user.click(sparql);
    const panel = pane('Knowledge graph search');
    expect(panel).toHaveClass(kit.pane);
    expect(within(panel).getByTestId('kg-search')).toBeInTheDocument();
    expect(sparql).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Knowledge graph search' })).toBeNull();
  });

  it('explore: a 200-character label keeps its title in the list and the tree', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    expect(within(pane('Concepts')).getByText(LONG_LABEL)).toHaveAttribute('title', LONG_LABEL);
    await user.click(screen.getByRole('tab', { name: 'Tree' }));
    expect(await within(pane('Concepts')).findByRole('tabpanel', { name: 'Tree' })).toBeInTheDocument();
    expect(within(pane('Concepts')).getByText(LONG_LABEL)).toHaveAttribute('title', LONG_LABEL);
  });

  it('explore: the graph view has a named toolbar and opens fullscreen on the kit Dialog', async () => {
    const user = userEvent.setup();
    renderPage('/concepts/browser?view=graph');
    const panel = await screen.findByRole('tabpanel', { name: 'Graph' });
    expect(within(panel).getByTestId('cytoscape')).toBeInTheDocument();
    expect(within(panel).getByRole('textbox', { name: 'Layout' })).toBeInTheDocument();
    for (const name of ['Groups', 'Node labels', 'Edge labels', 'Size', 'Spacing', 'Zoom Out', 'Zoom In', 'Fit to View', 'Reset Layout']) {
      expect(within(panel).getByRole('button', { name })).toBeInTheDocument();
    }
    await user.click(within(panel).getByRole('button', { name: 'Open Fullscreen' }));
    const dialog = await screen.findByRole('dialog', { name: 'View Graph' });
    expectKitDialog(dialog);
    expect(within(dialog).getByRole('textbox', { name: 'Layout' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Zoom In' })).toBeInTheDocument();
  });

  it('explore: Delete in a scheme\'s actions asks in an alertdialog, then deletes', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await menuItems(user, within(pane('Filters')).getByRole('button', { name: 'Actions for Product Taxonomy' }));
    await user.click(item('Delete'));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Scheme' });
    expectKitDialog(confirm);
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls('DELETE')).toEqual([`/api/knowledge/collections/${encodeURIComponent('urn:taxonomy:products')}`]));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Scheme deleted successfully' }));
  });
});

describe('explore empty and error states', () => {
  it('explore empty and error states keep their actions', async () => {
    const user = userEvent.setup();
    // Nothing yet: the empty state, with Create still in the header and Go to Define
    grouped = {};
    renderPage();
    const empty = await screen.findByTestId('explore-empty-state');
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(within(empty).getByRole('heading', { name: 'Nothing to explore yet' })).toBeInTheDocument();
    await user.click(within(empty).getByRole('button', { name: 'Go to Define' }));
    expect(await screen.findByText('define page')).toBeInTheDocument();
    cleanup();

    // A failed load: the error with Retry, and Create still in the header
    grouped = GROUPED;
    conceptsStatus = 500;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the concepts.');
    expect(alert).toHaveTextContent('The triple store is down');
    expect(consoleError).toHaveBeenCalledWith('Failed to fetch explore concepts:', expect.any(Error));
    consoleError.mockRestore();
    expect(screen.queryByTestId('explore-empty-state')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    conceptsStatus = 200;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Widgets')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explore: a successful quiet reload clears the error', async () => {
    conceptsStatus = 500;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the concepts.');
    // A save elsewhere (the header's Create still works) bumps the shared
    // nonce: the quiet reload succeeds, and the list replaces the error
    conceptsStatus = 200;
    act(() => useKnowledgeGraphStore.getState().bumpRefreshNonce('concept-create'));
    expect(await screen.findByText('Widgets')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    consoleError.mockRestore();
  });
});

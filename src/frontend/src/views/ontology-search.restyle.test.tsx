/**
 * Wave 2 Task 13b: Search (/concepts/search) on the page kit, with its three
 * tabs (components/search/concepts-search, properties-search, kg-search),
 * their Assign dialogs and the UC asset lookup on the kit Dialog. The look,
 * the long labels, the wide results and Escape in the stacked dialogs are
 * measured in a real browser in tests/e2e/concepts-search.spec.ts (ruling
 * R10); these tests check the structure, every control for a writer and a
 * reader, the permission gate, the URL state, and the empty, no-results and
 * error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, optionNames, pick, selectField } from '@/test/kit-dialog';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import OntologySearchView from './ontology-search';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LONG_LABEL = `Customer ${'lifetime-revenue-and-retention-measure-'.repeat(6)}`.slice(0, 200);

const CONCEPTS = [
  { value: 'urn:e2e:widgets', label: 'Widgets', type: 'class' },
  { value: 'urn:e2e:long', label: LONG_LABEL, type: 'class' },
];
const PROPERTIES = [{ value: 'urn:e2e:hasPrice', label: 'hasPrice', type: 'property' }];

const NEIGHBORS = [
  { direction: 'outgoing', predicate: 'http://www.w3.org/2000/01/rdf-schema#subClassOf', display: 'urn:e2e:products', displayType: 'resource', stepIri: 'urn:e2e:products', stepIsResource: true },
  { direction: 'incoming', predicate: 'http://www.w3.org/2000/01/rdf-schema#subClassOf', display: 'urn:e2e:gadgets', displayType: 'resource', stepIri: 'urn:e2e:gadgets', stepIsResource: true },
  { direction: 'outgoing', predicate: 'http://www.w3.org/2000/01/rdf-schema#comment', display: 'Things we sell', displayType: 'literal', stepIri: null, stepIsResource: false },
  { direction: 'incoming', predicate: 'http://www.w3.org/2000/01/rdf-schema#domain', display: 'urn:e2e:hasPrice', displayType: 'property', stepIri: 'urn:e2e:hasPrice', stepIsResource: true },
  { direction: 'outgoing', predicate: 'http://www.w3.org/2000/01/rdf-schema#range', display: 'urn:e2e:money', displayType: 'resource', stepIri: 'urn:e2e:money', stepIsResource: true },
];
const LINKS = [{ id: 'l1', entity_id: 'p1', entity_type: 'data_product', iri: 'urn:e2e:widgets' }];

let fetchMock: ReturnType<typeof vi.fn>;
/** Paths (no query) that answer 500 */
let failing = new Set<string>();

function mockBackend() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const q = url.searchParams.get('q') ?? '';
    if (failing.has(url.pathname)) return json({ detail: 'The triple store is down' }, 500);
    switch (url.pathname) {
      case '/api/semantic-models/concepts':
        return json(CONCEPTS.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())));
      case '/api/semantic-models/concepts/by-iri':
        return json({ concept: { iri: url.searchParams.get('iri'), label: CONCEPTS.find((c) => c.value === url.searchParams.get('iri'))?.label } });
      case '/api/semantic-models/properties':
        return json(PROPERTIES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()) || p.value === q));
      case '/api/semantic-models/neighbors':
        return json(NEIGHBORS);
      case '/api/semantic-links/by-iri':
        return json(url.searchParams.get('iri') === 'urn:e2e:widgets' ? LINKS : []);
      case '/api/semantic-links/':
        return json({ id: 'new' });
      case '/api/data-products/p1':
        return json({ id: 'p1', name: 'Sales Product' });
      case '/api/data-products':
        return json([{ id: 'p1', name: 'Sales Product' }, { id: 'p2', name: 'Ops Product' }]);
      case '/api/data-contracts':
        return json([{ id: 'c1', name: 'Orders Contract' }]);
      case '/api/data-contracts/c1':
        return json({ id: 'c1', name: 'Orders Contract', schema_objects: [{ name: 'orders', properties: [{ name: 'price' }] }] });
      case '/api/semantic-models/prefix':
        return json(q ? [{ value: 'urn:e2e:widgets', type: 'resource' }] : []);
      case '/api/semantic-models/query':
        return json([{ s: 'urn:e2e:widgets' }]);
      case '/api/catalogs':
        return json([{ id: 'main', name: 'main', type: 'catalog', hasChildren: true, children: [] }]);
      default:
        if (url.pathname.startsWith('/api/semantic-models/resources/')) {
          return json({ iri: 'urn:e2e:widgets', triples: [{ predicate: 'http://www.w3.org/2000/01/rdf-schema#label', object: 'Widgets', objectType: 'literal' }] });
        }
        return json(method === 'GET' ? [] : {});
    }
  });
  vi.stubGlobal('fetch', fetchMock);
}

const posts = () =>
  fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([input, init]) => ({ path: new URL(String(input), 'http://localhost').pathname, body: JSON.parse(String((init as RequestInit).body)) }));

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'semantic-models': level },
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

const renderPage = (route = '/concepts/search') =>
  renderWithMantine(
    <Routes>
      <Route path="/concepts/search" element={<><OntologySearchView /><Probe /></>} />
      <Route path="/data-products/:id" element={<><p>product page</p><Probe /></>} />
    </Routes>,
    { route },
  );

const pane = (name: string) => screen.getByRole('region', { name });
const params = () => new URLSearchParams(location.search);

/** Classes that look like Tailwind utilities, outside the ui Button and Badge (which stay, wave 6). */
function tailwindIn(root: HTMLElement): string[] {
  const utility = /^(?:[a-z]+:)*-?(?:flex|grid|hidden|inline|block|truncate|shrink|grow|items-|justify-|self-|gap-|space-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|min-|max-|text-|font-|bg-|border|rounded|shadow|leading-|tracking-|whitespace-|cursor-|opacity-|tabular-nums|uppercase|col-span|hover:|animate-)/;
  const found = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>('[class]')) {
    if (el.closest('.mantine-Badge-root, .mantine-Button-root')) continue;
    for (const c of el.classList) if (utility.test(c)) found.add(c);
  }
  return [...found];
}

async function searchConcept(user: ReturnType<typeof userEvent.setup>, text: string) {
  const search = within(pane('Concept search')).getByRole('textbox', { name: 'Type to search by name, label, or IRI...' });
  await user.clear(search);
  await user.type(search, text);
  return search;
}

/** Selects Widgets on the Concepts tab and waits for its panes. */
async function selectWidgets(user: ReturnType<typeof userEvent.setup>) {
  await searchConcept(user, 'Widg');
  await user.click(await within(pane('Concept search')).findByRole('button', { name: 'Widgets - urn:e2e:widgets' }));
  await screen.findByRole('region', { name: 'Widgets' });
  await within(pane('Concept relations')).findByRole('button', { name: /Sales Product/ });
}

beforeEach(() => {
  failing = new Set();
  mockBackend();
  grant(FeatureAccessLevel.READ_WRITE);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toast.mockClear();
});

describe('concepts-search on the page kit', () => {
  it('concepts-search renders with the page kit', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    // The shell owns the breadcrumb; the page draws the kit header and its description
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    const heading = screen.getByRole('heading', { level: 1, name: 'Search Concepts' });
    expect(heading.parentElement).toHaveClass(kit.header);
    expect(screen.getByText('Search and browse ontology concepts and properties')).toBeInTheDocument();

    // The tabs are kit tabs, over one panel for the active tab
    const tabs = screen.getByRole('tablist', { name: 'Search Concepts' });
    expect(tabs).toHaveClass(kit.tabList);
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Concepts', 'Properties', 'Knowledge Graph']);
    const panel = screen.getByRole('tabpanel', { name: 'Concepts' });

    // The search, then the concept and its relations, each a kit pane in a stack
    expect(within(panel).getByRole('region', { name: 'Concept search' })).toHaveClass(kit.pane);
    await selectWidgets(user);
    expect(pane('Widgets')).toHaveClass(kit.pane);
    expect(pane('Concept relations')).toHaveClass(kit.pane);
    expect(pane('Concept search').parentElement).toHaveClass(kit.stack);
    expect(pane('Widgets').parentElement).toBe(pane('Concept search').parentElement);
    for (const name of ['Concept Hierarchy', 'Related Properties', 'Linked Catalog Objects']) {
      expect(within(pane('Concept relations')).getByRole('heading', { name })).toBeInTheDocument();
    }

    expect(container.querySelector('.p-6, .py-6, .rounded-xl, .rounded-lg, .bg-card, [class*="shadow"]')).toBeNull();
    expect(tailwindIn(container)).toEqual([]);

    // The other two tabs draw kit panes too
    await user.click(within(tabs).getByRole('tab', { name: 'Properties' }));
    expect(within(screen.getByRole('tabpanel', { name: 'Properties' })).getByRole('region', { name: 'Property search' })).toHaveClass(kit.pane);
    await user.click(within(tabs).getByRole('tab', { name: 'Knowledge Graph' }));
    const kg = screen.getByRole('tabpanel', { name: 'Knowledge Graph' });
    for (const name of ['Prefix Search', 'Path Explorer', 'SPARQL']) {
      expect(within(kg).getByRole('region', { name })).toHaveClass(kit.pane);
    }
    expect(tailwindIn(container)).toEqual([]);
  });

  it('concepts-search keeps every control on the Concepts tab for a writer', async () => {
    const user = userEvent.setup();
    renderPage();

    // Search: results are buttons with the IRI in their title, and Clear
    await searchConcept(user, 'u');
    const search = pane('Concept search');
    const long = await within(search).findByRole('button', { name: `${LONG_LABEL} - urn:e2e:long` });
    expect(long).toHaveAttribute('title', 'urn:e2e:long');
    expect(within(search).getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    await waitFor(() => expect(params().get('query')).toBe('u'));

    await selectWidgets(user);
    expect(params().get('iri')).toBe('urn:e2e:widgets');
    // The concept: its IRI and its literal attributes
    const concept = pane('Widgets');
    expect(within(concept).getByText('urn:e2e:widgets')).toBeInTheDocument();
    expect(within(concept).getByText('Things we sell')).toBeInTheDocument();
    // Relations: parent and subclass buttons, properties, linked objects
    const relations = pane('Concept relations');
    expect(within(relations).getByRole('button', { name: 'urn:e2e:products' })).toHaveAttribute('title', 'urn:e2e:products');
    expect(within(relations).getByRole('button', { name: 'urn:e2e:gadgets' })).toBeInTheDocument();
    expect(within(relations).getByText('urn:e2e:hasPrice')).toBeInTheDocument();

    // Assign to Concept opens the kit dialog with the entity type and the entity
    await user.click(within(concept).getByRole('button', { name: 'Assign to Concept' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign Object to Concept' });
    expectKitDialog(dialog);
    const type = selectField(dialog, 'Entity Type');
    expect(await optionNames(user, type)).toEqual([
      'Data Product', 'Data Contract', 'Data Domain', 'Asset', 'UC Catalog', 'UC Schema', 'UC Table',
    ]);
    expect(within(dialog).getByRole('button', { name: 'Assign' })).toBeDisabled();
    await pick(user, type, 'Data Product');
    const entity = selectField(dialog, 'Data Product');
    await waitFor(async () => expect(await optionNames(user, entity)).toEqual(['Sales Product', 'Ops Product']));
    await pick(user, entity, 'Ops Product');
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(posts()).toContainEqual({
      path: '/api/semantic-links/', body: { entity_id: 'p2', entity_type: 'data_product', iri: 'urn:e2e:widgets' },
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assign Object to Concept' })).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' }));

    // A UC type opens the UC lookup, a kit dialog over the assign dialog
    await user.click(within(pane('Widgets')).getByRole('button', { name: 'Assign to Concept' }));
    const again = await screen.findByRole('dialog', { name: 'Assign Object to Concept' });
    await pick(user, selectField(again, 'Entity Type'), 'UC Table');
    expect(within(again).queryByRole('button', { name: 'Assign' })).toBeNull();
    await user.click(within(again).getByRole('button', { name: 'Browse UC Table...' }));
    const lookup = await screen.findByRole('dialog', { name: 'Select UC Table' });
    expect(await within(lookup).findByText('main')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Select UC Table' })).toBeNull());
    // Only the lookup closed; the type survives
    expect(screen.getByRole('dialog', { name: 'Assign Object to Concept' })).toBeInTheDocument();
    expect(selectField(screen.getByRole('dialog', { name: 'Assign Object to Concept' }), 'Entity Type')).toHaveValue('UC Table');

    // A linked object opens its page
    await user.click(within(screen.getByRole('dialog', { name: 'Assign Object to Concept' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(within(pane('Concept relations')).getByRole('button', { name: /Sales Product/ }));
    expect(await screen.findByText('product page')).toBeInTheDocument();
    expect(location.pathname).toBe('/data-products/p1');
  });

  it('concepts-search: Clear empties the search and the selection', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectWidgets(user);
    await user.click(within(pane('Concept search')).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('region', { name: 'Widgets' })).toBeNull();
    expect(within(pane('Concept search')).getByRole('textbox')).toHaveValue('');
    await waitFor(() => expect(params().get('iri')).toBeNull());
  });

  it('concepts-search: a deep link with ?iri= opens the concept', async () => {
    renderPage(`/concepts/search?iri=${encodeURIComponent('urn:e2e:widgets')}`);
    expect(await screen.findByRole('region', { name: 'Widgets' })).toBeInTheDocument();
  });

  it('concepts-search keeps every control on the Properties tab for a writer', async () => {
    const user = userEvent.setup();
    renderPage('/concepts/search?tab=properties');
    const search = within(pane('Property search')).getByRole('textbox', { name: 'Type to search by name, label, or IRI...' });
    await user.type(search, 'has');
    await user.click(await within(pane('Property search')).findByRole('button', { name: 'hasPrice - urn:e2e:hasPrice' }));
    const property = await screen.findByRole('region', { name: 'hasPrice' });
    expect(params().get('tab')).toBe('properties');
    expect(params().get('iri')).toBe('urn:e2e:hasPrice');
    const links = pane('Property links');
    expect(within(links).getByRole('heading', { name: 'Domain / Range' })).toBeInTheDocument();
    expect(within(links).getByRole('heading', { name: 'Linked Catalog Objects' })).toBeInTheDocument();
    expect(within(links).getByText('No catalog objects assigned.')).toBeInTheDocument();

    // Assign: a data contract property, picked contract → schema → property
    await user.click(within(property).getByRole('button', { name: 'Assign to Property' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign Object to Property' });
    expectKitDialog(dialog);
    const target = selectField(dialog, 'Target Type');
    expect(await optionNames(user, target)).toEqual(['Data Contract Property', 'UC Column', 'Asset']);
    await pick(user, target, 'Data Contract Property');
    await waitFor(async () => expect(await optionNames(user, selectField(dialog, 'Contract'))).toEqual(['Orders Contract']));
    await pick(user, selectField(dialog, 'Contract'), 'Orders Contract');
    await waitFor(async () => expect(await optionNames(user, selectField(dialog, 'Schema'))).toEqual(['orders']));
    await pick(user, selectField(dialog, 'Schema'), 'orders');
    await pick(user, selectField(dialog, 'Property'), 'price');
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(posts()).toContainEqual({
      path: '/api/semantic-links/', body: { entity_id: 'c1#orders#price', entity_type: 'data_contract_property', iri: 'urn:e2e:hasPrice' },
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assign Object to Property' })).toBeNull());

    // UC Column opens the lookup
    await user.click(within(pane('hasPrice')).getByRole('button', { name: 'Assign to Property' }));
    const again = await screen.findByRole('dialog', { name: 'Assign Object to Property' });
    await pick(user, selectField(again, 'Target Type'), 'UC Column');
    await user.click(within(again).getByRole('button', { name: 'Browse UC table and select column...' }));
    expect(await screen.findByRole('dialog', { name: 'Select UC Column' })).toBeInTheDocument();
  });

  it('concepts-search keeps every control on the Knowledge Graph tab', async () => {
    const user = userEvent.setup();
    renderPage('/concepts/search?tab=kg');
    const prefix = pane('Prefix Search');
    await user.type(within(prefix).getByRole('textbox', { name: 'Prefix Search' }), 'widg');
    await user.click(await within(prefix).findByRole('button', { name: 'Start path' }));
    await waitFor(() => expect(params().get('path')).toBe('urn:e2e:widgets'));

    const path = pane('Path Explorer');
    expect(within(path).getByRole('button', { name: 'urn:e2e:widgets' })).toHaveAttribute('title', 'urn:e2e:widgets');
    const direction = selectField(path, 'Direction Filter');
    expect(await optionNames(user, direction)).toEqual(['Everything', 'Incoming Only', 'Outgoing Only']);
    expect(within(path).getByRole('switch', { name: 'Show concepts/classes only' })).not.toBeChecked();
    expect((await within(path).findAllByRole('button', { name: 'Step' })).length).toBeGreaterThan(0);
    expect(await within(path).findByRole('heading', { name: 'Resource detail' })).toBeInTheDocument();
    await pick(user, direction, 'Incoming Only');
    await waitFor(() => expect(params().get('direction')).toBe('incoming'));
    await user.click(within(path).getByRole('switch', { name: 'Show concepts/classes only' }));
    await waitFor(() => expect(params().get('concepts_only')).toBe('true'));

    // SPARQL: the examples menu fills the query; Run posts it and shows the rows
    const sparql = pane('SPARQL');
    await user.click(within(sparql).getByRole('button', { name: 'Examples' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Subjects and their types', hidden: true }));
    expect(within(sparql).getByRole('textbox', { name: 'SPARQL' })).toHaveValue('SELECT ?s ?type WHERE { ?s a ?type } LIMIT 100');
    await user.click(within(sparql).getByRole('button', { name: 'Run SPARQL' }));
    await waitFor(() => expect(posts()).toContainEqual({ path: '/api/semantic-models/query', body: { sparql: 'SELECT ?s ?type WHERE { ?s a ?type } LIMIT 100' } }));
    expect(await within(sparql).findByText(/"s": "urn:e2e:widgets"/)).toBeInTheDocument();
  });

  it('concepts-search: the tabs keep ?tab= in the URL', async () => {
    const user = userEvent.setup();
    renderPage('/concepts/search?tab=properties');
    expect(screen.getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Knowledge Graph' }));
    expect(params().get('tab')).toBe('kg');
    await user.click(screen.getByRole('tab', { name: 'Concepts' }));
    expect(params().get('tab')).toBeNull();
    expect(screen.getByRole('tabpanel', { name: 'Concepts' })).toBeInTheDocument();
  });

  it('concepts-search keeps every control for a reader, without Assign', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    const user = userEvent.setup();
    renderPage();
    await selectWidgets(user);
    // Linking writes (POST /api/semantic-links/ needs semantic-models READ_WRITE)
    expect(screen.queryByRole('button', { name: 'Assign to Concept' })).toBeNull();
    expect(within(pane('Concept relations')).getByRole('button', { name: 'urn:e2e:products' })).toBeInTheDocument();
    expect(within(pane('Concept search')).getByRole('button', { name: 'Clear' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Properties' }));
    // The tab keeps ?query= and ?iri=, as before: Clear starts a new search
    await user.click(await within(pane('Property search')).findByRole('button', { name: 'Clear' }));
    await user.type(within(pane('Property search')).getByRole('textbox'), 'has');
    await user.click(await within(pane('Property search')).findByRole('button', { name: 'hasPrice - urn:e2e:hasPrice' }));
    await screen.findByRole('region', { name: 'hasPrice' });
    expect(screen.queryByRole('button', { name: 'Assign to Property' })).toBeNull();
  });
});

describe('concepts-search empty, no-results and error states keep their actions', () => {
  it('Concepts: no results says so and keeps Clear', async () => {
    const user = userEvent.setup();
    renderPage();
    await searchConcept(user, 'zzz');
    const search = pane('Concept search');
    expect(await within(search).findByText('No results found')).toBeInTheDocument();
    expect(within(search).getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('Concepts: a failed search shows the error and Retry, which searches again', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    failing.add('/api/semantic-models/concepts');
    const user = userEvent.setup();
    renderPage();
    await searchConcept(user, 'Widg');
    const search = pane('Concept search');
    const alert = await within(search).findByRole('alert');
    expect(alert).toHaveTextContent('The search failed.');
    expect(alert).toHaveTextContent('The triple store is down');
    expect(within(search).queryByText('No results found')).toBeNull();
    failing.delete('/api/semantic-models/concepts');
    await user.click(within(search).getByRole('button', { name: 'Retry' }));
    expect(await within(search).findByRole('button', { name: 'Widgets - urn:e2e:widgets' })).toBeInTheDocument();
    expect(within(search).queryByRole('alert')).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('Concepts: a failed concept load shows the error and Retry', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    failing.add('/api/semantic-models/neighbors');
    const user = userEvent.setup();
    renderPage();
    await searchConcept(user, 'Widg');
    await user.click(await within(pane('Concept search')).findByRole('button', { name: 'Widgets - urn:e2e:widgets' }));
    const concept = await screen.findByRole('region', { name: 'Widgets' });
    const alert = await within(concept).findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the details.');
    // A failed load isn't shown as "nothing found"
    expect(screen.queryByText('No parent classes found')).toBeNull();
    failing.delete('/api/semantic-models/neighbors');
    await user.click(within(concept).getByRole('button', { name: 'Retry' }));
    expect(await within(pane('Concept relations')).findByRole('button', { name: 'urn:e2e:products' })).toBeInTheDocument();
    expect(within(pane('Widgets')).queryByRole('alert')).toBeNull();
    spy.mockRestore();
  });

  it('Concepts: a concept with no relations says so in each column', async () => {
    const user = userEvent.setup();
    renderPage();
    await searchConcept(user, 'Customer');
    await user.click(await within(pane('Concept search')).findByRole('button', { name: `${LONG_LABEL} - urn:e2e:long` }));
    // Long labels truncate with the whole label in the title
    const concept = await screen.findByRole('region', { name: LONG_LABEL });
    expect(within(concept).getByRole('heading', { name: LONG_LABEL })).toHaveAttribute('title', LONG_LABEL);
    expect(within(pane('Concept relations')).getByText('No catalog objects assigned.')).toBeInTheDocument();
    expect(within(concept).getByRole('button', { name: 'Assign to Concept' })).toBeInTheDocument();
  });

  it('Properties: a failed search shows the error and Retry; no results says so', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    failing.add('/api/semantic-models/properties');
    const user = userEvent.setup();
    renderPage('/concepts/search?tab=properties');
    const field = within(pane('Property search')).getByRole('textbox');
    await user.type(field, 'has');
    expect(await within(pane('Property search')).findByRole('alert')).toHaveTextContent('The search failed.');
    failing.delete('/api/semantic-models/properties');
    await user.click(within(pane('Property search')).getByRole('button', { name: 'Retry' }));
    expect(await within(pane('Property search')).findByRole('button', { name: 'hasPrice - urn:e2e:hasPrice' })).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, 'zzz');
    expect(await within(pane('Property search')).findByText('No results found')).toBeInTheDocument();
    expect(within(pane('Property search')).getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('Knowledge Graph: failed prefix, path and SPARQL loads show the error and a way to retry', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    failing.add('/api/semantic-models/prefix');
    const user = userEvent.setup();
    renderPage(`/concepts/search?tab=kg&path=${encodeURIComponent('urn:e2e:widgets')}`);
    const prefix = pane('Prefix Search');
    expect(await within(prefix).findByRole('alert')).toHaveTextContent('The search failed.');
    failing.delete('/api/semantic-models/prefix');
    await user.click(within(prefix).getByRole('button', { name: 'Retry' }));
    expect(await within(prefix).findByRole('button', { name: 'Start path' })).toBeInTheDocument();

    // The path's links
    failing.add('/api/semantic-models/neighbors');
    await user.click(within(prefix).getByRole('button', { name: 'Start path' }));
    const path = pane('Path Explorer');
    expect(await within(path).findByRole('alert')).toHaveTextContent('Could not load the details.');
    expect(within(path).queryByText('No outgoing links for current selection.')).toBeNull();
    failing.delete('/api/semantic-models/neighbors');
    await user.click(within(path).getByRole('button', { name: 'Retry' }));
    expect((await within(path).findAllByRole('button', { name: 'Step' })).length).toBeGreaterThan(0);

    // SPARQL: the error, and Run stays to run it again
    failing.add('/api/semantic-models/query');
    const sparql = pane('SPARQL');
    await user.click(within(sparql).getByRole('button', { name: 'Run SPARQL' }));
    expect(await within(sparql).findByRole('alert')).toHaveTextContent('The triple store is down');
    failing.delete('/api/semantic-models/query');
    await user.click(within(sparql).getByRole('button', { name: 'Run SPARQL' }));
    expect(await within(sparql).findByText(/"s": "urn:e2e:widgets"/)).toBeInTheDocument();
    expect(within(sparql).queryByRole('alert')).toBeNull();
    spy.mockRestore();
  });
});

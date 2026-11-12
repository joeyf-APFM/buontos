/**
 * Wave 2 Task 15: concept detail (/concepts/browser/*) on the page kit, with
 * its panels (the summary, relations, linked entities, version history and
 * Turtle) and the page's own dialogs (Submit for review, Request changes).
 * The look, the long label and IRI, the long relation list scrolling inside
 * its pane and the neighbourhood graph are measured in a real browser in
 * tests/e2e/concept-detail.spec.ts (ruling R10); these tests check the
 * structure, every control for a writer and a reader, the URL, the
 * breadcrumb, and the not-found, error and empty states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { FeatureAccessLevel } from '@/types/settings';
import ConceptDetailView from './concept-detail';

// The shared panels and the dialogs other tasks own are consumed as they are
const { Stub } = vi.hoisted(() => ({ Stub: () => null }));
vi.mock('@/components/common/ownership-panel', () => ({
  OwnershipPanel: ({ canAssign }: { canAssign: boolean }) => <p data-testid="ownership">{canAssign ? 'assign' : 'read'}</p>,
}));
vi.mock('@/components/metadata/entity-metadata-panel', () => ({
  default: ({ canEdit }: { canEdit: boolean }) => <p data-testid="metadata">{canEdit ? 'edit' : 'read'}</p>,
}));
vi.mock('@/components/comments', () => ({
  CommentSidebar: ({ onToggle }: { onToggle: () => void }) => <button type="button" onClick={onToggle}>Comments</button>,
}));
const { editorProps } = vi.hoisted(() => ({ editorProps: [] as Array<{ open: boolean }> }));
vi.mock('@/components/knowledge/concept-editor-dialog', () => ({
  ConceptEditorDialog: (props: { open: boolean }) => { editorProps.push(props); return null; },
}));
vi.mock('@/components/workflows/approval-wizard-dialog', () => ({ default: Stub }));
// The reactflow canvas is measured in the browser
vi.mock('@/components/semantic/concept-neighborhood-graph', () => ({
  default: () => <div data-testid="concept-neighborhood-graph" />,
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const IRI = 'http://example.org/concepts/Customer';
const SCHEME = 'urn:scheme:sales';
const LONG_LABEL = `Customer ${'lifetime-revenue-and-retention-concept-'.repeat(6)}`.slice(0, 200);

const concept = (extra: Record<string, unknown> = {}) => ({
  iri: IRI,
  label: 'Customer',
  labels: {},
  comments: { en: 'A party that buys goods.' },
  concept_type: 'class',
  status: 'draft',
  source_context: SCHEME,
  parent_concepts: ['http://example.org/concepts/Party'],
  child_concepts: ['http://example.org/concepts/RetailCustomer'],
  synonyms: ['Client'],
  examples: ['Retail shopper'],
  created_at: '2026-10-01T09:00:00Z',
  ...extra,
});

const NEIGHBORS = [
  { direction: 'outgoing', predicate: 'http://www.w3.org/2004/02/skos/core#related', display: 'http://example.org/concepts/Account', displayType: 'resource', stepIri: 'http://example.org/concepts/Account', stepIsResource: true },
];
const LINKS = [{ id: 'link-1', entity_id: 'p1', entity_type: 'data_product', iri: IRI }];
const VERSIONS = {
  iri: IRI, label: 'Customer', current_version: 2, versions: [
    { version: 2, is_current: true, created_at: '2026-10-05T09:00:00Z', created_by: 'ann@example.com' },
    { version: 1, is_current: false, created_at: '2026-10-01T09:00:00Z', created_by: 'ann@example.com' },
  ], replaced_by_iris: [],
};

let fetchMock: ReturnType<typeof vi.fn>;
let current: Record<string, unknown> | null = concept();
let conceptStatus = 200;
let conceptDetail = 'The graph store is down';
let editable = true;
let links: unknown[] = LINKS;
let neighbors: unknown[] = NEIGHBORS;

function mockBackend() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    switch (url.pathname) {
      case '/api/semantic-models/concepts/by-iri':
        if (conceptStatus !== 200) return json({ detail: conceptDetail }, conceptStatus);
        return json(current ? { concept: current } : {});
      case '/api/knowledge/collections':
        return json({ collections: [{ iri: SCHEME, label: 'Sales Glossary', is_editable: editable, source_key: SCHEME, child_collections: [] }] });
      case '/api/semantic-models/concepts/version':
        return json(VERSIONS);
      case '/api/semantic-models/concepts/version/detail':
        return json({ definition: 'An older definition.' });
      case '/api/semantic-models/neighbors':
        return json(neighbors);
      case '/api/semantic-links/by-iri':
        return json(links);
      case '/api/data-products/p1':
        return json({ id: 'p1', name: 'Sales orders' });
      case '/api/semantic-models/query':
        return json([{ p: 'http://www.w3.org/2000/01/rdf-schema#label', o: 'Customer' }]);
      case '/api/workflows/for-trigger/for_request_status_change':
        return json({ detail: 'none' }, 404);
      case '/api/knowledge/concepts/by-iri/submit-review/preview':
        return json({ governed: false, workflow_names: [], workflow_count: 0 });
      case '/api/knowledge/concepts/by-iri/submit-review':
        return json({ governed: false });
      case '/api/knowledge/concepts/by-iri':
        if (method === 'DELETE') return json({});
        return json({});
      default:
        return json([]);
    }
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = () =>
  fetchMock.mock.calls.map(([input, init]) => {
    const url = new URL(String(input), 'http://localhost');
    return `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url.pathname}`;
  });

function grant(level: FeatureAccessLevel, others: Record<string, FeatureAccessLevel> = {}) {
  usePermissionsStore.setState({
    permissions: { 'semantic-models': level, 'data-domains': level, 'business-owners': level, ...others },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

let location = { pathname: '' };
function Probe() {
  const l = useLocation();
  useEffect(() => {
    location = { pathname: l.pathname };
  });
  return null;
}

const renderPage = (iri = IRI) =>
  renderWithMantine(
    <Routes>
      <Route path="/concepts/browser" element={<><p>explore page</p><Probe /></>} />
      <Route path="/concepts/browser/*" element={<><ConceptDetailView /><Probe /></>} />
    </Routes>,
    { route: `/concepts/browser/${encodeURIComponent(iri)}` },
  );

const loaded = () => screen.findByRole('heading', { level: 1, name: 'Customer' });
const pane = (name: string) => screen.getByRole('region', { name });

/** Classes that look like Tailwind utilities, outside the ui Button and Badge (which stay, wave 6). */
function tailwindIn(root: HTMLElement): string[] {
  const utility = /^(?:[a-z]+:)*-?(?:flex|grid|hidden|inline|block|truncate|shrink|grow|items-|justify-|self-|gap-|space-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|min-|max-|text-|font-|bg-|border|rounded|shadow|leading-|tracking-|whitespace-|cursor-|opacity-|tabular-nums|uppercase|animate-|divide-|list-|break-)/;
  const found = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>('[class]')) {
    if (el.closest('.mantine-Badge-root, .mantine-Button-root')) continue;
    for (const c of el.classList) if (utility.test(c)) found.add(c);
  }
  return [...found];
}

function expectNoOldMarkup(root: HTMLElement) {
  expect(root.querySelector('.p-6, .py-6, .py-4, .bg-card, .rounded-lg, .shadow-sm, [class*="card"]')).toBeNull();
  expect(tailwindIn(root)).toEqual([]);
}

beforeEach(() => {
  current = concept();
  conceptStatus = 200;
  conceptDetail = 'The graph store is down';
  editable = true;
  links = LINKS;
  neighbors = NEIGHBORS;
  editorProps.length = 0;
  document.documentElement.setAttribute('data-mode', 'simple');
  mockBackend();
  grant(FeatureAccessLevel.READ_WRITE);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-mode');
});

describe('concept-detail renders with the page kit', () => {
  it('has the kit header and one column of panes, and no old markup', async () => {
    const { container } = renderPage();
    const h1 = await loaded();
    expect(h1.parentElement).toHaveClass(kit.header);
    expect(h1).toHaveAttribute('title', 'Customer');
    await within(pane('Linked Entities')).findByRole('button', { name: 'Sales orders' });
    await within(pane('Version history')).findByText(/on 10\/1\/2026/);

    const names = ['Summary', 'Definition', 'Owners', 'Details', 'Hierarchy', 'Linked Entities', 'Version history', 'Relations', 'RDF (Turtle)', 'Metadata'];
    const panes = names.map(pane);
    const stack = panes[0].parentElement!;
    expect(stack).toHaveClass(kit.stack);
    // In this order, every one a kit pane in the one stack, Metadata last
    expect([...stack.children]).toEqual(panes);
    for (const p of panes) expect(p).toHaveClass(kit.pane);
    // Turtle is Advanced only (index.css hides .adv-only in Simple)
    expect(pane('RDF (Turtle)')).toHaveClass('adv-only');
    expectNoOldMarkup(container);
  });

  it('puts the page name in the breadcrumb, and clears it on leave', async () => {
    const { unmount } = renderPage();
    await loaded();
    expect(useBreadcrumbStore.getState().dynamicTitle).toBe('Customer');
    expect(useBreadcrumbStore.getState().staticSegments.map((s) => s.path)).toEqual(['/concepts', '/concepts/browser']);
    unmount();
    expect(useBreadcrumbStore.getState().dynamicTitle).toBeNull();
  });
});

describe('concept-detail keeps every control', () => {
  it('for a writer on a draft in an editable scheme', async () => {
    const user = userEvent.setup();
    renderPage();
    const h1 = await loaded();
    const header = h1.parentElement!;
    for (const name of ['Back to Concepts', 'Request', 'Edit', 'Delete', 'Comments']) {
      expect(within(header).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByTestId('ownership')).toHaveTextContent('assign');
    expect(screen.getByTestId('metadata')).toHaveTextContent('edit');

    // Edit opens the editor
    await user.click(within(header).getByRole('button', { name: 'Edit' }));
    expect(editorProps[editorProps.length - 1]?.open).toBe(true);

    // The hierarchy chips are buttons, and open their concept
    const hierarchy = pane('Hierarchy');
    await user.click(within(hierarchy).getByRole('button', { name: 'Party' }));
    expect(location.pathname).toBe(`/concepts/browser/${encodeURIComponent('http://example.org/concepts/Party')}`);
  });

  it('Delete removes the concept and goes back to Explore', async () => {
    const user = userEvent.setup();
    renderPage();
    const h1 = await loaded();
    await user.click(within(h1.parentElement!).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(location.pathname).toBe('/concepts/browser'));
    expect(calls()).toContain('DELETE /api/knowledge/concepts/by-iri');
  });

  it('Request review opens Submit for review on the kit, which submits', async () => {
    const user = userEvent.setup();
    renderPage();
    const h1 = await loaded();
    await user.click(within(h1.parentElement!).getByRole('button', { name: 'Request' }));
    const action = await screen.findByRole('dialog', { name: 'Request Action' });
    await user.click(within(action).getByRole('button', { name: 'Request Review' }));
    const dialog = await screen.findByRole('dialog', { name: 'Submit for Review' });
    expect(dialog).toHaveClass('mantine-Modal-content');
    expect(await within(dialog).findByText(/No approval workflow is attached/)).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes (optional)' }), 'Check it');
    await user.click(within(dialog).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Submit for Review' })).toBeNull());
    const submit = fetchMock.mock.calls.find(([input]) => String(input).includes('/by-iri/submit-review?'));
    expect(JSON.parse(String((submit![1] as RequestInit).body))).toEqual({ notes: 'Check it' });
  });

  it('linked entities: Add, Open and Remove for a writer', async () => {
    renderPage();
    await loaded();
    const linked = pane('Linked Entities');
    await within(linked).findByRole('button', { name: 'Sales orders' });
    expect(within(linked).getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(within(linked).getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(within(linked).getByRole('button', { name: 'Remove linked entity' })).toBeInTheDocument();
    // The fold is a button with its state
    expect(within(linked).getByRole('button', { name: /^Linked Entities/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('the Relations block folds, and switches between List and Graph', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const relations = pane('Relations');
    const fold = within(relations).getByRole('button', { name: 'Relations' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    await within(relations).findByRole('button', { name: 'Account' });
    await user.click(within(relations).getByRole('tab', { name: 'Graph' }));
    expect(within(relations).getByRole('tab', { name: 'Graph' })).toHaveAttribute('aria-selected', 'true');
    expect(within(relations).getByTestId('concept-neighborhood-graph')).toBeInTheDocument();
    await user.click(within(relations).getByRole('tab', { name: 'List' }));
    await user.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(within(relations).queryByRole('tab', { name: 'Graph' })).toBeNull();
    await user.click(fold);
    await user.click(await within(relations).findByRole('button', { name: 'Account' }));
    expect(location.pathname).toBe(`/concepts/browser/${encodeURIComponent('http://example.org/concepts/Account')}`);
  });

  it('a previous version shows its definition', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const versions = pane('Version history');
    await user.click(await within(versions).findByRole('button', { name: /on 10\/1\/2026/ }));
    expect(await within(versions).findByText('An older definition.')).toBeInTheDocument();
  });

  it('Advanced: the IRI chip with Copy, the type and IRI rows, and Turtle with Copy', async () => {
    document.documentElement.setAttribute('data-mode', 'advanced');
    renderPage();
    await loaded();
    const summary = pane('Summary');
    expect(within(summary).getByRole('button', { name: 'Copy IRI' })).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Open IRI' })).toHaveAttribute('href', IRI);
    expect(within(summary).getByText(IRI)).toHaveAttribute('title', IRI);
    const details = pane('Details');
    expect(within(details).getByText(IRI)).toHaveAttribute('title', IRI);
    const turtle = pane('RDF (Turtle)');
    expect(await within(turtle).findByText(/rdf-schema#label> "Customer" \./)).toBeInTheDocument();
    expect(within(turtle).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('for a reader: no write controls', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    const h1 = await loaded();
    const header = h1.parentElement!;
    expect(within(header).getByRole('button', { name: 'Back to Concepts' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Comments' })).toBeInTheDocument();
    for (const name of ['Request', 'Edit', 'Delete']) {
      expect(within(header).queryByRole('button', { name })).toBeNull();
    }
    const linked = pane('Linked Entities');
    await within(linked).findByRole('button', { name: 'Sales orders' });
    expect(within(linked).queryByRole('button', { name: 'Add' })).toBeNull();
    expect(within(linked).queryByRole('button', { name: 'Remove linked entity' })).toBeNull();
    expect(screen.getByTestId('ownership')).toHaveTextContent('read');
    expect(screen.getByTestId('metadata')).toHaveTextContent('read');
  });

  // Ruling R66: the owner routes check business-owners write
  it('Assign Owner needs business-owners write as well as semantic-models', async () => {
    grant(FeatureAccessLevel.READ_WRITE, { 'business-owners': FeatureAccessLevel.READ_ONLY });
    renderPage();
    await loaded();
    expect(screen.getByTestId('ownership')).toHaveTextContent('read');
    // The rest of the page keeps its writes
    expect(within(pane('Linked Entities')).getByRole('button', { name: 'Add' })).toBeInTheDocument();
    cleanup();

    grant(FeatureAccessLevel.READ_ONLY, { 'business-owners': FeatureAccessLevel.READ_WRITE });
    renderPage();
    await loaded();
    expect(screen.getByTestId('ownership')).toHaveTextContent('read');
  });

  it('a published concept in a read-only scheme offers no lifecycle and shows the versioning note', async () => {
    current = concept({ status: 'published' });
    editable = false;
    renderPage();
    const h1 = await loaded();
    expect(within(h1.parentElement!).queryByRole('button', { name: 'Request' })).toBeNull();
    expect(within(h1.parentElement!).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(await within(pane('Version history')).findByTestId('version-history-readonly-note')).toBeInTheDocument();
  });
});

describe('concept-detail long text (Review Focus 1)', () => {
  it('a 200-character label keeps its title in the header', async () => {
    current = concept({ labels: { en: LONG_LABEL } });
    renderPage();
    const h1 = await screen.findByRole('heading', { level: 1, name: LONG_LABEL });
    expect(h1).toHaveAttribute('title', LONG_LABEL);
  });
});

describe('concept-detail states (Review Focus 2)', () => {
  it('a failed load shows an Alert with Retry and Back; Retry loads the concept', async () => {
    const user = userEvent.setup();
    conceptStatus = 500;
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The graph store is down');
    expect(screen.getByRole('button', { name: 'Back to Concepts' })).toBeInTheDocument();
    conceptStatus = 200;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await loaded();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a concept that is not there: a notice with Back, no Retry; Back goes to Explore', async () => {
    const user = userEvent.setup();
    current = null;
    renderPage();
    expect(await screen.findByText('Concept not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to Concepts' }));
    expect(location.pathname).toBe('/concepts/browser');
  });

  // Review fix round 1, finding 3: only the backend's own "Concept not found"
  // is a missing concept; another 404 (an unrouted path mid-deploy) keeps Retry
  it('the backend\'s 404 "Concept not found" is the notice, with no Retry', async () => {
    conceptStatus = 404;
    conceptDetail = 'Concept not found';
    renderPage();
    expect(await screen.findByText('Concept not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('a generic 404 "Not Found" is a failed load, with Retry', async () => {
    const user = userEvent.setup();
    conceptStatus = 404;
    conceptDetail = 'Not Found';
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not Found');
    conceptStatus = 200;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await loaded();
  });

  it('empty sections keep their text and their actions', async () => {
    current = concept({ parent_concepts: [], child_concepts: [], comments: {} });
    links = [];
    neighbors = [];
    renderPage();
    await loaded();
    expect(within(pane('Hierarchy')).getByText('No broader or narrower concepts.')).toBeInTheDocument();
    const linked = pane('Linked Entities');
    expect(await within(linked).findByText('No entities linked to this concept.')).toBeInTheDocument();
    expect(within(linked).getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(await within(pane('Relations')).findByText(/No concept-to-concept relations yet/)).toBeInTheDocument();
    // No definition: no Definition pane
    expect(screen.queryByRole('region', { name: 'Definition' })).toBeNull();
  });

  it('a refetch from another view is quiet: the page stays while it reloads', async () => {
    const { useKnowledgeGraphStore } = await import('@/stores/knowledge-graph-store');
    renderPage();
    await loaded();
    act(() => useKnowledgeGraphStore.getState().bumpRefreshNonce('elsewhere'));
    expect(screen.getByRole('heading', { level: 1, name: 'Customer' })).toBeInTheDocument();
    await waitFor(() => expect(calls().filter((c) => c === 'GET /api/semantic-models/concepts/by-iri')).toHaveLength(2));
  });
});

/**
 * Wave 2 Task 12b: the Ontology Generator (/concepts/generator) on the page
 * kit. The look (the 16px title, the 300px settings column, wrapping and
 * truncation, the wide tables scrolling in their pane, no horizontal page
 * scroll) is measured in a real browser in tests/e2e/concepts-generator.spec.ts
 * (ruling R10); these tests check the structure, every control for a writer
 * and a reader, the run, the save dialog, and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, selectField } from '@/test/kit-dialog';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import OntologyGeneratorView from './ontology-generator';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

// The schema browser is consumed as it is (its look is the wave-1 importer's):
// a stand-in that picks one table
vi.mock('@/components/schema-importer/schema-browser', () => ({
  default: ({ connectionId, onSelectionChange }: { connectionId: string | null; onSelectionChange: (p: Set<string>) => void }) => (
    <div data-testid="schema-browser" data-connection={connectionId ?? ''}>
      <button type="button" onClick={() => onSelectionChange(new Set(['gold.sales.orders']))}>pick a table</button>
    </div>
  ),
}));

const LONG_NAME = `Enterprise ${'customer-order-fulfilment-ontology-'.repeat(7)}`.slice(0, 200);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const CONNECTION = { id: 'conn-1', name: 'Workspace catalog', connector_type: 'databricks', enabled: true };
const params = (connection_name: string) => ({ connection_id: 'conn-1', connection_name, path_count: 2, guidelines: 'Model the sales domain', base_uri: '', options: {} });
const RUNS = [
  { run_id: 'run-done', status: 'completed', params: params('Workspace catalog'), step_count: 3, created_at: '2026-11-09T11:00:00Z', completed_at: '2026-11-09T11:04:00Z' },
  { run_id: 'run-failed', status: 'failed', error: 'The model timed out', params: params(LONG_NAME), step_count: 0, created_at: '2026-11-09T09:00:00Z' },
];
const RESULT = {
  success: true,
  owl_content: '@prefix : <urn:x#> .',
  classes: [
    { uri: 'urn:c1', name: 'Customer', label: 'Customer', comment: LONG_NAME, emoji: '', parent: '', dataProperties: [{ name: 'customer_id', label: 'id', uri: 'urn:p1' }] },
  ],
  properties: [{ uri: 'urn:op1', name: 'placedBy', label: 'placed by', comment: '', type: 'ObjectProperty', domain: 'Order', range: 'Customer' }],
  ontology_info: { uri: 'urn:x', label: 'Sales', comment: '', namespace: 'urn:x#' },
  constraints: [],
  axioms: [],
  steps: [{ step_type: 'tool_call', content: 'list_tables(gold.sales)', tool_name: 'list_tables', duration_ms: 120 }],
  iterations: 2,
  error: '',
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};

let fetchMock: ReturnType<typeof vi.fn>;
type Backend = {
  connections?: unknown;
  connectionsStatus?: number;
  runs?: unknown;
  runsStatus?: number;
  save?: unknown;
};

function mockBackend({ connections = [CONNECTION], connectionsStatus = 200, runs = RUNS, runsStatus = 200, save }: Backend = {}) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/connections') return json(connectionsStatus === 200 ? connections : { detail: 'Connections exploded' }, connectionsStatus);
    if (url.pathname === '/api/ontology/runs') return json(runsStatus === 200 ? { runs } : { detail: 'Runs exploded' }, runsStatus);
    if (url.pathname === '/api/ontology/runs/run-done' && method === 'GET') return json({ ...RUNS[0], steps: RESULT.steps, result: RESULT });
    if (url.pathname === '/api/ontology/runs/run-new' && method === 'GET') return json({ ...RUNS[0], run_id: 'run-new', steps: RESULT.steps, result: RESULT });
    if (url.pathname.startsWith('/api/ontology/runs/') && method === 'DELETE') return json({ ok: true });
    if (url.pathname === '/api/ontology/generate-from-connection') return json({ run_id: 'run-new', status: 'pending' });
    if (url.pathname === '/api/ontology/save-to-collection') {
      return json(save ?? { success: true, collection_iri: 'urn:sales', triples_imported: 12, error: '' });
    }
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (path: string, method = 'GET') =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === path && ((init as RequestInit | undefined)?.method ?? 'GET') === method);

const RW = FeatureAccessLevel.READ_WRITE;
const RO = FeatureAccessLevel.READ_ONLY;

/** The user's levels: the page's writes need ontology write (the backend's check). */
function grant(permissions: Record<string, FeatureAccessLevel>) {
  usePermissionsStore.setState({
    permissions,
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = (route = '/concepts/generator') =>
  renderWithMantine(
    <Routes>
      <Route path="/concepts/generator" element={<OntologyGeneratorView />} />
    </Routes>,
    { route },
  );

const pane = (name: string) => screen.getByRole('region', { name });
const loaded = async () => {
  await waitFor(() => expect(selectField(pane('Connection'), 'Connection')).toHaveValue('Workspace catalog'));
  await waitFor(() => expect(calls('/api/ontology/runs').length).toBeGreaterThan(0));
};

/** Opens Recent Runs and loads the completed run. */
async function loadRun(user: ReturnType<typeof userEvent.setup>) {
  const toggle = within(pane('Recent Runs')).getByRole('button', { name: /^Recent Runs/ });
  if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle);
  await user.click(within(pane('Recent Runs')).getByRole('button', { name: /^Workspace catalog/ }));
  return within(await screen.findByRole('region', { name: 'Results' }));
}

/** Classes that look like Tailwind utilities, outside the ui Button and Badge (which stay, wave 6) and the schema browser. */
function tailwindIn(root: HTMLElement): string[] {
  const utility = /^(?:[a-z]+:)*-?(?:flex|grid|hidden|inline|block|truncate|shrink|grow|items-|justify-|self-|gap-|space-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|min-|max-|text-|font-|bg-|border|rounded|shadow|leading-|tracking-|whitespace-|cursor-|opacity-|tabular-nums|uppercase|animate-|ring-|line-clamp)/;
  const found = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>('[class]')) {
    if (el.closest('.mantine-Badge-root, .mantine-Button-root, [data-testid="schema-browser"]')) continue;
    for (const c of el.classList) if (utility.test(c)) found.add(c);
  }
  return [...found];
}

describe('the ontology generator on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    grant({ ontology: RW, 'semantic-models': RW });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    toast.mockClear();
  });

  it('ontology generator renders with the page kit', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await loaded();

    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    const heading = screen.getByRole('heading', { level: 1, name: 'Ontology Generator' });
    expect(heading.parentElement).toHaveClass(kit.header);
    expect(screen.getByText('Browse a remote system, select tables, and generate an OWL ontology from their schemas.')).toBeInTheDocument();

    // The settings column and the resources, each a stack of kit panes
    for (const name of ['Connection', 'Generation Options', 'Run', 'Recent Runs', 'Workspace catalog — Resources']) {
      expect(pane(name)).toHaveClass(kit.pane);
      expect(pane(name).parentElement).toHaveClass(kit.stack);
    }
    expect(within(pane('Workspace catalog — Resources')).getByTestId('schema-browser')).toHaveAttribute('data-connection', 'conn-1');

    // A result: its pane and the kit tabs
    const results = await loadRun(user);
    expect(pane('Results')).toHaveClass(kit.pane);
    expect(results.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Classes (1)', 'Properties (1)', 'Turtle', 'Agent Log']);
    expect(results.getByRole('tab', { name: 'Classes (1)' })).toHaveClass(kit.tab);

    expect(container.querySelector('.p-6, .rounded-xl, .bg-card, [class*="shadow"]')).toBeNull();
    expect(tailwindIn(container)).toEqual([]);
  });

  // Who may write: ontology write alone is enough (Save to scheme too, as the
  // backend checks only ontology); semantic-models write without it is not
  const PERSONAS = [
    ['a writer', { ontology: RW, 'semantic-models': RW }, true],
    ['a writer with ontology but not semantic-models', { ontology: RW }, true],
    ['a reader', { ontology: RO, 'semantic-models': RO }, false],
    ['a writer with semantic-models but not ontology', { ontology: RO, 'semantic-models': RW }, false],
  ] as const;

  for (const [persona, permissions, writes] of PERSONAS) {
    it(`ontology generator keeps every control for ${persona}${writes ? '' : ', with the writes hidden'}`, async () => {
      grant(permissions);
      const user = userEvent.setup();
      renderPage();
      await loaded();

      // Settings: the same for everyone
      const options = within(pane('Generation Options'));
      expect(options.getByRole('textbox', { name: 'Guidelines' })).toHaveValue('');
      expect(options.getByRole('textbox', { name: 'Base URI' })).toHaveValue('http://ontos.example.org/ontology#');
      for (const name of ['Data properties', 'Relationships', 'Inheritance']) expect(options.getByRole('switch', { name })).toBeChecked();
      await user.click(options.getByRole('switch', { name: 'Inheritance' }));
      expect(options.getByRole('switch', { name: 'Inheritance' })).not.toBeChecked();
      await user.click(screen.getByRole('button', { name: 'pick a table' }));
      expect(within(pane('Workspace catalog — Resources')).getByText('1 selected')).toBeInTheDocument();

      // Generate waits for a selection; without ontology write there's no Run pane
      if (writes) {
        const run = within(pane('Run'));
        expect(run.getByRole('button', { name: 'Generate Ontology (1 selected)' })).toBeEnabled();
        expect(run.getByText('Processes up to 50 tables per run. For large schemas, split your selection into multiple runs.')).toBeInTheDocument();
      } else {
        expect(screen.queryByRole('region', { name: 'Run' })).toBeNull();
        expect(screen.queryByRole('button', { name: /Generate Ontology/ })).toBeNull();
      }

      // Recent runs: a toggle, then a row per run, and a Delete per run for a writer
      const runs = within(pane('Recent Runs'));
      const toggle = runs.getByRole('button', { name: /^Recent Runs/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(runs.getAllByRole('button', { name: /^(Workspace catalog|Enterprise)/ })).toHaveLength(2);
      expect(runs.queryAllByRole('button', { name: 'Delete run' })).toHaveLength(writes ? 2 : 0);

      // A result: the tabs, Copy and Download; Save to scheme for a writer
      const results = await loadRun(user);
      if (writes) expect(results.getByRole('button', { name: 'Save to scheme' })).toBeEnabled();
      else expect(results.queryByRole('button', { name: 'Save to scheme' })).toBeNull();
      expect(results.getByRole('cell', { name: 'Customer' })).toBeInTheDocument();
      await user.click(results.getByRole('tab', { name: 'Properties (1)' }));
      expect(results.getByRole('cell', { name: 'placedBy' })).toBeInTheDocument();
      await user.click(results.getByRole('tab', { name: 'Turtle' }));
      expect(results.getByRole('button', { name: 'Copy' })).toBeEnabled();
      expect(results.getByRole('button', { name: 'Download' })).toBeEnabled();
      await user.click(results.getByRole('tab', { name: 'Agent Log' }));
      expect(results.getByText('list_tables(gold.sales)')).toBeInTheDocument();
    });
  }

  it('shows no write before the permissions are known', async () => {
    usePermissionsStore.setState({ permissions: {}, isLoading: true, isReady: false, _initAttempted: true, _isInitializing: true });
    renderPage();
    await loaded();
    expect(screen.queryByRole('button', { name: /Generate Ontology/ })).toBeNull();
    act(() => grant({ ontology: RW }));
    expect(await screen.findByRole('button', { name: 'Generate Ontology (0 selected)' })).toBeInTheDocument();
  });

  it('a reader sees a running run\'s progress, but not Cancel', async () => {
    grant({ ontology: RO });
    const running = { ...RUNS[0], run_id: 'run-live', status: 'running', progress_message: 'Reading gold.sales' };
    mockBackend({ runs: [running] });
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(input), 'http://localhost').pathname === '/api/ontology/runs/run-live' ? json({ ...running, steps: [] }) : answer(input, init));
    renderPage();
    const run = within(await screen.findByRole('region', { name: 'Run' }));
    expect(await run.findByText('Reading gold.sales')).toBeInTheDocument();
    expect(run.queryByRole('button', { name: 'Cancel Generation' })).toBeNull();
  });

  it('the run: Generate posts the settings, polls, and shows the result', async () => {
    const user = userEvent.setup();
    renderPage('/concepts/generator?guidelines=Model%20sales');
    await loaded();
    expect(screen.getByRole('textbox', { name: 'Guidelines' })).toHaveValue('Model sales');
    await user.click(screen.getByRole('button', { name: 'pick a table' }));
    await user.click(screen.getByRole('button', { name: 'Generate Ontology (1 selected)' }));
    const [post] = calls('/api/ontology/generate-from-connection', 'POST');
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      connection_id: 'conn-1',
      selected_paths: ['gold.sales.orders'],
      guidelines: 'Model sales',
      base_uri: 'http://ontos.example.org/ontology#',
      include_data_properties: true,
      include_relationships: true,
      include_inheritance: true,
    });
    expect(await screen.findByRole('region', { name: 'Results' })).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Generation started' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ontology generated', description: '1 classes, 1 properties.' }));
  });

  it('a running run resumes polling, with its progress and Cancel', async () => {
    const running = { ...RUNS[0], run_id: 'run-live', status: 'running', progress_message: 'Reading gold.sales' };
    let cancelled = false;
    mockBackend({ runs: [running] });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/connections') return json([CONNECTION]);
      if (url.pathname === '/api/ontology/runs') return json({ runs: [{ ...running, status: cancelled ? 'cancelled' : 'running' }] });
      if (method === 'DELETE') cancelled = true;
      if (url.pathname === '/api/ontology/runs/run-live' && method === 'GET') {
        return json({ ...running, steps: [{ step_type: 'tool_call', content: 'describe gold.sales', tool_name: 'describe', duration_ms: 3 }] });
      }
      return json({ ok: true });
    });
    const user = userEvent.setup();
    renderPage();
    const run = within(await screen.findByRole('region', { name: 'Run' }));
    expect(await run.findByText('Reading gold.sales')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Agent Progress' })).toHaveTextContent('describe gold.sales');
    await user.click(run.getByRole('button', { name: 'Cancel Generation' }));
    expect(calls('/api/ontology/runs/run-live', 'DELETE')).toHaveLength(1);
    expect(await within(pane('Run')).findByRole('button', { name: /Generate Ontology/ })).toBeInTheDocument();
  });

  it('a run\'s card opens on keyboard focus, and Delete removes the run', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const runs = within(pane('Recent Runs'));
    await user.click(runs.getByRole('button', { name: /^Recent Runs/ }));
    const row = runs.getByRole('button', { name: /^Workspace catalog/ });
    act(() => row.focus());
    expect(await screen.findByText('Model the sales domain')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    await user.click(runs.getAllByRole('button', { name: 'Delete run' })[0]);
    await waitFor(() => expect(calls('/api/ontology/runs/run-done', 'DELETE')).toHaveLength(1));
    // The list is loaded again
    await waitFor(() => expect(calls('/api/ontology/runs').length).toBeGreaterThan(1));
  });

  it('a 200-character name keeps its title', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const runs = within(pane('Recent Runs'));
    await user.click(runs.getByRole('button', { name: /^Recent Runs/ }));
    expect(runs.getByText(LONG_NAME)).toHaveAttribute('title', LONG_NAME);
    const results = await loadRun(user);
    // The class's long description is cut short, with its title
    expect(results.getByText(LONG_NAME)).toHaveAttribute('title', LONG_NAME);
  });

  it('Save to scheme: a kit Dialog that posts the result and closes, with the success toast', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const results = await loadRun(user);
    await user.click(results.getByRole('button', { name: 'Save to scheme' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save to concept scheme' });
    expectKitDialog(dialog);
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Scheme name' }), 'Sales Ontology');
    await user.type(within(dialog).getByRole('textbox', { name: 'Description (optional)' }), 'For sales');
    expect(within(dialog).getByText('1 classes and 1 properties will be imported.')).toBeInTheDocument();
    await user.click(save);
    const [post] = calls('/api/ontology/save-to-collection', 'POST');
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      owl_content: RESULT.owl_content, collection_name: 'Sales Ontology', collection_description: 'For sales',
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved to scheme', description: '12 triples imported into "Sales Ontology".' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save to concept scheme' })).toBeNull());
  });

  it('a failed save keeps the dialog open, with no success toast', async () => {
    mockBackend({ save: { success: false, error: 'Scheme already exists' } });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const results = await loadRun(user);
    await user.click(results.getByRole('button', { name: 'Save to scheme' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save to concept scheme' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Scheme name' }), 'Sales Ontology');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Save failed', description: 'Scheme already exists', variant: 'destructive' })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved to scheme' }));
    expect(screen.getByRole('dialog', { name: 'Save to concept scheme' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('ontology generator empty and error states keep their actions', async () => {
    // No connections: the message; the options, Generate and the runs stay
    mockBackend({ connections: [] });
    const { unmount } = renderPage();
    const connection = within(pane('Connection'));
    expect(await connection.findByText('No connections configured. Add one in Settings > Connectors.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Guidelines' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Generate Ontology (0 selected)' })).toBeInTheDocument();
    expect(within(pane('Recent Runs')).getByRole('button', { name: /^Recent Runs/ })).toBeEnabled();
    unmount();

    // A failed connections load: the error and Retry; Retry loads them again
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend({ connectionsStatus: 500, runsStatus: 500 });
    const user = userEvent.setup();
    renderPage();
    const alert = await within(pane('Connection')).findByRole('alert');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(alert).toHaveTextContent('Could not load the connections.');
    expect(screen.queryByText('No connections configured. Add one in Settings > Connectors.')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Guidelines' })).toBeEnabled();
    // A failed runs load says so in the open list, with its own Retry
    const runs = within(pane('Recent Runs'));
    await user.click(runs.getByRole('button', { name: /^Recent Runs/ }));
    expect(await runs.findByText('Could not load the recent runs.')).toBeInTheDocument();
    mockBackend();
    await user.click(within(pane('Connection')).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(selectField(pane('Connection'), 'Connection')).toHaveValue('Workspace catalog'));
    await user.click(runs.getByRole('button', { name: 'Retry' }));
    expect(await runs.findByRole('button', { name: /^Workspace catalog/ })).toBeInTheDocument();
    logged.mockRestore();
  });

  it('a result with an error shows it, and the page stays usable', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/connections') return json([CONNECTION]);
      if (url.pathname === '/api/ontology/runs') return json({ runs: RUNS });
      if (url.pathname === '/api/ontology/runs/run-done') {
        return json({ ...RUNS[0], steps: [], result: { ...RESULT, success: false, classes: [], properties: [], error: 'The agent stopped' } });
      }
      return json([]);
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const results = await loadRun(user);
    expect(results.getByRole('alert')).toHaveTextContent('The agent stopped');
    expect(results.getByText('No classes generated')).toBeInTheDocument();
    expect(results.queryByRole('button', { name: 'Save to scheme' })).toBeNull();
    expect(screen.getByRole('button', { name: /Generate Ontology/ })).toBeInTheDocument();
  });
});

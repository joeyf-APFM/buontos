/**
 * Wave 2 Task 12a: Define (/concepts/define) on the page kit. The look (the
 * 16px title, truncation, no horizontal page scroll, the tooltips on focus)
 * is measured in a real browser in tests/e2e/concepts-define-collections.spec.ts
 * (ruling R10); these tests check the structure, every control for a writer
 * and a reader, the Author dialog, and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import DefineView from './define';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

type StubProps = { open: boolean; onOpenChange: (open: boolean) => void };
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => ({ open, onOpenChange }: StubProps) =>
    open ? (
      <div role="dialog" aria-label={name}>
        <button type="button" onClick={() => onOpenChange(false)}>close</button>
      </div>
    ) : null,
}));

// Task 12b's dialogs, consumed as they are: only their wiring is checked here
vi.mock('@/components/knowledge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/knowledge')>()),
  ImportConceptsDialog: stub('Import concepts'),
}));
vi.mock('@/components/concepts/guided-generate-dialog', () => ({ GuidedGenerateDialog: stub('Guided build') }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const run = (id: string, status: string, message: string, extra: Record<string, unknown> = {}) => ({
  run_id: id, status, progress_message: message, created_at: '2026-11-09T11:00:00Z', step_count: 4, ...extra,
});
const RUNS = [
  run('run-1', 'completed', '156 draft terms from gold.sales'),
  run('run-2', 'running', 'Extracting classes…'),
  run('run-3', 'failed', 'Never shown'),
];

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend({ runs = RUNS as unknown, runsStatus = 200, createStatus = 200 } = {}) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/ontology/runs') return json(runsStatus === 200 ? { runs } : { detail: 'Runs exploded' }, runsStatus);
    if (url.pathname === '/api/knowledge/collections' && init?.method === 'POST') {
      if (createStatus !== 200) return json({ detail: 'Name already taken' }, createStatus);
      return json({ iri: 'urn:new-scheme', label: 'Risk Glossary' });
    }
    if (url.pathname === '/api/knowledge/collections') return json({ collections: [] });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const runLoads = () =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input), 'http://localhost').pathname === '/api/ontology/runs');

/** semantic-models at `level`; ontology (which Generate needs) at the same level unless given. */
function grant(level: FeatureAccessLevel, ontology: FeatureAccessLevel = level) {
  usePermissionsStore.setState({
    permissions: { 'semantic-models': level, ontology },
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

const renderPage = (route = '/concepts/define') =>
  renderWithMantine(
    <Routes>
      <Route path="/concepts/define" element={<><DefineView /><Probe /></>} />
      <Route path="/concepts/browser" element={<><p>explore page</p><Probe /></>} />
      <Route path="/concepts/generator" element={<><p>generator page</p><Probe /></>} />
    </Routes>,
    { route },
  );

const loaded = () => screen.findByText('156 draft terms from gold.sales');
const pane = (name: string) => screen.getByRole('region', { name });
const PATH_ACTIONS = ['New Concept Scheme', 'Start guided build', 'Upload files'];

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

describe('define on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    grant(FeatureAccessLevel.READ_WRITE);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    toast.mockClear();
  });

  it('define renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    // The shell owns the breadcrumb; the page draws the kit header
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    const heading = screen.getByRole('heading', { level: 1, name: 'Define' });
    expect(heading.parentElement).toHaveClass(kit.header);
    expect(screen.getByText('Author, generate, or import your business concept schemes.')).toBeInTheDocument();

    // The legend, the paths and the runs, each a kit pane, stacked
    for (const name of ['What you can build', 'Start with…', 'In progress']) expect(pane(name)).toHaveClass(kit.pane);
    expect(pane('What you can build').parentElement).toHaveClass(kit.stack);
    // Three path cards, each a labelled group (no shadcn Card)
    const cards = within(pane('Start with…')).getAllByRole('group');
    expect(cards.map((c) => within(c).getByRole('heading', { level: 3 }).textContent)).toEqual(['Author', 'Generate', 'Import']);
    for (const name of ['Author', 'Generate', 'Import']) expect(within(pane('Start with…')).getByRole('group', { name })).toBeInTheDocument();
    // The runs are a list
    expect(within(pane('In progress')).getAllByRole('listitem')).toHaveLength(2);

    expect(container.querySelector('.p-6, .rounded-xl, .bg-card, [class*="shadow"]')).toBeNull();
    expect(tailwindIn(container)).toEqual([]);
  });

  it('define keeps every control for a writer', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    for (const name of PATH_ACTIONS) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute('title');
    }
    // The runs: one Review per open run, and the rows-per-page field
    const runs = pane('In progress');
    expect(within(runs).getAllByRole('button', { name: 'Review' })).toHaveLength(2);
    expect(within(runs).getByText('Needs review')).toBeInTheDocument();
    expect(within(runs).getByText('Running')).toBeInTheDocument();
    expect(within(runs).queryByText('Never shown')).toBeNull();
    expect(within(runs).getByRole('combobox', { name: 'Rows per page' })).toHaveValue('10');

    // Each path opens its dialog
    await user.click(screen.getByRole('button', { name: 'Start guided build' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Guided build' })).getByRole('button', { name: 'close' }));
    await user.click(screen.getByRole('button', { name: 'Upload files' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Import concepts' })).getByRole('button', { name: 'close' }));

    // Author opens the scheme editor (a kit Dialog); Create posts, then lands in Explore on the new scheme
    await user.click(screen.getByRole('button', { name: 'New Concept Scheme' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create Scheme' });
    expect(dialog).toHaveClass('mantine-Modal-content');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Risk Glossary');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('explore page')).toBeInTheDocument();
    expect(location.search).toBe(`?source=${encodeURIComponent('urn:new-scheme')}`);
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({ label: 'Risk Glossary', collection_type: 'glossary' });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Scheme created successfully' }));
  });

  it('define: Review opens the run in the generator', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(pane('In progress')).getAllByRole('button', { name: 'Review' })[0]);
    expect(await screen.findByText('generator page')).toBeInTheDocument();
    expect(location.search).toBe('?run=run-1');
  });

  it('define keeps every control for a reader, disabled with a hint', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    for (const name of PATH_ACTIONS) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Requires write access');
    }
    expect(within(pane('In progress')).getAllByRole('button', { name: 'Review' })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Upload files' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('define empty and error states keep their actions', async () => {
    // No runs: the message, and the three paths still open their dialogs
    mockBackend({ runs: [] });
    const user = userEvent.setup();
    const { unmount } = renderPage();
    const runs = pane('In progress');
    expect(await within(runs).findByText('No creation work in progress. Start with one of the paths above.')).toBeInTheDocument();
    for (const name of PATH_ACTIONS) expect(screen.getByRole('button', { name })).toBeEnabled();
    unmount();

    // A failed load: the error and Retry, and the paths are still there
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend({ runsStatus: 500 });
    renderPage();
    const alert = await within(pane('In progress')).findByRole('alert');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(alert).toHaveTextContent('Could not load the creation work in progress.');
    expect(screen.queryByText('No creation work in progress. Start with one of the paths above.')).toBeNull();
    for (const name of PATH_ACTIONS) expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(runLoads()).toHaveLength(1);
    mockBackend();
    await user.click(within(pane('In progress')).getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(within(pane('In progress')).queryByRole('alert')).toBeNull();
    expect(logged).toHaveBeenCalledWith('Failed to fetch generation runs:', expect.any(Error));
    logged.mockRestore();
  });

  it('define: a failed Author save shows an error toast and keeps the editor open', async () => {
    mockBackend({ createStatus: 409 });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'New Concept Scheme' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create Scheme' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Finance Glossary');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Name already taken', variant: 'destructive' })),
    );
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ description: 'Scheme created successfully' }));
    expect(screen.getByRole('dialog', { name: 'Create Scheme' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeEnabled();
    expect(location.pathname).toBe('/concepts/define');
  });

  it('define: the info marks are images with a short name, their tip describing them on focus', async () => {
    renderPage();
    await loaded();
    const cards = pane('Start with…');
    const marks = within(cards).getAllByRole('img');
    expect(marks.map((m) => m.getAttribute('aria-label'))).toEqual(['About Author', 'About Generate', 'About Import']);
    expect(within(pane('What you can build')).getAllByRole('img', { name: /vocabulary$/ })).toHaveLength(3);
    act(() => marks[0].focus());
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Creates skos:Concept entries');
    expect(marks[0]).toHaveAccessibleDescription(/^Creates skos:Concept entries/);
  });

  it('define: Generate needs ontology write, Author and Import need semantic-models write', async () => {
    const RW = FeatureAccessLevel.READ_WRITE;
    const RO = FeatureAccessLevel.READ_ONLY;
    // Ontology write but read-only schemes: only Generate
    grant(RO, RW);
    const { unmount } = renderPage();
    await loaded();
    expect(screen.getByRole('button', { name: 'Start guided build' })).toBeEnabled();
    for (const name of ['New Concept Scheme', 'Upload files']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
      expect(screen.getByRole('button', { name })).toHaveAttribute('title', 'Requires write access');
    }
    unmount();
    // Scheme write but read-only ontology: all but Generate
    grant(RW, RO);
    const second = renderPage();
    await loaded();
    expect(screen.getByRole('button', { name: 'Start guided build' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start guided build' })).toHaveAttribute('title', 'Requires write access');
    for (const name of ['New Concept Scheme', 'Upload files']) expect(screen.getByRole('button', { name })).toBeEnabled();
    second.unmount();
  });

  it('define: ?open=generate follows ontology write, ?open=import semantic-models write', async () => {
    const RW = FeatureAccessLevel.READ_WRITE;
    const RO = FeatureAccessLevel.READ_ONLY;
    // Without ontology write, ?open=generate opens nothing and is dropped
    grant(RW, RO);
    const first = renderPage('/concepts/define?open=generate');
    await loaded();
    await waitFor(() => expect(location.search).toBe(''));
    expect(screen.queryByRole('dialog', { name: 'Guided build' })).toBeNull();
    first.unmount();
    // With ontology write alone, it opens; ?open=import does not
    grant(RO, RW);
    const second = renderPage('/concepts/define?open=generate');
    expect(await screen.findByRole('dialog', { name: 'Guided build' })).toBeInTheDocument();
    expect(location.search).toBe('?open=generate');
    second.unmount();
    renderPage('/concepts/define?open=import');
    await loaded();
    await waitFor(() => expect(location.search).toBe(''));
    expect(screen.queryByRole('dialog', { name: 'Import concepts' })).toBeNull();
  });

  it('define keeps ?open= for a writer, and clears it on close', async () => {
    const user = userEvent.setup();
    renderPage('/concepts/define?open=author');
    const dialog = await screen.findByRole('dialog', { name: 'Create Scheme' });
    expect(location.search).toBe('?open=author');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(location.search).toBe(''));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create Scheme' })).toBeNull());
  });
});

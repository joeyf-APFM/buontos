/**
 * Wave 2 Task 14: Term Mapping (/concepts/mapping) on the page kit. The look
 * and the long names are measured in a real browser in
 * tests/e2e/concepts-enrich-mapping.spec.ts (ruling R10); these tests check
 * the structure, every control for an admin, a writer and a reader, the API
 * calls and toasts, stale answers, and the empty and error states. The run
 * and review dialogs are stubbed here: their own tests are in
 * components/term-mapping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import TermMappingView from './term-mapping';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

type DialogStubProps = { isOpen: boolean; onOpenChange: (open: boolean) => void; onCreated?: (run: unknown) => void; run?: { id: string } | null };
const created = vi.hoisted(() => ({ run: null as unknown }));
vi.mock('@/components/term-mapping/run-config-dialog', () => ({
  default: ({ isOpen, onOpenChange, onCreated }: DialogStubProps) =>
    isOpen ? (
      <div role="dialog" aria-label="New run stub">
        <button type="button" onClick={() => { onCreated?.(created.run); onOpenChange(false); }}>create</button>
      </div>
    ) : null,
}));
vi.mock('@/components/term-mapping/generate-review-dialog', () => ({
  default: ({ isOpen, run }: DialogStubProps) =>
    isOpen ? <div role="dialog" aria-label="Review stub">{run?.id}</div> : null,
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LONG_COMMENT = `Columns ${'of-the-customer-lifetime-revenue-domain-'.repeat(6)}`.slice(0, 200);

const stats = (extra: Record<string, number> = {}) => ({
  targets: 120, suggestions_total: 2, suggestions_pending: 2, suggestions_accepted: 0, suggestions_rejected: 0,
  suggestions_auto_apply: 1, links_created: 0, links_skipped: 0, ...extra,
});
const summary = (id: string, status: string, comment: string | null, extra: Record<string, unknown> = {}) => ({
  id, status, comment, stats: stats(), created_by: 'e2e.user@example.com', created_at: '2026-11-09T11:00:00Z', ...extra,
});
const detail = (s: ReturnType<typeof summary>, extra: Record<string, unknown> = {}) => ({
  ...s, ontology_contexts: ['urn:glossary:finance'], include_shipped: [], target_filter: {}, engines: ['heuristic'],
  error: null, applied_link_ids: [], ...extra,
});

const RUN_A = summary('aaaaaaaa-1111', 'suggested', LONG_COMMENT);
const RUN_B = summary('bbbbbbbb-2222', 'applied', 'Nightly', { stats: stats({ suggestions_auto_apply: 0, suggestions_pending: 0 }) });

let fetchMock: ReturnType<typeof vi.fn>;
let runs: { status: number; body: unknown } = { status: 200, body: [RUN_A, RUN_B] };
let failingDetail = false;
let held: { path: string; release?: () => void } | null = null;

function mockBackend() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (held && url.pathname === held.path) {
      const hold = held;
      held = null;
      return new Promise<Response>((resolve) => {
        hold.release = () => resolve(json(detail(summary('aaaaaaaa-1111', 'suggested', 'Stale answer'))));
      });
    }
    if (init?.method === 'POST') {
      if (url.pathname.endsWith('/undo')) return json({ run_id: 'x', links_removed: 4, suggestions_reverted: 2, errors: [] });
      return json({ run_id: 'x', links_created: 1, links_skipped: 0, errors: [] });
    }
    switch (url.pathname) {
      case '/api/term-mappings/runs':
        return json(runs.body, runs.status);
      case '/api/term-mappings/runs/aaaaaaaa-1111':
        return failingDetail ? json({ detail: 'Run store down' }, 500) : json(detail(RUN_A));
      case '/api/term-mappings/runs/cccccccc-3333':
        return json(created.run);
      case '/api/term-mappings/runs/bbbbbbbb-2222':
        return json(detail(RUN_B, { ontology_contexts: [], include_shipped: ['urn:taxonomy:databricks_ontology'] }));
      default:
        return json([]);
    }
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (path: string, method = 'GET') =>
  fetchMock.mock.calls.filter(([input, init]) => {
    const url = new URL(String(input), 'http://localhost');
    return `${url.pathname}${url.search}` === path && ((init as RequestInit | undefined)?.method ?? 'GET') === method;
  });

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'term-mapping': level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = () => renderWithMantine(<TermMappingView />, { route: '/concepts/mapping' });

const runsPane = () => screen.getByRole('region', { name: 'Recent runs' });
const detailPane = () => screen.getByRole('region', { name: 'Run detail' });
const runButton = (id: string) => within(runsPane()).findByRole('button', { name: new RegExp(id.slice(0, 8)) });

function tailwindIn(root: HTMLElement): string[] {
  const utility = /^(?:[a-z]+:)*-?(?:flex|grid|hidden|inline|block|truncate|shrink|grow|items-|justify-|self-|gap-|space-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|min-|max-|text-|font-|bg-|border|rounded|shadow|leading-|tracking-|whitespace-|cursor-|opacity-|tabular-nums|uppercase|animate-|italic|underline|break-all)/;
  const found = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>('[class]')) {
    if (el.closest('.mantine-Badge-root, .mantine-Button-root')) continue;
    for (const c of el.classList) if (utility.test(c)) found.add(c);
  }
  return [...found];
}

function expectNoOldMarkup(root: HTMLElement) {
  expect(root.querySelectorAll('.p-6, .py-6, .bg-card, .rounded-lg, .shadow-sm, .space-y-4')).toHaveLength(0);
  expect(tailwindIn(root)).toEqual([]);
}

beforeEach(() => {
  runs = { status: 200, body: [RUN_A, RUN_B] };
  failingDetail = false;
  held = null;
  created.run = detail(summary('cccccccc-3333', 'suggested', 'Fresh run'));
  mockBackend();
  grant(FeatureAccessLevel.ADMIN);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('term-mapping renders with the page kit', () => {
  it('has the kit header, the runs and detail panes side by side, and no old markup', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runButton(RUN_A.id);

    const h1 = screen.getByRole('heading', { level: 1, name: 'Term Mapping' });
    expect(h1.parentElement).toHaveClass(kit.header);
    expect(screen.getByText(/^Bulk-suggest ontology concept assignments/)).toBeInTheDocument();
    expect(runsPane()).toHaveClass(kit.pane);
    expect(detailPane()).toHaveClass(kit.pane);
    expect(runsPane().parentElement).toHaveClass(kit.content);
    expect(detailPane().parentElement).toBe(runsPane().parentElement);
    expect(within(detailPane()).getByText('Select a run on the left, or start a new one.')).toBeInTheDocument();
    expectNoOldMarkup(container);

    await user.click(await runButton(RUN_A.id));
    await within(detailPane()).findByText('Sources of suggestions');
    expect(within(detailPane()).getByRole('heading', { level: 2, name: /Run aaaaaaaa/ })).toBeInTheDocument();
    expectNoOldMarkup(container);
  });
});

describe('term-mapping keeps every control', () => {
  it('an admin: Refresh, New run, a run selected, its Refresh, Apply auto, Generate review and Undo', async () => {
    const user = userEvent.setup();
    renderPage();
    await runButton(RUN_A.id);
    expect(calls('/api/term-mappings/runs?limit=50')).toHaveLength(1);

    // Refresh refetches the list
    await user.click(screen.getAllByRole('button', { name: 'Refresh' })[0]);
    await waitFor(() => expect(calls('/api/term-mappings/runs?limit=50')).toHaveLength(2));

    // Selecting a run loads it; the row is marked current
    const rowA = await runButton(RUN_A.id);
    await user.click(rowA);
    expect(rowA).toHaveAttribute('aria-current', 'true');
    const pane = within(detailPane());
    await pane.findByText('Sources of suggestions');
    expect(calls('/api/term-mappings/runs/aaaaaaaa-1111')).toHaveLength(1);
    for (const label of ['Targets', 'Suggestions', 'Pending', 'Auto-apply', 'Accepted', 'Rejected', 'Links created', 'Links skipped']) {
      expect(pane.getByText(label)).toBeInTheDocument();
    }
    expect(pane.getByText('urn:glossary:finance')).toBeInTheDocument();
    expect(pane.getByRole('link', { name: 'Asset Reviews' })).toHaveAttribute('href', '/data-asset-reviews');

    await user.click(pane.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(calls('/api/term-mappings/runs/aaaaaaaa-1111')).toHaveLength(2));

    // Apply auto: POST, a toast, then both reloads
    await user.click(pane.getByRole('button', { name: 'Apply auto (1)' }));
    await waitFor(() => expect(calls('/api/term-mappings/runs/aaaaaaaa-1111/apply?apply_auto=true', 'POST')).toHaveLength(1));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Applied', description: '1 links created, 0 skipped' })));
    await waitFor(() => expect(calls('/api/term-mappings/runs/aaaaaaaa-1111')).toHaveLength(3));

    // Generate review opens its dialog with the run
    await user.click(pane.getByRole('button', { name: /Generate review/ }));
    expect(screen.getByRole('dialog', { name: 'Review stub' })).toHaveTextContent('aaaaaaaa-1111');

    // Undo on an applied run, after the confirm
    await user.click(await runButton(RUN_B.id));
    await within(detailPane()).findByText('urn:taxonomy:databricks_ontology');
    expect(within(detailPane()).queryByRole('button', { name: /Apply auto/ })).toBeNull();
    await user.click(within(detailPane()).getByRole('button', { name: 'Undo' }));
    expect(window.confirm).toHaveBeenCalledWith('Undo run bbbbbbbb-2222? This removes every link this run created.');
    await waitFor(() => expect(calls('/api/term-mappings/runs/bbbbbbbb-2222/undo', 'POST')).toHaveLength(1));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Undone' })));
  });

  it('a cancelled Undo posts nothing', async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(false);
    renderPage();
    await user.click(await runButton(RUN_B.id));
    await user.click(await within(detailPane()).findByRole('button', { name: 'Undo' }));
    expect(calls('/api/term-mappings/runs/bbbbbbbb-2222/undo', 'POST')).toHaveLength(0);
  });

  it('a failed apply toasts the failure and no success', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    await user.click(await runButton(RUN_A.id));
    fetchMock.mockImplementationOnce(async () => json({ detail: 'Apply exploded' }, 500));
    await user.click(await within(detailPane()).findByRole('button', { name: 'Apply auto (1)' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Apply failed', variant: 'destructive' })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Applied' }));
  });

  it('New run opens the run dialog, and a created run goes to the top and opens', async () => {
    const user = userEvent.setup();
    renderPage();
    await runButton(RUN_A.id);
    await user.click(screen.getByRole('button', { name: 'New run' }));
    await user.click(within(screen.getByRole('dialog', { name: 'New run stub' })).getByRole('button', { name: 'create' }));
    const rows = within(runsPane()).getAllByRole('button');
    expect(rows[0]).toHaveAccessibleName(/cccccccc/);
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    await waitFor(() => expect(calls('/api/term-mappings/runs/cccccccc-3333')).toHaveLength(1));
  });

  it('a writer has no Undo', async () => {
    const user = userEvent.setup();
    grant(FeatureAccessLevel.READ_WRITE);
    renderPage();
    expect(screen.getByRole('button', { name: 'New run' })).toBeInTheDocument();
    await user.click(await runButton(RUN_B.id));
    await within(detailPane()).findByText('Sources of suggestions');
    expect(within(detailPane()).queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('a reader can browse and refresh, with no write controls', async () => {
    const user = userEvent.setup();
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    await user.click(await runButton(RUN_A.id));
    const pane = within(detailPane());
    await pane.findByText('Sources of suggestions');
    expect(screen.queryByRole('button', { name: 'New run' })).toBeNull();
    expect(pane.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(pane.queryByRole('button', { name: /Apply auto/ })).toBeNull();
    expect(pane.queryByRole('button', { name: /Generate review/ })).toBeNull();
    expect(pane.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});

describe('term-mapping Review Focus 1: long names', () => {
  it('a long comment keeps its full text in a title in the list', async () => {
    renderPage();
    await runButton(RUN_A.id);
    expect(within(runsPane()).getByText(LONG_COMMENT)).toHaveAttribute('title', LONG_COMMENT);
  });
});

describe('term-mapping Review Focus 2: empty and error states', () => {

  it('no runs: the note, with Refresh and New run', async () => {
    runs = { status: 200, body: [] };
    renderPage();
    expect(await within(runsPane()).findByText(/No runs yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New run' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('a failed list: an Alert with Retry, no empty note, and Retry loads the runs', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runs = { status: 500, body: { detail: 'Runs exploded' } };
    renderPage();
    const alert = await within(runsPane()).findByRole('alert');
    expect(alert).toHaveTextContent('Runs exploded');
    expect(within(runsPane()).queryByText(/No runs yet/)).toBeNull();
    expect(screen.getByRole('button', { name: 'New run' })).toBeInTheDocument();
    runs = { status: 200, body: [RUN_A] };
    await user.click(within(runsPane()).getByRole('button', { name: 'Retry' }));
    expect(await runButton(RUN_A.id)).toBeInTheDocument();
    expect(within(runsPane()).queryByRole('alert')).toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it('a failed run: a toast and an Alert with Retry in the detail, not an endless spinner', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    failingDetail = true;
    renderPage();
    await user.click(await runButton(RUN_A.id));
    const alert = await within(detailPane()).findByRole('alert');
    expect(alert).toHaveTextContent('Run store down');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Failed to load run', variant: 'destructive' }));
    failingDetail = false;
    await user.click(within(detailPane()).getByRole('button', { name: 'Retry' }));
    expect(await within(detailPane()).findByText('Sources of suggestions')).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });
});

describe('term-mapping keeps focus through a reload', () => {
  it('the pane head stays mounted while the run reloads: Refresh and Apply auto keep focus', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await runButton(RUN_A.id));
    const pane = within(detailPane());
    await pane.findByText('Sources of suggestions');

    held = { path: '/api/term-mappings/runs/aaaaaaaa-1111' };
    const hold = held;
    const refresh = pane.getByRole('button', { name: 'Refresh' });
    await user.click(refresh);
    // Loading: the loader is in the body, the head (and Refresh) stay
    await waitFor(() => expect(pane.queryByText('Sources of suggestions')).toBeNull());
    expect(pane.getByRole('button', { name: 'Refresh' })).toBe(refresh);
    expect(refresh).toHaveFocus();
    expect(refresh).toHaveAttribute('aria-busy', 'true');
    await act(async () => hold.release?.());
    await pane.findByText('Sources of suggestions');
    expect(refresh).toHaveFocus();

    const apply = pane.getByRole('button', { name: 'Apply auto (1)' });
    await user.click(apply);
    await waitFor(() => expect(calls('/api/term-mappings/runs/aaaaaaaa-1111/apply?apply_auto=true', 'POST')).toHaveLength(1));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Applied' })));
    await pane.findByText('Sources of suggestions');
    expect(pane.getByRole('button', { name: 'Apply auto (1)' })).toBe(apply);
    expect(apply).toHaveFocus();
  });
});

describe('term-mapping stale answers', () => {
  it('the reload after Apply auto on run A does not replace run B, picked meanwhile', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await runButton(RUN_A.id));
    await within(detailPane()).findByText('Sources of suggestions');
    // Apply auto on A waits; B is picked before it answers
    held = { path: '/api/term-mappings/runs/aaaaaaaa-1111/apply' };
    const hold = held;
    await user.click(within(detailPane()).getByRole('button', { name: 'Apply auto (1)' }));
    await user.click(await runButton(RUN_B.id));
    await within(detailPane()).findByText('urn:taxonomy:databricks_ontology');
    const loadsOfA = calls('/api/term-mappings/runs/aaaaaaaa-1111').length;
    await act(async () => hold.release?.());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Applied' })));
    // A isn't reloaded over B, which stays shown and picked
    expect(calls('/api/term-mappings/runs/aaaaaaaa-1111')).toHaveLength(loadsOfA);
    expect(within(detailPane()).getByText('urn:taxonomy:databricks_ontology')).toBeInTheDocument();
    expect(within(detailPane()).getByRole('heading', { level: 2, name: /Run bbbbbbbb/ })).toBeInTheDocument();
  });

  it('a slow answer for an earlier run is dropped once another run is picked', async () => {
    const user = userEvent.setup();
    renderPage();
    held = { path: '/api/term-mappings/runs/aaaaaaaa-1111' };
    const hold = held;
    await user.click(await runButton(RUN_A.id));
    await user.click(await runButton(RUN_B.id));
    const pane = within(detailPane());
    expect(await pane.findByText('urn:taxonomy:databricks_ontology')).toBeInTheDocument();
    await act(async () => hold.release?.());
    expect(pane.queryByText('Stale answer')).toBeNull();
    expect(pane.getByText('urn:taxonomy:databricks_ontology')).toBeInTheDocument();
  });
});

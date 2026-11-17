/**
 * Wave 3 Task 3: a compliance run (/compliance/runs/:runId) on the page kit.
 * Pixel values that depend on the cascade (long object names, the page's
 * horizontal scroll, how a 5,000-result run feels) are measured in a real
 * browser in tests/e2e/compliance-details.spec.ts (ruling R10); these tests
 * check the structure, every control, the paging and filter of a big run, and
 * a failed run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import CompliancePolicyRunDetails from './compliance-run-details';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const RUN = {
  id: 'r-1', policy_id: 'p-1', status: 'completed', started_at: '2026-11-08T08:00:00Z',
  finished_at: '2026-11-08T08:00:10Z', success_count: 3, failure_count: 2, score: 60,
  error_message: null, error_code: null, error_params: null,
};
const result = (id: string, name: string, passed: boolean, message: string | null) => ({
  id, run_id: 'r-1', object_type: 'table', object_id: `o-${id}`, object_name: name, passed, message,
  details_json: null, created_at: '2026-11-08T08:00:10Z',
});
const RESULTS = [
  result('1', 'main.sales.orders', false, 'No owner assigned'),
  result('2', 'main.sales.order_lines', true, null),
  result('3', 'main.finance.invoices', false, 'No owner assigned'),
];

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: URL) => Response | Promise<Response> | undefined;

function mockBackend(run: Record<string, unknown> = RUN, results: unknown[] = RESULTS, extra: Handler = () => undefined) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const answer = await extra(url);
    if (answer) return answer;
    if (url.pathname === '/api/compliance/runs/r-1/results') {
      const onlyFailed = url.searchParams.get('only_failed') === 'true';
      return json({ run, results: onlyFailed ? (results as { passed: boolean }[]).filter((r) => !r.passed) : results });
    }
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const resultCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/compliance/runs/r-1/results'));

const renderPage = () =>
  renderWithMantine(
    <Routes>
      <Route path="/compliance" element={<p>list page</p>} />
      <Route path="/compliance/policies/:policyId" element={<p>policy page</p>} />
      <Route path="/compliance/runs/:runId" element={<CompliancePolicyRunDetails />} />
    </Routes>,
    { route: '/compliance/runs/r-1' },
  );

const loaded = () => screen.findByRole('heading', { level: 1, name: 'Run r-1' });
// The page's own markup: the shared DataTable and the shared panels keep their own classes until their wave
const ownMarkup = (root: HTMLElement, selector: string) =>
  Array.from(root.querySelectorAll(selector)).filter((el) => !el.closest('table, [data-table], section[aria-labelledby]')).map((el) => el.className);
// Mantine's pager buttons carry their name in aria-label only
const edge = (root: HTMLElement, label: string) => root.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const names = (els: HTMLElement[]) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim());
const PAGER = ['Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page'];

describe('a compliance run on the page kit', () => {
  beforeEach(() => mockBackend());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('run details renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/compliance/runs/r-1')).toBe(true);
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    expect(useBreadcrumbStore.getState().staticSegments).toEqual([{ label: 'Compliance', path: '/compliance' }]);
    expect(useBreadcrumbStore.getState().dynamicTitle).toBe('Run r-1');
    expect(screen.getByRole('heading', { level: 1, name: 'Run r-1' }).closest(`.${kit.header}`)).not.toBeNull();

    // Two kit panes in one stack: the run's figures, then its results
    const summary = screen.getByRole('region', { name: 'Run Summary' });
    const results = screen.getByRole('region', { name: 'Results' });
    for (const pane of [summary, results]) expect(pane).toHaveClass(kit.pane);
    expect(summary.parentElement).toHaveClass(kit.stack);
    expect(results.parentElement).toBe(summary.parentElement);

    // The figures are StatTiles
    for (const [label, value] of [['Score', '60%'], ['Passed', '3'], ['Failed', '2']]) {
      const tile = within(summary).getByText(label).parentElement!;
      expect(tile).toHaveClass(kit.statTile);
      expect(within(tile).getByText(value)).toBeInTheDocument();
    }
    expect(within(summary).getByText('completed')).toBeInTheDocument();
    expect(within(results).getAllByRole('table')).toHaveLength(1);

    // No layout padding, shadcn Card or Tailwind class in the page's own markup
    expect(ownMarkup(container, '.py-6, .p-6, .space-y-6, .text-xl, .mb-3, .gap-2')).toEqual([]);
    expect(ownMarkup(container, '.bg-card, .rounded-lg.border, .bg-muted, .text-muted-foreground, .text-green-600, .text-red-600')).toEqual([]);
  });

  it('run details keeps every control', async () => {
    renderPage();
    await loaded();
    const buttons = names(screen.getAllByRole('button', { hidden: true }));
    for (const name of ['Back', 'Columns', 'Show All', 'Show Failed', ...PAGER]) expect(buttons).toContain(name);
    expect(screen.getByRole('link', { name: 'View Policy' })).toHaveAttribute('href', '/compliance/policies/p-1');
    expect(screen.getByPlaceholderText('Filter object names...').tagName).toBe('INPUT');
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
    // Opens on the failed results
    expect(screen.getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(2);
  });

  it('run details: Show All and Show Failed refetch once each, and the page stays up', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    expect(resultCalls()).toHaveLength(1);
    expect(screen.queryByText('main.sales.order_lines')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Show All' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Run r-1' })).toBeInTheDocument();
    expect(await screen.findByText('main.sales.order_lines')).toBeInTheDocument();
    expect(resultCalls()).toHaveLength(2);
    expect(String(resultCalls()[1][0])).toContain('only_failed=false');

    await user.click(screen.getByRole('button', { name: 'Show Failed' }));
    await waitFor(() => expect(screen.queryByText('main.sales.order_lines')).toBeNull());
    expect(resultCalls()).toHaveLength(3);
  });

  it('run details: the Back button goes back', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/compliance');
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(window.location.pathname).toBe('/compliance'));
  });

  it('compliance run details: a 5,000-result run pages and filters', async () => {
    const big = Array.from({ length: 5000 }, (_, i) =>
      result(String(i), `main.sales.table_${String(i).padStart(4, '0')}`, false, `Missing owner ${i}`));
    mockBackend(RUN, big);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const results = screen.getByRole('region', { name: 'Results' });

    // The table keeps paging: 10 rows a page, and Next moves on
    await waitFor(() => expect(within(results).getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(10));
    expect(within(results).getByText('main.sales.table_0000')).toBeInTheDocument();
    await user.click(edge(results, 'Go to next page'));
    expect(await within(results).findByText('main.sales.table_0010')).toBeInTheDocument();
    expect(within(results).queryByText('main.sales.table_0000')).toBeNull();
    await user.click(edge(results, 'Go to last page'));
    expect(await within(results).findByText('main.sales.table_4999')).toBeInTheDocument();

    // The filter works over all 5,000 rows, not only the page shown
    const filter = within(results).getByPlaceholderText('Filter object names...');
    await user.click(filter);
    await user.paste('table_3141');
    await waitFor(() => expect(within(results).getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(1));
    expect(within(results).getByText('main.sales.table_3141')).toBeInTheDocument();
    // One request for the whole run: paging and filtering are in the table
    expect(resultCalls()).toHaveLength(1);
  }, 30_000);

  it('compliance run details: a failed run keeps its error and back link', async () => {
    mockBackend({
      ...RUN, status: 'failed', score: 0, success_count: 0, failure_count: 0,
      error_message: 'Warehouse unreachable', error_code: null,
    }, []);
    renderPage();
    await loaded();
    const summary = screen.getByRole('region', { name: 'Run Summary' });
    expect(within(summary).getByText('failed')).toBeInTheDocument();
    expect(within(summary).getByText(/Warehouse unreachable/)).toBeInTheDocument();
    // No results, and the way back stays
    expect(screen.getByRole('link', { name: 'View Policy' })).toBeInTheDocument();
    // A coded error is shown in the user's language, else the stored message
    cleanup();
    mockBackend({
      ...RUN, status: 'failed', error_message: 'English message', error_code: 'no_such_code',
    }, []);
    renderPage();
    await loaded();
    expect(screen.getByText(/English message/)).toBeInTheDocument();
  });

  it('compliance run details: a run that does not load shows the error and a way back', async () => {
    mockBackend(RUN, [], (url) =>
      url.pathname === '/api/compliance/runs/r-1/results' ? json({ detail: 'Run not found' }, 404) : undefined);
    const user = userEvent.setup();
    renderPage();
    // The server's own message, not a blank page
    expect(await screen.findByRole('alert')).toHaveTextContent('Run not found');
    await user.click(screen.getByRole('button', { name: 'Back' }));
  });

  it('compliance run details: a run with no results keeps its figures and an empty table', async () => {
    mockBackend({ ...RUN, success_count: 0, failure_count: 0 }, []);
    renderPage();
    await loaded();
    expect(screen.getByRole('region', { name: 'Run Summary' })).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox', { name: 'Select row' })).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'View Policy' })).toBeInTheDocument();
  });

  it('compliance run details: a late answer for an earlier filter is dropped', async () => {
    let releaseAll: (r: Response) => void = () => {};
    mockBackend(RUN, RESULTS, (url) => {
      // Show All's answer is held back until after Show Failed's
      if (url.pathname === '/api/compliance/runs/r-1/results' && url.searchParams.get('only_failed') === 'false') {
        return new Promise<Response>((resolve) => { releaseAll = resolve; });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Show All' }));
    await waitFor(() => expect(resultCalls()).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Show Failed' }));
    await waitFor(() => expect(resultCalls()).toHaveLength(3));
    // The old answer arrives last, and must not put the passed rows back
    releaseAll(json({ run: RUN, results: RESULTS }));
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByText('main.sales.order_lines')).toBeNull();
    expect(screen.getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(2);
  });
});

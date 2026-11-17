/**
 * Wave 3 Task 3: a compliance policy (/compliance/policies/:policyId) on the
 * page kit. Pixel values that depend on the cascade (the long names, the page's
 * horizontal scroll) are measured in a real browser in
 * tests/e2e/compliance-details.spec.ts (ruling R10); these tests check the
 * structure, every control for both personas, the permission gate on Edit and
 * Run Now, the edit dialog and Run Now.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { FeatureAccessLevel } from '@/types/settings';
import CompliancePolicyDetails from './compliance-policy-details';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const POLICY = {
  id: 'p-1', name: 'Owner assigned', description: 'Every product names an owner',
  failure_message: 'No owner', rule: 'MATCH (obj:Object) ASSERT obj.owner IS NOT NULL',
  is_active: true, severity: 'high', category: 'Governance',
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-11-02T15:30:00Z',
  examples: { pass: ['main.sales.orders'], fail: ['main.sales.tmp'] },
};
const run = (id: string, startedAt: string, success: number, failure: number, extra = {}) => ({
  id, policy_id: 'p-1', status: 'completed', started_at: startedAt, finished_at: startedAt,
  success_count: success, failure_count: failure, score: Math.round((success / (success + failure)) * 100),
  error_message: null, error_code: null, error_params: null, ...extra,
});
const RUNS = [run('r-new', '2026-11-08T08:00:00Z', 3, 2), run('r-old', '2026-11-01T08:00:00Z', 4, 1)];
const result = (id: string, name: string, passed: boolean, message: string | null) => ({
  id, run_id: 'r-new', object_type: 'table', object_id: `o-${id}`, object_name: name, passed, message,
  details_json: null, created_at: '2026-11-08T08:00:10Z',
});
const RESULTS = [
  result('1', 'main.sales.orders', false, 'No owner assigned'),
  result('2', 'main.sales.order_lines', true, null),
  result('3', 'main.finance.invoices', true, null),
];

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response | undefined> | undefined;

function mockBackend(extra: Handler = () => undefined, policy: Record<string, unknown> = POLICY, runs: unknown[] = RUNS) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const answer = await extra(url, init);
    if (answer) return answer;
    if (url.pathname === '/api/compliance/policies/p-1' && method === 'GET') return json(policy);
    if (url.pathname === '/api/compliance/policies/p-1' && method === 'PUT') return json({ ...policy, ...JSON.parse(String(init?.body)) });
    if (url.pathname === '/api/compliance/policies/p-1/runs' && method === 'GET') return json(runs);
    if (url.pathname === '/api/compliance/policies/p-1/runs' && method === 'POST') return json(RUNS[0]);
    if (url.pathname.endsWith('/results')) {
      const onlyFailed = url.searchParams.get('only_failed') === 'true';
      return json({ run: RUNS[0], results: onlyFailed ? RESULTS.filter((r) => !r.passed) : RESULTS });
    }
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string, pathname: string) =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === pathname && (init?.method ?? 'GET') === method);

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { compliance: level, 'data-domains': level },
    appliedRoleId: null,
    isLoading: false,
    isReady: true,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = () =>
  renderWithMantine(
    <Routes>
      <Route path="/compliance" element={<p>list page</p>} />
      <Route path="/compliance/policies/:policyId" element={<CompliancePolicyDetails />} />
    </Routes>,
    { route: '/compliance/policies/p-1' },
  );

const loaded = () => screen.findByRole('heading', { level: 1, name: 'Owner assigned' });
// The page's own markup: the shared DataTable and the shared panels keep their own classes until their wave
const ownMarkup = (root: HTMLElement, selector: string) =>
  Array.from(root.querySelectorAll(selector)).filter((el) => !el.closest('table, [data-table], section[aria-labelledby]')).map((el) => el.className);
const names = (els: HTMLElement[]) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim());
const PAGER = ['Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page'];
// The page's own buttons in the Task 1 baselines (the metadata panel's unnamed ones aside)
const OWN_BUTTONS = ['Back to List', 'Columns', 'Comments', 'Show All', 'Show Failed', ...PAGER];

describe('a compliance policy on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    toast.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('policy details renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/compliance/policies/p-1')).toBe(true);
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    expect(useBreadcrumbStore.getState().staticSegments).toEqual([{ label: 'Compliance', path: '/compliance' }]);
    expect(useBreadcrumbStore.getState().dynamicTitle).toBe('Owner assigned');

    const heading = screen.getByRole('heading', { level: 1, name: 'Owner assigned' });
    expect(heading.closest(`.${kit.header}`)).not.toBeNull();

    // Kit panes in one stack: details, rule, run summary, runs, results, metadata
    const details = screen.getByRole('region', { name: 'Policy details' });
    const rule = screen.getByRole('region', { name: 'Rule' });
    const summary = screen.getByRole('region', { name: 'Run Summary' });
    const runs = screen.getByRole('region', { name: 'Runs' });
    const results = screen.getByRole('region', { name: 'Results' });
    // The pane and the panel's own section both carry the name
    const metadata = screen.getAllByRole('region', { name: 'Metadata' })[0];
    for (const pane of [details, rule, summary, runs, results, metadata]) expect(pane).toHaveClass(kit.pane);
    expect(details.parentElement).toHaveClass(kit.stack);
    for (const pane of [rule, summary, runs, results, metadata]) expect(pane.parentElement).toBe(details.parentElement);

    // The details grid: label and value rows
    expect(within(details).getAllByRole('term').map((el) => el.textContent))
      .toEqual(['Description', 'ID', 'Category', 'Severity']);
    expect(within(details).getByText('Every product names an owner')).toBeInTheDocument();
    expect(within(details).getByText('p-1')).toBeInTheDocument();
    expect(within(details).getByText('Governance')).toBeInTheDocument();
    expect(within(details).getByText('high')).toBeInTheDocument();

    // The rule and its examples
    expect(within(rule).getByText('MATCH (obj:Object) ASSERT obj.owner IS NOT NULL')).toBeInTheDocument();
    expect(within(rule).getByText('Should Pass')).toBeInTheDocument();
    expect(within(rule).getByText('main.sales.tmp')).toBeInTheDocument();

    // The run summary's figures are StatTiles
    expect(within(summary).getByText('Score').parentElement).toHaveClass(kit.statTile);
    expect(within(summary).getByText('60%')).toBeInTheDocument();
    expect(within(summary).getByText('Passed').parentElement).toHaveClass(kit.statTile);

    // The results: one table in a pane, with its filter
    expect(within(results).getAllByRole('table')).toHaveLength(1);
    expect(within(results).getByPlaceholderText('Filter object names...')).toBeInTheDocument();

    // The metadata panel sits flush in its pane, keeping its own head
    expect(metadata.querySelector('[data-flush]')).not.toBeNull();
    expect(within(metadata).getAllByRole('heading', { name: 'Metadata' })).toHaveLength(1);

    // No layout padding, shadcn Card or Tailwind class in the page's own markup
    expect(ownMarkup(container, '.py-6, .p-6, .space-y-6, .grid-cols-1, .md\\:grid-cols-3, .text-2xl, .gap-4')).toEqual([]);
    expect(ownMarkup(container, '.bg-card, .rounded-lg.border, .bg-muted, .text-muted-foreground, .text-green-600, .text-red-600')).toEqual([]);
  });

  it('policy details keeps every control', async () => {
    renderPage();
    await loaded();
    const buttons = names(screen.getAllByRole('button', { hidden: true }));
    for (const name of [...OWN_BUTTONS, 'Edit', 'Run']) expect(buttons).toContain(name);
    // One button per run, named by its date, score and counts
    expect(buttons.filter((n) => n?.startsWith('completed'))).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Open run details' })).toHaveLength(2);
    expect(screen.getByPlaceholderText('Filter object names...').tagName).toBe('INPUT');
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(3));
  });

  it('policy details keeps every control for a read-only user, without Edit and Run Now', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    await loaded();
    const buttons = names(screen.getAllByRole('button', { hidden: true }));
    for (const name of OWN_BUTTONS) expect(buttons).toContain(name);
    expect(buttons).not.toContain('Edit');
    expect(buttons).not.toContain('Run');
    // Still reads everything
    expect(screen.getByRole('region', { name: 'Rule' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Results' })).toBeInTheDocument();
  });

  it('policy details: Edit and Run Now need compliance write access', async () => {
    const edit = () => screen.queryByRole('button', { name: 'Edit' });
    const runNow = () => screen.queryByRole('button', { name: 'Run' });

    // Admin and Read/Write see both
    renderPage();
    await loaded();
    expect(edit()).toBeInTheDocument();
    expect(runNow()).toBeInTheDocument();
    cleanup();

    grant(FeatureAccessLevel.READ_WRITE);
    renderPage();
    await loaded();
    expect(edit()).toBeInTheDocument();
    expect(runNow()).toBeInTheDocument();
    cleanup();

    // Read-only sees neither, and the page is still readable
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    await loaded();
    expect(edit()).toBeNull();
    expect(runNow()).toBeNull();
    cleanup();

    // No access to compliance at all: neither
    usePermissionsStore.setState({ permissions: {} });
    renderPage();
    await loaded();
    expect(edit()).toBeNull();
    expect(runNow()).toBeNull();
  });

  it('policy details: Edit opens the dialog and saves the changes', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Compliance Rule' });
    expect(dialog).toHaveClass('mantine-Modal-content');

    const name = within(dialog).getByRole('textbox', { name: /^Name/ });
    expect(name).toHaveValue('Owner assigned');
    await user.clear(name);
    await user.type(name, 'Owner named');
    await user.click(within(dialog).getByRole('textbox', { name: 'Severity' }));
    await user.click(await screen.findByRole('option', { name: 'Critical', hidden: true }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls('PUT', '/api/compliance/policies/p-1')).toHaveLength(1));
    const body = JSON.parse(String(calls('PUT', '/api/compliance/policies/p-1')[0][1]?.body));
    expect(body).toMatchObject({
      id: 'p-1', name: 'Owner named', severity: 'critical', category: 'Governance',
      rule: POLICY.rule, description: POLICY.description, failure_message: 'No owner',
    });
    // The page and the breadcrumb take the new name, and the dialog closes
    expect(await screen.findByRole('heading', { level: 1, name: 'Owner named' })).toBeInTheDocument();
    expect(useBreadcrumbStore.getState().dynamicTitle).toBe('Owner named');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('Owner named') }));
  });

  it('policy details: a rule in the edit dialog is the one mono field, and Escape in a Select keeps the dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Compliance Rule' });
    const rule = within(dialog).getByRole('textbox', { name: /^Rule Code/ });
    expect(rule).toHaveValue(POLICY.rule);
    expect(rule.className).toMatch(/rule/);
    expect(within(dialog).getByRole('textbox', { name: /^Name/}).className).not.toMatch(/rule/);

    await user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), ' kept');
    const category = within(dialog).getByRole('textbox', { name: 'Category' });
    await user.click(category);
    expect(category).toHaveAttribute('aria-haspopup', 'listbox');
    await user.keyboard('{Escape}');
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole('dialog', { name: 'Edit Compliance Rule' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue('Owner assigned kept');
  });

  it('policy details: a failed save keeps the dialog and says why', async () => {
    mockBackend((url, init) =>
      url.pathname === '/api/compliance/policies/p-1' && init?.method === 'PUT' ? json({ detail: 'nope' }, 500) : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Compliance Rule' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    expect(screen.getByRole('dialog', { name: 'Edit Compliance Rule' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Owner assigned' })).toBeInTheDocument();
  });

  it('policy details: Run Now posts once on a double click and refreshes the runs', async () => {
    let release: (r: Response) => void = () => {};
    mockBackend((url, init) =>
      url.pathname === '/api/compliance/policies/p-1/runs' && init?.method === 'POST'
        ? new Promise<Response>((resolve) => { release = resolve; })
        : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.dblClick(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(calls('POST', '/api/compliance/policies/p-1/runs')).toHaveLength(1));
    expect(JSON.parse(String(calls('POST', '/api/compliance/policies/p-1/runs')[0][1]?.body))).toEqual({ mode: 'inline' });
    // The page stays up while the run is out
    expect(screen.getByRole('heading', { level: 1, name: 'Owner assigned' })).toBeInTheDocument();
    const before = calls('GET', '/api/compliance/policies/p-1/runs').length;
    release(json(RUNS[0]));
    await waitFor(() => expect(calls('GET', '/api/compliance/policies/p-1/runs').length).toBe(before + 1));
    expect(calls('POST', '/api/compliance/policies/p-1/runs')).toHaveLength(1);
  });

  it('policy details: a refused Run Now says why', async () => {
    mockBackend((url, init) =>
      url.pathname === '/api/compliance/policies/p-1/runs' && init?.method === 'POST' ? json({ detail: 'No tag access' }, 403) : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'No tag access' })));
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  it('policy details: Show Failed and Show All refetch the results, and a run can be chosen', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const results = screen.getByRole('region', { name: 'Results' });
    // The page opens on all results
    await waitFor(() => expect(within(results).getByText('main.finance.invoices')).toBeInTheDocument());
    await user.click(within(results).getByRole('button', { name: 'Show Failed' }));
    await waitFor(() => expect(within(results).queryByText('main.finance.invoices')).toBeNull());
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/runs/r-new/results?only_failed=true'))).toBe(true);
    await user.click(within(results).getByRole('button', { name: 'Show All' }));
    await waitFor(() => expect(within(results).getByText('main.finance.invoices')).toBeInTheDocument());

    // Choosing the older run fetches its results
    await user.click(screen.getByRole('button', { name: /^completed .*Score: 80%/ }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/runs/r-old/results'))).toBe(true));
  });

  it('policy details: a failed run keeps its error text', async () => {
    mockBackend(undefined, POLICY, [run('r-bad', '2026-11-08T08:00:00Z', 0, 0, {
      status: 'failed', score: 0, error_message: 'Warehouse unreachable',
    })]);
    renderPage();
    await loaded();
    const summary = screen.getByRole('region', { name: 'Run Summary' });
    expect(within(summary).getByText(/Warehouse unreachable/)).toBeInTheDocument();
  });

  it('policy details: no runs and no examples still read cleanly', async () => {
    mockBackend(undefined, { ...POLICY, examples: null }, []);
    renderPage();
    await loaded();
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Run Summary' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Results' })).toBeNull();
    expect(screen.queryByText('Should Pass')).toBeNull();
  });

  it('policy details: a policy that does not load shows the error and a way back', async () => {
    mockBackend((url) => (url.pathname === '/api/compliance/policies/p-1' ? json({ detail: 'Policy gone' }, 404) : undefined));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Policy gone|Failed|not found/i);
    await user.click(screen.getByRole('button', { name: 'Back to List' }));
    expect(await screen.findByText('list page')).toBeInTheDocument();
  });

  it('policy details: guards against non-array answers', async () => {
    mockBackend((url) => {
      if (url.pathname === '/api/compliance/policies/p-1/runs') return json({ not: 'an array' });
      return undefined;
    });
    renderPage();
    await loaded();
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
  });

  it('policy details: Escape does not close the edit dialog while a save is out', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    mockBackend(async (url, init) => {
      if (url.pathname !== '/api/compliance/policies/p-1' || init?.method !== 'PUT') return undefined;
      await held;
      return json({ detail: 'nope' }, 500);
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Compliance Rule' });
    await user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), ' kept');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('PUT', '/api/compliance/policies/p-1')).toHaveLength(1));
    await user.keyboard('{Escape}');
    // Longer than the modal's exit transition, so a closing dialog would be gone
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByRole('dialog', { name: 'Edit Compliance Rule' })).toBeInTheDocument();
    release();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByRole('dialog', { name: 'Edit Compliance Rule' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue('Owner assigned kept');
  });
});

/**
 * Wave 3 Task 7: Master Data (/master-data) on the page kit. Pixel values that
 * depend on the cascade (the pane widths, the long-name wrap, the page's
 * horizontal scroll) are measured in tests/e2e/master-data.spec.ts (ruling
 * R10); these tests check the structure, every control on every tab for both
 * personas, the two delete confirms, the requests the page sends, the
 * navigation into a review, and the empty and error states.
 *
 * The dialogs the page opens belong to Task 8 and are consumed as they are;
 * the Create Review dialog is stubbed here so a created review can be followed
 * without driving its principal picker (the real one opens in the Playwright
 * spec).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import MasterDataManagement from './master-data-management';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

vi.mock('@/components/mdm/create-review-dialog', () => ({
  default: ({ isOpen, runId, onClose, onSuccess }: {
    isOpen: boolean; runId: string; onClose: () => void; onSuccess: (id: string) => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="Create Match Review">
        <span>{runId}</span>
        <button type="button" onClick={() => onSuccess('rev-9')}>Create Review Request</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const CREATED = '2026-10-01T09:00:00Z';
const CONFIG = {
  id: 'mdm-1', name: 'Customer master', description: 'Golden record for customers',
  entity_type: 'customer', master_contract_id: 'c-1', master_contract_name: 'Orders contract',
  status: 'active', project_id: null,
  matching_rules: [
    { name: 'Email match', type: 'deterministic', fields: ['email'], weight: 1, threshold: 1 },
    { name: 'Name similarity', type: 'probabilistic', fields: ['first_name', 'last_name'], weight: 0.6, threshold: 0.85, algorithm: 'jaro_winkler' },
  ],
  survivorship_rules: [{ field: 'email', strategy: 'most_recent' }],
  source_count: 2, last_run_at: '2026-11-08T08:00:00Z', last_run_status: 'completed',
  created_at: CREATED, updated_at: CREATED, created_by: 'e2e.user@example.com',
};
const OTHER = {
  ...CONFIG, id: 'mdm-2', name: 'Product master', description: null, entity_type: 'product',
  status: 'paused', matching_rules: [], survivorship_rules: [], source_count: 0, last_run_at: null, last_run_status: null,
};
const CONFIGS = [CONFIG, OTHER];

const source = (n: number, contract: string, table: string, key: string) => ({
  id: `src-${n}`, config_id: 'mdm-1', source_contract_id: `c-src-${n}`, source_contract_name: contract,
  source_table_fqn: table, key_column: key, column_mapping: {}, priority: n, status: 'active',
  last_sync_at: CREATED, created_at: CREATED, updated_at: CREATED,
});
const SOURCES = [
  source(1, 'Web shop customers', 'main.web.customers', 'customer_id'),
  source(2, 'CRM accounts', 'main.crm.accounts', 'account_id'),
];
const RUN = {
  id: 'run-12345678-aaaa', config_id: 'mdm-1', source_link_id: null, status: 'completed', databricks_run_id: null,
  total_source_records: 1200, total_master_records: 900, matches_found: 3, new_records: 1,
  started_at: '2026-11-08T08:00:00Z', completed_at: '2026-11-08T08:10:00Z', error_message: null,
  triggered_by: 'e2e.user@example.com', pending_review_count: 2, approved_count: 1,
};
const candidate = (n: number, type: string, status: string, score: number, master: string | null, review: string | null = null) => ({
  id: `cand-${n}`, run_id: RUN.id, master_record_id: master, source_record_id: `src-rec-${n}`,
  source_contract_id: 'c-src-1', confidence_score: score, match_type: type, matched_fields: ['email'],
  status, master_record_data: null, source_record_data: {}, merged_record_data: null,
  review_request_id: review, reviewed_at: null, reviewed_by: null, merged_at: null,
});
const CANDIDATES = [
  candidate(1, 'exact', 'pending', 0.99, 'master-1', 'rev-1'),
  candidate(2, 'fuzzy', 'approved', 0.86, 'master-2'),
  candidate(3, 'new', 'pending', 0.5, null),
];

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response | undefined> | undefined;

function mockBackend(configs: unknown = CONFIGS, extra: Handler = () => undefined) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const answer = await extra(url, init);
    if (answer) return answer;
    const path = url.pathname;
    if (path === '/api/mdm/configs' && method === 'GET') return json(configs);
    if (path === '/api/mdm/configs/mdm-1' && method === 'GET') return json(CONFIG);
    if (path === '/api/mdm/configs/mdm-1/sources') return json(SOURCES);
    if (path === '/api/mdm/configs/mdm-1/runs') return json([RUN]);
    if (/^\/api\/mdm\/configs\/[^/]+\/(sources|runs)$/.test(path)) return json([]);
    if (path === `/api/mdm/runs/${RUN.id}/candidates`) return json(CANDIDATES);
    if (path.endsWith('/start-run') && method === 'POST') return json({ ...RUN, id: 'run-new', status: 'running' });
    if (path.endsWith('/merge-approved') && method === 'POST') return json({ message: 'Merged 1 record' });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (path === '/api/directory/status') return json({ configured: false, provider_type: null, connection_name: null });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string, pathname: string | RegExp) =>
  fetchMock.mock.calls.filter(([input, init]) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    return (typeof pathname === 'string' ? path === pathname : pathname.test(path)) && (init?.method ?? 'GET') === method;
  });

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'master-data': level },
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
      <Route path="/master-data" element={<MasterDataManagement />} />
      <Route path="/data-asset-reviews/:id" element={<p>Review page</p>} />
    </Routes>,
    { route: '/master-data' },
  );

const list = () => screen.getByRole('listbox', { name: 'MDM Configurations' });
const loaded = () => screen.findByRole('option', { name: /Customer master/ });
const configRow = (name: string | RegExp) => within(list()).getByRole('option', { name: typeof name === 'string' ? new RegExp(name) : name });
const details = (name = 'Customer master') => screen.getByRole('region', { name });
const names = (els: HTMLElement[]) =>
  els.map((el) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || el.getAttribute('title') || ''));
const sorted = (l: string[]) => [...l].sort();
type User = ReturnType<typeof userEvent.setup>;

async function selectCustomer(user: User) {
  await user.click(configRow('Customer master'));
  await within(details()).findByRole('tab', { name: 'Sources (2)' });
  await within(details()).findByRole('tab', { name: 'Match Runs (1)' });
}

const tab = (name: string | RegExp) => within(details()).getByRole('tab', { name });
const panel = () => within(details()).getByRole('tabpanel');

describe('master data on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    toast.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('master data renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(container.querySelector(`.${kit.page}`)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();

    const heading = screen.getByRole('heading', { level: 1, name: 'Master Data Management' });
    expect(heading.parentElement).toHaveClass(kit.header);
    expect(within(heading.parentElement as HTMLElement).getByRole('button', { name: 'New MDM Configuration' })).toBeInTheDocument();
    // The subtitle, under the header's line
    expect(screen.getByText('Define master data contracts and manage entity matching across systems')).toBeInTheDocument();

    // Two kit panes side by side in a PaneStack, 1/3 and 2/3
    const configs = screen.getByRole('region', { name: 'MDM Configurations' });
    const side = screen.getByRole('region', { name: 'Configuration Details' });
    expect(configs).toHaveClass(kit.pane);
    expect(side).toHaveClass(kit.pane);
    const cells = Array.from(container.querySelectorAll<HTMLElement>(`.${kit.stackCell}`));
    expect(cells.map((c) => c.style.getPropertyValue('--pane-size'))).toEqual(['1', '2']);
    expect(cells[0]).toContainElement(configs);
    expect(cells[1]).toContainElement(side);
    expect(within(side).getByText('Select an MDM Configuration')).toBeInTheDocument();

    // No layout padding, shadcn card or Tailwind class in the page's own markup
    expect(container.querySelector('.py-6, .p-6, .space-y-6, .text-3xl, .grid-cols-12, .col-span-4, .col-span-8')).toBeNull();
    expect(container.querySelector('[data-slot="card"], .rounded-lg.border, [class*="bg-primary"], [class*="text-muted"]')).toBeNull();
    expect(container.querySelector('.text-center, .text-lg, .font-medium:not(button), .text-sm:not(button), [class*="h-[calc"]')).toBeNull();

    const user = userEvent.setup();
    await selectCustomer(user);
    for (const name of ['Overview', /^Sources/, 'Matching Rules', /^Match Runs/]) {
      await user.click(tab(name));
      expect(container.querySelector('.text-center, .rounded-lg, .space-y-2, .space-y-3, .grid-cols-2, .grid-cols-4, [class*="text-green"], [class*="text-yellow"], [class*="text-blue"], .font-mono')).toBeNull();
    }
  });

  it.each([
    ['an admin', FeatureAccessLevel.ADMIN],
    ['a read-only user', FeatureAccessLevel.READ_ONLY],
  ])('master data keeps every control for %s', async (_who, level) => {
    // The page has never gated its controls: the baselines of both personas
    // show the same inventory
    grant(level);
    const user = userEvent.setup();
    renderPage();
    await loaded();

    // Nothing selected (the Task 1 baseline's inventory): a delete per
    // configuration (unnamed, R10) and the two create buttons
    expect(sorted(names(screen.getAllByRole('button')))).toEqual(
      sorted(['', '', 'Create New Configuration', 'New MDM Configuration']));
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    // Each row: name, entity type and source count, status
    expect(within(configRow('Customer master')).getByText('Customer master')).toHaveAttribute('title', 'Customer master');
    expect(within(configRow('Customer master')).getByText(/customer • 2 sources/)).toBeInTheDocument();
    expect(within(configRow('Customer master')).getByText('active')).toBeInTheDocument();
    expect(within(configRow('Product master')).getByText('paused')).toBeInTheDocument();

    await selectCustomer(user);
    const pane = details();
    expect(configRow('Customer master')).toHaveAttribute('aria-selected', 'true');
    expect(within(pane).getByText('Golden record for customers')).toBeInTheDocument();
    expect(within(pane).getAllByRole('tab').map((t) => t.textContent)).toEqual(
      ['Overview', 'Sources (2)', 'Matching Rules', 'Match Runs (1)']);
    expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
    // Overview: the facts and the run statistics
    expect(sorted(names(within(pane).getAllByRole('button')))).toEqual(sorted(['Start Matching', 'Link Source']));
    for (const text of ['Orders contract', 'customer', 'active', 'Total Runs', 'Matches Found', 'New Records', 'Pending Review']) {
      expect(within(panel()).getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(within(panel()).getByText('Master Contract')).toBeInTheDocument();
    expect(within(panel()).getByText('Linked Sources')).toBeInTheDocument();

    // Sources: one row per source link, each with its remove button
    await user.click(tab('Sources (2)'));
    expect(sorted(names(within(pane).getAllByRole('button')))).toEqual(
      sorted(['Start Matching', 'Link Source', 'Remove source link', 'Remove source link']));
    const rows = within(panel()).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Source Contract', 'Table', 'Key Column', 'Priority', 'Status', '']);
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual(
      ['Web shop customers', 'main.web.customers', 'customer_id', '1', 'active', '']);

    // Matching Rules: the rules, and the survivorship rules
    await user.click(tab('Matching Rules'));
    expect(sorted(names(within(pane).getAllByRole('button')))).toEqual(sorted(['Start Matching', 'Link Source', 'Edit Rules']));
    for (const text of ['Email match', 'Name similarity', 'deterministic', 'probabilistic', 'Survivorship Rules', 'most_recent']) {
      expect(within(panel()).getByText(text)).toBeInTheDocument();
    }
    expect(within(panel()).getByText(/Fields: first_name, last_name/)).toHaveTextContent(/Algorithm: jaro_winkler/);

    // Match Runs: the run, its counts and actions
    await user.click(tab('Match Runs (1)'));
    expect(sorted(names(within(pane).getAllByRole('button')))).toEqual(
      sorted(['Start Matching', 'Link Source', 'Merge (1)', 'Create Review', 'View']));
    for (const text of ['Run run-1234...', 'e2e.user@example.com', '3 matches', '1 new', '2 pending review', '1 ready to merge', 'completed']) {
      expect(within(panel()).getByText(text)).toBeInTheDocument();
    }

    // View opens the Candidates tab, which appears only once a run is chosen
    await user.click(within(panel()).getByRole('button', { name: 'View' }));
    await waitFor(() => expect(tab('Candidates (3)')).toHaveAttribute('aria-selected', 'true'));
    expect(sorted(names(within(pane).getAllByRole('button')))).toEqual(sorted(['Start Matching', 'Link Source', 'Merge Approved']));
    expect(within(panel()).getByText('Match Candidates for Run run-1234...')).toBeInTheDocument();
    expect(within(panel()).getByText('2 pending, 1 approved, 0 merged')).toBeInTheDocument();
    const candRows = within(panel()).getAllByRole('row');
    expect(candRows).toHaveLength(4);
    expect(within(candRows[0]).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Type', 'Master ID', 'Source ID', 'Confidence', 'Matched Fields', 'Status']);
    expect(within(candRows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual(
      ['exact', 'master-1', 'src-rec-1', '99.0%', 'email', 'pending']);
    expect(within(candRows[3]).getAllByRole('cell')[1]).toHaveTextContent('New');
  });

  it('master data: nothing selected says how to start, and an empty list says so', async () => {
    mockBackend([]);
    renderPage();
    expect(await screen.findByText('No MDM configurations yet.')).toBeInTheDocument();
    expect(screen.getByText('Create one to get started.')).toBeInTheDocument();
    expect(screen.getByText('Choose a configuration from the list to view details and manage matching runs.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New MDM Configuration' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create New Configuration' })).toBeEnabled();
  });

  it('master data: a configuration with no sources, rules or runs says so, with its actions', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(configRow('Product master'));
    const pane = details('Product master');
    // Not active: Start Matching is off; the description falls back to the entity type
    expect(within(pane).getByRole('button', { name: 'Start Matching' })).toBeDisabled();
    expect(within(pane).getByText('Master contract for product entities')).toBeInTheDocument();
    await user.click(within(pane).getByRole('tab', { name: 'Sources (0)' }));
    expect(within(pane).getByText('No source contracts linked yet.')).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Link Source Contract' })).toBeEnabled();
    await user.click(within(pane).getByRole('tab', { name: 'Matching Rules' }));
    expect(within(pane).getByText('No matching rules configured. Default rules will be used.')).toBeInTheDocument();
    expect(within(pane).getByText('No survivorship rules configured. Source values will be preferred.')).toBeInTheDocument();
    await user.click(within(pane).getByRole('tab', { name: 'Match Runs (0)' }));
    expect(within(pane).getByText('No match runs yet.')).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Start First Matching Run' })).toBeEnabled();
  });

  it('master data empty and error states keep their message and actions', async () => {
    let failing = true;
    mockBackend(CONFIGS, (url, init) =>
      failing && url.pathname === '/api/mdm/configs' && (init?.method ?? 'GET') === 'GET'
        ? json({ detail: 'Backend unavailable' }, 500)
        : undefined);
    const user = userEvent.setup();
    renderPage();
    const pane = await screen.findByRole('region', { name: 'MDM Configurations' });
    expect(await within(pane).findByRole('alert')).toHaveTextContent('Backend unavailable');
    expect(screen.getByRole('button', { name: 'New MDM Configuration' })).toBeEnabled();
    // Retry brings the list back, and the error goes
    failing = false;
    await user.click(within(pane).getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(within(pane).queryByRole('alert')).toBeNull();
  });

  it('master data: the last good list stays under a reload error, which clears after a later success', async () => {
    let failing = false;
    mockBackend(CONFIGS, (url, init) =>
      failing && url.pathname === '/api/mdm/configs' && (init?.method ?? 'GET') === 'GET'
        ? json({ detail: 'Backend unavailable' }, 500)
        : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await selectCustomer(user);
    failing = true;
    // Removing a source reloads the list
    await user.click(tab('Sources (2)'));
    await user.click(within(panel()).getAllByRole('button', { name: 'Remove source link' })[0]);
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
    const pane = screen.getByRole('region', { name: 'MDM Configurations' });
    expect(await within(pane).findByRole('alert')).toHaveTextContent('Backend unavailable');
    expect(configRow('Customer master')).toBeInTheDocument();
    expect(configRow('Product master')).toBeInTheDocument();
    expect(details()).toBeInTheDocument();
    failing = false;
    await user.click(within(pane).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(pane).queryByRole('alert')).toBeNull());
    expect(configRow('Customer master')).toBeInTheDocument();
  });

  it('master data: a list that is not an array shows as empty, and a failed candidates answer does not break the page', async () => {
    mockBackend({ detail: 'odd' });
    const { unmount } = renderPage();
    expect(await screen.findByText('No MDM configurations yet.')).toBeInTheDocument();
    unmount();

    mockBackend(CONFIGS, (url) =>
      url.pathname.endsWith('/candidates') ? json({ detail: 'Candidates unavailable' }, 500) : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await selectCustomer(user);
    await user.click(tab('Match Runs (1)'));
    await user.click(within(panel()).getByRole('button', { name: 'View' }));
    await waitFor(() => expect(tab('Candidates (0)')).toHaveAttribute('aria-selected', 'true'));
    expect(within(panel()).getByText('No candidates found for this run.')).toBeInTheDocument();
  });

  it('master data: tab switching keeps the selected configuration without refetching more than the old page did', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    expect(calls('GET', '/api/mdm/configs')).toHaveLength(1);
    await selectCustomer(user);
    expect(calls('GET', '/api/mdm/configs/mdm-1/sources')).toHaveLength(1);
    expect(calls('GET', '/api/mdm/configs/mdm-1/runs')).toHaveLength(1);
    const before = fetchMock.mock.calls.length;

    for (const name of [/^Sources/, 'Matching Rules', /^Match Runs/, 'Overview', /^Sources/]) {
      await user.click(tab(name));
      expect(tab(name)).toHaveAttribute('aria-selected', 'true');
      expect(configRow('Customer master')).toHaveAttribute('aria-selected', 'true');
      expect(details()).toBeInTheDocument();
    }
    // No request at all from switching tabs (the old page sent none)
    expect(fetchMock.mock.calls.length).toBe(before);

    // Opening a run fetches its candidates once; going back and forth fetches nothing more
    await user.click(tab(/^Match Runs/));
    await user.click(within(panel()).getByRole('button', { name: 'View' }));
    await waitFor(() => expect(tab('Candidates (3)')).toHaveAttribute('aria-selected', 'true'));
    await user.click(tab('Overview'));
    await user.click(tab('Candidates (3)'));
    expect(calls('GET', `/api/mdm/runs/${RUN.id}/candidates`)).toHaveLength(1);
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });

  it('master data: choosing another configuration drops the run, shows its own tabs, and ignores the first one\'s late answers', async () => {
    let releaseOld: () => void = () => {};
    const held = new Promise<void>((resolve) => { releaseOld = resolve; });
    let holding = false;
    mockBackend(CONFIGS, async (url) => {
      if (holding && url.pathname === '/api/mdm/configs/mdm-1/sources') {
        await held;
        return json(SOURCES);
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await selectCustomer(user);
    await user.click(tab(/^Match Runs/));
    await user.click(within(panel()).getByRole('button', { name: 'View' }));
    await waitFor(() => expect(tab('Candidates (3)')).toHaveAttribute('aria-selected', 'true'));

    // From the Candidates tab to another configuration: a tab of its own shows,
    // not an empty pane
    await user.click(configRow('Product master'));
    const pane = details('Product master');
    expect(within(pane).queryByRole('tab', { name: /Candidates/ })).toBeNull();
    expect(within(pane).getByRole('tabpanel')).toBeInTheDocument();
    expect(within(pane).getByRole('tab', { selected: true })).toBeInTheDocument();

    // Back to the first, whose sources answer late, then the second again
    holding = true;
    await user.click(configRow('Customer master'));
    await user.click(configRow('Product master'));
    releaseOld();
    await new Promise((r) => setTimeout(r, 30));
    expect(within(details('Product master')).getByRole('tab', { name: 'Sources (0)' })).toBeInTheDocument();
  });

  it('master data: Start Matching sends once on a double click, and a failure says why', async () => {
    let fail = false;
    mockBackend(CONFIGS, async (url, init) => {
      if (!url.pathname.endsWith('/start-run') || init?.method !== 'POST') return undefined;
      await new Promise((r) => setTimeout(r, 100));
      return fail ? json({ detail: 'Cluster unavailable' }, 500) : undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await selectCustomer(user);
    await user.dblClick(within(details()).getByRole('button', { name: 'Start Matching' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'MDM matching job started' })));
    expect(calls('POST', '/api/mdm/configs/mdm-1/start-run')).toHaveLength(1);
    // The runs are fetched again after the start
    await waitFor(() => expect(calls('GET', '/api/mdm/configs/mdm-1/runs')).toHaveLength(2));

    fail = true;
    toast.mockClear();
    await user.click(within(details()).getByRole('button', { name: 'Start Matching' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Cluster unavailable', variant: 'destructive' })));
  });

  it('master data: Merge sends once on a double click, and refreshes the runs', async () => {
    mockBackend(CONFIGS, async (url, init) => {
      if (!url.pathname.endsWith('/merge-approved') || init?.method !== 'POST') return undefined;
      await new Promise((r) => setTimeout(r, 100));
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await selectCustomer(user);
    await user.click(tab(/^Match Runs/));
    await user.dblClick(within(panel()).getByRole('button', { name: 'Merge (1)' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Merged 1 record' })));
    expect(calls('POST', `/api/mdm/runs/${RUN.id}/merge-approved`)).toHaveLength(1);
    await waitFor(() => expect(calls('GET', '/api/mdm/configs/mdm-1/runs')).toHaveLength(2));
    // A click on Merge does not open the run
    expect(within(details()).queryByRole('tab', { name: /Candidates/ })).toBeNull();
  });

  it('master data delete confirm is an alertdialog, sends once and returns focus (configuration)', async () => {
    let gone = false;
    mockBackend(CONFIGS, async (url, init) => {
      if (init?.method === 'DELETE') {
        gone = true;
        await new Promise((r) => setTimeout(r, 100));
        return new Response(null, { status: 204 });
      }
      if (gone && url.pathname === '/api/mdm/configs') return json([OTHER]);
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await selectCustomer(user);
    const del = within(configRow('Customer master')).getByRole('button');

    // Cancel sends nothing, keeps the selection, and focus is back on the row's delete
    await user.click(del);
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Configuration' });
    expect(confirm).toHaveTextContent('Are you sure you want to delete this MDM configuration?');
    expect(confirm).toHaveTextContent('Customer master');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(del).toHaveFocus());
    expect(calls('DELETE', /\/api\/mdm\/configs\//)).toHaveLength(0);
    expect(configRow('Customer master')).toHaveAttribute('aria-selected', 'true');

    // Delete with a double click: one request, the row and its details go, focus goes to New MDM Configuration
    await user.click(del);
    await user.dblClick(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls('DELETE', '/api/mdm/configs/mdm-1')).toHaveLength(1);
    await waitFor(() => expect(within(list()).queryByRole('option', { name: /Customer master/ })).toBeNull());
    expect(screen.getByRole('region', { name: 'Configuration Details' })).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Configuration deleted' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'New MDM Configuration' })).toHaveFocus());
    expect(calls('DELETE', '/api/mdm/configs/mdm-1')).toHaveLength(1);
  });

  it('master data: deleting a configuration from its row does not select it, and a failed delete keeps it', async () => {
    mockBackend(CONFIGS, (_url, init) => (init?.method === 'DELETE' ? json({ detail: 'In use' }, 409) : undefined));
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(configRow('Product master')).getByRole('button'));
    expect(configRow('Product master')).toHaveAttribute('aria-selected', 'false');
    expect(calls('GET', /\/sources$/)).toHaveLength(0);
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'In use', variant: 'destructive' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(configRow('Product master')).toBeInTheDocument();
  });

  it('master data delete confirm is an alertdialog, sends once and returns focus (source link)', async () => {
    let gone = false;
    mockBackend(CONFIGS, async (url, init) => {
      if (init?.method === 'DELETE') {
        gone = true;
        await new Promise((r) => setTimeout(r, 100));
        return new Response(null, { status: 204 });
      }
      if (gone && url.pathname === '/api/mdm/configs/mdm-1/sources') return json(SOURCES.slice(1));
      if (gone && url.pathname === '/api/mdm/configs') return json([{ ...CONFIG, source_count: 1 }, OTHER]);
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await selectCustomer(user);
    await user.click(tab('Sources (2)'));
    const remove = within(panel()).getAllByRole('button', { name: 'Remove source link' })[0];

    await user.click(remove);
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove source link' });
    expect(confirm).toHaveTextContent('Are you sure you want to remove this source link?');
    expect(confirm).toHaveTextContent('Web shop customers');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(remove).toHaveFocus());
    expect(calls('DELETE', /\/api\/mdm\/sources\//)).toHaveLength(0);

    await user.click(remove);
    await user.dblClick(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls('DELETE', '/api/mdm/sources/src-1')).toHaveLength(1);
    await waitFor(() => expect(within(details()).getByRole('tab', { name: 'Sources (1)' })).toBeInTheDocument());
    expect(within(panel()).queryByText('Web shop customers')).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Source link removed' }));
    await waitFor(() => expect(within(details()).getByRole('button', { name: 'Link Source' })).toHaveFocus());
    // The list's source count is fetched again, as before
    await waitFor(() => expect(within(configRow('Customer master')).getByText(/1 sources/)).toBeInTheDocument());
  });

  it('master data opens the Task 8 dialogs from the page', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'New MDM Configuration' }));
    expect(await screen.findByRole('dialog', { name: 'New MDM Configuration' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Create New Configuration' }));
    expect(await screen.findByRole('dialog', { name: 'New MDM Configuration' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await selectCustomer(user);
    await user.click(within(details()).getByRole('button', { name: 'Link Source' }));
    expect(await screen.findByRole('dialog', { name: 'Link Source Contract' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(tab('Matching Rules'));
    await user.click(within(panel()).getByRole('button', { name: 'Edit Rules' }));
    expect(await screen.findByRole('dialog', { name: 'Edit MDM Rules' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(tab(/^Match Runs/));
    await user.click(within(panel()).getByRole('button', { name: 'Create Review' }));
    const review = await screen.findByRole('dialog', { name: 'Create Match Review' });
    expect(review).toHaveTextContent(RUN.id);
    // Create Review chooses the run, as before: its Candidates tab appears, not opened
    expect(within(details()).getByRole('tab', { name: /Candidates/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('master data: a created review and a candidate with a review open /data-asset-reviews/:id', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();
    await loaded();
    await selectCustomer(user);
    await user.click(tab(/^Match Runs/));
    await user.click(within(panel()).getByRole('button', { name: 'Create Review' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Create Match Review' })).getByRole('button', { name: 'Create Review Request' }));
    expect(await screen.findByText('Review page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/data-asset-reviews/rev-9');
    unmount();

    renderPage();
    await loaded();
    await selectCustomer(user);
    await user.click(tab(/^Match Runs/));
    await user.click(within(panel()).getByRole('button', { name: 'View' }));
    await waitFor(() => expect(tab('Candidates (3)')).toHaveAttribute('aria-selected', 'true'));
    // A candidate without a review goes nowhere
    await user.click(within(panel()).getByText('src-rec-2'));
    expect(window.location.pathname).toBe('/master-data');
    await user.click(within(panel()).getByText('src-rec-1'));
    expect(await screen.findByText('Review page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/data-asset-reviews/rev-1');
  });

  it('master data: Escape waits while a delete is out', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    mockBackend(CONFIGS, async (_url, init) => {
      if (init?.method !== 'DELETE') return undefined;
      await held;
      return new Response(null, { status: 204 });
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(configRow('Product master')).getByRole('button'));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await user.keyboard('{Escape}');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls('DELETE', '/api/mdm/configs/mdm-2')).toHaveLength(1);
  });

  it('master data: saved rules refresh the configuration, and a failed refresh keeps it on screen', async () => {
    let failRefresh = false;
    const renamed = { ...CONFIG, matching_rules: [{ ...CONFIG.matching_rules[0], name: 'Phone match' }] };
    mockBackend(CONFIGS, (url, init) => {
      if (url.pathname === '/api/mdm/configs/mdm-1' && init?.method === 'PUT') return json(renamed);
      if (url.pathname === '/api/mdm/configs/mdm-1' && (init?.method ?? 'GET') === 'GET') {
        return failRefresh ? json({ detail: 'Gone' }, 500) : json(renamed);
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await selectCustomer(user);
    await user.click(tab('Matching Rules'));
    await user.click(within(panel()).getByRole('button', { name: 'Edit Rules' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Edit MDM Rules' })).getByRole('button', { name: 'Save Rules' }));
    expect(await within(panel()).findByText('Phone match')).toBeInTheDocument();
    expect(calls('PUT', '/api/mdm/configs/mdm-1')).toHaveLength(1);

    // The old page put the error answer's empty object in the selection and broke
    failRefresh = true;
    await user.click(within(panel()).getByRole('button', { name: 'Edit Rules' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Edit MDM Rules' })).getByRole('button', { name: 'Save Rules' }));
    await waitFor(() => expect(calls('GET', '/api/mdm/configs/mdm-1')).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 30));
    expect(details()).toBeInTheDocument();
    expect(tab('Matching Rules')).toBeInTheDocument();
  });

  it('master data: a click on a run opens its candidates', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await selectCustomer(user);
    await user.click(tab(/^Match Runs/));
    await user.click(within(panel()).getByText('Run run-1234...'));
    await waitFor(() => expect(tab('Candidates (3)')).toHaveAttribute('aria-selected', 'true'));
  });

  it('master data: arrow keys move through the configuration list and Enter selects', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const [first, second] = within(list()).getAllByRole('option');
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(details('Product master')).toBeInTheDocument();
  });

  it('master data: long names carry a title in the list, the pane head, the sources and the rules', async () => {
    const LONG = `Customer golden record for every region ${'and every partner system '.repeat(8)}`.slice(0, 199) + '.';
    const UNBROKEN = 'x'.repeat(200);
    const long = { ...CONFIG, name: LONG, matching_rules: [{ ...CONFIG.matching_rules[0], name: UNBROKEN }] };
    mockBackend([long], (url) =>
      url.pathname === '/api/mdm/configs/mdm-1/sources' ? json([{ ...SOURCES[0], source_contract_name: UNBROKEN }]) : undefined);
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByRole('option', { name: /Customer golden record/ });
    expect(within(row).getByText(LONG)).toHaveAttribute('title', LONG);
    await user.click(row);
    const pane = screen.getByRole('region', { name: LONG });
    expect(within(pane).getByRole('heading', { level: 2 })).toHaveAttribute('title', LONG);
    await user.click(await within(pane).findByRole('tab', { name: 'Sources (1)' }));
    expect(within(pane).getByText(UNBROKEN)).toHaveAttribute('title', UNBROKEN);
    await user.click(within(pane).getByRole('tab', { name: 'Matching Rules' }));
    expect(within(pane).getByText(UNBROKEN)).toHaveAttribute('title', UNBROKEN);
  });
});

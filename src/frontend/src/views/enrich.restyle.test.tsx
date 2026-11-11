/**
 * Wave 2 Task 14: Enrich (/concepts/enrich) on the page kit, with its
 * coverage matrix, delivery targets and delivery modes
 * (components/enrich). The look, the long names and the matrix scrolling
 * inside its pane are measured in a real browser in
 * tests/e2e/concepts-enrich-mapping.spec.ts (ruling R10); these tests check
 * the structure, every control for a writer and a reader, the API calls,
 * stale answers, and the empty and error states. The dialogs' own tests are
 * in components/enrich and components/term-mapping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, pick, selectField } from '@/test/kit-dialog';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { ConceptModeSwitch } from '@/components/concepts/mode-switch';
import { useEnrichCoverageTableStore } from '@/stores/enrich-coverage-table-store';
import EnrichView from './enrich';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LONG_NAME = `Customer ${'lifetime-revenue-and-retention-scheme-'.repeat(6)}`.slice(0, 200);

const scheme = (id: string, label: string, extra: Record<string, unknown> = {}) => ({
  scheme: id, label, concepts: 10, coverage_pct: 50, products: 1, contracts: 2, assets: 5, suggested: 0,
  last_run_at: null, ...extra,
});

const COVERAGE = {
  schemes: [
    scheme('urn:finance', 'Finance', { suggested: 3 }),
    scheme('urn:hr', 'People', { suggested: 0 }),
    scheme('urn:long', LONG_NAME, { suggested: 1 }),
  ],
};

const TAG_STATS = {
  eligible: 40, pending: 2, synced: 38, last_run_state: 'SUCCESS', last_run_at: '2026-11-08T10:00:00Z',
  job_installed: true,
  pending_items: [
    {
      entity_id: 'main.sales.orders', entity_type: 'uc_table', iri: 'urn:concept:order', label: LONG_NAME,
      created_at: '2026-11-08T11:00:00Z', scheme: 'urn:finance', scheme_label: 'Finance', asset_name: 'orders',
    },
  ],
};

const pending = (id: string, label: string) => ({
  id, run_id: 'run-1', source_entity_type: 'asset', source_entity_id: `main.sales.${id}`, source_label: null,
  target_concept_iri: `urn:concept:${id}`, target_concept_label: label, confidence: 0.9, reason: 'label match',
});

let fetchMock: ReturnType<typeof vi.fn>;
let coverage: { status: number; body: unknown } = { status: 200, body: COVERAGE };
let connections: unknown = [];
/** A path whose answer waits for `release(body)` */
let held: { path: string; release?: (body: unknown) => void } | null = null;

function mockBackend() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (held && url.pathname === held.path) {
      const hold = held;
      held = null;
      return new Promise<Response>((resolve) => {
        hold.release = (body) => resolve(json(body));
      });
    }
    if (init?.method === 'POST') return json({ accepted: 3, rejected: 0, skipped: 0, errors: [] });
    switch (url.pathname) {
      case '/api/knowledge/coverage':
        return json(coverage.body, coverage.status);
      case '/api/knowledge/tag-delivery-stats':
        return json(TAG_STATS);
      case '/api/connections':
        return json(connections);
      case '/api/knowledge/coverage/urn%3Afinance/pending-suggestions':
        return json([pending('f1', 'Payment Term'), pending('f2', 'Net Revenue')]);
      case '/api/knowledge/coverage/urn%3Along/pending-suggestions':
        return json([pending('l1', 'Long Scheme Concept')]);
      default:
        return json([]);
    }
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === pathname && ((init as RequestInit | undefined)?.method ?? 'GET') === method);

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'term-mapping': level },
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

const renderPage = () =>
  renderWithMantine(
    <Routes>
      <Route path="/concepts/enrich" element={<><ConceptModeSwitch /><EnrichView /><Probe /></>} />
      <Route path="*" element={<><p>elsewhere</p><Probe /></>} />
    </Routes>,
    { route: '/concepts/enrich' },
  );

const mapPane = () => screen.getByRole('region', { name: 'Map' });
const deliverPane = () => screen.getByRole('region', { name: 'Deliver' });
const loaded = () => within(mapPane()).findByText('People');

/** Classes that look like Tailwind utilities, outside the ui Button and Badge (which stay, wave 6) and the shared DataTable's own chrome. */
function tailwindIn(root: HTMLElement): string[] {
  const utility = /^(?:[a-z]+:)*-?(?:flex|grid|hidden|inline|block|truncate|shrink|grow|items-|justify-|self-|gap-|space-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|min-|max-|text-|font-|bg-|border|rounded|shadow|leading-|tracking-|whitespace-|cursor-|opacity-|tabular-nums|uppercase|animate-|relative|absolute|ml-auto)/;
  const found = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>('[class]')) {
    if (el.closest('.mantine-Badge-root, .mantine-Button-root')) continue;
    // The shared DataTable (consumed as it is): only what this page puts in its cells counts
    const table = el.closest('[data-enrich-matrix]');
    if (table && (!el.closest('td, th') || ['TD', 'TH', 'TR'].includes(el.tagName))) continue;
    for (const c of el.classList) if (utility.test(c)) found.add(c);
  }
  return [...found];
}

function expectNoOldMarkup(root: HTMLElement) {
  expect(root.querySelectorAll('.p-6, .py-6, .bg-card, .rounded-lg, .shadow-sm, .max-w-\\[1180px\\]')).toHaveLength(0);
  expect(tailwindIn(root)).toEqual([]);
}

beforeEach(() => {
  coverage = { status: 200, body: COVERAGE };
  connections = [];
  held = null;
  localStorage.setItem('ontosConceptMode', 'simple');
  document.documentElement.setAttribute('data-mode', 'simple');
  useEnrichCoverageTableStore.getState().reset();
  mockBackend();
  grant(FeatureAccessLevel.READ_WRITE);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('enrich renders with the page kit', () => {
  it('has the kit header, the platform bar, the Map and Deliver panes, and no old markup', async () => {
    const { container } = renderPage();
    await loaded();

    const h1 = screen.getByRole('heading', { level: 1, name: 'Enrich' });
    expect(h1.parentElement).toHaveClass(kit.header);
    expect(screen.getByText('Map your concepts to assets, then deliver governed metadata onto the platform.')).toBeInTheDocument();
    expect(mapPane()).toHaveClass(kit.pane);
    expect(deliverPane()).toHaveClass(kit.pane);
    // One stack of panes, Map above Deliver
    expect(mapPane().parentElement).toBe(deliverPane().parentElement);
    expect(mapPane().parentElement).toHaveClass(kit.stack);
    // The matrix is in Map; the targets are in Deliver
    expect(within(mapPane()).getByRole('table')).toBeInTheDocument();
    expect(within(deliverPane()).getAllByRole('listitem')).toHaveLength(3);
    expectNoOldMarkup(container);
  });

  it('has no old markup in the advanced view either', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: /^Large View/ }));
    expect(within(deliverPane()).getByText('Direct')).toBeInTheDocument();
    expectNoOldMarkup(container);
    await user.click(screen.getByRole('button', { name: 'Small View' }));
  });
});

describe.each([
  ['a writer', FeatureAccessLevel.READ_WRITE, true],
  ['a reader', FeatureAccessLevel.READ_ONLY, false],
])('enrich keeps every control for %s', (_who, level, canWrite) => {
  beforeEach(() => grant(level));

  it('loads coverage, tag stats and connections, and lists the platforms', async () => {
    const user = userEvent.setup();
    connections = [
      { connector_type: 'snowflake', enabled: true },
      { connector_type: 'snowflake', enabled: true },
      { connector_type: 'bigquery', enabled: false },
      { connector_type: 'databricks', enabled: true },
    ];
    renderPage();
    await loaded();
    expect(calls('/api/knowledge/coverage')).toHaveLength(1);
    expect(calls('/api/knowledge/tag-delivery-stats')).toHaveLength(1);
    expect(calls('/api/connections')).toHaveLength(1);

    const platform = selectField(document.body, 'Deliver to');
    expect(platform).toHaveValue('Databricks, Unity Catalog');
    await waitFor(async () => {
      await user.click(platform);
      expect(screen.getAllByRole('option', { hidden: true }).map((o) => o.textContent)).toEqual(['Databricks, Unity Catalog', 'Snowflake']);
      await user.click(platform);
    });
    await pick(user, platform, 'Snowflake');
    expect(platform).toHaveValue('Snowflake');
    expect(within(mapPane()).getByText(/straight to a Snowflake Asset/)).toBeInTheDocument();
    // Tags are delivered only on Unity Catalog: the row turns read-only
    expect(within(deliverPane()).getByRole('button', { name: /Manage in Settings/ })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Manage connections ↗' })).toHaveAttribute('href', '/settings/connectors');
    expect(screen.getByRole('button', { name: /^Delivery platforms come from/ })).toBeInTheDocument();
  });

  it('keeps the matrix: rows, sorting, filtering, totals and Review', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const map = within(mapPane());

    expect(map.getByText('Finance')).toBeInTheDocument();
    expect(map.getByText('All selected')).toBeInTheDocument();
    // Totals over all rows: 30 concepts, 15 covered
    const totals = map.getByText('All selected').closest('tr')!;
    expect(within(totals).getByText('30')).toBeInTheDocument();
    expect(within(totals).getByText('50%')).toBeInTheDocument();
    expect(map.getByText('15 concepts have no link yet.')).toBeInTheDocument();

    for (const name of ['Concept scheme', 'Concepts', 'Coverage', 'Products', 'Contracts', 'Assets', 'Suggested']) {
      expect(map.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(map.getByRole('button', { name: /^Asset links are what Deliver enriches/ })).toBeInTheDocument();
    expect(map.getByRole('button', { name: /^Coverage = share/ })).toBeInTheDocument();

    // Sort by Concepts, descending on the second click
    await user.click(map.getByRole('button', { name: 'Concepts' }));
    await user.click(map.getByRole('button', { name: 'Concepts' }));
    expect(useEnrichCoverageTableStore.getState().sorting).toEqual([{ id: 'concepts', desc: true }]);

    await user.type(map.getByPlaceholderText('Filter schemes...'), 'Fin');
    await waitFor(() => expect(map.queryByText('People')).toBeNull());
    expect(map.getByText('Finance')).toBeInTheDocument();
    await user.clear(map.getByPlaceholderText('Filter schemes...'));

    // Review: enabled with suggestions, for a writer
    await waitFor(() => expect(map.getAllByRole('button', { name: 'Review' })).toHaveLength(3));
    const reviews = map.getAllByRole('button', { name: 'Review' });
    const peopleRow = map.getByText('People').closest('tr')!;
    expect(within(peopleRow).getByRole('button', { name: 'Review' })).toBeDisabled();
    const financeRow = map.getByText('Finance').closest('tr')!;
    const financeReview = within(financeRow).getByRole('button', { name: 'Review' });
    if (canWrite) expect(financeReview).toBeEnabled();
    else for (const r of reviews) expect(r).toBeDisabled();

    expect(map.getByRole('button', { name: 'Suggest matches' })).toHaveProperty('disabled', !canWrite);
  });

  it('opens Review for a scheme, with its pending suggestions', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    if (!canWrite) return;
    const financeRow = within(mapPane()).getByText('Finance').closest('tr')!;
    await user.click(within(financeRow).getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Review suggested matches')).toBeInTheDocument();
    expect(await within(dialog).findByText('Payment Term')).toBeInTheDocument();
    expect(calls('/api/knowledge/coverage/urn%3Afinance/pending-suggestions')).toHaveLength(1);

    // Accept & apply all: the decisions, the apply, then coverage and tag stats again
    await user.click(within(dialog).getByRole('button', { name: /Accept & apply all 2/ }));
    await waitFor(() => expect(calls('/api/term-mappings/runs/run-1/apply', 'POST')).toHaveLength(1));
    const [, init] = calls('/api/term-mappings/runs/run-1/decisions', 'POST')[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      decisions: [{ id: 'f1', decision: 'accept' }, { id: 'f2', decision: 'accept' }],
    });
    await waitFor(() => expect(calls('/api/knowledge/coverage')).toHaveLength(2));
    expect(calls('/api/knowledge/tag-delivery-stats')).toHaveLength(2);
  });

  it('keeps the Deliver lane: targets, the pending list and Manage in Settings', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const deliver = within(deliverPane());
    expect(deliver.getByText('Tags')).toBeInTheDocument();
    expect(deliver.getByText('Live')).toBeInTheDocument();
    expect(deliver.getByText('Planned')).toBeInTheDocument();
    expect(deliver.getByText('Coming')).toBeInTheDocument();
    expect(deliver.getByText('dbxmetagen can draft these')).toBeInTheDocument();
    expect(deliver.getByText(/38 of 40 synced/)).toBeInTheDocument();
    for (const configure of deliver.getAllByRole('button', { name: 'Configure' })) expect(configure).toBeDisabled();
    expect(deliver.getByRole('button', { name: /^Deliver writes your governed metadata/ })).toBeInTheDocument();

    // The pending count opens the list of pending tag changes, on the kit Dialog
    const opener = deliver.getByRole('button', { name: '2 pending' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Pending tag changes' });
    expectKitDialog(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Finance' }));
    expect(location).toEqual({ pathname: '/concepts/browser', search: '?source=urn%3Afinance' });
  });

  it('goes to the asset a pending tag lands on, and to the job settings', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(deliverPane()).getByRole('button', { name: '2 pending' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pending tag changes' });
    await user.click(within(dialog).getByRole('button', { name: 'orders' }));
    expect(location).toEqual({ pathname: '/catalog-commander', search: '?table=main.sales.orders' });
  });

  it('Manage in Settings goes to the jobs settings', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(deliverPane()).getByRole('button', { name: /Manage in Settings/ }));
    expect(location.pathname).toBe('/settings/jobs');
  });

  it('shows the delivery modes and the provenance only in the advanced view', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const deliver = within(deliverPane());
    // The mode is shared app-wide: start from the simple view
    await user.click(screen.getByRole('button', { name: 'Small View' }));
    expect(deliver.queryByText('Direct')).toBeNull();
    expect(deliver.queryByText(/via uc_tag_sync/)).toBeNull();
    expect(deliver.queryByRole('button', { name: 'about' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Large View/ }));
    expect(deliver.getByText('Direct')).toBeInTheDocument();
    expect(deliver.getByText('Indirect')).toBeInTheDocument();
    expect(deliver.getByText('Manual')).toBeInTheDocument();
    expect(deliver.getAllByText('active')).toHaveLength(2);
    expect(deliver.getByText(/via uc_tag_sync/)).toBeInTheDocument();
    expect(deliver.getAllByRole('button', { name: 'about' }).length).toBeGreaterThan(0);
    expect(deliver.getByRole('link', { name: /Delivery mode is set per site/ })).toHaveAttribute('href', '/settings/delivery');

    await user.click(screen.getByRole('button', { name: 'Small View' }));
    expect(deliver.queryByText('Direct')).toBeNull();
  });
});

describe('enrich Review Focus 1: long names', () => {
  it('a long scheme name keeps its full text in a title in the matrix', async () => {
    renderPage();
    await loaded();
    const cell = within(mapPane()).getByText(LONG_NAME);
    expect(cell).toHaveAttribute('title', LONG_NAME);
  });

  it('a long pending concept keeps its full name in the button, with its IRI in the title', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(deliverPane()).getByRole('button', { name: '2 pending' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pending tag changes' });
    expect(within(dialog).getByRole('button', { name: LONG_NAME })).toHaveAttribute('title', 'urn:concept:order');
  });
});

describe('enrich Review Focus 2: empty and error states', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

  it('an unavailable coverage service shows the sample rows under an Alert with Retry, which loads the live rows', async () => {
    const user = userEvent.setup();
    coverage = { status: 500, body: { detail: 'down' } };
    renderPage();
    const alert = await within(mapPane()).findByRole('alert');
    expect(alert).toHaveTextContent('Coverage figures are sample data');
    // The sample rows, and the Map actions, stay
    expect(within(mapPane()).getByText('Logistics')).toBeInTheDocument();
    expect(within(mapPane()).getByRole('button', { name: 'Suggest matches' })).toBeEnabled();

    coverage = { status: 200, body: COVERAGE };
    await user.click(within(mapPane()).getByRole('button', { name: 'Retry' }));
    expect(await within(mapPane()).findByText('People')).toBeInTheDocument();
    expect(within(mapPane()).queryByRole('alert')).toBeNull();
    expect(within(mapPane()).queryByText('Logistics')).toBeNull();
  });

  it('no schemes: the matrix says so, and Suggest matches stays', async () => {
    coverage = { status: 200, body: { schemes: [] } };
    renderPage();
    expect(await within(mapPane()).findByText('No results.')).toBeInTheDocument();
    expect(within(mapPane()).queryByRole('alert')).toBeNull();
    expect(within(mapPane()).getByRole('button', { name: 'Suggest matches' })).toBeEnabled();
  });

});

describe('enrich memoised matrix columns', () => {
  it('a focused Review button stays the same element, and focused, across a re-render of the page', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const financeRow = within(mapPane()).getByText('Finance').closest('tr')!;
    const review = within(financeRow).getByRole('button', { name: 'Review' });
    review.focus();
    // Opening and closing the pending list re-renders the page
    await user.click(within(deliverPane()).getByRole('button', { name: '2 pending' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    review.focus();
    await act(async () => useEnrichCoverageTableStore.getState().setPageSize(20));
    expect(within(financeRow).getByRole('button', { name: 'Review' })).toBe(review);
    expect(review).toHaveFocus();
  });
});

describe('enrich stale answers', () => {
  it('a slow answer for an earlier scheme review is dropped', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    held = { path: '/api/knowledge/coverage/urn%3Afinance/pending-suggestions' };
    const hold = held;
    const financeRow = within(mapPane()).getByText('Finance').closest('tr')!;
    await user.click(within(financeRow).getByRole('button', { name: 'Review' }));
    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const longRow = within(mapPane()).getByText(LONG_NAME).closest('tr')!;
    await user.click(within(longRow).getByRole('button', { name: 'Review' }));
    dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Long Scheme Concept')).toBeInTheDocument();

    await act(async () => hold.release?.([pending('f1', 'Payment Term')]));
    expect(within(dialog).getByText('Long Scheme Concept')).toBeInTheDocument();
    expect(within(dialog).queryByText('Payment Term')).toBeNull();
  });

  it('a slow coverage answer is dropped once a newer one has arrived', async () => {
    const user = userEvent.setup();
    coverage = { status: 500, body: { detail: 'down' } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    await within(mapPane()).findByRole('alert');
    // A Retry that hangs, then another that answers
    coverage = { status: 200, body: COVERAGE };
    held = { path: '/api/knowledge/coverage' };
    const hold = held;
    await user.click(within(mapPane()).getByRole('button', { name: 'Retry' }));
    await user.click(within(mapPane()).getByRole('button', { name: 'Retry' }));
    expect(await within(mapPane()).findByText('People')).toBeInTheDocument();
    await act(async () => hold.release?.({ schemes: [scheme('urn:old', 'Stale Scheme')] }));
    expect(within(mapPane()).queryByText('Stale Scheme')).toBeNull();
    expect(within(mapPane()).getByText('People')).toBeInTheDocument();
  });
});

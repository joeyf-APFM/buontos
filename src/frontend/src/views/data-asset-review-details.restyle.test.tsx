/**
 * Task 15: a Data Asset Review (/data-asset-reviews/:requestId) on the page
 * kit. The page has no tabs. Pixel values that depend on the cascade (the
 * header, the stacked panes, the Select, the editor Modal, focus) are measured
 * in a real browser in tests/e2e/data-asset-reviews.spec.ts (ruling R10);
 * these tests check the structure, every control and action, the API calls,
 * and the guards against odd responses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import DataAssetReviewDetails from './data-asset-review-details';
import classes from './data-asset-review-details.module.css';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const UPDATED = '2026-11-02T15:30:00Z';
const LONG_NOTES = 'Please check the order tables before the release, and say which columns still need owners.';
const REVIEW = {
  id: 'r-1234567890',
  requester_email: 'rita@example.com',
  reviewer_email: 'sam@example.com',
  title: 'Review sales tables',
  status: 'in_review',
  notes: LONG_NOTES,
  created_at: '2026-10-01T09:00:00Z',
  updated_at: UPDATED,
  assets: [
    { id: 'a-1', asset_fqn: 'main.sales.orders', asset_type: 'table', status: 'pending', comments: null, updated_at: UPDATED },
    { id: 'a-2', asset_fqn: 'product:p-1', asset_type: 'data_product', status: 'approved', comments: null, updated_at: UPDATED },
    { id: 'a-3', asset_fqn: 'knowledge-concept://urn:c-9', asset_type: 'table', status: 'pending', comments: null, updated_at: UPDATED },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;
let review: Record<string, unknown>;

function mockBackend(body: unknown = REVIEW, status = 200) {
  review = body as Record<string, unknown>;
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/data-asset-reviews/r-1234567890') {
      if (method === 'PATCH') return json({ ...review, ...JSON.parse(String(init?.body)) });
      return json(body, status);
    }
    if (url.pathname === '/api/data-asset-reviews/r-1234567890/status' && method === 'PUT') {
      return json({ ...review, ...JSON.parse(String(init?.body)) });
    }
    if (url.pathname === '/api/settings/llm') return json({ enabled: false });
    if (url.pathname.endsWith('/preview')) return json({ schema: [{ name: 'id', type: 'int', nullable: false }], data: [{ id: 7 }] });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string, pathname: string) =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === pathname && (init?.method ?? 'GET') === method);

const renderPage = () =>
  renderWithMantine(
    <Routes>
      <Route path="/data-asset-reviews" element={<p>list page</p>} />
      <Route path="/data-asset-reviews/:requestId" element={<DataAssetReviewDetails />} />
    </Routes>,
    { route: '/data-asset-reviews/r-1234567890' },
  );

const loaded = () => screen.findByRole('heading', { level: 1, name: 'Review sales tables' });
const rowOf = (text: string) => screen.getByText(text, { exact: true }).closest('tr') as HTMLElement;
const names = (els: HTMLElement[]) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim());

describe('a data asset review on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    toast.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('data asset review details renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    // The layout's padding gives way to the page's
    expect(isFullBleed('/data-asset-reviews/r-1234567890')).toBe(true);
    // No breadcrumb of its own: the shell draws the one breadcrumb (Task 16d)
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    // The page names itself to the shell's breadcrumb through the store, as before
    expect(useBreadcrumbStore.getState().staticSegments).toEqual([{ label: 'Data Asset Reviews', path: '/data-asset-reviews' }]);
    expect(useBreadcrumbStore.getState().dynamicTitle).toBe('Review sales tables');

    const heading = screen.getByRole('heading', { level: 1, name: 'Review sales tables' });
    expect(heading.closest(`.${kit.header}`)).not.toBeNull();
    expect(screen.getByText('r-1234567890')).toHaveClass(classes.id);

    // Two kit panes in one stack: the request's details, then its assets
    const info = screen.getByRole('region', { name: 'Request Information' });
    const assets = screen.getByRole('region', { name: 'Assets for Review (3)' });
    for (const pane of [info, assets]) expect(pane).toHaveClass(kit.pane);
    expect(info.parentElement).toHaveClass(kit.stack);
    expect(assets.parentElement).toBe(info.parentElement);
    expect(info.parentElement!.children).toHaveLength(2);

    // The details grid: label and value rows
    const terms = within(info).getAllByRole('term').map((el) => el.textContent);
    expect(terms).toEqual(['Requester', 'Reviewer', 'Current Status', 'Created', 'Last Updated', 'Notes']);
    const values = within(info).getAllByRole('definition');
    expect(values[0]).toHaveTextContent('rita@example.com');
    expect(values[1]).toHaveTextContent('sam@example.com');
    expect(values[2]).toHaveTextContent('In Review');
    expect(within(values[5]).getByText(LONG_NOTES)).toHaveClass(classes.notes);
    expect(within(assets).getAllByRole('table')).toHaveLength(1);

    expect(container.querySelector('.py-6, .p-6, .text-3xl, .space-y-6')).toBeNull();
    expect(container.querySelector('.bg-card, .rounded-lg.border')).toBeNull();
  });

  it('data asset review details keeps every control', async () => {
    renderPage();
    await loaded();

    expect(names(screen.getAllByRole('button', { hidden: true }))).toEqual([
      'Edit title', 'Back to Reviews', 'Copy ID',
      'Columns', 'Asset FQN', 'Type', 'Status', 'Last Reviewed', 'Review', 'Review', 'Review',
      'Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page',
    ]);
    const status = screen.getByLabelText('Overall Status:');
    expect(status).toHaveAttribute('aria-haspopup', 'listbox');
    expect(status).toHaveValue('In Review');
    expect(status).toBeEnabled();
    // A Mantine Select (the inventory records it as a combobox: R3); the
    // DataTable's page size is the one Radix combobox
    expect(status.tagName).toBe('INPUT');
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByPlaceholderText('Filter items...').tagName).toBe('INPUT');
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(3);
    // The data product's page (Home and the list are the shell breadcrumb's now)
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/data-products/p-1']);
    expect(screen.getByRole('link', { name: 'product:p-1' })).toBeInTheDocument();

    // The cells: type and status badges, plain FQNs for tables
    expect(within(rowOf('main.sales.orders')).getByText('table')).toBeInTheDocument();
    expect(within(rowOf('main.sales.orders')).getByText('Pending')).toBeInTheDocument();
    expect(within(rowOf('product:p-1')).getByText('Approved')).toBeInTheDocument();

    // Every status is offered, by its label
    const user = userEvent.setup();
    await user.click(status);
    // jsdom can't place the dropdown, so Mantine leaves it display: none: hence hidden: true
    const list = document.getElementById(status.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(within(list).getAllByRole('option', { hidden: true }).map((o) => o.textContent)).toEqual([
      'Queued', 'In Review', 'Approved', 'Needs Review', 'Denied', 'Cancelled',
    ]);
  });

  it('data asset review details saves a new overall status, and only a new one', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const status = screen.getByLabelText('Overall Status:');
    await user.click(status);
    await user.click(await screen.findByRole('option', { name: 'In Review', hidden: true }));
    expect(calls('PUT', '/api/data-asset-reviews/r-1234567890/status')).toHaveLength(0);

    await user.click(status);
    await user.click(await screen.findByRole('option', { name: 'Approved', hidden: true }));
    await waitFor(() => expect(calls('PUT', '/api/data-asset-reviews/r-1234567890/status')).toHaveLength(1));
    const [, init] = calls('PUT', '/api/data-asset-reviews/r-1234567890/status')[0];
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'approved' });
    await waitFor(() => expect(status).toHaveValue('Approved'));
    expect(within(screen.getByRole('region', { name: 'Request Information' })).getByText('Approved')).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith({ title: 'Success', description: 'Request status updated to approved.' });
  });

  it('data asset review details edits the title inline', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Edit title' }));
    const field = screen.getByPlaceholderText('Leave empty to auto-generate from selected assets');
    expect(field).toHaveFocus();
    expect(field).toHaveValue('Review sales tables');
    expect(field).toHaveAttribute('maxLength', '200');
    expect(names(screen.getAllByRole('button')).slice(0, 3)).toEqual(['Save', 'Cancel', 'Back to Reviews']);

    // Escape cancels; unchanged saves nothing
    await user.keyboard('{Escape}');
    expect(screen.queryByPlaceholderText('Leave empty to auto-generate from selected assets')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit title' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(calls('PATCH', '/api/data-asset-reviews/r-1234567890')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Edit title' }));
    const again = screen.getByPlaceholderText('Leave empty to auto-generate from selected assets');
    await user.clear(again);
    await user.type(again, '  Renamed  {Enter}');
    await waitFor(() => expect(calls('PATCH', '/api/data-asset-reviews/r-1234567890')).toHaveLength(1));
    const [, init] = calls('PATCH', '/api/data-asset-reviews/r-1234567890')[0];
    expect(JSON.parse(String(init?.body))).toEqual({ title: 'Renamed' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Renamed' })).toBeInTheDocument();
    expect(useBreadcrumbStore.getState().dynamicTitle).toBe('Renamed');
  });

  it('data asset review details copies the id', async () => {
    // userEvent.setup() puts its own clipboard on navigator
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Copy ID' }));
    expect(writeText).toHaveBeenCalledWith('r-1234567890');
    expect(toast).toHaveBeenCalledWith({ title: 'ID copied to clipboard.' });
  });

  it('data asset review details goes back to the list', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Back to Reviews' }));
    expect(await screen.findByText('list page')).toBeInTheDocument();
  });

  it('data asset review details opens the review editor in a Modal, closed by either close button', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(rowOf('main.sales.orders')).getByRole('button', { name: 'Review' }));
    const editor = await screen.findByRole('dialog', { name: 'Reviewing: main.sales.orders' });
    expect(editor).toHaveClass('mantine-Modal-content');
    expect(editor).toHaveAttribute('aria-modal', 'true');
    expect(await within(editor).findByText('7')).toBeInTheDocument();
    // The corner close (unnamed, as before: R16) and the footer's Close
    const closes = within(editor).getAllByRole('button').filter((b) => b.classList.contains('mantine-Modal-close'));
    expect(closes).toHaveLength(1);
    expect(closes[0]).not.toHaveAccessibleName();
    await user.click(within(editor).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(within(rowOf('main.sales.orders')).getByRole('button', { name: 'Review' }));
    const again = await screen.findByRole('dialog', { name: 'Reviewing: main.sales.orders' });
    await user.click(within(again).getAllByRole('button').find((b) => b.classList.contains('mantine-Modal-close'))!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('data asset review details shows the concept diff for a knowledge concept', async () => {
    mockBackend({ ...REVIEW, details: { diff: { definition: 'A customer order', prefLabel: 'Order', reference_count: 4 } } });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(rowOf('knowledge-concept://urn:c-9')).getByRole('button', { name: 'Review' }));
    const editor = await screen.findByRole('dialog', { name: 'Reviewing: knowledge-concept://urn:c-9' });
    const diff = within(editor).getByText('urn:c-9').parentElement as HTMLElement;
    expect(diff).toHaveClass(classes.diff);
    expect(diff).toHaveTextContent('Definition:A customer order');
    expect(diff).toHaveTextContent('Label: Order');
    expect(diff).toHaveTextContent('Used by: 4 places');
  });

  it('data asset review details shows a load error, naming itself to the breadcrumb', async () => {
    mockBackend({ detail: 'No such review' }, 404);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(alert).toHaveTextContent('Review Request Details fetch failed: No such review');
    expect(useBreadcrumbStore.getState().staticSegments).toEqual([{ label: 'Data Asset Reviews', path: '/data-asset-reviews' }]);
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    expect(toast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'Failed to load request: Review Request Details fetch failed: No such review',
      variant: 'destructive',
    });
    logged.mockRestore();
  });

  it('data asset review details treats a missing asset list as empty', async () => {
    mockBackend({ ...REVIEW, assets: null });
    renderPage();
    await loaded();
    expect(screen.getByRole('region', { name: 'Assets for Review (0)' })).toBeInTheDocument();
    expect(screen.getByText('No results.')).toBeInTheDocument();
  });
});

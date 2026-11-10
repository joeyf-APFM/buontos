/**
 * Task 15: Data Asset Reviews (/data-asset-reviews) on the page kit. Pixel
 * values that depend on the cascade (row heights, the full-bleed fill, the
 * header labels, the dialog's look, focus) are measured in a real browser in
 * tests/e2e/data-asset-reviews.spec.ts (ruling R10); these tests check the
 * structure, every control, the confirmations, the API calls and the guards
 * against odd or late responses.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import { useProjectStore } from '@/stores/project-store';
import DataAssetReviews from './data-asset-reviews';
import classes from './data-asset-reviews.module.css';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const REQUEST = {
  requester_email: 'rita@example.com', reviewer_email: 'sam@example.com', notes: null,
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-11-02T15:30:00Z',
};
const REQUESTS = [
  { ...REQUEST, id: 'r-1', title: 'Review sales tables', status: 'in_review', assets: [{ id: 'a-1' }, { id: 'a-2' }] },
  { ...REQUEST, id: 'r-2', title: null, status: 'approved', assets: null },
];

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend(list: unknown = REQUESTS) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/data-asset-reviews' && (!init?.method || init.method === 'GET')) return json(list);
    if (url.pathname.startsWith('/api/data-asset-reviews/') && init?.method === 'DELETE') return new Response(null, { status: 204 });
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
      <Route path="/data-asset-reviews" element={<DataAssetReviews />} />
      <Route path="/data-asset-reviews/:requestId" element={<p>detail page</p>} />
    </Routes>,
    { route: '/data-asset-reviews' },
  );

const loaded = () => screen.findByText('Review sales tables', { exact: true });
const pane = () => screen.getByRole('region', { name: 'Review request list' });
const rowOf = (text: string) => screen.getByText(text, { exact: true }).closest('tr') as HTMLElement;
const names = (els: HTMLElement[]) => els.map((el) => el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent?.trim());

describe('data asset reviews on the page kit', () => {
  let confirmSpy: MockInstance<(message?: string) => boolean>;
  beforeEach(() => {
    mockBackend();
    toast.mockClear();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => {
    // Unmount before the project is reset, so no load starts after the test
    cleanup();
    useProjectStore.setState({ currentProject: null });
    vi.unstubAllGlobals();
    confirmSpy.mockRestore();
  });

  it('data asset reviews renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/data-asset-reviews')).toBe(true);
    expect(container.querySelector(`.${kit.page}`)).toHaveAttribute('data-full-bleed');
    // No breadcrumb of its own: the shell draws the one breadcrumb (Task 16d)
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();

    const heading = screen.getByRole('heading', { level: 1, name: 'Data Asset Reviews' });
    expect(heading.parentElement).toHaveClass(kit.header);

    // One flush kit pane, holding the shared DataTable
    expect(pane()).toHaveClass(kit.pane);
    expect(within(pane()).getAllByRole('table')).toHaveLength(1);

    // No layout padding, shadcn Card, Alert or Tailwind class in the page's own markup
    expect(container.querySelector('.py-6, .p-6, .mb-6, .text-3xl')).toBeNull();
    expect(container.querySelector('.bg-card, .rounded-lg.border')).toBeNull();
    expect(screen.getByRole('button', { name: 'Title' })).toHaveClass(classes.sort);
    expect(screen.getAllByRole('button', { name: 'Delete Request' })[0]).toHaveClass(classes.delete);
  });

  it('data asset reviews keeps every control', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    expect(screen.getByPlaceholderText('Filter titles...').tagName).toBe('INPUT');
    // Exactly these buttons, in order (hidden: true takes in the first and
    // last page buttons, which show from lg, a width jsdom never matches)
    expect(names(screen.getAllByRole('button', { hidden: true }))).toEqual([
      'Columns', 'Create New Data Asset Review Request', 'Title', 'Status', 'Created', 'Updated',
      'Delete Request', 'Delete Request',
      'Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page',
    ]);
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(2);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    // No links: Home, named, is the shell breadcrumb's now
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    // Cells: the title (or untitled), the status, the people, the asset count
    expect(within(rowOf('Review sales tables')).getByText('In Review')).toBeInTheDocument();
    expect(within(rowOf('Review sales tables')).getByText('2')).toBeInTheDocument();
    expect(within(rowOf('(untitled)')).getByText('Approved')).toBeInTheDocument();
    expect(within(rowOf('(untitled)')).getByText('0')).toBeInTheDocument();
    expect(within(rowOf('(untitled)')).getByText('rita@example.com')).toBeInTheDocument();
    expect(within(rowOf('(untitled)')).getByText('sam@example.com')).toBeInTheDocument();

    // Selecting rows shows the bulk delete
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Delete Selected (2)' })).toBeEnabled();

    // Create opens the dialog
    await user.click(screen.getByRole('button', { name: 'Create New Data Asset Review Request' }));
    expect(await screen.findByRole('dialog', { name: 'Create New Data Asset Review Request' })).toBeInTheDocument();
  });

  it('data asset reviews opens a request from its row', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByText('Review sales tables', { exact: true }));
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('data asset reviews deletes only after the confirmation, then reloads', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    confirmSpy.mockReturnValueOnce(false);
    await user.click(within(rowOf('Review sales tables')).getByRole('button', { name: 'Delete Request' }));
    expect(confirmSpy).toHaveBeenLastCalledWith('Are you sure you want to delete this review request?');
    expect(calls('DELETE', '/api/data-asset-reviews/r-1')).toHaveLength(0);

    await user.click(within(rowOf('Review sales tables')).getByRole('button', { name: 'Delete Request' }));
    await waitFor(() => expect(calls('DELETE', '/api/data-asset-reviews/r-1')).toHaveLength(1));
    await waitFor(() => expect(calls('GET', '/api/data-asset-reviews')).toHaveLength(2));
    expect(toast).toHaveBeenCalledWith({ title: 'Success', description: 'Review request deleted.' });
  });

  it('data asset reviews bulk-deletes the selected rows after the confirmation', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    confirmSpy.mockReturnValueOnce(false);
    await user.click(screen.getByRole('button', { name: 'Delete Selected (2)' }));
    expect(confirmSpy).toHaveBeenLastCalledWith('Are you sure you want to delete 2 selected request(s)?');
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Delete Selected (2)' }));
    await waitFor(() => expect(calls('GET', '/api/data-asset-reviews')).toHaveLength(2));
    expect(calls('DELETE', '/api/data-asset-reviews/r-1')).toHaveLength(1);
    expect(calls('DELETE', '/api/data-asset-reviews/r-2')).toHaveLength(1);
    expect(toast).toHaveBeenCalledWith({ title: 'Success', description: '2 request(s) deleted.' });
  });

  it('data asset reviews shows a load error in the pane', async () => {
    fetchMock.mockImplementation(async () => json({ detail: 'Backend exploded' }, 500));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    const alert = await within(await screen.findByRole('region', { name: 'Review request list' })).findByRole('alert');
    expect(alert).toHaveTextContent('Review Requests fetch failed: Backend exploded');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(logged).toHaveBeenCalledWith('Error fetching review requests:', new Error('Review Requests fetch failed: Backend exploded'));
    logged.mockRestore();
  });

  it('data asset reviews treats a non-array response as an empty list', async () => {
    mockBackend({ items: REQUESTS });
    renderPage();
    expect(await screen.findByText('No results.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Delete Request' })).toHaveLength(0);
  });

  it('data asset reviews loads the project\'s requests, and drops a late answer from before', async () => {
    let releaseFirst: (r: Response) => void = () => {};
    fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== '/api/data-asset-reviews') return Promise.resolve(json([]));
      if (!url.searchParams.has('project_id')) {
        return new Promise<Response>((resolve) => { releaseFirst = resolve; });
      }
      return Promise.resolve(json([REQUESTS[0]]));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await waitFor(() => expect(calls('GET', '/api/data-asset-reviews')).toHaveLength(1));

    // Switching to a project loads its requests
    act(() => {
      useProjectStore.setState({ currentProject: { id: 'p-1', name: 'Sales', title: 'Sales' } as never });
    });
    await waitFor(() => expect(calls('GET', '/api/data-asset-reviews')).toHaveLength(2));
    expect(String(fetchMock.mock.calls[1][0])).toBe('/api/data-asset-reviews?project_id=p-1');
    expect(await loaded()).toBeInTheDocument();

    // The first load answers last, with every request: it is dropped. Wait
    // until the page has read that answer's body and every continuation after
    // it has run, so a missing guard would have set the list by now
    const late = json(REQUESTS);
    const body = vi.spyOn(late, 'json');
    releaseFirst(late);
    await waitFor(() => expect(body).toHaveBeenCalledTimes(1));
    await act(async () => {
      await body.mock.results[0].value;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByText('(untitled)', { exact: true })).toBeNull();
    expect(screen.getByText('Review sales tables', { exact: true })).toBeInTheDocument();
  });
});

/**
 * Wave 2 Task 5: Business Owners (/business-owners) on the page kit. The
 * long-name wrap and the page's horizontal scroll are measured in a real
 * browser in tests/e2e/requests-owners.spec.ts (ruling R10); these tests check
 * the structure, every control for both personas, the memoised columns, and
 * the empty, error and no-access states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import BusinessOwnersView from './business-owners';
import classes from './business-owners.module.css';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const owner = (id: string, name: string | null, email: string, extra: Record<string, unknown> = {}) => ({
  id, object_type: 'data_product', object_id: `${id}-object`, user_email: email, user_name: name,
  role_id: 'role-1', role_name: 'Data Owner', is_active: true, assigned_at: '2026-11-01T09:00:00Z',
  removed_at: null, created_by: 'admin@example.com', ...extra,
});
const OWNERS = [
  owner('o1', 'Rita Owner', 'rita@example.com'),
  owner('o2', null, 'sam@example.com', { object_type: 'data_contract', is_active: false, role_name: null }),
];

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend(list: unknown = OWNERS, status = 200) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/business-owners') return json(list, status);
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'business-owners': level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = () => renderWithMantine(<BusinessOwnersView />, { route: '/business-owners' });

const loaded = () => screen.findByText('Rita Owner', { exact: true });
const pane = () => screen.getByRole('region', { name: 'Business owner list' });
const rowOf = (text: string) => screen.getByText(text, { exact: true }).closest('tr') as HTMLElement;
const names = (els: HTMLElement[]) =>
  els.map((el) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || el.getAttribute('title')));
const PAGER = ['Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page'];

describe('business owners on the page kit', () => {
  beforeEach(() => {
    localStorage.removeItem('business-owners-sort');
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    toast.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('business owners renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/business-owners')).toBe(true);
    expect(container.querySelector(`.${kit.page}`)).toHaveAttribute('data-full-bleed');
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    const heading = screen.getByRole('heading', { level: 1, name: 'Business Owners' });
    expect(heading.parentElement).toHaveClass(kit.header);
    expect(screen.getByText('Ownership assignments tracking who is responsible for what.')).toHaveClass(classes.subtitle);

    // One flush kit pane, holding the shared DataTable
    expect(pane()).toHaveClass(kit.pane);
    expect(within(pane()).getAllByRole('table')).toHaveLength(1);

    // No layout padding, header icon, or Tailwind class in the page's own markup
    expect(container.querySelector('.py-6, .mb-6, .text-3xl, .w-8, .mt-1, .ml-2, .max-w-\\[200px\\]')).toBeNull();
    expect(container.querySelector('span.font-medium, div.text-xs, span.font-mono, span.text-muted-foreground')).toBeNull();
    // The object id is an identifier: mono, and cut off with a title
    expect(within(rowOf('Rita Owner')).getByText('o1-object')).toHaveAttribute('title', 'o1-object');
    expect(within(rowOf('Rita Owner')).getByText('o1-object')).toHaveClass(classes.objectId);
  });

  it.each([
    ['an admin', FeatureAccessLevel.ADMIN],
    ['a consumer', FeatureAccessLevel.READ_ONLY],
  ])('business owners keeps every control for %s', async (_who, level) => {
    grant(level);
    const user = userEvent.setup();
    renderPage();
    await loaded();

    expect(names(within(pane()).getAllByRole('button', { hidden: true })).sort())
      .toEqual(['Assigned', 'Columns', 'Owner', ...PAGER].sort());
    expect(screen.getByPlaceholderText('Filter user emails...').tagName).toBe('INPUT');
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
    expect(within(pane()).getAllByRole('columnheader').map((h) => h.textContent?.trim()))
      .toEqual(['', 'Owner', 'Role', 'Object Type', 'Object', 'Status', 'Assigned']);

    // Cells: the name over its email, or the email alone; the role, type and status
    expect(within(rowOf('Rita Owner')).getByText('rita@example.com')).toBeInTheDocument();
    expect(within(rowOf('sam@example.com')).getByText('-')).toBeInTheDocument();
    expect(within(rowOf('sam@example.com')).getByText('Data Contract')).toBeInTheDocument();
    expect(within(rowOf('sam@example.com')).getByText('Inactive')).toBeInTheDocument();
    expect(within(rowOf('Rita Owner')).getByText('Active')).toBeInTheDocument();

    // The Owner header sorts by email
    const emails = () => screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    await user.click(screen.getByRole('button', { name: 'Owner' }));
    await waitFor(() => expect(emails()[0]).toContain('rita@example.com'));
    await user.click(screen.getByRole('button', { name: 'Owner' }));
    await waitFor(() => expect(emails()[0]).toContain('sam@example.com'));

    // The filter box narrows the list by email
    await user.type(screen.getByPlaceholderText('Filter user emails...'), 'sam');
    await waitFor(() => expect(screen.queryByText('Rita Owner', { exact: true })).toBeNull());
    expect(screen.getByText('sam@example.com', { exact: true })).toBeInTheDocument();
  });

  it('business owners: the columns are memoised, so a cell keeps its focus', async () => {
    renderPage();
    await loaded();
    const owner = screen.getByRole('button', { name: 'Owner' });
    owner.focus();
    // A re-render from the permissions store
    act(() => usePermissionsStore.setState({ permissions: { 'business-owners': FeatureAccessLevel.ADMIN } }));
    expect(screen.getByRole('button', { name: 'Owner' })).toBe(owner);
    expect(owner).toHaveFocus();
  });

  it('business owners empty and error states keep their actions', async () => {
    mockBackend([]);
    const { unmount } = renderPage();
    expect(await screen.findByText('No results.')).toBeInTheDocument();
    for (const name of ['Owner', 'Assigned', 'Columns']) {
      expect(within(pane()).getByRole('button', { name })).toBeEnabled();
    }
    expect(screen.getByPlaceholderText('Filter user emails...')).toBeEnabled();
    unmount();

    // A failed load: the error in the pane, under the header
    mockBackend({ detail: 'Backend exploded' }, 500);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    const alert = await within(await screen.findByRole('region', { name: 'Business owner list' })).findByRole('alert');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(alert).toHaveTextContent('Error Loading Data');
    expect(alert).toHaveTextContent('Backend exploded');
    expect(screen.getByRole('heading', { level: 1, name: 'Business Owners' })).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error fetching business owners' }));

    // Retry, under the alert, loads the list again (R31)
    const retry = within(pane()).getByRole('button', { name: 'Retry' });
    expect(alert.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    mockBackend();
    await userEvent.setup().click(retry);
    expect(await loaded()).toBeInTheDocument();
    expect(within(pane()).queryByRole('alert')).toBeNull();
    vi.mocked(console.error).mockRestore();
  });

  it('business owners without access shows the kit alert', async () => {
    grant(FeatureAccessLevel.NONE);
    renderPage();
    const alert = await within(pane()).findByRole('alert');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(alert).toHaveTextContent('Permission Denied');
    expect(alert).toHaveTextContent('You do not have permission to view business owners.');
    expect(within(pane()).queryByRole('table')).toBeNull();
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/business-owners')).toBe(false);
  });
});

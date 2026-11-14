/**
 * Wave 3 Task 4: Security Features (/security-features) on the page kit. Pixel
 * values that depend on the cascade (the full-bleed fill, the long-name wrap,
 * the page's horizontal scroll) and the Escape layering in a real browser are
 * measured in tests/e2e/security-features.spec.ts (ruling R10); these tests
 * check the structure, every control for both personas, the dialog, the
 * delete confirm, and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import SecurityFeatures from './security-features';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const UPDATED = '2026-11-02T15:30:00Z';
const FEATURES = [
  {
    id: 'sf-1', name: 'Regional row filter', description: 'Rows limited to the user region',
    type: 'row_filtering', status: 'active', target: 'main.sales.orders', conditions: ['region = current_region()'],
    last_updated: UPDATED,
  },
  {
    id: 'sf-2', name: 'Mask email addresses', description: 'Masks the email column for non-stewards',
    type: 'column_masking', status: 'inactive', target: 'main.sales.customers.email',
    conditions: ['is_member(stewards)', 'purpose = analytics'], last_updated: UPDATED,
  },
];
const LONG_NAME = `Mask every column that holds personal data ${'and name an accountable owner for it '.repeat(6)}`.slice(0, 199) + '.';

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response | undefined> | undefined;

function mockBackend(list: unknown = FEATURES, status = 200, extra: Handler = () => undefined) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const answer = await extra(url, init);
    if (answer) return answer;
    if (url.pathname === '/api/security-features' && method === 'GET') return json(list, status);
    if (url.pathname === '/api/security-features' && method === 'POST') return json({ ...FEATURES[0], id: 'sf-new' });
    if (url.pathname.startsWith('/api/security-features/') && method === 'PUT') return json(FEATURES[0]);
    if (url.pathname.startsWith('/api/security-features/') && method === 'DELETE') return new Response(null, { status: 204 });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string, pathname: string) =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === pathname && (init?.method ?? 'GET') === method);

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'security-features': level },
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
      <Route path="/security-features" element={<SecurityFeatures />} />
    </Routes>,
    { route: '/security-features' },
  );

const loaded = () => screen.findByText('Regional row filter', { exact: true });
const pane = () => screen.getByRole('region', { name: 'Security feature list' });
const rowOf = (text: string) => screen.getByText(text, { exact: true }).closest('tr') as HTMLElement;
const editOf = (name: string) => rowOf(name).querySelector('[data-action="edit"]') as HTMLElement;
const deleteOf = (name: string) => rowOf(name).querySelector('[data-action="delete"]') as HTMLElement;
const names = (els: HTMLElement[]) =>
  els.map((el) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || el.getAttribute('title') || ''));
const sorted = (list: string[]) => [...list].sort();

// The control inventory of /security-features in the Task 1 baselines (both
// personas): an unnamed edit and delete button per row, and Add Security Feature
const BUTTONS = ['', '', '', '', 'Add Security Feature'];

describe('security features on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    toast.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('security features renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/security-features')).toBe(true);
    expect(container.querySelector(`.${kit.page}`)).toHaveAttribute('data-full-bleed');
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();

    const heading = screen.getByRole('heading', { level: 1, name: 'Security Features' });
    expect(heading.parentElement).toHaveClass(kit.header);
    // Add sits in the header's actions
    expect(within(heading.parentElement as HTMLElement).getByRole('button', { name: 'Add Security Feature' })).toBeInTheDocument();

    // One flush kit pane holding the table
    expect(pane()).toHaveClass(kit.pane);
    expect(within(pane()).getAllByRole('table')).toHaveLength(1);
    expect(within(pane()).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Name', 'Type', 'Target', 'Status', 'Conditions', 'Last Updated', 'Actions']);

    // No layout padding, shadcn table or Tailwind class in the page's own markup
    expect(container.querySelector('.py-6, .p-6, .mb-6, .text-3xl, .space-y-4, .space-y-2, .text-right, .w-8')).toBeNull();
    expect(container.querySelector('.rounded-md.border, [class*="bg-green-"], [class*="bg-red-"], [class*="text-green-"]')).toBeNull();
    expect(container.querySelector('[data-slot="table"], .caption-bottom')).toBeNull();
  });

  it.each([
    ['an admin', FeatureAccessLevel.ADMIN],
    ['a read-only user', FeatureAccessLevel.READ_ONLY],
  ])('security features keeps every control for %s', async (_who, level) => {
    // The page has never gated its controls: the baselines of both personas
    // show the same inventory
    grant(level);
    renderPage();
    await loaded();

    expect(sorted(names(screen.getAllByRole('button', { hidden: true })))).toEqual(sorted(BUTTONS));
    expect(within(rowOf('Regional row filter')).getAllByRole('button')).toHaveLength(2);
    expect(editOf('Regional row filter')).toBeInTheDocument();
    expect(deleteOf('Mask email addresses')).toBeInTheDocument();

    // Cells
    const row = rowOf('Regional row filter');
    expect(within(row).getByText('Row Filtering')).toBeInTheDocument();
    expect(within(row).getByText('main.sales.orders')).toBeInTheDocument();
    expect(within(row).getByText('active')).toBeInTheDocument();
    expect(within(row).getByText('region = current_region()')).toBeInTheDocument();
    expect(within(row).getByText(new Date(UPDATED).toLocaleString())).toBeInTheDocument();
    expect(within(rowOf('Mask email addresses')).getByText('inactive')).toBeInTheDocument();
    expect(within(rowOf('Mask email addresses')).getByText('purpose = analytics')).toBeInTheDocument();
  });

  it('security features: Add opens the dialog and saves a new feature, once', async () => {
    // The answer takes a moment, as a network one does, so the second click lands while it is out
    mockBackend(FEATURES, 200, async (_url, init) => {
      if (init?.method !== 'POST') return undefined;
      await new Promise((r) => setTimeout(r, 150));
      return json({ ...FEATURES[0], id: 'sf-new' });
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Add Security Feature' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add Security Feature' });
    expect(dialog).toHaveClass('mantine-Modal-content');

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Tokenize cards');
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'Cards are tokenized');
    await user.click(within(dialog).getByRole('textbox', { name: 'Type' }));
    await user.click(await screen.findByRole('option', { name: 'Tokenization', hidden: true }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Target' }), 'main.pay.cards');
    await user.dblClick(within(dialog).getByRole('button', { name: 'Add Feature' }));

    await waitFor(() => expect(calls('POST', '/api/security-features')).toHaveLength(1));
    const body = JSON.parse(String(calls('POST', '/api/security-features')[0][1]?.body));
    expect(body).toEqual({
      name: 'Tokenize cards', description: 'Cards are tokenized', type: 'tokenization', status: 'active',
      target: 'main.pay.cards', conditions: [],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Security Feature' })).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' }));
    await waitFor(() => expect(calls('GET', '/api/security-features')).toHaveLength(2));
    expect(calls('POST', '/api/security-features')).toHaveLength(1);
  });

  it('security features: Edit fills the dialog and PUTs the whole feature', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(editOf('Mask email addresses'));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Security Feature' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Mask email addresses');
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue('Masks the email column for non-stewards');
    expect(within(dialog).getByRole('textbox', { name: 'Type' })).toHaveValue('Column Masking');
    expect(within(dialog).getByRole('textbox', { name: 'Target' })).toHaveValue('main.sales.customers.email');

    await user.clear(within(dialog).getByRole('textbox', { name: 'Name' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Mask emails');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(calls('PUT', '/api/security-features/sf-2')).toHaveLength(1));
    const body = JSON.parse(String(calls('PUT', '/api/security-features/sf-2')[0][1]?.body));
    expect(body).toEqual({ ...FEATURES[1], name: 'Mask emails' });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Security feature updated successfully' }));
  });

  it('security features: Add after a cancelled Edit opens an empty form', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(editOf('Regional row filter'));
    const edit = await screen.findByRole('dialog', { name: 'Edit Security Feature' });
    await user.click(within(edit).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('PUT', '/api/security-features/sf-1')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Add Security Feature' }));
    const add = await screen.findByRole('dialog', { name: 'Add Security Feature' });
    expect(within(add).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(within(add).getByRole('textbox', { name: 'Target' })).toHaveValue('');
    expect(within(add).getByRole('button', { name: 'Add Feature' })).toBeInTheDocument();
  });

  it('security features: Escape in an open Select closes only the Select, in jsdom', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Add Security Feature' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add Security Feature' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Keep me');
    const type = within(dialog).getByRole('textbox', { name: 'Type' });
    await user.click(type);
    expect(type).toHaveAttribute('aria-haspopup', 'listbox');
    await user.keyboard('{Escape}');
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole('dialog', { name: 'Add Security Feature' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Keep me');
  });

  it('security features: a failed save keeps the dialog and says why', async () => {
    mockBackend(FEATURES, 200, (_url, init) => (init?.method === 'POST' ? json({ detail: 'nope' }, 500) : undefined));
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Add Security Feature' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add Security Feature' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Keep me');
    await user.click(within(dialog).getByRole('button', { name: 'Add Feature' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    expect(screen.getByRole('dialog', { name: 'Add Security Feature' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Keep me');
    expect(within(dialog).getByRole('button', { name: 'Add Feature' })).toBeEnabled();
  });

  it('security features delete confirm is an alertdialog, sends once and returns focus', async () => {
    let release: (r: Response) => void = () => {};
    mockBackend(FEATURES, 200, (_url, init) =>
      init?.method === 'DELETE'
        ? new Promise<Response>((resolve) => { release = resolve; })
        : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(deleteOf('Regional row filter'));
    const confirm = await screen.findByRole('alertdialog', { name: /Delete/ });
    // Nothing is sent until it's confirmed; its description names the feature
    expect(confirm).toHaveTextContent('Regional row filter');
    expect(calls('DELETE', '/api/security-features/sf-1')).toHaveLength(0);

    // Cancel sends nothing and focus goes back to the row's delete button
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(deleteOf('Regional row filter')));
    expect(calls('DELETE', '/api/security-features/sf-1')).toHaveLength(0);

    // Confirm with a double click: one request
    await user.click(deleteOf('Regional row filter'));
    const confirm2 = await screen.findByRole('alertdialog');
    await user.dblClick(within(confirm2).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls('DELETE', '/api/security-features/sf-1')).toHaveLength(1));

    // The list reloads without the row; focus lands on Add, a control that is still there
    mockBackend(FEATURES.slice(1));
    release(new Response(null, { status: 204 }));
    await waitFor(() => expect(screen.queryByText('Regional row filter', { exact: true })).toBeNull());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Security Feature' })));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Security feature deleted successfully' }));
  });

  it('security features: a failed delete keeps the row and says why', async () => {
    mockBackend(FEATURES, 200, (_url, init) => (init?.method === 'DELETE' ? json({ detail: 'nope' }, 500) : undefined));
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(deleteOf('Regional row filter'));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('Regional row filter', { exact: true })).toBeInTheDocument();
  });

  it('security features: a long name wraps, and carries a title', async () => {
    mockBackend([...FEATURES, { ...FEATURES[0], id: 'sf-long', name: LONG_NAME, target: `main.sales.${'x'.repeat(190)}` }]);
    renderPage();
    await loaded();
    const name = screen.getByText(LONG_NAME, { exact: true });
    expect(name).toHaveAttribute('title', LONG_NAME);
    expect(screen.getByText(`main.sales.${'x'.repeat(190)}`, { exact: true })).toHaveAttribute('title', `main.sales.${'x'.repeat(190)}`);
  });

  it('security features empty and error states keep their message and actions', async () => {
    mockBackend([]);
    const user = userEvent.setup();
    const { unmount } = renderPage();
    expect(await screen.findByText('No security features yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Security Feature' })).toBeEnabled();
    unmount();

    // A failed load: the error shows in the pane with a Retry, and a toast
    mockBackend({ detail: 'Backend exploded' }, 500);
    renderPage();
    const alert = await within(await screen.findByRole('region', { name: 'Security feature list' })).findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load security features');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Failed to load security features', variant: 'destructive' }));
    expect(screen.getByRole('button', { name: 'Add Security Feature' })).toBeEnabled();

    mockBackend();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('security features: a list that is not an array shows as empty', async () => {
    mockBackend({ features: 'unexpected' });
    renderPage();
    expect(await screen.findByText('No security features yet.')).toBeInTheDocument();
  });

  it('security features: an older answer does not replace a newer one', async () => {
    let first: (r: Response) => void = () => {};
    let n = 0;
    mockBackend(FEATURES, 200, (url, init) => {
      if (url.pathname === '/api/security-features' && (init?.method ?? 'GET') === 'GET' && ++n === 1) {
        return new Promise<Response>((resolve) => { first = resolve; });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    // The first load hangs; a Retry-like reload after a save is not possible yet, so add one
    await user.click(await screen.findByRole('button', { name: 'Add Security Feature' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add Security Feature' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'x');
    await user.click(within(dialog).getByRole('button', { name: 'Add Feature' }));
    await loaded();
    first(json([{ ...FEATURES[0], id: 'stale', name: 'Stale answer' }]));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Stale answer')).toBeNull();
    expect(screen.getByText('Regional row filter', { exact: true })).toBeInTheDocument();
  });

  it('security features: Escape does not close the dialog while a save is out', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    mockBackend(FEATURES, 200, async (_url, init) => {
      if (init?.method !== 'POST') return undefined;
      await held;
      return json({ detail: 'nope' }, 500);
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Add Security Feature' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add Security Feature' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Keep me');
    await user.click(within(dialog).getByRole('button', { name: 'Add Feature' }));
    await waitFor(() => expect(calls('POST', '/api/security-features')).toHaveLength(1));
    await user.keyboard('{Escape}');
    // Longer than the modal's exit transition, so a closing dialog would be gone
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByRole('dialog', { name: 'Add Security Feature' })).toBeInTheDocument();
    release();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Add Feature' })).toBeEnabled());
    expect(screen.getByRole('dialog', { name: 'Add Security Feature' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Keep me');
  });
});

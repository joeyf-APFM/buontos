/**
 * Wave 3 Task 2: Compliance (/compliance) on the page kit. Pixel values that
 * depend on the cascade (the full-bleed fill, the long-name wrap, the page's
 * horizontal scroll) and the Escape layering in the policy dialog are measured
 * in a real browser in tests/e2e/compliance.spec.ts (ruling R10); these tests
 * check the structure, every control for both personas, the policy dialog,
 * the delete confirm, and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import list from '@/components/common/list-page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { FeatureAccessLevel } from '@/types/settings';
import Compliance from './compliance';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const policy = (id: string, name: string, severity: string, category: string, compliance: number, active = true) => ({
  id, name, description: `${name} everywhere`, failure_message: `${name} failed`,
  rule: 'MATCH (obj:table) ASSERT obj.owner IS NOT NULL', compliance, history: [], is_active: active,
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-11-02T15:30:00Z', severity, category,
});
const LONG_NAME = `Every data product that holds personal data ${'must name an accountable owner and '.repeat(6)}`.slice(0, 200);
const POLICIES = [
  policy('p-1', 'Owner assigned', 'high', 'Governance', 92),
  policy('p-2', 'PII is tagged', 'critical', 'Security', 64),
  policy('p-3', 'Descriptions present', 'low', 'Quality', 80, false),
];
const LIST = { policies: POLICIES, stats: { overall_compliance: 77, active_policies: 2, critical_issues: 1 } };

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response | undefined> | undefined;

function mockBackend(list: unknown = LIST, status = 200, extra: Handler = () => undefined) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const answer = await extra(url, init);
    if (answer) return answer;
    if (url.pathname === '/api/compliance/policies' && method === 'GET') return json(list, status);
    if (url.pathname === '/api/compliance/policies' && method === 'POST') return json({ ...POLICIES[0], id: 'p-new', name: 'New one' });
    if (url.pathname.startsWith('/api/compliance/policies/') && method === 'PUT') return json(POLICIES[0]);
    if (url.pathname.startsWith('/api/compliance/policies/') && method === 'DELETE') return new Response(null, { status: 204 });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string, pathname: string) =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === pathname && (init?.method ?? 'GET') === method);

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { compliance: level },
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
      <Route path="/compliance" element={<Compliance />} />
      <Route path="/compliance/policies/:policyId" element={<p>policy page</p>} />
    </Routes>,
    { route: '/compliance' },
  );

const loaded = () => screen.findByText('Owner assigned', { exact: true });
const pane = () => screen.getByRole('region', { name: 'Policy list' });
const rowOf = (text: string) => screen.getByText(text, { exact: true }).closest('tr') as HTMLElement;
const names = (els: HTMLElement[]) =>
  els.map((el) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || el.getAttribute('title')));
const sorted = (list: (string | null | undefined)[]) => [...list].sort();
const PAGER = ['Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page'];

// The control inventory of /compliance in the Task 1 baselines (both personas)
const BUTTONS = ['Columns', 'Create Rule', ...PAGER, 'Open', 'Open', 'Open'];

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(rowOf(name)).getByRole('button', { name: 'Open' }));
  return screen.findByRole('menu', { hidden: true });
}

describe('compliance on the page kit', () => {
  let errorSpy: MockInstance<(...args: unknown[]) => void>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error');
    localStorage.removeItem('compliance-policies-sort');
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    toast.mockClear();
  });
  afterEach(() => {
    const tableErrors = errorSpy.mock.calls.map((a) => String(a[0])).filter((m) => m.startsWith('[Table]'));
    cleanup();
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
    expect(tableErrors).toEqual([]);
  });

  it('compliance renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(isFullBleed('/compliance')).toBe(true);
    expect(container.querySelector(`.${kit.page}`)).toHaveAttribute('data-full-bleed');
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    expect(useBreadcrumbStore.getState().dynamicTitle).toBe('Compliance');

    const heading = screen.getByRole('heading', { level: 1, name: 'Compliance' });
    expect(heading.parentElement).toHaveClass(kit.header);

    // One flush kit pane: the four figures, then the shared DataTable
    expect(pane()).toHaveClass(kit.pane);
    expect(within(pane()).getAllByRole('table')).toHaveLength(1);
    expect(within(pane()).getByText('Overall Compliance')).toBeInTheDocument();
    expect(within(pane()).getByText('77%')).toBeInTheDocument();
    expect(within(pane()).getByText('Critical Issues')).toBeInTheDocument();

    // No layout padding, shadcn Card or Tailwind class in the page's own markup
    expect(container.querySelector('.py-6, .p-6, .mb-6, .mb-8, .text-3xl, .space-y-4, .grid-cols-1')).toBeNull();
    expect(container.querySelector('.bg-card, .rounded-lg.border')).toBeNull();
    expect(container.querySelector('[class*="bg-yellow-"], [class*="bg-green-"], [class*="text-green-"], [class*="text-red-"]')).toBeNull();
  });

  it('compliance keeps every control', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    expect(sorted(names(screen.getAllByRole('button', { hidden: true })))).toEqual(sorted(BUTTONS));
    expect(screen.getByPlaceholderText('Filter names...').tagName).toBe('INPUT');
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(3);

    // Cells: category, severity, score and status
    expect(within(rowOf('Owner assigned')).getByText('Governance')).toBeInTheDocument();
    expect(within(rowOf('Owner assigned')).getByText('high')).toBeInTheDocument();
    expect(within(rowOf('Owner assigned')).getByText('92%')).toBeInTheDocument();
    expect(within(rowOf('Owner assigned')).getByText('Active')).toBeInTheDocument();
    expect(within(rowOf('Descriptions present')).getByText('Inactive')).toBeInTheDocument();

    // The row's menu: Edit and Delete
    const menu = await openRowMenu(user, 'Owner assigned');
    expect(sorted(names(within(menu).getAllByRole('menuitem', { hidden: true })))).toEqual(['Delete', 'Edit']);
    await user.keyboard('{Escape}');

    // The filter box filters by name
    await user.type(screen.getByPlaceholderText('Filter names...'), 'pii');
    await waitFor(() => expect(screen.queryByText('Owner assigned', { exact: true })).toBeNull());
    expect(screen.getByText('PII is tagged', { exact: true })).toBeInTheDocument();
  });

  it('compliance keeps every control for a read-only user', async () => {
    // The page has never gated its controls (the backend answers 403): the
    // baselines of both personas show the same inventory
    grant(FeatureAccessLevel.READ_ONLY);
    renderPage();
    await loaded();
    expect(sorted(names(screen.getAllByRole('button', { hidden: true })))).toEqual(sorted(BUTTONS));
  });

  it('compliance: a row click opens the policy, a menu click does not', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await openRowMenu(user, 'Owner assigned');
    expect(screen.queryByText('policy page')).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByText('PII is tagged', { exact: true }));
    expect(await screen.findByText('policy page')).toBeInTheDocument();
  });

  it('compliance: Create Rule opens the dialog and saves a new policy', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Create Rule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create New Compliance Rule' });
    expect(dialog).toHaveClass('mantine-Modal-content');

    await user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Fresh policy');
    await user.type(within(dialog).getByRole('textbox', { name: /^Description/ }), 'Why it matters');
    await user.click(within(dialog).getByRole('textbox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'Privacy', hidden: true }));
    await user.click(within(dialog).getByRole('textbox', { name: 'Severity' }));
    await user.click(await screen.findByRole('option', { name: 'Critical', hidden: true }));
    const rule = within(dialog).getByRole('textbox', { name: /^Rule Code/ });
    expect(rule).toHaveClass('mantine-Textarea-input');
    await user.type(rule, 'MATCH (t:table) ASSERT t.a');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls('POST', '/api/compliance/policies')).toHaveLength(1));
    const body = JSON.parse(String(calls('POST', '/api/compliance/policies')[0][1]?.body));
    expect(body).toMatchObject({
      name: 'Fresh policy', description: 'Why it matters', category: 'Privacy', severity: 'critical',
      rule: 'MATCH (t:table) ASSERT t.a', is_active: true, compliance: 0, history: [],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create New Compliance Rule' })).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' }));
    await waitFor(() => expect(calls('GET', '/api/compliance/policies')).toHaveLength(2));
  });

  it('compliance: Edit fills the dialog, and a category the list lacks is kept', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const menu = await openRowMenu(user, 'Descriptions present');
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit', hidden: true }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Compliance Rule' });
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue('Descriptions present');
    // 'Quality' is not one of the dialog's categories: it still shows, and saving keeps it
    expect(within(dialog).getByRole('textbox', { name: 'Category' })).toHaveValue('Quality');
    expect(within(dialog).getByRole('textbox', { name: 'Severity' })).toHaveValue('Low');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('PUT', '/api/compliance/policies/p-3')).toHaveLength(1));
    const body = JSON.parse(String(calls('PUT', '/api/compliance/policies/p-3')[0][1]?.body));
    expect(body).toMatchObject({ id: 'p-3', category: 'Quality', severity: 'low', is_active: false });
  });

  it('compliance: Escape in an open Select closes only the Select, in jsdom', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Create Rule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create New Compliance Rule' });
    await user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Keep me');
    const category = within(dialog).getByRole('textbox', { name: 'Category' });
    await user.click(category);
    expect(category).toHaveAttribute('aria-haspopup', 'listbox');
    await user.keyboard('{Escape}');
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole('dialog', { name: 'Create New Compliance Rule' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue('Keep me');
  });

  it('compliance: a save with rule warnings says so', async () => {
    mockBackend(LIST, 200, (url, init) =>
      url.pathname === '/api/compliance/policies/p-1' && init?.method === 'PUT'
        ? json({ ...POLICIES[0], warnings: [{ code: 'unknown_code', message: 'Rule cannot work as written' }] })
        : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const menu = await openRowMenu(user, 'Owner assigned');
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit', hidden: true }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Compliance Rule' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Rule cannot work as written' })));
  });

  it('compliance delete confirm is an alertdialog, sends once and returns focus', async () => {
    let release: (r: Response) => void = () => {};
    mockBackend(LIST, 200, (_url, init) =>
      init?.method === 'DELETE'
        ? new Promise<Response>((resolve) => { release = resolve; })
        : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();

    const menu = await openRowMenu(user, 'Owner assigned');
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete', hidden: true }));
    const confirm = await screen.findByRole('alertdialog', { name: /Delete/ });
    // Nothing is sent until it's confirmed; its description names the policy
    expect(confirm).toHaveTextContent('Owner assigned');
    expect(calls('DELETE', '/api/compliance/policies/p-1')).toHaveLength(0);

    // Cancel sends nothing and focus goes back to the row's menu button
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(rowOf('Owner assigned')).getByRole('button', { name: 'Open' })));
    expect(calls('DELETE', '/api/compliance/policies/p-1')).toHaveLength(0);

    // Confirm with a double click: one request
    const again = await openRowMenu(user, 'Owner assigned');
    await user.click(within(again).getByRole('menuitem', { name: 'Delete', hidden: true }));
    const confirm2 = await screen.findByRole('alertdialog');
    const del = within(confirm2).getByRole('button', { name: 'Delete' });
    await user.dblClick(del);
    await waitFor(() => expect(calls('DELETE', '/api/compliance/policies/p-1')).toHaveLength(1));

    // The list reloads without the row; focus lands on Create Rule, a control that is still there
    mockBackend({ ...LIST, policies: POLICIES.slice(1) }, 200);
    release(new Response(null, { status: 204 }));
    await waitFor(() => expect(screen.queryByText('Owner assigned', { exact: true })).toBeNull());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Rule' })));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Policy deleted successfully' }));
  });

  it('compliance: a failed delete keeps the row and says why', async () => {
    mockBackend(LIST, 200, (_url, init) =>
      init?.method === 'DELETE' ? json({ detail: 'nope' }, 500) : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const menu = await openRowMenu(user, 'Owner assigned');
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete', hidden: true }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('Owner assigned', { exact: true })).toBeInTheDocument();
  });

  it('compliance: a long policy name wraps instead of widening the page', async () => {
    mockBackend({ ...LIST, policies: [...POLICIES, policy('p-long', LONG_NAME, 'medium', 'Governance', 71)] });
    renderPage();
    await loaded();
    const name = screen.getByText(LONG_NAME, { exact: true });
    expect(name).toHaveClass(list.title);
    expect(name).toHaveAttribute('title', LONG_NAME);
  });

  it('compliance empty and error states keep their actions', async () => {
    mockBackend({ policies: [], stats: { overall_compliance: 0, active_policies: 0, critical_issues: 0 } });
    const user = userEvent.setup();
    const { unmount } = renderPage();
    expect(await screen.findByText('No results.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Rule' })).toBeEnabled();
    unmount();

    // A failed load: the error shows in the pane with a Retry
    mockBackend({ detail: 'Backend exploded' }, 500);
    renderPage();
    const alert = await within(await screen.findByRole('region', { name: 'Policy list' })).findByRole('alert');
    expect(alert).toHaveTextContent('Backend exploded');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(screen.getByRole('button', { name: 'Create Rule' })).toBeEnabled();

    mockBackend();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('compliance: a policy list that is not an array shows as empty', async () => {
    mockBackend({ policies: 'unexpected', stats: null });
    renderPage();
    expect(await screen.findByText('No results.')).toBeInTheDocument();
  });

  it('compliance: Escape does not close the policy dialog while a save is out', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    mockBackend(LIST, 200, async (_url, init) => {
      if (init?.method !== 'POST') return undefined;
      await held;
      return json({ detail: 'nope' }, 500);
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Create Rule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create New Compliance Rule' });
    await user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Keep me');
    await user.type(within(dialog).getByRole('textbox', { name: /^Description/ }), 'Why it matters');
    await user.type(within(dialog).getByRole('textbox', { name: /^Rule Code/ }), 'MATCH (t:table) ASSERT t.a');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls('POST', '/api/compliance/policies')).toHaveLength(1));
    await user.keyboard('{Escape}');
    // Longer than the modal's exit transition, so a closing dialog would be gone
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByRole('dialog', { name: 'Create New Compliance Rule' })).toBeInTheDocument();
    release();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByRole('dialog', { name: 'Create New Compliance Rule' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue('Keep me');
  });
});

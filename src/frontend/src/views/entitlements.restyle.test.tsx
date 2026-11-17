/**
 * Wave 3 Task 6: Entitlements (/entitlements) on the page kit. Pixel values that
 * depend on the cascade (the pane widths, the long-name wrap, the page's
 * horizontal scroll) and the Escape layering in a real browser are measured in
 * tests/e2e/entitlements.spec.ts (ruling R10); these tests check the structure,
 * every control for both personas, the dialogs and their payloads, the two
 * delete confirms, the list's keyboard, and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, pick, selectField } from '@/test/kit-dialog';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { useDirectoryStore } from '@/stores/directory-store';
import { FeatureAccessLevel } from '@/types/settings';
import Entitlements from './entitlements';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const CREATED = '2026-10-01T09:00:00Z';
const PERSONAS = [
  {
    id: 'p-1', name: 'Data Steward', description: 'Curates and approves data assets', created_at: CREATED, updated_at: CREATED,
    privileges: [
      { securable_id: 'main.sales.orders', securable_type: 'table', permission: 'MANAGE' },
      { securable_id: 'main.sales', securable_type: 'schema', permission: 'READ' },
    ],
    groups: ['data-stewards', 'data-governance'],
  },
  {
    id: 'p-2', name: 'Analyst', description: 'Reads curated data', created_at: CREATED, updated_at: CREATED,
    privileges: [{ securable_id: 'main.sales', securable_type: 'schema', permission: 'READ' }],
    groups: ['analysts'],
  },
];
const LONG_NAME = `Steward of every partner dataset ${'and owner of its quality rules '.repeat(8)}`.slice(0, 199) + '.';

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response | undefined> | undefined;

function mockBackend(list: unknown = PERSONAS, status = 200, extra: Handler = () => undefined) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const answer = await extra(url, init);
    if (answer) return answer;
    const path = url.pathname;
    if (path === '/api/entitlements/personas' && method === 'GET') return json(list, status);
    if (path === '/api/entitlements/personas' && method === 'POST') return json({ ...PERSONAS[0], id: 'p-new' });
    if (/^\/api\/entitlements\/personas\/[^/]+$/.test(path) && method === 'PUT') return json(PERSONAS[0]);
    if (/^\/api\/entitlements\/personas\/[^/]+$/.test(path) && method === 'DELETE') return new Response(null, { status: 204 });
    if (path.endsWith('/privileges') && method === 'POST') {
      return json({ ...PERSONAS[1], privileges: [...PERSONAS[1].privileges, JSON.parse(String(init?.body))] });
    }
    if (path.includes('/privileges/') && method === 'DELETE') {
      return json({ ...PERSONAS[0], privileges: PERSONAS[0].privileges.slice(1) });
    }
    if (path.endsWith('/groups') && method === 'PUT') {
      return json({ ...PERSONAS[0], groups: JSON.parse(String(init?.body)).groups });
    }
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
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { entitlements: level },
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
      <Route path="/entitlements" element={<Entitlements />} />
    </Routes>,
    { route: '/entitlements' },
  );

const list = () => screen.getByRole('listbox', { name: 'Personas' });
const loaded = () => screen.findByRole('option', { name: /Data Steward/ });
const personaRow = (name: string) => within(list()).getByRole('option', { name: new RegExp(name) });
const names = (els: HTMLElement[]) =>
  els.map((el) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || el.getAttribute('title') || ''));
const sorted = (l: string[]) => [...l].sort();
async function select(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(personaRow(name));
}

describe('entitlements on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    toast.mockClear();
    useDirectoryStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('entitlements renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    expect(container.querySelector(`.${kit.page}`)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();

    const heading = screen.getByRole('heading', { level: 1, name: 'Entitlements' });
    expect(heading.parentElement).toHaveClass(kit.header);
    // Create Persona sits in the header's actions
    expect(within(heading.parentElement as HTMLElement).getByRole('button', { name: 'Create Persona' })).toBeInTheDocument();

    // Two kit panes side by side in a PaneStack, 1/4 and 3/4
    const personas = screen.getByRole('region', { name: 'Personas' });
    const details = screen.getByRole('region', { name: 'Select a Persona' });
    expect(personas).toHaveClass(kit.pane);
    expect(details).toHaveClass(kit.pane);
    const cells = Array.from(container.querySelectorAll<HTMLElement>(`.${kit.stackCell}`));
    expect(cells.map((c) => c.style.getPropertyValue('--pane-size'))).toEqual(['1', '3']);
    expect(cells[0]).toContainElement(personas);
    expect(cells[1]).toContainElement(details);
    expect(within(details).getByText('Select a persona to view details')).toBeInTheDocument();

    // No layout padding, shadcn card or Tailwind class in the page's own markup
    expect(container.querySelector('.py-6, .p-6, .mb-6, .text-3xl, .space-y-4, .space-y-2, .grid-cols-4, .md\\:col-span-3')).toBeNull();
    expect(container.querySelector('[data-slot="card"], .rounded-lg.border, [class*="bg-primary"], [class*="text-muted"]')).toBeNull();
    expect(container.querySelector('.w-12, .h-\\[70vh\\], .text-lg, .font-medium:not(button), .text-sm:not(button)')).toBeNull();
  });

  it.each([
    ['an admin', FeatureAccessLevel.ADMIN],
    ['a read-only user', FeatureAccessLevel.READ_ONLY],
  ])('entitlements keeps every control for %s', async (_who, level) => {
    // The page has never gated its controls: the baselines of both personas
    // show the same inventory
    grant(level);
    const user = userEvent.setup();
    renderPage();
    await loaded();

    // Nothing selected: only Create Persona (the Task 1 baseline's inventory)
    expect(names(screen.getAllByRole('button', { hidden: true }))).toEqual(['Create Persona']);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);

    // The list: a persona per row with its privilege count
    expect(within(personaRow('Data Steward')).getByText('2 privileges')).toBeInTheDocument();
    expect(within(personaRow('Analyst')).getByText('1 privilege')).toBeInTheDocument();

    await select(user, 'Data Steward');
    const details = screen.getByRole('region', { name: 'Data Steward' });
    expect(sorted(names(within(details).getAllByRole('button')))).toEqual(
      sorted(['Edit', 'Delete', 'Add Privilege', 'Remove privilege', 'Remove privilege']));
    expect(within(details).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Access Privileges', 'Group Assignments']);
    expect(within(details).getByRole('tab', { name: 'Access Privileges' })).toHaveAttribute('aria-selected', 'true');

    // The privileges: id, type and permission
    expect(within(details).getByText('main.sales.orders')).toBeInTheDocument();
    expect(within(details).getByText('table')).toBeInTheDocument();
    expect(within(details).getByText('MANAGE')).toBeInTheDocument();
    expect(within(details).getByText('READ')).toBeInTheDocument();

    // Groups tab: the picker with the persona's groups
    await user.click(within(details).getByRole('tab', { name: 'Group Assignments' }));
    expect(within(details).getByText('Add Groups')).toBeInTheDocument();
    expect(within(details).getByText('data-stewards')).toBeInTheDocument();
    expect(within(details).getByText('data-governance')).toBeInTheDocument();
    expect(within(details).queryByText('main.sales.orders')).toBeNull();
  });

  it('entitlements: a persona with no privileges says so, and the list says so when empty', async () => {
    mockBackend([{ ...PERSONAS[1], id: 'p-3', name: 'Newcomer', privileges: [], groups: [] }]);
    const user = userEvent.setup();
    const { unmount } = renderPage();
    await user.click(await screen.findByRole('option', { name: /Newcomer/ }));
    expect(within(screen.getByRole('region', { name: 'Newcomer' })).getByText('No privileges configured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Privilege' })).toBeEnabled();
    unmount();

    mockBackend([]);
    renderPage();
    expect(await screen.findByText('No personas found. Create one to get started.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Persona' })).toBeEnabled();
  });

  it('entitlements: arrow keys move through the persona list and Enter selects', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    expect(list()).toBeInTheDocument();
    const [first, second] = within(list()).getAllByRole('option');
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Analyst' })).toBeInTheDocument();
    // Space on the first selects it too
    await user.keyboard('{ArrowUp} ');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Data Steward' })).toBeInTheDocument();
  });

  it('entitlements: Create Persona opens the kit dialog and POSTs once on a double click', async () => {
    mockBackend(PERSONAS, 200, async (_url, init) => {
      if (init?.method !== 'POST') return undefined;
      await new Promise((r) => setTimeout(r, 150));
      return json({ ...PERSONAS[0], id: 'p-new' });
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Create Persona' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create New Persona' });
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    expect(within(dialog).getByRole('textbox', { name: /Persona Name/ })).toHaveValue('');
    await user.type(within(dialog).getByRole('textbox', { name: /Persona Name/ }), 'Auditor');
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'Reads everything');
    await user.dblClick(within(dialog).getByRole('button', { name: 'Create Persona' }));

    await waitFor(() => expect(calls('POST', '/api/entitlements/personas')).toHaveLength(1));
    expect(bodyOf(calls('POST', '/api/entitlements/personas')[0])).toEqual({ name: 'Auditor', description: 'Reads everything' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Persona created successfully' }));
    await waitFor(() => expect(calls('GET', '/api/entitlements/personas')).toHaveLength(2));
    expect(calls('POST', '/api/entitlements/personas')).toHaveLength(1);
  });

  it('entitlements: Edit fills the dialog, PUTs, and the detail header shows the new name', async () => {
    let renamed = false;
    mockBackend(PERSONAS, 200, (url, init) => {
      if (url.pathname === '/api/entitlements/personas' && (init?.method ?? 'GET') === 'GET' && renamed) {
        return json([{ ...PERSONAS[0], name: 'Lead Steward' }, PERSONAS[1]]);
      }
      if (init?.method === 'PUT') { renamed = true; return json({ ...PERSONAS[0], name: 'Lead Steward' }); }
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await select(user, 'Data Steward');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Persona' });
    expect(within(dialog).getByRole('textbox', { name: /Persona Name/ })).toHaveValue('Data Steward');
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue('Curates and approves data assets');
    await user.clear(within(dialog).getByRole('textbox', { name: /Persona Name/ }));
    await user.type(within(dialog).getByRole('textbox', { name: /Persona Name/ }), 'Lead Steward');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(calls('PUT', '/api/entitlements/personas/p-1')).toHaveLength(1));
    expect(bodyOf(calls('PUT', '/api/entitlements/personas/p-1')[0])).toEqual({
      name: 'Lead Steward', description: 'Curates and approves data assets',
    });
    // Existing bug: the header kept the old name until another persona was clicked
    expect(await screen.findByRole('region', { name: 'Lead Steward' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Data Steward' })).toBeNull();
    expect(personaRow('Lead Steward')).toHaveAttribute('aria-selected', 'true');
  });

  it('entitlements: Create after a cancelled Edit opens an empty form', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await select(user, 'Data Steward');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByRole('dialog', { name: 'Edit Persona' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Create Persona' }));
    const add = await screen.findByRole('dialog', { name: 'Create New Persona' });
    expect(within(add).getByRole('textbox', { name: /Persona Name/ })).toHaveValue('');
    expect(within(add).getByRole('textbox', { name: 'Description' })).toHaveValue('');
  });

  it('entitlements: a failed save keeps the dialog and its input, and Escape waits while a save is out', async () => {
    let release: (r: Response) => void = () => {};
    mockBackend(PERSONAS, 200, (_url, init) =>
      init?.method === 'POST' ? new Promise<Response>((resolve) => { release = resolve; }) : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Create Persona' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create New Persona' });
    await user.type(within(dialog).getByRole('textbox', { name: /Persona Name/ }), 'Keep me');
    await user.click(within(dialog).getByRole('button', { name: 'Create Persona' }));
    await waitFor(() => expect(calls('POST', '/api/entitlements/personas')).toHaveLength(1));
    // In flight: Escape and Cancel leave the dialog open
    await user.keyboard('{Escape}');
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole('dialog', { name: 'Create New Persona' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();

    release(json({ detail: 'nope' }, 500));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Failed to save persona', variant: 'destructive' })));
    expect(screen.getByRole('dialog', { name: 'Create New Persona' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /Persona Name/ })).toHaveValue('Keep me');
    expect(within(dialog).getByRole('button', { name: 'Create Persona' })).toBeEnabled();
  });

  it('entitlements delete confirm is an alertdialog, sends once and returns focus (persona)', async () => {
    let release: (r: Response) => void = () => {};
    mockBackend(PERSONAS, 200, (_url, init) =>
      init?.method === 'DELETE' ? new Promise<Response>((resolve) => { release = resolve; }) : undefined);
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await select(user, 'Data Steward');

    const del = screen.getByRole('button', { name: 'Delete' });
    await user.click(del);
    const confirm = await screen.findByRole('alertdialog', { name: /Delete/ });
    // Nothing is sent until it's confirmed; the description names the persona
    expect(confirm).toHaveTextContent('Data Steward');
    expect(calls('DELETE', /personas\/p-1$/)).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();

    // Cancel sends nothing and focus returns to the opener
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' })));
    expect(calls('DELETE', /personas\/p-1$/)).toHaveLength(0);

    // Confirm with a double click: one request
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.dblClick(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls('DELETE', /personas\/p-1$/)).toHaveLength(1));

    // The list reloads without it, nothing is selected, and focus lands on Create Persona
    mockBackend(PERSONAS.slice(1));
    release(new Response(null, { status: 204 }));
    await waitFor(() => expect(screen.queryByRole('option', { name: /Data Steward/ })).toBeNull());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('region', { name: 'Select a Persona' })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Persona' })));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Persona deleted successfully' }));
  });

  it('entitlements: a failed persona delete keeps the persona and says why', async () => {
    mockBackend(PERSONAS, 200, (_url, init) => (init?.method === 'DELETE' ? json({ detail: 'nope' }, 500) : undefined));
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await select(user, 'Data Steward');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Failed to delete persona', variant: 'destructive' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('region', { name: 'Data Steward' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Data Steward/ })).toBeInTheDocument();
  });

  it('entitlements delete confirm is an alertdialog, sends once and returns focus (privilege)', async () => {
    let release: (r: Response) => void = () => {};
    mockBackend(PERSONAS, 200, (_url, init) =>
      init?.method === 'DELETE' ? new Promise<Response>((resolve) => { release = resolve; }) : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await select(user, 'Data Steward');
    const details = () => screen.getByRole('region', { name: 'Data Steward' });
    const removes = () => within(details()).getAllByRole('button', { name: 'Remove privilege' });

    await user.click(removes()[0]);
    const confirm = await screen.findByRole('alertdialog', { name: /Remove/ });
    expect(confirm).toHaveTextContent('main.sales.orders');
    expect(calls('DELETE', /privileges\//)).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(removes()[0]));
    expect(calls('DELETE', /privileges\//)).toHaveLength(0);

    await user.click(removes()[0]);
    await user.dblClick(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(calls('DELETE', '/api/entitlements/personas/p-1/privileges/main.sales.orders')).toHaveLength(1));
    release(json({ ...PERSONAS[0], privileges: PERSONAS[0].privileges.slice(1) }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(details()).queryByText('main.sales.orders')).toBeNull();
    expect(within(details()).getAllByRole('button', { name: 'Remove privilege' })).toHaveLength(1);
    // The row is gone: focus lands on Add Privilege
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Privilege' })));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Privilege removed successfully' }));
    // The list's count follows
    expect(within(personaRow('Data Steward')).getByText('1 privilege')).toBeInTheDocument();
  });

  it('entitlements: Add Privilege POSTs the privilege, and the Selects cannot be cleared', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await select(user, 'Analyst');
    await user.click(screen.getByRole('button', { name: 'Add Privilege' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add Privilege' });
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    const add = within(dialog).getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    // The defaults of the old dialog
    const type = selectField(dialog, 'Securable Type');
    const permission = selectField(dialog, 'Permission');
    expect(type).toHaveValue('Table');
    expect(permission).toHaveValue('READ');

    await user.type(within(dialog).getByRole('textbox', { name: /Securable ID/ }), 'main.sales.orders');
    expect(add).toBeEnabled();
    await pick(user, type, 'Schema');
    await pick(user, permission, 'MANAGE');
    // Choosing the chosen option again keeps it (Radix could not clear either)
    await pick(user, permission, 'MANAGE');
    expect(permission).toHaveValue('MANAGE');
    await user.dblClick(add);

    await waitFor(() => expect(calls('POST', '/api/entitlements/personas/p-2/privileges')).toHaveLength(1));
    expect(bodyOf(calls('POST', '/api/entitlements/personas/p-2/privileges')[0])).toEqual({
      securable_id: 'main.sales.orders', securable_type: 'schema', permission: 'MANAGE',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(screen.getByRole('region', { name: 'Analyst' })).getByText('MANAGE')).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Privilege added successfully' }));
    // The dialog starts afresh the next time
    await user.click(screen.getByRole('button', { name: 'Add Privilege' }));
    const again = await screen.findByRole('dialog', { name: 'Add Privilege' });
    expect(within(again).getByRole('textbox', { name: /Securable ID/ })).toHaveValue('');
    expect(selectField(again, 'Permission')).toHaveValue('READ');
  });

  it('entitlements: Escape in an open Select closes only the Select, in jsdom', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await select(user, 'Analyst');
    await user.click(screen.getByRole('button', { name: 'Add Privilege' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add Privilege' });
    await user.type(within(dialog).getByRole('textbox', { name: /Securable ID/ }), 'keep.me');
    await user.click(selectField(dialog, 'Permission'));
    await user.keyboard('{Escape}');
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole('dialog', { name: 'Add Privilege' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /Securable ID/ })).toHaveValue('keep.me');
  });

  it('entitlements: a failed privilege add keeps the dialog and says why', async () => {
    mockBackend(PERSONAS, 200, (_url, init) => (init?.method === 'POST' ? json({ detail: 'nope' }, 500) : undefined));
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await select(user, 'Analyst');
    await user.click(screen.getByRole('button', { name: 'Add Privilege' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add Privilege' });
    await user.type(within(dialog).getByRole('textbox', { name: /Securable ID/ }), 'main.x');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Failed to add privilege', variant: 'destructive' })));
    expect(screen.getByRole('dialog', { name: 'Add Privilege' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: /Securable ID/ })).toHaveValue('main.x');
  });

  it('entitlements: changing the groups PUTs the new list', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await select(user, 'Data Steward');
    await user.click(screen.getByRole('tab', { name: 'Group Assignments' }));
    const input = await screen.findByRole('textbox', { name: 'Group Assignments' });
    await user.type(input, 'auditors{Enter}');
    await waitFor(() => expect(calls('PUT', '/api/entitlements/personas/p-1/groups')).toHaveLength(1));
    expect(bodyOf(calls('PUT', '/api/entitlements/personas/p-1/groups')[0])).toEqual({
      groups: ['data-stewards', 'data-governance', 'auditors'],
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Groups updated successfully' }));
    expect(await screen.findByText('auditors')).toBeInTheDocument();
  });

  it('entitlements: a long persona name carries a title in the list and the header', async () => {
    mockBackend([...PERSONAS, { ...PERSONAS[1], id: 'p-long', name: LONG_NAME }]);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const row = within(list()).getByRole('option', { name: new RegExp(LONG_NAME.slice(0, 40)) });
    expect(within(row).getByText(LONG_NAME, { exact: true })).toHaveAttribute('title', LONG_NAME);
    await user.click(row);
    const header = screen.getByRole('heading', { level: 2, name: LONG_NAME });
    expect(header).toHaveAttribute('title', LONG_NAME);
  });

  it('entitlements empty and error states keep their message and actions', async () => {
    // A failed load: the error shows in the list's pane with a Retry, and a toast
    mockBackend({ detail: 'Backend exploded' }, 500);
    const user = userEvent.setup();
    renderPage();
    const alert = await within(await screen.findByRole('region', { name: 'Personas' })).findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load personas');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Failed to load personas', variant: 'destructive' }));
    expect(screen.getByRole('button', { name: 'Create Persona' })).toBeEnabled();

    // Retry brings the list back, and the error goes
    mockBackend();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('entitlements: the last good list stays under a reload error, and the error clears after a later success', async () => {
    let failing = false;
    mockBackend(PERSONAS, 200, (url, init) => {
      if (failing && url.pathname === '/api/entitlements/personas' && (init?.method ?? 'GET') === 'GET') {
        return json({ detail: 'x' }, 500);
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    // A save, then its reload fails
    failing = true;
    await user.click(screen.getByRole('button', { name: 'Create Persona' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create New Persona' });
    await user.type(within(dialog).getByRole('textbox', { name: /Persona Name/ }), 'Auditor');
    await user.click(within(dialog).getByRole('button', { name: 'Create Persona' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load personas');
    expect(screen.getByRole('option', { name: /Data Steward/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Analyst/ })).toBeInTheDocument();

    // A later success (Retry) clears it
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByRole('option', { name: /Data Steward/ })).toBeInTheDocument();
  });

  it('entitlements: an action error clears after the next success', async () => {
    let failing = true;
    mockBackend(PERSONAS, 200, (_url, init) =>
      init?.method === 'PUT' && failing ? json({ detail: 'x' }, 500) : undefined);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await select(user, 'Data Steward');
    await user.click(screen.getByRole('tab', { name: 'Group Assignments' }));
    const input = await screen.findByRole('textbox', { name: 'Group Assignments' });
    await user.type(input, 'auditors{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update groups');
    // No Retry for a failed action: only a failed load has one
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    failing = false;
    await user.type(screen.getByRole('textbox', { name: 'Group Assignments' }), 'auditors{Enter}');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('entitlements: a list that is not an array shows as empty, and an older answer does not replace a newer one', async () => {
    mockBackend({ personas: 'unexpected' });
    const { unmount } = renderPage();
    expect(await screen.findByText('No personas found. Create one to get started.')).toBeInTheDocument();
    unmount();

    let first: (r: Response) => void = () => {};
    let n = 0;
    mockBackend(PERSONAS, 200, (url, init) => {
      if (url.pathname === '/api/entitlements/personas' && (init?.method ?? 'GET') === 'GET' && ++n === 1) {
        return new Promise<Response>((resolve) => { first = resolve; });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    // The first load hangs; a save reloads the list, and that answer is the newer one
    await user.click(await screen.findByRole('button', { name: 'Create Persona' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create New Persona' });
    await user.type(within(dialog).getByRole('textbox', { name: /Persona Name/ }), 'x');
    await user.click(within(dialog).getByRole('button', { name: 'Create Persona' }));
    await loaded();
    first(json([{ ...PERSONAS[0], id: 'stale', name: 'Stale answer' }]));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Stale answer')).toBeNull();
    expect(screen.getByRole('option', { name: /Data Steward/ })).toBeInTheDocument();
  });
});

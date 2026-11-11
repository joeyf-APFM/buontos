/**
 * Wave 2 Task 12a: Collections (/concepts/collections) on the page kit, with
 * the scheme editor (CollectionEditorDialog) on the kit Dialog. The look, the
 * long names and Escape in the editor's Selects are measured in a real
 * browser in tests/e2e/concepts-define-collections.spec.ts (ruling R10);
 * these tests check the structure, every control for a writer and a reader,
 * create, edit, delete and export, and the empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import CollectionsView from './collections';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));
// The shared metadata panel has its own tests
vi.mock('@/components/metadata/entity-metadata-panel', () => ({
  default: ({ entityId }: { entityId: string }) => <p>metadata of {entityId}</p>,
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LONG_NAME = 'x'.repeat(200);
const scheme = (iri: string, label: string, extra: Record<string, unknown> = {}) => ({
  iri, label, description: `About ${label.slice(0, 12)}`, collection_type: 'glossary', scope_level: 'enterprise',
  source_type: 'custom', is_editable: true, status: 'active', concept_count: 3, child_collections: [],
  created_by: 'urn:user:rita@example.com', ...extra,
});
const SCHEMES = [
  scheme('urn:finance', 'Finance Glossary'),
  scheme('urn:fibo', 'FIBO', { source_type: 'imported', is_editable: false, collection_type: 'ontology', created_by: 'urn:user:system' }),
  scheme('urn:long', LONG_NAME, { collection_type: 'taxonomy' }),
];

let fetchMock: ReturnType<typeof vi.fn>;

function mockBackend({ list = SCHEMES as unknown, status = 200, saveStatus = 200, deleteStatus = 200 } = {}) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/knowledge/collections' && method === 'GET') {
      return json(status === 200 ? { collections: list } : { detail: 'Schemes exploded' }, status);
    }
    if (url.pathname.startsWith('/api/knowledge/collections')) {
      if (url.pathname.endsWith('/export')) return new Response('@prefix x: <urn:x> .', { status: 200 });
      if (method === 'DELETE' && deleteStatus !== 200) return json({ detail: 'Scheme is in use' }, deleteStatus);
      return saveStatus === 200 ? json({ iri: 'urn:new' }) : json({ detail: 'Name already taken' }, saveStatus);
    }
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (method: string) =>
  fetchMock.mock.calls.filter(([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === method)
    .map(([input, init]) => ({ path: decodeURIComponent(new URL(String(input), 'http://localhost').pathname), body: (init as RequestInit | undefined)?.body }));
const listLoads = () => calls('GET').filter((c) => c.path === '/api/knowledge/collections');

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { 'semantic-models': level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = () => renderWithMantine(<CollectionsView />, { route: '/concepts/collections' });
const loaded = () => screen.findByText('Finance Glossary', { exact: true });
const list = () => screen.getByRole('region', { name: 'Scheme list' });
/** The list a Mantine Select's field opened. */
const listboxOf = (field: HTMLElement) => document.getElementById(field.getAttribute('aria-controls') ?? '') as HTMLElement;
const rowOf = (text: string) => within(list()).getByText(text, { exact: true }).closest('tr') as HTMLElement;

async function menuItems(user: ReturnType<typeof userEvent.setup>, label: string) {
  const target = within(list()).getByRole('button', { name: `Actions for ${label}` });
  await user.click(target);
  // This menu's dropdown, once it has mounted
  await waitFor(() => expect(target).toHaveAttribute('aria-expanded', 'true'));
  const menu = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[role="menu"][aria-labelledby="${target.id}"]`);
    expect(found).not.toBeNull();
    return found!;
  });
  // hidden: in jsdom every box is 0×0, so floating-ui's hide middleware takes
  // the target in the table's scroll box for clipped and hides the dropdown
  // (the e2e spec opens it in a real browser)
  const items = await within(menu).findAllByRole('menuitem', { hidden: true });
  return items.map((i) => i.textContent?.trim());
}

describe('collections on the page kit', () => {
  beforeEach(() => {
    mockBackend();
    grant(FeatureAccessLevel.READ_WRITE);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    // The export's download link: jsdom can't navigate
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    toast.mockClear();
  });

  it('collections renders with the page kit', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await loaded();

    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    const heading = screen.getByRole('heading', { level: 1, name: 'Schemes' });
    expect(heading.parentElement).toHaveClass(kit.header);
    expect(screen.getByText('3 schemes')).toBeInTheDocument();
    expect(list()).toHaveClass(kit.pane);
    expect(list().parentElement).toHaveClass(kit.content);

    // A row opens its details in a pane beside the list, named by the scheme
    await user.click(within(rowOf('Finance Glossary')).getByText('Finance Glossary'));
    const details = await screen.findByRole('region', { name: 'Finance Glossary' });
    expect(details).toHaveClass(kit.pane);
    expect(details.previousElementSibling).toBe(list());
    expect(within(details).getByText('urn:finance')).toBeInTheDocument();
    expect(within(details).getAllByRole('term').map((t) => t.textContent)).toEqual(['Type', 'Scope', 'Concepts', 'Source', 'Status']);
    expect(within(details).getByText('metadata of urn:finance')).toBeInTheDocument();

    // (The shared DataTable keeps its own classes: wave 6)
    const tailwind = [...container.querySelectorAll('.p-4, .w-1\\/2, .text-2xl, .text-lg, .border-b, .space-y-6, .grid-cols-2, .rounded-lg')];
    expect(tailwind.filter((el) => !el.closest('table'))).toEqual([]);
  });

  it('collections keeps every control for a writer', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();

    expect(screen.getByRole('button', { name: 'Create Scheme' })).toBeEnabled();
    for (const name of ['Name', 'Type', 'Scope', 'Concepts']) expect(within(list()).getByRole('button', { name })).toBeInTheDocument();
    expect(within(list()).getByPlaceholderText('Filter labels...')).toBeInTheDocument();

    // An editable scheme: edit, both exports and delete; a read-only one: exports only
    expect(await menuItems(user, 'Finance Glossary')).toEqual(['Edit', 'Export as Turtle', 'Export as RDF/XML', 'Delete']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu', { hidden: true })).toBeNull());
    expect(await menuItems(user, 'FIBO')).toEqual(['Export as Turtle', 'Export as RDF/XML']);

    // Export downloads the scheme
    await user.click(await screen.findByRole('menuitem', { name: 'Export as Turtle', hidden: true }));
    await waitFor(() => expect(calls('GET').map((c) => c.path)).toContain('/api/knowledge/collections/urn:fibo/export'));

    // Edit opens the editor with the scheme's values; Save patches it and reloads
    await menuItems(user, 'Finance Glossary');
    await user.click(screen.getByRole('menuitem', { name: 'Edit', hidden: true }));
    const editor = await screen.findByRole('dialog', { name: 'Edit Scheme' });
    expect(editor).toHaveClass('mantine-Modal-content');
    const name = within(editor).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Finance Glossary');
    expect(within(editor).queryByRole('textbox', { name: 'Type' })).toBeNull();
    expect(within(editor).getByRole('textbox', { name: 'Scope' })).toHaveValue('Enterprise');
    expect(within(editor).getByRole('textbox', { name: 'Parent Scheme' })).toHaveValue('None (root scheme)');
    expect(within(editor).getByRole('switch', { name: 'Editable' })).toBeChecked();
    await user.clear(name);
    await user.type(name, 'Finance Terms');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Scheme' })).toBeNull());
    const patch = calls('PATCH');
    expect(patch.map((c) => c.path)).toEqual(['/api/knowledge/collections/urn:finance']);
    expect(JSON.parse(String(patch[0].body))).toMatchObject({ label: 'Finance Terms', scope_level: 'enterprise', is_editable: true });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Scheme updated successfully' }));
    await waitFor(() => expect(listLoads()).toHaveLength(2));

    // Delete asks first, then deletes and reloads
    await menuItems(user, 'Finance Glossary');
    await user.click(screen.getByRole('menuitem', { name: 'Delete', hidden: true }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(calls('DELETE').map((c) => c.path)).toEqual(['/api/knowledge/collections/urn:finance']));
    await waitFor(() => expect(listLoads()).toHaveLength(3));

    // The details pane's Edit opens the editor too, and Close closes the pane
    await user.click(within(rowOf('Finance Glossary')).getByText('Finance Glossary'));
    const details = await screen.findByRole('region', { name: 'Finance Glossary' });
    await user.click(within(details).getByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('dialog', { name: 'Edit Scheme' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog', { name: 'Edit Scheme' })).getByRole('button', { name: 'Cancel' }));
    await user.click(within(details).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Finance Glossary' })).toBeNull();
  });

  it('collections: Create Scheme posts a new scheme, with the chosen type, scope and parent', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Create Scheme' }));
    const editor = await screen.findByRole('dialog', { name: 'Create Scheme' });
    const create = within(editor).getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();
    await user.type(within(editor).getByRole('textbox', { name: 'Name' }), 'Risk Glossary');
    await user.click(within(editor).getByRole('textbox', { name: 'Type' }));
    await user.click(await screen.findByRole('option', { name: 'Taxonomy', hidden: true }));
    await user.click(within(editor).getByRole('textbox', { name: 'Scope' }));
    await user.click(await screen.findByRole('option', { name: 'Domain', hidden: true }));
    // The parent list: the editable user schemes only, grouped by type, each with its parent's name
    const parent = within(editor).getByRole('textbox', { name: 'Parent Scheme' });
    await user.click(parent);
    await waitFor(() => expect(listboxOf(parent)).not.toBeNull());
    const options = within(listboxOf(parent)).getAllByRole('option', { hidden: true }).map((o) => o.textContent);
    expect(options).toEqual(['None (root scheme)', 'Finance Glossary', LONG_NAME]);
    expect([...listboxOf(parent).querySelectorAll('[class*="groupLabel"]')].map((g) => g.textContent)).toEqual(['Glossaries', 'Taxonomies']);
    await user.click(screen.getByRole('option', { name: 'Finance Glossary', hidden: true }));
    await user.click(within(editor).getByRole('switch', { name: 'Editable' }));
    await user.click(create);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create Scheme' })).toBeNull());
    expect(JSON.parse(String(calls('POST')[0].body))).toEqual({
      label: 'Risk Glossary', collection_type: 'taxonomy', scope_level: 'domain', parent_collection_iri: 'urn:finance', is_editable: false,
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Scheme created successfully' }));
  });

  it('collections: a failed save keeps the editor open, with no success toast', async () => {
    mockBackend({ saveStatus: 409 });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Create Scheme' }));
    const editor = await screen.findByRole('dialog', { name: 'Create Scheme' });
    await user.type(within(editor).getByRole('textbox', { name: 'Name' }), 'Finance Glossary');
    await user.click(within(editor).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Name already taken', variant: 'destructive' })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ description: 'Scheme created successfully' }));
    expect(screen.getByRole('dialog', { name: 'Create Scheme' })).toBeInTheDocument();
    expect(within(editor).getByRole('button', { name: 'Create' })).toBeEnabled();
  });

  it('collections: a failed Delete shows the error, with no success toast, and keeps the list', async () => {
    mockBackend({ deleteStatus: 409 });
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await menuItems(user, 'Finance Glossary');
    await user.click(screen.getByRole('menuitem', { name: 'Delete', hidden: true }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Scheme is in use', variant: 'destructive' })),
    );
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ description: 'Scheme deleted successfully' }));
    expect(listLoads()).toHaveLength(1);
    expect(within(list()).getByText('Finance Glossary', { exact: true })).toBeInTheDocument();
  });

  it('collections: a reload keeps the table, so focus goes back to the row after a Save from its menu, and to Create Scheme after a Delete', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const table = within(list()).getByRole('table');

    // Edit from the row's menu, Save: the list reloads in place and the kit
    // gives focus back to the row's Actions button
    await menuItems(user, 'Finance Glossary');
    await user.click(screen.getByRole('menuitem', { name: 'Edit', hidden: true }));
    const editor = await screen.findByRole('dialog', { name: 'Edit Scheme' });
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(listLoads()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Scheme' })).toBeNull());
    expect(within(list()).getByRole('table')).toBe(table);
    await waitFor(() => expect(within(list()).getByRole('button', { name: 'Actions for Finance Glossary' })).toHaveFocus());

    // Delete from the row's menu: once the list is back, focus is on Create Scheme
    await menuItems(user, 'Finance Glossary');
    await user.click(screen.getByRole('menuitem', { name: 'Delete', hidden: true }));
    await waitFor(() => expect(listLoads()).toHaveLength(3));
    expect(within(list()).getByRole('table')).toBe(table);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Scheme' })).toHaveFocus());
  });

  it('collections: Escape in an editor Select closes only the Select, and the name survives', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Create Scheme' }));
    const editor = await screen.findByRole('dialog', { name: 'Create Scheme' });
    await user.type(within(editor).getByRole('textbox', { name: 'Name' }), 'Risk Glossary');
    // The Type field's info mark: an image with a short name; the field keeps its own
    expect(within(editor).getByRole('img', { name: 'About scheme types' })).toHaveAttribute('tabindex', '0');
    expect(within(editor).getByRole('textbox', { name: 'Type' })).toBeInTheDocument();
    const scope = within(editor).getByRole('textbox', { name: 'Scope' });
    await user.click(scope);
    await waitFor(() => expect(scope).toHaveAttribute('aria-controls'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(scope).not.toHaveAttribute('aria-controls'));
    expect(screen.getByRole('dialog', { name: 'Create Scheme' })).toBeInTheDocument();
    expect(within(editor).getByRole('textbox', { name: 'Name' })).toHaveValue('Risk Glossary');
  });

  it('collections keeps every control for a reader', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    expect(screen.queryByRole('button', { name: 'Create Scheme' })).toBeNull();
    expect(await menuItems(user, 'Finance Glossary')).toEqual(['Export as Turtle', 'Export as RDF/XML']);
    await user.keyboard('{Escape}');
    await user.click(within(rowOf('Finance Glossary')).getByText('Finance Glossary'));
    const details = await screen.findByRole('region', { name: 'Finance Glossary' });
    expect(within(details).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(details).getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('collections: a 200-character name keeps a title in its details', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(rowOf(LONG_NAME)).getByText(LONG_NAME));
    const heading = await screen.findByRole('heading', { level: 2, name: LONG_NAME });
    expect(heading).toHaveAttribute('title', LONG_NAME);
  });

  it('collections empty and error states keep their actions', async () => {
    // No schemes: the table says so, and Create Scheme opens the editor
    mockBackend({ list: [] });
    const user = userEvent.setup();
    const { unmount } = renderPage();
    const noResults = await screen.findByText('No results.');
    expect(list()).toContainElement(noResults);
    expect(screen.getByText('0 schemes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create Scheme' }));
    expect(await screen.findByRole('dialog', { name: 'Create Scheme' })).toBeInTheDocument();
    unmount();

    // A failed load: the error, Retry, and Create Scheme still there
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend({ status: 500 });
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(alert).toHaveTextContent('Schemes exploded');
    expect(screen.getByRole('button', { name: 'Create Scheme' })).toBeEnabled();
    expect(listLoads()).toHaveLength(1);
    mockBackend();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await loaded()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(logged).toHaveBeenCalledWith('Failed to fetch collections:', expect.any(Error));
  });
});

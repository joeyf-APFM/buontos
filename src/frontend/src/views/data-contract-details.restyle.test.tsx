/**
 * Wave 2 Task 9: the Data Contract details page's frame and top sections
 * (/data-contracts/:id) on the page kit: the kit header, the banners, the
 * version and view controls, the Details and Description panes, and the
 * shared panels in untitled kit panes. The sections from Schemas on are Task
 * 10's and keep their markup. Pixel values that depend on the cascade (the
 * long name's truncation, the purpose's wrap, the page's horizontal scroll)
 * are measured in a real browser in tests/e2e/data-contract-details.spec.ts
 * (ruling R10); these tests check the structure, every control for both
 * personas, and the error state.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import usePermissionsStore from '@/stores/permissions-store';
import { useUserStore } from '@/stores/user-store';
import { FeatureAccessLevel } from '@/types/settings';
import DataContractDetails from './data-contract-details';

// Toasts go to Mantine's notifications, which these tests don't mount
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const CONTRACT = {
  id: 'c-1', name: 'Orders contract', version: '1.0.0', status: 'draft', apiVersion: 'v3.0.2', kind: 'DataContract',
  schema: [], tags: [], customProperties: {}, description: { purpose: 'Orders for reporting' },
  created: '2026-10-01T09:00:00Z', updated: '2026-11-02T15:30:00Z',
};

const MATURITY = { achieved_level_order: null, achieved_level_name: null, total_levels: 0, gates_passed: 0, gates_total: 0, levels: [] };

function mockBackend(contract: unknown = CONTRACT, status = 200, extra: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/data-contracts/c-1' && method === 'GET') {
      return status === 200 ? json(contract) : json({ detail: 'Backend down' }, status);
    }
    if (url.pathname === '/api/data-contracts/c-1' && method === 'DELETE') return json({ detail: 'Nope' }, 500);
    if (url.pathname === '/api/data-contracts/c-1/maturity') return json(MATURITY);
    if (url.pathname in extra) return json(extra[url.pathname]);
    return json([]);
  }));
}

function grant(level: FeatureAccessLevel, approver = false) {
  usePermissionsStore.setState({
    permissions: { 'data-contracts': level, 'semantic-models': level },
    availableRoles: approver
      ? [{ id: 'r-1', name: 'Approver', assigned_groups: ['admins'], feature_permissions: {}, approval_privileges: { CONTRACTS: true } } as never]
      : [],
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

const renderPage = (route = '/data-contracts/c-1') =>
  renderWithMantine(
    <Routes>
      <Route path="/data-contracts" element={<p>contract list</p>} />
      <Route path="/data-contracts/:contractId" element={<DataContractDetails />} />
    </Routes>,
    { route },
  );

const loaded = (name = 'Orders contract') => screen.findByRole('heading', { level: 1, name });
const header = () => screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement;
// The accessible name: a label, else the text, else the title (icon buttons)
const names = (els: HTMLElement[]) =>
  els.map((el) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || el.getAttribute('title') || ''));
// The header's actions, in the kit's end slot (its badges hold the maturity buttons)
const actions = () => header().querySelector(`.${kit.headerEnd}`) as HTMLElement;
const headerButtons = () => names(within(actions()).getAllByRole('button')).sort();

describe('data contract details on the page kit', () => {
  let confirmSpy: MockInstance<(message?: string) => boolean>;
  beforeEach(() => {
    localStorage.removeItem('data-contract-view-mode');
    mockBackend();
    grant(FeatureAccessLevel.ADMIN);
    useUserStore.setState({ userInfo: { email: 'e2e.user@example.com', username: 'e2e', user: 'E2E', ip: '', groups: ['admins'] } as never });
    toast.mockClear();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    confirmSpy.mockRestore();
    localStorage.removeItem('data-contract-view-mode');
  });

  it('data contract details renders with the page kit', async () => {
    const { container } = renderPage();
    await loaded();

    // Full bleed, as the product page: its panes stacked at their own height
    expect(isFullBleed('/data-contracts/c-1')).toBe(true);
    expect(container.querySelector(`.${kit.page}`)).not.toHaveAttribute('data-full-bleed');
    // The shell owns the breadcrumb
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();

    // The kit header: the name (with its title), the status badge and the actions
    const h1 = screen.getByRole('heading', { level: 1, name: 'Orders contract' });
    expect(h1).toHaveClass(kit.title);
    expect(h1).toHaveAttribute('title', 'Orders contract');
    expect(header()).toHaveClass(kit.header);
    expect(header()).toHaveAttribute('data-wrap-actions');
    expect(within(header()).getByText('draft', { exact: true })).toBeInTheDocument();
    expect(within(header()).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    // The purpose, under the header
    const purpose = screen.getByText('Orders for reporting', { selector: 'p' });
    expect(header().contains(purpose)).toBe(false);

    // The top sections are kit panes in a stack, the details in a DetailsGrid
    const details = screen.getByRole('region', { name: 'Details' });
    expect(details).toHaveClass(kit.pane);
    expect(details.parentElement).toHaveClass(kit.stack);
    expect(within(details).getByText('Version').tagName).toBe('DT');
    expect(within(details).getByText('Linked Business Concepts').tagName).toBe('DT');
    const description = screen.getByRole('region', { name: 'Description' });
    expect(description).toHaveClass(kit.pane);
    expect(within(description).getByText('Purpose').tagName).toBe('DT');

    // No shadcn Card, padding or old grid in the header or the page's own panes;
    // the full Tailwind scan is data-contract-details.markup.test.tsx
    for (const own of [header(), details, description]) {
      expect(own.querySelector('.p-6, .bg-card, .rounded-lg.border, .grid, .min-w-\\[4rem\\], .mr-2.h-4.w-4')).toBeNull();
    }
    expect(h1.closest('.bg-card, .rounded-lg')).toBeNull();
  });

  it('data contract details keeps every control', async () => {
    renderPage();
    await loaded();

    // A draft (editable in place) for an admin
    expect(headerButtons()).toEqual([
      'Back to List', 'Comments', 'Create New Version', 'Delete', 'Edit Metadata', 'Export ODCS', 'Request...',
    ].sort());
    for (const name of ['Back to List', 'Comments', 'Create New Version', 'Delete', 'Edit Metadata', 'Export ODCS', 'Request...']) {
      expect(within(header()).getByRole('button', { name })).toBeEnabled();
    }
    // The view sizes, still named S, M and L, mark the current one (an admin starts on M)
    for (const name of ['S', 'M', 'L']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    await waitFor(() => expect(['S', 'M', 'L'].map((name) => screen.getByRole('button', { name }).getAttribute('aria-pressed')))
      .toEqual(['false', 'true', 'false']));
    // The maturity badge and its re-evaluate button
    expect(await screen.findByRole('button', { name: 'Not assessed Maturity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-evaluate maturity' })).toBeInTheDocument();
    // The description's icon-only edit has a name; linked concepts' Add is in the details
    expect(within(screen.getByRole('region', { name: 'Description' })).getByRole('button', { name: 'Edit description' })).toBeEnabled();
    expect(within(screen.getByRole('region', { name: 'Details' })).getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('data contract details keeps the review and lifecycle actions for an approver', async () => {
    const user = userEvent.setup();
    grant(FeatureAccessLevel.ADMIN, true);
    mockBackend({ ...CONTRACT, status: 'proposed' });
    renderPage();
    await loaded();
    expect(within(header()).getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(within(header()).getByRole('button', { name: 'Reject' })).toBeEnabled();
    cleanup();

    mockBackend({ ...CONTRACT, status: 'active' });
    renderPage();
    await loaded();
    expect(within(header()).getByRole('button', { name: 'Certify' })).toBeEnabled();
    expect(within(header()).getByRole('button', { name: 'Publish' })).toBeEnabled();
    // Certify opens its (kit) dialog, as before
    await user.click(within(header()).getByRole('button', { name: 'Certify' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('data contract details keeps the personal draft actions and its banner', async () => {
    mockBackend({ ...CONTRACT, draftOwnerId: 'e2e.user@example.com', parentContractId: 'c-0', version: '1.1.0-draft' });
    renderPage();
    await loaded();
    expect(within(header()).getByRole('button', { name: 'Commit Changes' })).toBeEnabled();
    expect(within(header()).getByRole('button', { name: 'Discard Draft' })).toBeEnabled();
    expect(within(header()).queryByRole('button', { name: 'Create New Version' })).toBeNull();
    const banner = screen.getByText('Personal Draft').closest('[role="alert"], .mantine-Alert-root') as HTMLElement;
    expect(banner).toHaveClass('mantine-Alert-root');
    // Based on the parent: a named button that opens it
    expect(within(banner).getByRole('button', { name: 'v1.1.0' })).toBeEnabled();
  });

  it('data contract details: the consumer sees no edit, delete or certify control', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    useUserStore.setState({ userInfo: { email: 'e2e.consumer@example.com', username: 'c', user: 'C', ip: '', groups: ['users'] } as never });
    mockBackend({ ...CONTRACT, status: 'active' });
    renderPage();
    await loaded();

    expect(headerButtons()).toEqual([
      'Back to List', 'Clone for Editing', 'Comments', 'Create New Version', 'Export ODCS', 'Request...',
    ].sort());
    for (const name of ['Edit Metadata', 'Delete', 'Certify', 'Publish', 'Approve', 'Reject']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(within(screen.getByRole('region', { name: 'Details' })).queryByRole('button', { name: 'Add' })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Description' })).queryByRole('button', { name: 'Edit description' })).toBeNull();
    // The read-only banner
    expect(screen.getByText('Read-Only').closest('.mantine-Alert-root')).not.toBeNull();
  });

  it('data contract details: a long name keeps its title and the description sits under the header', async () => {
    const name = 'N'.repeat(200);
    const purpose = 'word '.repeat(40).trim();
    mockBackend({ ...CONTRACT, name, description: { purpose } });
    renderPage();
    const h1 = await loaded(name);
    expect(h1).toHaveAttribute('title', name);
    const description = screen.getByText(purpose, { selector: 'p' });
    expect(header().contains(description)).toBe(false);
  });

  it('data contract details: the project and team are text with their ids, not links to missing routes', async () => {
    const user = userEvent.setup();
    mockBackend({ ...CONTRACT, project_id: 'pr-1', project_name: 'Revenue', owner_team_id: 't-1', owner_team_name: 'Sales Analytics' });
    renderPage();
    await loaded();
    const details = screen.getByRole('region', { name: 'Details' });
    const project = within(details).getByText('Revenue');
    const team = within(details).getByText('Sales Analytics');
    expect(project).toHaveAttribute('title', 'Project ID: pr-1');
    expect(team).toHaveAttribute('title', 'Team ID: t-1');
    for (const el of [project, team]) {
      expect(el.closest('a, button, [role="link"], [role="button"]')).toBeNull();
      await user.click(el);
    }
    expect(screen.getByRole('heading', { level: 1, name: 'Orders contract' })).toBeInTheDocument();
  });

  it('data contract details: a failed delete shows no success toast', async () => {
    const user = userEvent.setup();
    renderPage();
    await loaded();
    await user.click(within(header()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Deleted' }));
    expect(screen.queryByText('contract list')).toBeNull();
  });

  it('data contract details: a contract that fails to load shows its error and a way back', async () => {
    const user = userEvent.setup();
    mockBackend(CONTRACT, 500);
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load contract');
    await user.click(screen.getByRole('button', { name: 'Back to List' }));
    expect(await screen.findByText('contract list')).toBeInTheDocument();
  });

  it('data contract details: the shared panels sit flush in untitled panes', async () => {
    localStorage.setItem('data-contract-view-mode', 'large');
    renderPage();
    await loaded();

    // Each panel names its own section too, so the kit pane is the outer one
    for (const label of ['Owners', 'Metadata', 'Data Quality']) {
      await waitFor(() => expect(screen.getAllByRole('region', { name: label }).length).toBeGreaterThan(0));
      const panes = screen.getAllByRole('region', { name: label }).filter((r) => r.classList.contains(kit.pane));
      expect(panes).toHaveLength(1);
      expect(panes[0].querySelector('h2')).toBeNull();
      expect(panes[0].querySelector('[data-flush]')).not.toBeNull();
      expect(panes[0].parentElement).toHaveClass(kit.stack);
    }
    // The relationships panel in its kit pane mode
    expect(await screen.findByRole('region', { name: 'Related Entities' })).toHaveClass(kit.pane);
  });

  it('data contract details: a column\'s foreign keys open in a named popover', async () => {
    const user = userEvent.setup();
    mockBackend({ ...CONTRACT, schema: [{ name: 'orders', properties: [] }] }, 200, {
      '/api/data-contracts/c-1/schemas/orders/properties': {
        total: 1,
        items: [{ name: 'customer_id', logicalType: 'string', required: true, unique: false,
          relationships: [{ type: 'foreignKey', to: 'customers.id' }] }],
      },
    });
    renderPage();
    await loaded();
    const trigger = await screen.findByRole('button', { name: 'Foreign key relationship' });
    await user.click(trigger);
    // A Mantine Popover (its fade is measured in the browser, not here)
    expect(await screen.findByText('→ customers.id')).toBeInTheDocument();
    expect(screen.getByText('Relationships').closest('.mantine-Popover-dropdown')).not.toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('→ customers.id')).toBeNull());
    // Escape closes it and hands focus back to its trigger
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

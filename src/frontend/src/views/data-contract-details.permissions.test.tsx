/**
 * Wave 2 Task 11c (the owner's ruling of 2026-11-11): the Data Contract page
 * gates its actions on the user's permission as well as the contract's status.
 *
 * - In-place editing needs Read/Write on data-contracts and an editable status
 *   (draft, proposed); an admin edits in any status, as before.
 * - Approve and Reject need the contracts approval privilege.
 * - Profile with DQX (and reviewing its suggestions) needs Read/Write.
 * - Linking or creating a product writes a product: it needs Read/Write on
 *   data-products, as well as the active or approved status it had.
 * - The quality panel's Add, Edit and Delete need Read/Write on data-contracts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { useUserStore } from '@/stores/user-store';
import { useJobCapabilitiesStore } from '@/stores/job-capabilities-store';
import { FeatureAccessLevel } from '@/types/settings';
import DataContractDetails from './data-contract-details';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const STAMP = '2026-11-01T00:00:00Z';

// Every section filled in, so each one's Add, Edit and Delete can show
const CONTRACT = {
  id: 'c-1', name: 'Orders contract', version: '1.0.0', status: 'draft', apiVersion: 'v3.0.2', kind: 'DataContract',
  tags: [], description: { purpose: 'Orders for reporting' }, created: STAMP, updated: STAMP,
  schema: [{ name: 'orders', physicalName: 'main.sales.orders', properties: [] }],
  qualityRules: [{ name: 'Order id is never null', dimension: 'completeness', severity: 'error', type: 'library' }],
  team: [{ role: 'owner', name: 'Ada Lovelace' }],
  sla: { uptimeTarget: 99.9 },
  servers: [{ server: 'prod-warehouse', type: 'databricks', environment: 'prod' }],
  accessControl: { classification: 'internal' },
  customProperties: { retention: '30d' },
  support: { slack: 'https://slack.example.com/orders' },
};

const ANSWERS: Record<string, unknown> = {
  '/api/data-contracts/c-1/maturity': { achieved_level_order: null, achieved_level_name: null, total_levels: 0, gates_passed: 0, gates_total: 0, levels: [] },
  '/api/data-contracts/c-1/authoritative-definitions': [{ id: 'ad-1', type: 'businessDefinition', url: 'https://wiki.example.com/orders' }],
  '/api/data-contracts/c-1/schemas/orders/authoritative-definitions': [{ id: 'sad-1', type: 'tableDefinition', url: 'https://wiki.example.com/orders-table' }],
  '/api/data-contracts/c-1/schemas/orders/properties': { total: 1, items: [{ name: 'order_id', logicalType: 'string' }] },
  '/api/data-contracts/c-1/profile-runs': [{ id: 'run-1', status: 'completed', suggestion_counts: { pending: 2 } }],
  '/api/data-products/by-contract/c-1': [],
  '/api/entities/data_contract/c-1/quality-items/summary': { overall_score_percent: 80, items_count: 1, by_dimension: {}, measured_at: STAMP },
  '/api/entities/data_contract/c-1/quality-items': [{ id: 'q1', title: 'Nulls', dimension: 'completeness', source: 'manual', score_percent: 80, measured_at: STAMP }],
};

function mockBackend(contract: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { pathname } = new URL(String(input), 'http://localhost');
    if (pathname === '/api/data-contracts/c-1' && (init?.method ?? 'GET') === 'GET') return json({ ...CONTRACT, ...contract });
    if (pathname in ANSWERS) return json(ANSWERS[pathname]);
    return json([]);
  }));
}

type Persona = 'reader' | 'writer' | 'approver' | 'admin';

function signIn(persona: Persona) {
  const level = {
    reader: FeatureAccessLevel.READ_ONLY,
    writer: FeatureAccessLevel.READ_WRITE,
    approver: FeatureAccessLevel.READ_WRITE,
    admin: FeatureAccessLevel.ADMIN,
  }[persona];
  usePermissionsStore.setState({
    permissions: { 'data-contracts': level, 'data-products': level, 'semantic-models': level, 'data-domains': level },
    availableRoles: persona === 'approver'
      ? [{ id: 'r-1', name: 'Steward', assigned_groups: ['stewards'], feature_permissions: {}, approval_privileges: { CONTRACTS: true } } as never]
      : [],
    appliedRoleId: null, isLoading: false, _initAttempted: true, _isInitializing: false,
  });
  useUserStore.setState({
    userInfo: { email: `${persona}@example.com`, username: persona, user: persona, ip: '', groups: [persona === 'approver' ? 'stewards' : 'users'] } as never,
  });
}

async function open(persona: Persona, status: string, extra: Record<string, unknown> = {}) {
  signIn(persona);
  mockBackend({ status, ...extra });
  renderWithMantine(
    <Routes>
      <Route path="/data-contracts/:contractId" element={<DataContractDetails />} />
    </Routes>,
    { route: '/data-contracts/c-1' },
  );
  await screen.findByRole('heading', { level: 1, name: 'Orders contract' });
  // Everything the page loads after the contract
  await screen.findByText('Ada Lovelace');
  await within((await screen.findAllByRole('region', { name: 'Data Quality' }))[0]).findByText('Nulls');
  await screen.findByText('https://wiki.example.com/orders');
  await screen.findByText(/quality check suggestions available/);
}

const header = () => screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement;
const region = (name: RegExp | string) => screen.getAllByRole('region', { name })[0];
const button = (scope: HTMLElement, name: string | RegExp) => within(scope).queryAllByRole('button', { name });

// The in-place controls, each where it lives
function inPlaceControls(): Record<string, HTMLElement[]> {
  return {
    'Edit Metadata': button(header(), 'Edit Metadata'),
    Delete: button(header(), 'Delete'),
    'Edit description': button(region('Description'), 'Edit description'),
    'concept Add': button(region('Details'), 'Add'),
    'Infer from Catalog': button(region(/^Schemas/), 'Infer from Catalog'),
    'Infer from Asset': button(region(/^Schemas/), 'Infer from Asset'),
    'Add Schema': button(region(/^Schemas/), 'Add Schema'),
    'Edit orders': button(region(/^Schemas/), 'Edit orders'),
    'Delete orders': button(region(/^Schemas/), 'Delete orders'),
    'schema definition Add': button(region(/^Schemas/), 'Add'),
    'Add Rule': button(region(/^Quality Rules/), 'Add Rule'),
    'Edit rule': button(region(/^Quality Rules/), 'Edit Order id is never null'),
    'Delete rule': button(region(/^Quality Rules/), 'Delete Order id is never null'),
    'Edit SLA': button(region('SLA & Infrastructure'), 'Edit SLA'),
    'Add Server': button(region('SLA & Infrastructure'), 'Add Server'),
    'Edit server': button(region('SLA & Infrastructure'), 'Edit prod-warehouse'),
    'Add Property': button(region(/^Custom Properties/), 'Add Property'),
    'Edit property': button(region(/^Custom Properties/), 'Edit retention'),
    'Add Definition': button(region('Authoritative Definitions'), 'Add Definition'),
    'Edit definition': button(region('Authoritative Definitions'), 'Edit https://wiki.example.com/orders'),
  };
}

const present = (controls: Record<string, HTMLElement[]>) =>
  Object.entries(controls).filter(([, found]) => found.length > 0).map(([name]) => name);

// The writer-only controls that don't depend on the status
function writeControls(): Record<string, HTMLElement[]> {
  return {
    'Profile with DQX': button(region(/^Schemas/), 'Profile with DQX'),
    'Review Suggestions': button(region(/^Schemas/), 'Review Suggestions'),
    'Add measurement': button(region('Data Quality'), 'Add measurement'),
    'Edit measurement': button(region('Data Quality'), 'Edit'),
    'Delete measurement': button(region('Data Quality'), 'Delete'),
  };
}

const productControls = () => ({
  'Link to Existing Product': button(region(/^Linked Data Products/), 'Link to Existing Product'),
  'Create Data Product': button(region(/^Linked Data Products/), 'Create Data Product'),
});

const IN_PLACE = Object.keys({
  'Edit Metadata': 0, Delete: 0, 'Edit description': 0, 'concept Add': 0, 'Infer from Catalog': 0, 'Infer from Asset': 0,
  'Add Schema': 0, 'Edit orders': 0, 'Delete orders': 0, 'schema definition Add': 0, 'Add Rule': 0, 'Edit rule': 0,
  'Delete rule': 0, 'Edit SLA': 0, 'Add Server': 0, 'Edit server': 0, 'Add Property': 0, 'Edit property': 0,
  'Add Definition': 0, 'Edit definition': 0,
});
const WRITE = ['Profile with DQX', 'Review Suggestions', 'Add measurement', 'Edit measurement', 'Delete measurement'];

describe('data contract details permission gates', () => {
  beforeEach(() => {
    localStorage.setItem('data-contract-view-mode', 'large');
    useJobCapabilitiesStore.setState({ installed: {}, enablementRequestsAllowed: false, isLoaded: false, isLoading: false });
    toast.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.removeItem('data-contract-view-mode');
  });

  it.each(['draft', 'proposed'])('data contract permissions: a reader on a %s contract has none of the write controls', async (status) => {
    await open('reader', status);
    expect(present(inPlaceControls())).toEqual([]);
    expect(present(writeControls())).toEqual([]);
    expect(present(productControls())).toEqual([]);
    for (const name of ['Approve', 'Reject']) expect(button(header(), name)).toHaveLength(0);
    // The owners and relationships panels lose their assign and add too
    expect(within(region('Owners')).queryByRole('button', { name: 'Assign Owner' })).toBeNull();
    // As before for a draft: no read-only banner and no Clone for Editing (its status is editable)
    expect(screen.queryByText('Read-Only')).toBeNull();
    expect(button(header(), 'Clone for Editing')).toHaveLength(0);
    // What stays: reading and requesting
    for (const name of ['Back to List', 'Request...', 'Export ODCS', 'Create New Version']) {
      expect(within(header()).getByRole('button', { name })).toBeEnabled();
    }
  });

  it('data contract permissions: a writer on a draft has every write control', async () => {
    await open('writer', 'draft');
    expect(present(inPlaceControls())).toEqual(IN_PLACE);
    expect(present(writeControls())).toEqual(WRITE);
    // Linking and creating a product still wait for an active or approved status
    const products = productControls();
    expect(products['Link to Existing Product'][0]).toBeDisabled();
    expect(products['Create Data Product'][0]).toBeDisabled();
    expect(within(region('Owners')).getByRole('button', { name: 'Assign Owner' })).toBeInTheDocument();
    // A draft isn't up for approval
    for (const name of ['Approve', 'Reject']) expect(button(header(), name)).toHaveLength(0);
  });

  it('data contract permissions: the owner of a personal draft (a writer) edits it in place', async () => {
    await open('writer', 'draft', { draftOwnerId: 'writer@example.com', parentContractId: 'c-0' });
    expect(present(inPlaceControls())).toEqual(IN_PLACE);
    expect(within(header()).getByRole('button', { name: 'Commit Changes' })).toBeEnabled();
    expect(within(header()).getByRole('button', { name: 'Discard Draft' })).toBeEnabled();
  });

  it('data contract permissions: a writer on an active contract has no in-place control, as before', async () => {
    await open('writer', 'active');
    expect(present(inPlaceControls())).toEqual([]);
    expect(present(writeControls())).toEqual(WRITE);
    const products = productControls();
    expect(products['Link to Existing Product'][0]).toBeEnabled();
    expect(products['Create Data Product'][0]).toBeEnabled();
    expect(within(header()).getByRole('button', { name: 'Clone for Editing' })).toBeEnabled();
    expect(within(header()).getByRole('button', { name: 'Publish' })).toBeEnabled();
    expect(screen.getByText('Read-Only')).toBeInTheDocument();
  });

  it('data contract permissions: a reader on an active contract keeps Clone for Editing and the banner, as before', async () => {
    await open('reader', 'active');
    expect(present(inPlaceControls())).toEqual([]);
    expect(present(writeControls())).toEqual([]);
    expect(present(productControls())).toEqual([]);
    expect(within(header()).getByRole('button', { name: 'Clone for Editing' })).toBeEnabled();
    expect(screen.getByText('Read-Only')).toBeInTheDocument();
  });

  it.each(['draft', 'active'])('data contract permissions: an admin on a %s contract has every control, as before', async (status) => {
    await open('admin', status);
    expect(present(inPlaceControls())).toEqual(IN_PLACE);
    expect(present(writeControls())).toEqual(WRITE);
    const products = productControls();
    expect(products['Link to Existing Product']).toHaveLength(1);
    expect(products['Create Data Product'].length).toBeGreaterThan(0);
  });

  it.each(['proposed', 'under_review'])('data contract permissions: Approve and Reject on a %s contract need the approval privilege', async (status) => {
    await open('writer', status);
    for (const name of ['Approve', 'Reject']) expect(button(header(), name)).toHaveLength(0);
    cleanup();

    await open('approver', status);
    await waitFor(() => expect(within(header()).getByRole('button', { name: 'Approve' })).toBeEnabled());
    expect(within(header()).getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('data contract permissions: an admin without the approval privilege gets no Approve or Reject', async () => {
    await open('admin', 'proposed');
    for (const name of ['Approve', 'Reject']) expect(button(header(), name)).toHaveLength(0);
    // ...but still edits in place, as admins do
    expect(present(inPlaceControls())).toEqual(IN_PLACE);
  });
});

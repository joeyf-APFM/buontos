/**
 * Wave 2 Tasks 9 and 10: no Tailwind class in the Data Contract page's own
 * markup: the header, the banners, the version and view controls, every
 * section pane from Details to Authoritative Definitions (with the schema
 * columns' cells), and the panes around the shared panels. The components the
 * page consumes as they are (later waves, or already restyled) are stubbed;
 * DataTable's stub renders the page's own cells. Every section is shown: a
 * personal draft with every detail filled, in the large view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { useUserStore } from '@/stores/user-store';
import { FeatureAccessLevel } from '@/types/settings';
import DataContractDetails from './data-contract-details';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

// The consumed components, as stubs that mark their subtree
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => () => <div data-consumed={name} />,
}));
vi.mock('@/components/comments', () => ({ CommentSidebar: stub('CommentSidebar') }));
vi.mock('@/components/semantic/linked-concept-chips', () => ({ default: stub('LinkedConceptChips') }));
vi.mock('@/components/ui/tag-chip', () => ({ default: stub('TagChip') }));
vi.mock('@/components/common/certification-badge', () => ({ default: stub('CertificationBadge') }));
vi.mock('@/components/common/entity-tree-panel', () => ({ EntityTreePanel: stub('EntityTreePanel') }));
vi.mock('@/components/common/ownership-panel', () => ({ OwnershipPanel: stub('OwnershipPanel') }));
vi.mock('@/components/metadata/entity-metadata-panel', () => ({ default: stub('EntityMetadataPanel') }));
vi.mock('@/components/quality/entity-quality-panel', () => ({ default: stub('EntityQualityPanel') }));
vi.mock('@/components/common/version-selector', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: stub('VersionSelector'),
}));
// DataTable is consumed as it is: its stub draws only the page's own cells
vi.mock('@/components/ui/data-table', () => ({
  DataTable: ({ columns, data }: { columns: Array<{ cell?: (ctx: unknown) => unknown }>; data: Array<Record<string, unknown>> }) => (
    <table>
      <tbody>
        {data.map((row, r) => (
          <tr key={r}>
            {columns.map((column, c) => (
              <td key={c}>
                {column.cell?.({ row: { original: row, getValue: (key: string) => row[key] } }) as never}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));
// The loading skeleton is list-view-skeleton's, consumed as it is
vi.mock('@/components/common/list-view-skeleton', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  DetailViewSkeleton: stub('DetailViewSkeleton'),
}));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const CONTRACT = {
  id: 'c-1', name: 'Orders contract', version: '1.1.0-draft', status: 'draft', apiVersion: 'v3.0.2', kind: 'DataContract',
  draftOwnerId: 'e2e.user@example.com', parentContractId: 'c-0',
  domainId: 'd-1', domain: 'Sales', tenant: 'acme', project_id: 'pr-1', project_name: 'Revenue',
  owner_team_id: 't-1', owner_team_name: 'Sales Analytics', dataProductId: 'p-1', dataProductName: 'Sales orders',
  certification_level: 1, publication_scope: 'organization', tags: ['sales'],
  description: { purpose: 'Orders for reporting', limitations: 'Daily only', usage: 'Dashboards' },
  // Every section from Schemas on, filled in: two schemas (tabs), with ids, keys and concepts
  schema: [
    { name: 'orders', physicalName: 'main.sales.orders', stableId: 'sch-1', relationships: [{ type: 'foreignKey', to: 'customers' }], properties: [] },
    { name: 'customers', properties: [] },
  ],
  qualityRules: [{ name: 'Order id is never null', dimension: 'completeness', severity: 'error', type: 'library' }],
  team: [{ role: 'owner', name: 'Ada Lovelace' }],
  sla: { uptimeTarget: 99.9, maxDowntimeMinutes: 30, queryResponseTimeMs: 200, dataFreshnessMinutes: 60 },
  servers: [{ server: 'prod-warehouse', type: 'databricks', environment: 'prod', host: 'dbc.example.com' }],
  accessControl: { classification: 'internal', containsPii: true },
  customProperties: { retention: '30d', owners: '["a","b"]' },
  support: { slack: 'https://slack.example.com/orders', email: '' },
  created: '2026-10-01T09:00:00Z', updated: '2026-11-02T15:30:00Z',
};

function mockBackend(contract: unknown = CONTRACT) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const { pathname } = new URL(String(input), 'http://localhost');
    switch (pathname) {
      case '/api/data-contracts/c-1': return json(contract);
      case '/api/data-contracts/c-1/maturity':
        return json({ achieved_level_order: 1, achieved_level_name: 'Bronze', total_levels: 2, gates_passed: 1, gates_total: 2, evaluated_at: '2026-11-01T09:00:00Z',
          levels: [{ level_order: 1, level_name: 'Bronze', achieved: true, gates: [{ passed: true, required: true }] },
            { level_order: 2, level_name: 'Silver', achieved: false, gates: [{ passed: false, required: true }] }] });
      case '/api/data-contracts/c-1/versions':
        return json([{ id: 'c-2', version: '2.0.0' }, { id: 'c-1', version: '1.1.0-draft' }]);
      case '/api/data-contracts/c-1/team-metadata':
        return json({ name: 'Sales Analytics', description: 'Owns the orders data' });
      case '/api/data-contracts/c-1/authoritative-definitions':
        return json([{ id: 'ad-1', type: 'businessDefinition', url: 'https://wiki.example.com/orders' }]);
      case '/api/data-contracts/c-1/schemas/orders/authoritative-definitions':
        return json([{ id: 'sad-1', type: 'tableDefinition', url: 'https://wiki.example.com/orders-table' }]);
      case '/api/data-contracts/c-1/schemas/orders/properties':
        return json({ total: 1, items: [{ name: 'order_id', logicalType: 'string', required: true, unique: true, stableId: 'col-1',
          description: 'The order', relationships: [{ type: 'foreignKey', to: 'customers.id' }] }] });
      case '/api/semantic-links/entity/data_contract_schema/c-1%23orders':
        return json([{ id: 'l-1', iri: 'https://example.com/onto#Order', label: 'Order' }]);
      case '/api/semantic-links/entity-prefix/data_contract_property/c-1%23orders%23':
        return json([{ id: 'l-2', entity_id: 'c-1#orders#order_id', iri: 'https://example.com/onto#OrderId', label: 'Order id' }]);
      case '/api/data-products/by-contract/c-1':
        return json([{ id: 'p-1', name: 'Sales orders', version: '1.0.0', status: 'active', description: { purpose: 'Orders' },
          outputPorts: [{ name: 'orders', version: '1.0.0', contractId: 'c-1' }] }]);
      default: return json([]);
    }
  }));
}

/** Class names that aren't a CSS module's, Mantine's or an icon's. */
function foreignClasses(root: HTMLElement): string[] {
  const own = /^(_[\w-]+_[0-9a-z]+|mantine-[\w-]+|m_[0-9a-f]+|lucide(-[\w-]+)?)$/;
  const found = new Set<string>();
  const walk = (el: Element) => {
    if (el.hasAttribute('data-consumed')) return;
    // ui/button and ui/badge render Mantine with their own utility classes (allowed until wave 6)
    const allowedRoot = el.classList.contains('mantine-Button-root') || el.classList.contains('mantine-Badge-root');
    if (!allowedRoot) {
      for (const name of Array.from(el.classList)) if (!own.test(name)) found.add(name);
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
  return [...found].sort();
}

describe('data contract details markup', () => {
  beforeEach(() => {
    localStorage.setItem('data-contract-view-mode', 'large');
    usePermissionsStore.setState({
      // Related Entities' Add and Remove follow entity_relationships
      permissions: {
        'data-contracts': FeatureAccessLevel.ADMIN, 'semantic-models': FeatureAccessLevel.ADMIN,
        entity_relationships: FeatureAccessLevel.ADMIN,
      },
      availableRoles: [], appliedRoleId: null, isLoading: false, _initAttempted: true, _isInitializing: false,
    });
    useUserStore.setState({ userInfo: { email: 'e2e.user@example.com', username: 'e2e', user: 'E2E', ip: '', groups: ['admins'] } as never });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.removeItem('data-contract-view-mode');
  });

  const render = () => renderWithMantine(
    <Routes>
      <Route path="/data-contracts/:contractId" element={<DataContractDetails />} />
    </Routes>,
    { route: '/data-contracts/c-1' },
  );

  it('the page\'s frame and every section carry no Tailwind class', async () => {
    mockBackend();
    const { container } = render();
    await screen.findByRole('heading', { level: 1, name: 'Orders contract' });
    // The banner, the maturity, the versions, and every top section
    await screen.findByRole('button', { name: 'Bronze Maturity' });
    await screen.findByRole('button', { name: /Newer version/i });
    expect(screen.getByText('Personal Draft')).toBeInTheDocument();
    for (const name of ['Details', 'Description']) expect(screen.getByRole('region', { name })).toBeInTheDocument();
    for (const name of ['Owners', 'Metadata', 'Data Quality']) expect(screen.getByRole('region', { name })).toBeInTheDocument();
    // Every section, with its rows, the schema's columns, ids, keys and concepts
    for (const name of [/^Schemas/, /^Linked Data Products/, /^Quality Rules/, 'ODCS Team Metadata', 'SLA & Infrastructure',
      'Access Control', /^Custom Properties/, 'Support', 'Authoritative Definitions']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    await screen.findByText('order_id');
    await screen.findByText('Order id');
    await screen.findByText('Order');
    await screen.findByText('Sales orders', { selector: 'a[href="/data-products/p-1"]:not([title])' });
    await screen.findByText('https://wiki.example.com/orders-table');
    await screen.findByText('https://wiki.example.com/orders');
    expect(screen.getByText('Owns the orders data')).toBeInTheDocument();
    expect(screen.getByText('sch-1')).toBeInTheDocument();
    expect(screen.getByText('col-1')).toBeInTheDocument();

    expect(foreignClasses(container)).toEqual([]);
  });

  it('the read-only banner and the loading state carry no Tailwind class', async () => {
    mockBackend({ ...CONTRACT, status: 'active', draftOwnerId: null });
    usePermissionsStore.setState({ permissions: { 'data-contracts': FeatureAccessLevel.READ_ONLY } });
    const { container } = render();
    // Loading: the skeleton, in the page's own state wrapper
    expect(foreignClasses(container)).toEqual([]);
    await screen.findByRole('heading', { level: 1, name: 'Orders contract' });
    expect(screen.getByText('Read-Only')).toBeInTheDocument();
    expect(foreignClasses(container)).toEqual([]);
  });
});

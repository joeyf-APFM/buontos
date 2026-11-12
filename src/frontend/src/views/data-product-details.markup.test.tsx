/**
 * Wave 2 Task 7: no Tailwind class anywhere in the Data Product page's own
 * markup, nor in the components it owns (AccessGrantsPanel, VersionNavigator,
 * MaturityInline). The components it consumes as they are (later waves, or
 * already restyled elsewhere) are stubbed, so only the page's own classes
 * are scanned. Every section is shown: the large view, with every list
 * filled, a personal draft's banner and an access grant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { useUserStore } from '@/stores/user-store';
import { FeatureAccessLevel } from '@/types/settings';
import DataProductDetails from './data-product-details';

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
vi.mock('@/components/lineage', () => ({ BusinessLineageView: stub('BusinessLineageView') }));
vi.mock('@/components/common/lineage-editor', () => ({ LineageEditor: stub('LineageEditor') }));
vi.mock('@/components/common/asset-selector', () => ({ AssetSelector: stub('AssetSelector') }));
vi.mock('@/components/costs/entity-costs-panel', () => ({ default: stub('EntityCostsPanel') }));
vi.mock('@/components/common/ownership-panel', () => ({ OwnershipPanel: stub('OwnershipPanel') }));
vi.mock('@/components/metadata/entity-metadata-panel', () => ({ default: stub('EntityMetadataPanel') }));
vi.mock('@/components/ratings', () => ({ RatingPanel: stub('RatingPanel') }));
vi.mock('@/components/quality/entity-quality-panel', () => ({ default: stub('EntityQualityPanel') }));
vi.mock('@/components/common/version-selector', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: stub('VersionSelector'),
}));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const PRODUCT = {
  apiVersion: 'v1.0.0', kind: 'DataProduct', id: 'p-1', name: 'Sales orders', status: 'draft', version: '1.0.0',
  draftOwnerId: 'e2e.user@example.com', domain: 'sales', tenant: 'acme', project_id: 'pr-1', project_name: 'Revenue',
  owner_team_id: 't-1', owner_team_name: 'Sales Analytics', publication_scope: 'organization',
  certification_level: 1, tags: ['sales'],
  description: { purpose: 'Orders for reporting', limitations: 'Daily only', usage: 'Dashboards' },
  outputPorts: [{ id: 'out-1', name: 'orders_gold', version: '1.0.0', description: 'Gold', contractId: 'c-1', contractName: 'Orders',
    deliveryMethodName: 'Table', status: 'active', containsPii: true }, { id: 'out-2', name: 'orders_silver', version: '1.0.0' }],
  inputPorts: [{ name: 'orders_raw', version: '1.0.0', contractId: 'c-2', contractName: 'Raw' }, { name: 'orders_old', version: '1.0.0', contractId: 'c-3' }],
  managementPorts: [{ name: 'Ops', content: 'discoverability', url: 'https://example.com/ops' }],
  support: [{ channel: 'Slack', url: 'https://example.com/slack', tool: 'slack' }],
  team: { name: 'Sales', members: [{ username: 'rita@example.com', name: 'Rita', role: 'owner' }] },
  authoritativeDefinitions: [{ type: 'businessDefinition', url: 'https://example.com/def', description: 'The definition' }],
  customProperties: [{ property: 'tier', value: 'gold' }, { property: 'empty', value: 'null' }],
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-11-02T15:30:00Z',
};

function mockBackend() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const { pathname } = new URL(String(input), 'http://localhost');
    switch (pathname) {
      case '/api/data-products/p-1': return json(PRODUCT);
      case '/api/data-products/p-1/subscription': return json({ subscribed: false });
      case '/api/data-products/p-1/subscribers':
        return json({ subscriber_count: 1, subscribers: [{ email: 'sam@example.com', reason: 'Reports', subscribed_at: '2026-11-01T09:00:00Z' }] });
      case '/api/data-products/p-1/quality-summary': return json({ overall_score_percent: 72, items_count: 3, by_dimension: {}, by_source: {} });
      case '/api/data-products/p-1/maturity':
        return json({ achieved_level_order: 1, achieved_level_name: 'Bronze', total_levels: 2, gates_passed: 1, gates_total: 2, evaluated_at: '2026-11-01T09:00:00Z',
          levels: [{ level_order: 1, level_name: 'Bronze', achieved: true, gates: [{ passed: true, required: true }] },
            { level_order: 2, level_name: 'Silver', achieved: false, gates: [{ passed: false, required: true }] }] });
      case '/api/data-products/p-1/versions':
        return json([{ id: 'p-2', version: '2.0.0' }, { id: 'p-1', version: '1.0.0' }]);
      case '/api/business-owners/by-object/data_product/p-1':
        return json([{ user_name: 'Rita Owner', user_email: 'rita@example.com', role_name: 'Owner', is_active: true }]);
      case '/api/entities/OutputPort/out-1/relationships':
        return json({ outgoing: [{ id: 'rel-1', source_id: 'out-1', target_type: 'Table', target_id: 'a-1', target_name: 'orders' }], incoming: [] });
      case '/api/access-grants/entity/data_product/p-1':
        return json({ total: 1, grants: [{ id: 'g-1', grantee_email: 'sam@example.com', permission_level: 'READ', granted_at: '2026-11-01T09:00:00Z',
          expires_at: '2026-11-12T09:00:00Z', granted_by: 'rita@example.com', status: 'active', days_until_expiry: 3, is_active: true }] });
      case '/api/access-grants/entity/data_product/p-1/summary':
        return json({ active_grants_count: 1, pending_requests_count: 1, expiring_soon_count: 1, total_grants_count: 1 });
      case '/api/access-grants/entity/data_product/p-1/requests':
        return json({ total: 1, requests: [{ id: 'r-1', requester_email: 'lee@example.com', permission_level: 'READ', requested_duration_days: 30,
          status: 'pending', created_at: '2026-11-01T09:00:00Z' }] });
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

describe('data product details markup', () => {
  beforeEach(() => {
    localStorage.setItem('data-product-view-mode', 'large');
    mockBackend();
    usePermissionsStore.setState({
      // The grants and relationships panels' controls follow their own features
      permissions: {
        'data-products': FeatureAccessLevel.ADMIN, 'semantic-models': FeatureAccessLevel.ADMIN,
        'access-grants': FeatureAccessLevel.ADMIN, entity_relationships: FeatureAccessLevel.ADMIN,
      },
      availableRoles: [], appliedRoleId: null, isLoading: false, _initAttempted: true, _isInitializing: false,
    });
    useUserStore.setState({ userInfo: { email: 'e2e.user@example.com', username: 'e2e', user: 'E2E', ip: '', groups: ['admins'] } as never });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.removeItem('data-product-view-mode');
  });

  it('the page and its own components carry no Tailwind class', async () => {
    const { container } = renderWithMantine(
      <Routes>
        <Route path="/data-products/:productId" element={<DataProductDetails />} />
      </Routes>,
      { route: '/data-products/p-1' },
    );
    await screen.findByRole('heading', { level: 1, name: 'Sales orders' });
    // Every section, the linked asset, the subscriber, the grant and the request, the maturity and the versions
    await screen.findByText('orders');
    await screen.findByText('lee@example.com');
    await screen.findByText('sam@example.com', { selector: 'td' });
    await screen.findByRole('button', { name: 'Bronze Maturity' });
    await screen.findByRole('button', { name: /Newer version/i });
    await waitFor(() => expect(screen.getByText('Rita Owner')).toBeInTheDocument());
    for (const name of [/Deliverables/, /Consumables/, /Management Ports/, /Team Metadata/, /Support Channels/,
      /Authoritative Definitions/, /Custom Properties/, /Subscribers/, /Access Grants/, 'Contacts', 'Details', 'Description']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }

    expect(foreignClasses(container)).toEqual([]);
  });
});

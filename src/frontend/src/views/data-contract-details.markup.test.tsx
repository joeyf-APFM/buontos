/**
 * Wave 2 Task 9: no Tailwind class in the Data Contract page's own markup
 * (its frame and top sections: the header, the banners, the version and view
 * controls, the Details and Description panes and the panes around the shared
 * panels). The sections from Schemas on are Task 10's: their container is
 * scanned, their insides are not. The components the page consumes as they
 * are (later waves, or already restyled) are stubbed. Every top section is
 * shown: a personal draft with every detail filled, in the large view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { useUserStore } from '@/stores/user-store';
import { FeatureAccessLevel } from '@/types/settings';
import classes from './data-contract-details.module.css';
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
  certification_level: 1, publication_scope: 'organization', tags: ['sales'], schema: [], customProperties: {},
  description: { purpose: 'Orders for reporting', limitations: 'Daily only', usage: 'Dashboards' },
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
      default: return json([]);
    }
  }));
}

/** Class names that aren't a CSS module's, Mantine's or an icon's, outside Task 10's sections. */
function foreignClasses(root: HTMLElement): string[] {
  const own = /^(_[\w-]+_[0-9a-z]+|mantine-[\w-]+|m_[0-9a-f]+|lucide(-[\w-]+)?)$/;
  const found = new Set<string>();
  const walk = (el: Element, scanChildren = true) => {
    if (el.hasAttribute('data-consumed')) return;
    // ui/button and ui/badge render Mantine with their own utility classes (allowed until wave 6)
    const allowedRoot = el.classList.contains('mantine-Button-root') || el.classList.contains('mantine-Badge-root');
    if (!allowedRoot) {
      for (const name of Array.from(el.classList)) if (!own.test(name)) found.add(name);
    }
    // Task 10's cards: the container is the page's, the cards are not (yet)
    if (!scanChildren || el.classList.contains(classes.sections)) return;
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
  return [...found].sort();
}

describe('data contract details markup', () => {
  beforeEach(() => {
    localStorage.setItem('data-contract-view-mode', 'large');
    usePermissionsStore.setState({
      permissions: { 'data-contracts': FeatureAccessLevel.ADMIN, 'semantic-models': FeatureAccessLevel.ADMIN },
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

  it('the page\'s frame and top sections carry no Tailwind class', async () => {
    mockBackend();
    const { container } = render();
    await screen.findByRole('heading', { level: 1, name: 'Orders contract' });
    // The banner, the maturity, the versions, and every top section
    await screen.findByRole('button', { name: 'Bronze Maturity' });
    await screen.findByRole('button', { name: /Newer version/i });
    expect(screen.getByText('Personal Draft')).toBeInTheDocument();
    for (const name of ['Details', 'Description']) expect(screen.getByRole('region', { name })).toBeInTheDocument();
    for (const name of ['Owners', 'Metadata', 'Data Quality']) expect(screen.getByRole('region', { name })).toBeInTheDocument();
    expect(container.querySelector(`.${classes.sections}`)).not.toBeNull();

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

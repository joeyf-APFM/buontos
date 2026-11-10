/**
 * Task 11: the asset detail page on the page kit (mantine/page). Pixel values
 * that depend on the cascade (the stack of panes, the header's spacing) are
 * measured in a real browser in tests/e2e/asset-detail.spec.ts (ruling R10);
 * these tests check the structure, the controls and the keyboard paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import kit from '@/mantine/page/page.module.css';
import panel from '@/components/common/panel.module.css';
import AssetDetailView from './asset-detail';

// The edit and lineage dialogs are shared forms with their own tests; here
// only whether the page opens them matters
vi.mock('@/components/common/asset-form-dialog', () => ({
  AssetFormDialog: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog" aria-label="Edit asset" /> : null),
}));
vi.mock('@/components/common/lineage-editor', () => ({
  LineageEditor: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog" aria-label="Lineage editor" /> : null),
}));

const ASSET = {
  id: 'a1',
  name: 'orders',
  description: 'One row per customer order',
  asset_type_id: 't-table',
  asset_type_name: 'Table',
  platform: 'databricks',
  location: 'main.sales.orders',
  domains: [],
  properties: null,
  tags: ['sales'],
  status: 'active',
  created_by: 'e2e.user@example.com',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-11-02T00:00:00Z',
};

// One downstream entity of a business term, for the impact panel's chips
const IMPACT = {
  center_entity_type: 'BusinessTerm',
  center_entity_id: 'a1',
  nodes: [
    { id: 'BusinessTerm:a1', entity_type: 'BusinessTerm', entity_id: 'a1', name: 'orders', is_center: true },
    { id: 'DataProduct:p1', entity_type: 'DataProduct', entity_id: 'p1', name: 'Sales product', is_center: false },
  ],
  edges: [{ source: 'BusinessTerm:a1', target: 'DataProduct:p1', relationship_type: 'uses' }],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockBackend(asset: Record<string, unknown> = ASSET) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === `/api/assets/${asset.id}`) return json(asset);
    if (url.pathname.endsWith('/metric-view')) return json({ detail: { code: 'metric_view_not_found' } }, 404);
    if (url.pathname.startsWith('/api/entities/') && url.pathname.endsWith('/relationships')) {
      return json({ outgoing: [], incoming: [], total: 0 });
    }
    if (url.pathname.includes('/ratings')) return json({ average_rating: 0, total_ratings: 0, distribution: {} });
    if (url.pathname.endsWith('/impact')) return json(IMPACT);
    if (url.pathname.startsWith('/api/business-lineage/')) return json({ nodes: [], edges: [] });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function setPermissions(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { assets: level, 'semantic-models': level, comments: level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

function Where() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname + location.search}</output>;
}

const renderPage = (id = ASSET.id) =>
  renderWithMantine(
    <>
      <Routes>
        <Route path="/assets/:assetId" element={<AssetDetailView />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    { route: `/assets/${id}` },
  );

const findHeading = () => screen.findByRole('heading', { level: 1, name: 'orders' });

describe('asset detail on the page kit', () => {
  beforeEach(() => {
    setPermissions(FeatureAccessLevel.ADMIN);
    mockBackend();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asset detail renders with the page kit', async () => {
    const { container } = renderPage();
    const heading = await findHeading();

    // A full-bleed route: the page draws its own breadcrumb and padding
    expect(isFullBleed('/assets/a1')).toBe(true);
    expect(isFullBleed('/assets')).toBe(true);

    // The kit's one-line header, with the status beside the title
    const header = heading.parentElement!;
    expect(header).toHaveClass(kit.header);
    expect(within(header).getByText('active')).toBeInTheDocument();
    expect(within(header).getByText('Table')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Edit' })).toBeInTheDocument();

    // The breadcrumb, in the kit's slot, above the header
    const crumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(crumb.closest(`.${kit.crumb}`)).not.toBeNull();
    expect(within(crumb).getByRole('link', { name: 'Asset Explorer' })).toHaveAttribute('href', '/assets');

    // The page's parts are panes: kit panes, or the shared panels' panes (Task 8)
    const details = screen.getByRole('region', { name: 'Details' });
    expect(details).toHaveClass(kit.pane);
    for (const name of ['Relationships', 'Ratings & Reviews', 'Cost Management', 'Data Quality']) {
      expect(await screen.findByRole('region', { name })).toHaveClass(kit.pane);
    }
    expect(await screen.findByRole('region', { name: 'Owners' })).toHaveClass(panel.pane);
    expect(await screen.findByRole('region', { name: 'Metadata' })).toHaveClass(panel.pane);
    // Stacked, not stretched: every pane sits in the kit's pane stack
    expect(details.parentElement).toHaveClass(kit.stack);

    // The details grid matches the explorer's details panel
    const terms = within(details).getAllByRole('term').map((t) => t.textContent);
    expect(terms).toEqual(['Location', 'Platform', 'Created By', 'Created', 'Updated', 'Tags']);
    expect(within(details).getAllByRole('term')[0].parentElement).toHaveClass(panel.kv);
    expect(within(details).getByText('main.sales.orders')).toBeInTheDocument();
    expect(within(details).getByText('sales')).toBeInTheDocument();
    expect(within(details).getByText('Linked Business Concepts')).toBeInTheDocument();

    // No legacy page padding and no shadcn Card (Mantine Paper) in the page tree
    await waitFor(() => expect(screen.getByRole('region', { name: 'Data Quality' })).toBeInTheDocument());
    expect(container.querySelector('.p-6, .py-6')).toBeNull();
    expect(container.querySelector('.mantine-Paper-root')).toBeNull();
  });

  it('asset detail keeps every control', async () => {
    const user = userEvent.setup();
    renderPage();
    const header = (await findHeading()).parentElement!;

    for (const name of ['Back', 'Comments', 'View in Hierarchy', 'Manage Lineage', 'Edit', 'Delete']) {
      expect(within(header).getByRole('button', { name })).toBeEnabled();
    }
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Overview', 'Relationships', 'Lineage']);
    // Add a concept (Details) and add a relationship (Relationships)
    const details = screen.getByRole('region', { name: 'Details' });
    expect(within(details).getByRole('button', { name: 'Add' })).toBeEnabled();
    const relationships = await screen.findByRole('region', { name: 'Relationships' });
    expect(await within(relationships).findByRole('button', { name: 'Add' })).toBeEnabled();
    expect(await screen.findByRole('button', { name: 'Assign Owner' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Add expense' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Add measurement' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Rate \d out of 5 stars/ })).toHaveLength(5);

    // The actions still open their dialogs and routes
    await user.click(within(header).getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit asset' })).toBeInTheDocument();
    await user.click(within(header).getByRole('button', { name: 'Manage Lineage' }));
    expect(screen.getByRole('dialog', { name: 'Lineage editor' })).toBeInTheDocument();
    await user.click(within(header).getByRole('button', { name: 'View in Hierarchy' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/hierarchy?type=Table&id=a1');
  });

  it('asset detail opens the delete dialog for an admin', async () => {
    const user = userEvent.setup();
    renderPage();
    const header = (await findHeading()).parentElement!;
    await user.click(within(header).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('asset detail keeps the read-only gates for a consumer', async () => {
    setPermissions(FeatureAccessLevel.READ_ONLY);
    renderPage();
    const header = (await findHeading()).parentElement!;

    expect(within(header).queryByRole('button', { name: 'Manage Lineage' })).toBeNull();
    expect(within(header).getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(within(header).getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(within(header).getByRole('button', { name: 'Comments' })).toBeEnabled();
    const details = screen.getByRole('region', { name: 'Details' });
    // No concept links and no write access: no concepts section at all
    expect(within(details).queryByText('Linked Business Concepts')).toBeNull();
    const relationships = await screen.findByRole('region', { name: 'Relationships' });
    await waitFor(() => expect(within(relationships).getByText('No relationships found')).toBeInTheDocument());
    expect(within(relationships).queryByRole('button', { name: 'Add' })).toBeNull();
  });

  it('asset detail tabs switch with arrow keys', async () => {
    const user = userEvent.setup();
    renderPage();
    await findHeading();

    const overview = screen.getByRole('tab', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-selected', 'true');
    expect(overview).toHaveClass(kit.tab);
    await user.click(overview);
    await user.keyboard('{ArrowRight}');
    const relationships = screen.getByRole('tab', { name: 'Relationships' });
    expect(relationships).toHaveFocus();
    expect(relationships).toHaveAttribute('aria-selected', 'true');
    // The relationships view toggles, now named and pressed
    const panelEl = screen.getByRole('tabpanel');
    const table = within(panelEl).getByRole('button', { name: 'Table view' });
    const graph = within(panelEl).getByRole('button', { name: 'Graph view' });
    expect(table).toHaveAttribute('aria-pressed', 'true');
    expect(graph).toHaveAttribute('aria-pressed', 'false');
    expect(await within(panelEl).findByRole('region', { name: 'All Entity Relationships' })).toHaveClass(kit.pane);

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Lineage' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toContainElement(screen.getByRole('region', { name: 'Lineage' }));
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(overview).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Details' })).toBeInTheDocument();
  });

  it('asset detail shows the business term panes and the impact tab', async () => {
    mockBackend({
      ...ASSET,
      asset_type_name: 'Business Term',
      properties: { definition: 'A placed order', synonyms: 'purchase, sale' },
    });
    const user = userEvent.setup();
    renderPage();
    await findHeading();

    const definition = screen.getByRole('region', { name: 'Business Definition' });
    expect(definition).toHaveClass(kit.pane);
    expect(within(definition).getByText('A placed order')).toBeInTheDocument();
    expect(within(definition).getByText('purchase')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Impact Analysis' }));
    // The impact panel's panes: the summary, then the downstream graph
    expect(await screen.findByRole('region', { name: 'Impact Summary' })).toHaveClass(kit.pane);
    expect(screen.getByRole('region', { name: 'Impact graph' })).toHaveClass(kit.pane);
  });

  it('asset detail impact chips are buttons that open the affected entity', async () => {
    mockBackend({ ...ASSET, asset_type_name: 'Business Term', properties: { definition: 'A placed order' } });
    const user = userEvent.setup();
    renderPage();
    await findHeading();
    await user.click(screen.getByRole('tab', { name: 'Impact Analysis' }));
    const summary = await screen.findByRole('region', { name: 'Impact Summary' });

    // A button now (it was a mouse-only badge), with the same click: the entity's page
    const chip = await within(summary).findByRole('button', { name: 'Sales product' });
    expect(chip.tagName).toBe('BUTTON');
    expect(chip).toHaveAttribute('type', 'button');
    await user.click(chip);
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/data-products/p1');
  });

  it('asset detail impact chips open from the keyboard', async () => {
    mockBackend({ ...ASSET, asset_type_name: 'Business Term', properties: { definition: 'A placed order' } });
    const user = userEvent.setup();
    renderPage();
    await findHeading();
    await user.click(screen.getByRole('tab', { name: 'Impact Analysis' }));
    const summary = await screen.findByRole('region', { name: 'Impact Summary' });
    within(summary).getByText('1 affected entity');
    (await within(summary).findByRole('button', { name: 'Sales product' })).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('/data-products/p1');
  });

  it('asset detail lists properties in the details grid', async () => {
    mockBackend({ ...ASSET, properties: { row_count: 12, is_pii: true } });
    renderPage();
    await findHeading();
    const properties = screen.getByRole('region', { name: 'Properties' });
    expect(properties).toHaveClass(kit.pane);
    expect(within(properties).getAllByRole('term').map((t) => t.textContent)).toEqual(['Row Count', 'Is Pii']);
    expect(within(properties).getByText('Yes')).toBeInTheDocument();
  });

  it('asset detail shows the error with a way back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'Asset not found' }, 404)));
    // useApi logs each failed request
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderPage('missing');
    expect(await screen.findByRole('alert')).toHaveTextContent('Asset not found');
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(container.querySelector('.py-6')).toBeNull();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

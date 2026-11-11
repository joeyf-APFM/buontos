// Records for the pages the restyle check covers (restyle-pages.ts), by exact
// /api path. Detail routes there use these ids. Pages not listed here get the
// router's empty-list answer.

const CREATED = '2026-10-01T09:00:00Z';
const UPDATED = '2026-11-02T15:30:00Z';

const ASSET_TYPES = [
  {
    id: 'e2e-type-table', name: 'Table', description: 'A table in a data platform', category: 'data',
    icon: null, required_fields: null, optional_fields: null, allowed_relationships: null,
    is_system: true, status: 'active', asset_count: 12, created_by: 'system', created_at: CREATED, updated_at: UPDATED,
  },
  {
    id: 'e2e-type-report', name: 'Report', description: 'A published report', category: 'analytics',
    icon: null, required_fields: null, optional_fields: null, allowed_relationships: null,
    is_system: false, status: 'active', asset_count: 3, created_by: 'e2e.user@example.com', created_at: CREATED, updated_at: UPDATED,
  },
];

const ASSET = {
  id: 'e2e-asset-1',
  name: 'orders',
  description: 'One row per customer order',
  asset_type_id: 'e2e-type-table',
  asset_type_name: 'Table',
  platform: 'databricks',
  location: 'main.sales.orders',
  domain_ids: [],
  domains: [],
  properties: null,
  tags: ['sales'],
  status: 'active',
  data_branch: 'uc',
  certification_level: null,
  parent_id: null,
  parent_name: null,
  relationships: [],
  created_by: 'e2e.user@example.com',
  created_at: CREATED,
  updated_at: UPDATED,
};

const REVIEW = {
  id: 'e2e-review-1',
  requester_email: 'e2e.requester@example.com',
  reviewer_email: 'e2e.user@example.com',
  title: 'Review sales tables',
  status: 'in_review',
  notes: 'Please check the order tables before release.',
  created_at: CREATED,
  updated_at: UPDATED,
  assets: [
    { id: 'e2e-reviewed-1', asset_fqn: 'main.sales.orders', asset_type: 'table', status: 'pending', comments: null, updated_at: UPDATED },
    { id: 'e2e-reviewed-2', asset_fqn: 'main.sales.order_lines', asset_type: 'table', status: 'approved', comments: 'Looks good', updated_at: UPDATED },
  ],
};

const COLUMN = {
  column_label: null, nullable: false, is_primary_key: false, classification: null,
  table_name: 'orders', table_full_name: 'main.sales.orders', schema_name: 'sales', catalog_name: 'main',
  table_type: 'TABLE', source: 'asset', asset_id: 'e2e-asset-1', system_name: null, contract_id: null,
  contract_name: null, contract_version: null, contract_status: null, business_terms: [],
};

const TABLE = {
  full_name: 'main.sales.orders',
  name: 'orders',
  schema_name: 'sales',
  catalog_name: 'main',
  table_type: 'MANAGED',
  owner: 'e2e.user@example.com',
  comment: 'One row per customer order',
  created_at: CREATED,
  updated_at: UPDATED,
  created_by: 'e2e.user@example.com',
  updated_by: 'e2e.user@example.com',
  storage_location: null,
  data_source_format: 'DELTA',
  columns: [
    { name: 'order_id', type_text: 'bigint', type_name: 'LONG', position: 0, nullable: false, comment: 'Order key' },
    { name: 'ordered_at', type_text: 'timestamp', type_name: 'TIMESTAMP', position: 1, nullable: true, comment: null },
  ],
  row_count: null,
  size_bytes: null,
  tags: null,
};

const member = (team: string, n: number, identifier: string, name: string, type = 'user') => ({
  id: `${team}-m${n}`, team_id: team, member_type: type, member_identifier: identifier, member_name: name,
  app_role_override: null, created_at: CREATED, updated_at: UPDATED, added_by: 'e2e.user@example.com',
});

const team = (id: string, name: string, description: string, members: unknown[]) => ({
  id, name, title: null, description, domain_ids: [], domains: [], tags: [], metadata: null,
  created_at: CREATED, updated_at: UPDATED, created_by: 'e2e.user@example.com', updated_by: 'e2e.user@example.com', members,
});

const TEAMS = [
  team('e2e-team-1', 'Sales Analytics', 'Owns the sales reporting products', [
    member('e2e-team-1', 1, 'e2e.user@example.com', 'E2E User'),
    member('e2e-team-1', 2, 'analysts', 'Analysts', 'group'),
  ]),
  team('e2e-team-2', 'Data Platform', 'Runs the shared pipelines', [
    member('e2e-team-2', 1, 'e2e.engineer@example.com', 'E2E Engineer'),
  ]),
  team('e2e-team-3', 'Finance', 'Finance reporting', []),
];

const product = (id: string, name: string, status: string, tags: string[], teamName: string) => ({
  apiVersion: 'v1.0.0', kind: 'DataProduct', id, status, name, version: '1.0.0', domain_ids: [], domains: [], tags,
  inputPorts: [], managementPorts: [], support: [], customProperties: [], authoritativeDefinitions: [],
  outputPorts: [{ id: `${id}-out`, name: `${name} output`, version: '1.0.0', type: 'table' }],
  description: { purpose: `${name} for reporting` },
  team: { name: teamName, members: [{ username: 'e2e.user@example.com', name: 'E2E User', role: 'owner' }] },
  created_at: CREATED, updated_at: UPDATED,
});

const PRODUCTS = [
  product('e2e-product-1', 'Sales orders', 'active', ['sales'], 'Sales Analytics'),
  product('e2e-product-2', 'Customer 360', 'draft', ['customers', 'pii'], 'Data Platform'),
  product('e2e-product-3', 'Monthly revenue', 'deprecated', [], 'Finance'),
];

const policy = (id: string, name: string, severity: string, category: string, compliance: number, isActive: boolean) => ({
  id, name, description: `${name} across every product`, failure_message: `${name} failed`,
  rule: "MATCH (obj:Object) ASSERT obj.owner IS NOT NULL", compliance, history: [compliance - 5, compliance],
  created_at: CREATED, updated_at: UPDATED, is_active: isActive, severity, category,
});

const COMPLIANCE = {
  policies: [
    policy('e2e-policy-1', 'Owner assigned', 'high', 'Governance', 92, true),
    policy('e2e-policy-2', 'PII is tagged', 'critical', 'Security', 64, true),
    policy('e2e-policy-3', 'Descriptions present', 'low', 'Quality', 80, false),
  ],
  stats: { overall_compliance: 79, active_policies: 2, critical_issues: 1 },
};

const CONNECTION = {
  id: 'e2e-conn-1', name: 'Workspace catalog', connector_type: 'databricks', description: 'Unity Catalog of this workspace',
  config: {}, enabled: true, is_default: true, system_asset_id: null, data_branch: 'uc', created_by: 'e2e.user@example.com',
  created_at: CREATED, updated_at: UPDATED,
};

const browseNode = (name: string, nodeType: string, path: string, hasChildren: boolean, assetType: string | null) => ({
  name, node_type: nodeType, path, has_children: hasChildren, description: null, asset_type: assetType, connector_type: 'databricks',
});

// The schema browser asks for one level at a time with ?path=
const BROWSE: Record<string, unknown[]> = {
  '': [browseNode('main', 'catalog', 'main', true, 'Catalog'), browseNode('finance', 'catalog', 'finance', true, 'Catalog')],
  main: [browseNode('sales', 'schema', 'main.sales', true, 'Schema')],
  'main.sales': [
    browseNode('orders', 'table', 'main.sales.orders', false, 'Table'),
    browseNode('order_lines', 'table', 'main.sales.order_lines', false, 'Table'),
  ],
};

const treeNode = (key: string, label: string, kind: string, count: number, hasChildren: boolean, extra = {}) => ({
  key, label, kind, count, has_children: hasChildren, ...extra,
});
const treeAsset = (id: string, label: string, type: string, count: number, hasChildren: boolean) =>
  treeNode(`asset:${id}`, label, 'asset', count, hasChildren, { asset_id: id, asset_type_name: type });

// The Asset Explorer asks for one tree level at a time with ?parent=
const ASSET_TREE: Record<string, unknown[]> = {
  '': [
    treeNode('branch:uc', 'Unity Catalog', 'branch', 3, true),
    treeNode('branch:internal', 'Internal', 'branch', 0, false),
    treeNode('branch:external', 'External', 'branch', 1, true),
  ],
  'branch:uc': [treeAsset('e2e-cat-1', 'main', 'Catalog', 3, true)],
  'asset:e2e-cat-1': [treeAsset('e2e-sch-1', 'main.sales', 'Schema', 2, true)],
  'asset:e2e-sch-1': [
    treeAsset('e2e-asset-1', 'main.sales.orders', 'Table', 0, false),
    treeAsset('e2e-asset-2', 'main.sales.order_lines', 'Table', 0, false),
  ],
  'branch:external': [treeAsset('e2e-asset-3', 'Revenue dashboard', 'Dashboard', 0, false)],
};

const assetSummary = (id: string, name: string, type: string, status: string, hasChildren: boolean) => ({
  id, name, description: `${name} description`, asset_type_id: `e2e-type-${type.toLowerCase()}`, asset_type_name: type,
  location: name, status, data_branch: 'uc', domains: [], primary_domain_id: null, updated_at: UPDATED,
  owner_display: 'Sales Analytics', owner_extra_count: 0, concepts: ['Order'], column_count: 2, has_children: hasChildren,
});

// The first row has children, so the grid shows its expand button
const ASSET_PAGE = {
  items: [
    assetSummary('e2e-asset-1', 'main.sales.orders', 'Table', 'active', true),
    assetSummary('e2e-asset-2', 'main.sales.order_lines', 'Table', 'draft', false),
  ],
  total: 2,
};

export const DATA_FIXTURES: Record<string, unknown> = {
  // Spot-check pages (Ruling R1)
  '/api/teams': TEAMS,
  '/api/data-products': PRODUCTS,
  '/api/compliance/policies': COMPLIANCE,

  // Schema Importer: one connection, so it is picked, and its browse tree
  '/api/connections': [CONNECTION],
  '/api/schema-import/browse/e2e-conn-1': (url: URL) => {
    const path = url.searchParams.get('path') ?? '';
    return { connection_id: 'e2e-conn-1', path: path || null, nodes: BROWSE[path] ?? [], truncated: false };
  },

  // Asset Explorer: its tree and the grid page under a node. Other /api/assets
  // callers (pickers, search) get the same envelope.
  '/api/assets/tree': (url: URL) => ASSET_TREE[url.searchParams.get('parent') ?? ''] ?? [],
  '/api/assets': ASSET_PAGE,

  // Settings → Asset Types
  '/api/asset-types': ASSET_TYPES,

  // Asset detail
  '/api/assets/e2e-asset-1': ASSET,
  '/api/entities/asset/e2e-asset-1/ratings': {
    entity_type: 'asset', entity_id: 'e2e-asset-1', average_rating: 0, total_ratings: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, user_current_rating: null,
  },
  '/api/entities/asset/e2e-asset-1/quality-items/summary': { overall_score_percent: 0, items_count: 0, by_dimension: {} },
  '/api/entities/asset/e2e-asset-1/cost-items/summary': { total_cents: 0, currency: 'USD', by_center: {} },

  // Data Asset Reviews
  '/api/data-asset-reviews': [REVIEW],
  '/api/data-asset-reviews/e2e-review-1': REVIEW,

  // Data Catalog
  '/api/data-catalog/hierarchy': { asset_types: ['table'], systems: [], catalogs: ['main'], schemas: ['sales'] },
  '/api/data-catalog/columns': {
    table_count: 1,
    column_count: 2,
    columns: [
      { ...COLUMN, column_name: 'order_id', column_type: 'BIGINT', description: 'Order key', position: 0, is_primary_key: true },
      { ...COLUMN, column_name: 'ordered_at', column_type: 'TIMESTAMP', description: null, position: 1, nullable: true },
    ],
    offset: 0,
    limit: 100,
    has_more: false,
  },
  '/api/data-catalog/tables/main.sales.orders': TABLE,

  // Pages of later waves that crash on an empty list
  '/api/audit': { total: 0, items: [] },
  '/api/database-schema': { tables: [], relationships: [] },
  '/api/estates/e2e-estate-1': {
    id: 'e2e-estate-1', name: 'Partner estate', description: 'A partner instance', workspace_url: 'https://partner.example.com',
    cloud_type: 'aws', metastore_name: 'partner-metastore', connection_type: 'delta_share', export_policies: [],
    import_policies: [], is_enabled: true, sync_schedule: '0 0 * * *', last_sync_status: 'success',
    last_sync_time: UPDATED, created_at: CREATED, updated_at: UPDATED,
  },
  '/api/data-products/e2e-product-1': {
    apiVersion: 'v1.0.0', kind: 'DataProduct', id: 'e2e-product-1', status: 'draft', name: 'Sales orders',
    version: '1.0.0', domain_ids: [], domains: [], tags: [], inputPorts: [], outputPorts: [], managementPorts: [],
    support: [], customProperties: [], authoritativeDefinitions: [], description: { purpose: 'Orders for reporting' },
    created_at: CREATED, updated_at: UPDATED,
  },
  // The large view's rating panel (the router's default [] has no average to show)
  '/api/entities/data_product/e2e-product-1/ratings': {
    entity_type: 'data_product', entity_id: 'e2e-product-1', average_rating: 0, total_ratings: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, user_current_rating: null,
  },
  '/api/data-products/e2e-product-1/maturity': {
    entity_type: 'DataProduct', entity_id: 'e2e-product-1', entity_name: 'Sales orders', achieved_level_order: null,
    achieved_level_name: null, total_levels: 0, gates_passed: 0, gates_total: 0, levels: [], evaluated_at: UPDATED,
    evaluated_by: null,
  },
  '/api/settings/search-config': {
    version: '1',
    defaults: {
      fields: {
        title: { indexed: true, match_type: 'prefix', priority: 1, boost: 2 },
        description: { indexed: true, match_type: 'substring', priority: 2, boost: 1 },
        tags: { indexed: true, match_type: 'exact', priority: 3, boost: 1 },
      },
    },
    asset_types: {
      'data-product': { enabled: true, inherit_defaults: true, fields: {}, extra_fields: {} },
    },
    ranking: { primary_sort: 'match_priority', secondary_sort: 'boost_score', tertiary_sort: 'title_asc' },
  },
  '/api/workflows/e2e-workflow-1': {
    id: 'e2e-workflow-1', name: 'Review new contracts', description: 'Asks for review on create',
    trigger: { type: 'on_create', entity_types: ['data_contract'] }, workflow_type: 'process', is_active: true,
    is_default: false, version: 1, steps: [], created_at: CREATED, updated_at: UPDATED,
  },
};

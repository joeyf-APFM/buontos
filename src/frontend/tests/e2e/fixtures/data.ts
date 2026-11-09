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

export const DATA_FIXTURES: Record<string, unknown> = {
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

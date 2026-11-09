import type { Page, Route } from '@playwright/test';

// Feature ids from src/backend/src/common/features.py, plus the frontend-only
// ids the navigation checks. The fixture user is an admin everywhere.
const FEATURE_IDS = [
  'data-catalog', 'data-products', 'data-contracts', 'assets', 'semantic-models', 'term-mapping',
  'schema-importer', 'compliance', 'master-data', 'data-asset-reviews', 'security-features',
  'entitlements', 'entitlements-sync', 'process-workflows', 'access-grants', 'estate-manager',
  'catalog-commander', 'settings', 'settings-asset-types', 'settings-certification-levels',
  'settings-maturity-levels', 'settings-general', 'settings-ui', 'settings-connectors', 'settings-git',
  'settings-mcp', 'settings-directory', 'settings-semantic-models', 'settings-search',
  'settings-delivery', 'settings-workflows', 'settings-roles', 'data-domains', 'business-roles',
  'business-owners', 'delivery-methods', 'teams', 'projects', 'tags', 'jobs', 'audit', 'comments',
  'ontology', 'notifications', 'search', 'my-products', 'my-requests',
];

const PERMISSIONS = Object.fromEntries(FEATURE_IDS.map((id) => [id, 'Admin']));

const USER = {
  email: 'e2e.user@example.com',
  username: 'e2e.user',
  user: 'E2E User',
  ip: '127.0.0.1',
  groups: ['admins'],
};

// Exact-path answers. Anything else under /api gets an empty list, which every
// list view renders as its empty state.
const FIXTURES: Record<string, unknown> = {
  '/api/health': { db_ok: true, ws_ok: true, seed_ok: true, warnings: [], warning_details: [], db_error: null },
  '/api/user/permissions': PERMISSIONS,
  '/api/user/actual-permissions': PERMISSIONS,
  '/api/user/details': USER,
  '/api/user/info': USER,
  '/api/user/actual-role': { role: { id: 'admin', name: 'Admin' } },
  '/api/user/role-override': { role_id: null },
  '/api/user/pending-approvals': { workflows: [] },
  '/api/settings': {
    job_cluster_id: null,
    enabled_jobs: [],
    available_workflows: [],
    current_settings: {},
    llm_enabled: false,
    helix_enabled: false,
  },
  '/api/settings/ui-customization': {},
  '/api/cache-version': { version: 1 },
};

// Endpoints the app treats as switched off when they answer 404
const NOT_FOUND = new Set(['/api/test/personas']);

export const unmockedRequests: string[] = [];

async function answer(route: Route) {
  const url = new URL(route.request().url());
  if (NOT_FOUND.has(url.pathname)) {
    return route.fulfill({ status: 404, json: { detail: 'Not Found' } });
  }
  if (url.pathname in FIXTURES) {
    return route.fulfill({ json: FIXTURES[url.pathname] });
  }
  unmockedRequests.push(`${route.request().method()} ${url.pathname}`);
  return route.fulfill({ json: [] });
}

export async function mockApi(page: Page) {
  // A predicate, not a glob: '**/api/**' would also catch Vite module URLs
  await page.route((url) => url.pathname.startsWith('/api/'), answer);
}

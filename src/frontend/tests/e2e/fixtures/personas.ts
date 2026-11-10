// The users the fixture router (fixtures/api.ts) can sign in as. The app reads
// a user's feature permissions from GET /api/user/permissions, as a map of
// feature id to access level (src/stores/permissions-store.ts).

// Feature ids from src/backend/src/common/features.py, plus the frontend-only
// ids the navigation checks.
export const FEATURE_IDS = [
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

// FeatureAccessLevel values (src/types/settings.ts)
type AccessLevel = 'None' | 'Read-only' | 'Read/Write' | 'Filtered' | 'Full' | 'Admin';

export interface Persona {
  id: string;
  user: { email: string; username: string; user: string; ip: string; groups: string[] };
  role: { id: string; name: string };
  permissions: Record<string, AccessLevel>;
}

function allFeatures(level: AccessLevel): Record<string, AccessLevel> {
  return Object.fromEntries(FEATURE_IDS.map((id) => [id, level]));
}

export const PERSONAS = {
  /** Admin on every feature. */
  admin: {
    id: 'admin',
    user: { email: 'e2e.user@example.com', username: 'e2e.user', user: 'E2E User', ip: '127.0.0.1', groups: ['admins'] },
    role: { id: 'admin', name: 'Admin' },
    permissions: allFeatures('Admin'),
  },
  /** Read-only on every feature, so no `assets` Read/Write: sees pages, cannot change them. */
  consumer: {
    id: 'consumer',
    user: { email: 'e2e.consumer@example.com', username: 'e2e.consumer', user: 'E2E Consumer', ip: '127.0.0.1', groups: ['users'] },
    role: { id: 'consumer', name: 'Data Consumer' },
    permissions: allFeatures('Read-only'),
  },
} satisfies Record<string, Persona>;

export type PersonaId = keyof typeof PERSONAS;

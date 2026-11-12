import type { Page } from '@playwright/test';

// Every routed screen (src/app.tsx), with the restyle wave that redoes it
// (docs/superpowers/specs/2026-11-09-mantine-restyle-design.md). Redirect-only
// routes are left out. Detail routes use the ids in fixtures/data.ts.
// `skip` gives the reason a page has no baseline yet.

export interface RestylePage {
  id: string;
  route: string;
  wave: number;
  skip?: string;
}

export const RESTYLE_PAGES: RestylePage[] = [
  // Wave 1: data asset pages
  { id: 'asset-detail', route: '/assets/e2e-asset-1', wave: 1 },
  { id: 'data-catalog', route: '/data-catalog', wave: 1 },
  { id: 'data-catalog-details', route: '/data-catalog/main.sales.orders', wave: 1 },
  { id: 'schema-importer', route: '/schema-importer', wave: 1 },
  { id: 'concepts-import', route: '/concepts/import', wave: 1 },
  { id: 'settings-asset-types', route: '/settings/asset-types', wave: 1 },
  { id: 'data-asset-reviews', route: '/data-asset-reviews', wave: 1 },
  { id: 'data-asset-review-details', route: '/data-asset-reviews/e2e-review-1', wave: 1 },

  // Wave 2: Build
  { id: 'data-products', route: '/data-products', wave: 2 },
  { id: 'data-product-details', route: '/data-products/e2e-product-1', wave: 2 },
  { id: 'my-products', route: '/my-products', wave: 2 },
  { id: 'my-product-details', route: '/my-products/e2e-product-1', wave: 2 },
  { id: 'my-requests', route: '/my-requests', wave: 2 },
  { id: 'data-contracts', route: '/data-contracts', wave: 2 },
  { id: 'data-contract-details', route: '/data-contracts/e2e-contract-1', wave: 2 },
  { id: 'marketplace', route: '/marketplace', wave: 2 },
  { id: 'search', route: '/search', wave: 2 },
  { id: 'search-llm', route: '/search/llm', wave: 2 },
  { id: 'search-index', route: '/search/index', wave: 2 },
  { id: 'business-owners', route: '/business-owners', wave: 2 },
  { id: 'owner-consumers', route: '/owner-consumers', wave: 2 },
  { id: 'concepts-define', route: '/concepts/define', wave: 2 },
  { id: 'concepts-enrich', route: '/concepts/enrich', wave: 2 },
  { id: 'concepts-collections', route: '/concepts/collections', wave: 2 },
  { id: 'concepts-browser', route: '/concepts/browser', wave: 2 },
  { id: 'concept-detail', route: '/concepts/browser/e2e-concept-1', wave: 2 },
  { id: 'concepts-search', route: '/concepts/search', wave: 2 },
  { id: 'concepts-hierarchy', route: '/concepts/hierarchy', wave: 2 },
  { id: 'concepts-generator', route: '/concepts/generator', wave: 2 },
  { id: 'concepts-mapping', route: '/concepts/mapping', wave: 2 },

  // Wave 3: Govern
  { id: 'compliance', route: '/compliance', wave: 3 },
  { id: 'compliance-policy-details', route: '/compliance/policies/e2e-policy-1', wave: 3 },
  { id: 'compliance-run-details', route: '/compliance/runs/e2e-run-1', wave: 3 },
  { id: 'master-data', route: '/master-data', wave: 3 },
  { id: 'security-features', route: '/security-features', wave: 3 },
  { id: 'entitlements', route: '/entitlements', wave: 3 },
  { id: 'entitlements-sync', route: '/entitlements-sync', wave: 3 },

  // Wave 4: Settings
  { id: 'settings-general', route: '/settings/general', wave: 4 },
  { id: 'settings-git', route: '/settings/git', wave: 4 },
  { id: 'settings-delivery', route: '/settings/delivery', wave: 4 },
  { id: 'settings-jobs', route: '/settings/jobs', wave: 4 },
  { id: 'settings-roles', route: '/settings/roles', wave: 4 },
  { id: 'settings-tags', route: '/settings/tags', wave: 4 },
  { id: 'settings-search', route: '/settings/search', wave: 4 },
  { id: 'settings-mcp', route: '/settings/mcp', wave: 4 },
  { id: 'settings-ui', route: '/settings/ui', wave: 4 },
  { id: 'settings-connectors', route: '/settings/connectors', wave: 4 },
  { id: 'settings-directory', route: '/settings/directory', wave: 4 },
  { id: 'settings-semantic-models', route: '/settings/semantic-models', wave: 4 },
  { id: 'settings-certification-levels', route: '/settings/certification-levels', wave: 4 },
  { id: 'settings-maturity-levels', route: '/settings/maturity-levels', wave: 4 },
  { id: 'settings-workflows', route: '/settings/workflows', wave: 4 },
  { id: 'settings-workflow-new', route: '/settings/workflows/new', wave: 4 },
  { id: 'settings-workflow-designer', route: '/settings/workflows/e2e-workflow-1', wave: 4 },
  { id: 'settings-audit', route: '/settings/audit', wave: 4 },
  { id: 'settings-data-domains', route: '/settings/data-domains', wave: 4 },
  { id: 'settings-data-domain-details', route: '/settings/data-domains/e2e-domain-1', wave: 4 },
  { id: 'settings-business-roles', route: '/settings/business-roles', wave: 4 },
  { id: 'settings-delivery-methods', route: '/settings/delivery-methods', wave: 4 },
  { id: 'settings-teams', route: '/settings/teams', wave: 4 },
  { id: 'settings-projects', route: '/settings/projects', wave: 4 },
  { id: 'workflows', route: '/workflows', wave: 4 },
  { id: 'workflow-new', route: '/workflows/new', wave: 4 },
  { id: 'workflow-designer', route: '/workflows/e2e-workflow-1', wave: 4 },

  // Wave 5: Deploy and the rest
  { id: 'estate-manager', route: '/estate-manager', wave: 5 },
  { id: 'estate-details', route: '/estates/e2e-estate-1', wave: 5 },
  { id: 'catalog-commander', route: '/catalog-commander', wave: 5 },
  { id: 'domain-sync', route: '/domain-sync', wave: 5 },
  { id: 'home', route: '/', wave: 5 },
  { id: 'about', route: '/about', wave: 5 },
  { id: 'user-guide', route: '/user-guide', wave: 5 },
  { id: 'user-docs', route: '/user-docs/e2e-doc', wave: 5 },
  { id: 'database-schema', route: '/database-schema', wave: 5 },
  { id: 'dev-lineage', route: '/dev/lineage', wave: 5 },
  { id: 'not-found', route: '/e2e-no-such-page', wave: 5 },

  // Already on Mantine; no wave redoes them, but wave 0 must not change them
  { id: 'asset-explorer', route: '/assets', wave: 0 },
  { id: 'settings-helix', route: '/settings/helix', wave: 0 },
];

// The roles whose controls the restyle must keep (ruling R3 added textbox,
// radio and treeitem; fix round 3 searchbox, spinbutton and slider)
const CONTROL_ROLES = [
  'button', 'link', 'menuitem', 'tab', 'checkbox', 'switch', 'combobox', 'textbox', 'radio', 'treeitem',
  'searchbox', 'spinbutton', 'slider',
];
// `role "name"` at the start of an aria-snapshot entry
const CONTROL_ENTRY = new RegExp(`^(${CONTROL_ROLES.join('|')})(?: "((?:[^"\\\\]|\\\\.)*)")?(?=[\\s:\\[]|$)`);

/**
 * Select-like fields that are not `role="combobox"`, such as Mantine's Select
 * (a text input with `aria-haspopup="listbox"`). They are recorded as
 * combobox, so a Radix Select and a Mantine Select give the same entry.
 */
export const SELECT_LIKE = 'input[aria-haspopup="listbox"], button[aria-haspopup="listbox"]';

/** Search fields, recorded as searchbox whatever role the library gives them. */
export const SEARCH_LIKE = 'input[type="search"]:not([aria-haspopup="listbox"])';

// The roles the inventory gives fields, whatever the library renders
const NORMALISED_ROLES: [selector: string, role: string][] = [
  [SELECT_LIKE, 'combobox'],
  [SEARCH_LIKE, 'searchbox'],
];

/**
 * One aria-snapshot line's entry, without the `- ` and with YAML quoting
 * undone: a name with ": " in it makes the whole entry a single-quoted
 * scalar, e.g. `- 'textbox "Search: t:catalog"'`.
 */
function snapshotEntry(line: string): string | null {
  const m = /^\s*- (.*)$/.exec(line);
  if (!m) return null;
  const rest = m[1];
  if (!rest.startsWith("'")) return rest;
  let out = '';
  for (let i = 1; i < rest.length; i++) {
    if (rest[i] !== "'") out += rest[i];
    else if (rest[i + 1] === "'") out += rest[i++];
    else break;
  }
  return out;
}

/**
 * The controls in <main>, as sorted `role "name"` lines, one per control (so
 * a duplicated control appears twice). Names are Playwright's accessible
 * names, read from its aria snapshot; hidden controls are not listed.
 * Select-like fields are listed as combobox and search fields as searchbox.
 */
export async function controlInventory(page: Page): Promise<string[]> {
  const main = page.locator('main');
  // Give the fields their normalised role just for the snapshot
  await main.evaluate((root, rules) => {
    for (const [selector, role] of rules) {
      for (const el of root.querySelectorAll(selector)) {
        if (!el.hasAttribute('data-restyle-role')) el.setAttribute('data-restyle-role', el.getAttribute('role') ?? '');
        el.setAttribute('role', role);
      }
    }
  }, NORMALISED_ROLES);
  let snapshot: string;
  try {
    snapshot = await main.ariaSnapshot();
  } finally {
    await main.evaluate((root) => {
      for (const el of root.querySelectorAll('[data-restyle-role]')) {
        const role = el.getAttribute('data-restyle-role');
        if (role) el.setAttribute('role', role);
        else el.removeAttribute('role');
        el.removeAttribute('data-restyle-role');
      }
    });
  }
  const controls: string[] = [];
  for (const line of snapshot.split('\n')) {
    const entry = snapshotEntry(line);
    const match = entry === null ? null : CONTROL_ENTRY.exec(entry);
    if (!match) continue;
    const name = match[2] === undefined ? '' : (JSON.parse(`"${match[2]}"`) as string);
    controls.push(`${match[1]} ${JSON.stringify(name)}`);
  }
  return controls.sort();
}

import { describe, expect, it } from 'vitest';
import appSource from '@/app.tsx?raw';
import { NAV, NAV_GROUPS, activeLocation, groupDefaultPath, visibleNav, type NavItem, type NavGroupId, type NavSection } from './nav-config';

// Full route paths declared in app.tsx, nested routes joined to their parent.
function routePaths(source: string): Set<string> {
  const paths = new Set<string>();
  const parents: (string | null)[] = [];
  const tag = /<Route\b|<\/Route>/g;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(source))) {
    if (match[0] === '</Route>') {
      parents.pop();
      continue;
    }
    // Find the end of the opening tag, skipping JSX in {…} props
    let depth = 0;
    let end = match.index + match[0].length;
    for (; end < source.length; end++) {
      const c = source[end];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    const attrs = source.slice(match.index, end + 1);
    const selfClosing = source[end - 1] === '/';
    const own = /\bpath="([^"]+)"/.exec(attrs)?.[1] ?? null;
    const parent = [...parents].reverse().find((p) => p !== null) ?? '';
    const full = own === null ? null : own.startsWith('/') ? own : `${parent}/${own}`;
    if (full) paths.add(full);
    tag.lastIndex = end + 1;
    if (!selfClosing) parents.push(full);
  }
  return paths;
}

function allItems(): NavItem[] {
  return Object.values(NAV).flatMap((sections) =>
    sections.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])])),
  );
}

describe('NAV', () => {
  it('points every item at a route in app.tsx', () => {
    const routes = routePaths(appSource);
    expect(routes.has('/settings/business-roles')).toBe(true); // the parser joins nested routes
    const missing = allItems()
      .map((i) => i.path)
      .filter((p): p is string => !!p && !routes.has(p));
    expect(missing).toEqual([]);
  });

  it('gives every item a page or sub-items', () => {
    const inert = allItems().filter((i) => !i.path && !i.children?.length);
    expect(inert).toEqual([]);
  });

  it('has no Ask Helix item (it lives in the icon strip)', () => {
    expect(allItems().map((i) => i.id)).not.toContain('ask-helix');
  });

  it('uses each id once', () => {
    const ids = allItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

function itemIds(nav: Record<NavGroupId, unknown[]>, group: NavGroupId): string[] {
  return ((nav[group] ?? []) as { items: NavItem[] }[]).flatMap((s) => s.items.map((i) => i.id));
}

// Ids of a group's items, each followed by its sub-item ids in brackets
function tree(group: NavGroupId): string[] {
  return NAV[group].flatMap((s) =>
    s.items.map((i) => (i.children ? `${i.id} [${i.children.map((c) => c.id).join(', ')}]` : i.id)),
  );
}

describe('the side strip groups (Task 16a)', () => {
  it('lists the groups in strip order, Settings last', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      'Discover', 'Build', 'Organization', 'Semantics', 'Workflows', 'Settings',
    ]);
  });

  it('labels the new groups with the existing keys', () => {
    const label = (id: NavGroupId) => NAV_GROUPS.find((g) => g.id === id)!.labelKey;
    expect(label('Organization')).toBe('shell:sections.organization');
    expect(label('Semantics')).toBe('shell:sections.semantics');
    expect(label('Workflows')).toBe('settings:tabs.workflows');
  });

  it('links the Workflows button to the Workflows item, never to a copy of its path', () => {
    const link = NAV_GROUPS.find((g) => g.id === 'Workflows')!.link;
    const items = NAV.Workflows.flatMap((s) => s.items);
    expect(items).toHaveLength(1);
    expect(link).toBe(items[0].path);
  });

  it('makes Workflows a direct link to its page, and only Workflows', () => {
    expect(NAV_GROUPS.filter((g) => g.link).map((g) => [g.id, g.link])).toEqual([['Workflows', '/settings/workflows']]);
    expect(tree('Workflows')).toEqual(['workflows']);
  });

  it('moves Organization with its items in order', () => {
    expect(tree('Organization')).toEqual([
      'data-domains', 'teams', 'projects', 'roles [app-roles, business-roles]',
    ]);
  });

  it('moves Semantics with its items in order', () => {
    expect(tree('Semantics')).toEqual([
      'semantic-models', 'settings-asset-types', 'tags', 'levels [certification-levels, maturity-levels]',
    ]);
  });

  it('leaves Settings with Platform, a Process of Delivery and Audit log, then Govern and Deploy', () => {
    expect(NAV.Settings.map((s) => s.titleKey)).toEqual([
      'shell:sections.platform', 'shell:sections.process', 'navigation:groups.govern', 'navigation:groups.deploy',
    ]);
    expect(tree('Settings')).toEqual([
      'general', 'helix', 'appearance', 'settings-search', 'connectors [git, mcp, delivery-methods]', 'jobs', 'directory',
      'delivery', 'audit',
      'compliance', 'master-data', 'data-asset-reviews', 'security-features', 'entitlements-menu [entitlements, entitlements-sync]',
      'estate-manager', 'catalog-commander',
    ]);
  });

  it('keeps the Govern and Deploy permission ids', () => {
    const govern = NAV.Settings.find((s) => s.titleKey === 'navigation:groups.govern')!;
    const deploy = NAV.Settings.find((s) => s.titleKey === 'navigation:groups.deploy')!;
    const ids = (s: NavSection) => s.items.flatMap((i) => [i, ...(i.children ?? [])]).map((i) => `${i.id}:${i.permissionId}`);
    expect(ids(govern)).toEqual([
      'compliance:compliance', 'master-data:master-data', 'data-asset-reviews:data-asset-reviews',
      'security-features:security-features', 'entitlements-menu:entitlements', 'entitlements:entitlements',
      'entitlements-sync:entitlements-sync',
    ]);
    expect(ids(deploy)).toEqual(['estate-manager:estate-manager', 'catalog-commander:catalog-commander']);
  });

  it('keeps the permission ids of the moved items', () => {
    const permissions = (group: NavGroupId) =>
      NAV[group].flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])])).map((i) => `${i.id}:${i.permissionId}`);
    expect(permissions('Organization')).toEqual([
      'data-domains:data-domains', 'teams:teams', 'projects:projects', 'roles:settings-roles',
      'app-roles:settings-roles', 'business-roles:business-roles',
    ]);
    expect(permissions('Semantics')).toEqual([
      'semantic-models:settings-semantic-models', 'settings-asset-types:settings-asset-types', 'tags:tags',
      'levels:settings-certification-levels', 'certification-levels:settings-certification-levels',
      'maturity-levels:settings-maturity-levels',
    ]);
    expect(permissions('Workflows')).toEqual(['workflows:settings-workflows']);
  });
});

describe('visibleNav', () => {
  it('hides Organization, Semantics and Workflows without the settings gate', () => {
    const nav = visibleNav((id) => id !== 'settings');
    expect(nav.Organization).toBeUndefined();
    expect(nav.Semantics).toBeUndefined();
    expect(nav.Workflows).toBeUndefined();
    expect(nav.Build).toBeDefined();
  });

  it('keeps only Govern and Deploy in Settings without the settings gate', () => {
    const nav = visibleNav((id) => id !== 'settings');
    expect(nav.Settings.map((s) => s.titleKey)).toEqual(['navigation:groups.govern', 'navigation:groups.deploy']);
  });

  it('shows Settings with just Govern for a user with compliance access and no gate', () => {
    const nav = visibleNav((id) => id === 'compliance');
    expect(nav.Settings.map((s) => s.titleKey)).toEqual(['navigation:groups.govern']);
    expect(itemIds(nav, 'Settings')).toEqual(['compliance']);
  });

  it('hides Settings without the gate and without any Govern or Deploy item', () => {
    expect(visibleNav((id) => id === 'data-contracts').Settings).toBeUndefined();
    // Settings pages alone don't show without the gate
    expect(visibleNav((id) => id === 'settings-general').Settings).toBeUndefined();
  });

  it('shows every Settings section with the gate', () => {
    expect(visibleNav(() => true).Settings.map((s) => s.titleKey)).toEqual([
      'shell:sections.platform', 'shell:sections.process', 'navigation:groups.govern', 'navigation:groups.deploy',
    ]);
  });

  it('shows them with the gate and all permissions', () => {
    const nav = visibleNav(() => true);
    expect(nav.Organization).toBeDefined();
    expect(nav.Semantics).toBeDefined();
    expect(itemIds(nav, 'Workflows')).toEqual(['workflows']);
  });

  it('hides a new group when none of its items is allowed', () => {
    const org = new Set(['data-domains', 'teams', 'projects', 'settings-roles', 'business-roles']);
    const sem = new Set(['settings-semantic-models', 'settings-asset-types', 'tags', 'settings-certification-levels', 'settings-maturity-levels']);
    expect(visibleNav((id) => !org.has(id)).Organization).toBeUndefined();
    expect(visibleNav((id) => !sem.has(id)).Semantics).toBeUndefined();
    expect(visibleNav((id) => id !== 'settings-workflows').Workflows).toBeUndefined();
    // The others stay
    expect(visibleNav((id) => !org.has(id)).Semantics).toBeDefined();
  });

  it('keeps only the allowed items of a new group', () => {
    const nav = visibleNav((id) => id !== 'teams' && id !== 'tags');
    expect(itemIds(nav, 'Organization')).not.toContain('teams');
    expect(itemIds(nav, 'Organization')).toContain('projects');
    expect(itemIds(nav, 'Semantics')).not.toContain('tags');
  });

  it('hides Organization → Roles when both role pages are denied', () => {
    const denied = new Set(['settings-roles', 'business-roles']);
    const nav = visibleNav((id) => !denied.has(id));
    expect(itemIds(nav, 'Organization')).not.toContain('roles');
    expect(itemIds(nav, 'Organization')).toContain('projects');
  });

  it('keeps a parent while one child is allowed', () => {
    const nav = visibleNav((id) => id !== 'settings-roles');
    const roles = nav.Organization.flatMap((s) => s.items).find((i) => i.id === 'roles');
    expect(roles?.children?.map((c) => c.id)).toEqual(['business-roles']);
  });

  it('hides the whole Settings group when every settings permission is denied', () => {
    const settingsPermissions = new Set(
      NAV.Settings.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])])).map((i) => i.permissionId),
    );
    const nav = visibleNav((id) => !settingsPermissions.has(id) || id === 'settings');
    expect(nav.Settings).toBeUndefined();
    expect(nav.Discover).toBeDefined();
  });

  it('drops empty sections', () => {
    const nav = visibleNav((id) => id !== 'settings-delivery' && id !== 'audit');
    expect(nav.Settings.map((s) => s.titleKey)).not.toContain('shell:sections.process');
  });
});

describe('visibleNav maturity', () => {
  const gaOnly = (m: string) => m === 'ga';
  const everything = () => true;

  it('hides alpha items unless alpha is allowed', () => {
    const section = (nav: ReturnType<typeof visibleNav>, key: string) =>
      (nav.Settings ?? []).find((s) => s.titleKey === `navigation:groups.${key}`)?.items.map((i) => i.id);
    const hidden = visibleNav(() => true, gaOnly);
    expect(section(hidden, 'govern') ?? []).not.toContain('security-features');
    expect(section(hidden, 'govern') ?? []).not.toContain('entitlements-menu'); // both sub-items are alpha
    expect(section(hidden, 'deploy')).toBeUndefined(); // estate-manager, catalog-commander

    const shown = visibleNav(() => true, (m) => m === 'ga' || m === 'alpha');
    expect(section(shown, 'govern')).toContain('security-features');
    expect(section(shown, 'deploy')).toEqual(['estate-manager', 'catalog-commander']);
  });

  it('treats items without a feature as ga', () => {
    const nav = visibleNav(() => true, gaOnly);
    expect(itemIds(nav, 'Settings')).toContain('general');
    expect(nav.Build.flatMap((s) => s.items).find((i) => i.id === 'concepts')?.children).toHaveLength(6);
  });

  it('applies on top of the permission check', () => {
    const nav = visibleNav((id) => id !== 'security-features', everything);
    expect(itemIds(nav, 'Settings')).not.toContain('security-features');
    expect(itemIds(nav, 'Settings')).toContain('compliance');
  });
});

describe('activeLocation', () => {
  it('finds a settings sub-item', () => {
    expect(activeLocation('/settings/business-roles')).toEqual({
      group: 'Organization',
      itemId: 'roles',
      childId: 'business-roles',
    });
  });

  it('finds the Explorer under Build for /assets', () => {
    expect(activeLocation('/assets')).toEqual({ group: 'Build', itemId: 'assets', childId: 'explorer' });
  });

  it('matches the longest path prefix', () => {
    expect(activeLocation('/assets/123')).toEqual({ group: 'Build', itemId: 'assets', childId: 'explorer' });
    expect(activeLocation('/my-products/9')).toEqual({ group: 'Build', itemId: 'products', childId: 'my-products' });
    expect(activeLocation('/concepts/generator')).toEqual({ group: 'Build', itemId: 'concepts' });
  });

  it('puts the moved settings pages in their new groups', () => {
    expect(activeLocation('/settings/teams')).toEqual({ group: 'Organization', itemId: 'teams' });
    expect(activeLocation('/settings/data-domains/d1')).toEqual({ group: 'Organization', itemId: 'data-domains' });
    expect(activeLocation('/settings/tags')).toEqual({ group: 'Semantics', itemId: 'tags' });
    expect(activeLocation('/settings/general')).toEqual({ group: 'Settings', itemId: 'general' });
  });

  it('gives Asset types, listed under Build and Semantics, to Semantics', () => {
    expect(activeLocation('/settings/asset-types')).toEqual({ group: 'Semantics', itemId: 'settings-asset-types' });
  });

  it('gives /settings/workflows and its sub-paths to the Workflows button', () => {
    expect(activeLocation('/settings/workflows')).toEqual({ group: 'Workflows', itemId: 'workflows' });
    expect(activeLocation('/settings/workflows/new')).toEqual({ group: 'Workflows', itemId: 'workflows' });
  });

  it('gives the Govern and Deploy pages to Settings', () => {
    expect(activeLocation('/compliance')).toEqual({ group: 'Settings', itemId: 'compliance' });
    expect(activeLocation('/compliance/runs/r1')).toEqual({ group: 'Settings', itemId: 'compliance' });
    expect(activeLocation('/estate-manager')).toEqual({ group: 'Settings', itemId: 'estate-manager' });
    expect(activeLocation('/entitlements-sync')).toEqual({ group: 'Settings', itemId: 'entitlements-menu', childId: 'entitlements-sync' });
    expect(activeLocation('/catalog-commander')).toEqual({ group: 'Settings', itemId: 'catalog-commander' });
  });

  it('only matches whole path segments', () => {
    expect(activeLocation('/assetsx')).toBeNull();
    expect(activeLocation('/')).toBeNull();
  });
});

// Task 16c: the owner's side-menu list (2026-11-10)
describe('Directory (Task 16c)', () => {
  it('is the last Platform item in Settings, after Jobs', () => {
    const platform = NAV.Settings.find((s) => s.titleKey === 'shell:sections.platform')!;
    expect(platform.items.slice(-2).map((i) => `${i.id}:${i.permissionId}`)).toEqual(['jobs:jobs', 'directory:settings-directory']);
    expect(itemIds(NAV, 'Organization')).not.toContain('directory');
  });
});

describe('group defaults (Task 16c)', () => {
  const group = (id: NavGroupId) => NAV_GROUPS.find((g) => g.id === id)!;
  const all = visibleNav(() => true);

  it('names a default item for every group but Settings', () => {
    expect(NAV_GROUPS.map((g) => [g.id, g.defaultItemId])).toEqual([
      ['Discover', 'marketplace'],
      ['Build', 'explorer'],
      ['Organization', 'data-domains'],
      ['Semantics', 'semantic-models'],
      ['Workflows', 'workflows'],
      ['Settings', undefined],
    ]);
  });

  it("goes to each group's default page", () => {
    expect(NAV_GROUPS.map((g) => [g.id, groupDefaultPath(g, all[g.id])])).toEqual([
      ['Discover', '/marketplace'],
      ['Build', '/assets'],
      ['Organization', '/settings/data-domains'],
      ['Semantics', '/settings/semantic-models'],
      ['Workflows', '/settings/workflows'],
      ['Settings', null],
    ]);
  });

  it('falls back to the first visible item when the default is hidden', () => {
    const nav = visibleNav((id) => id !== 'data-products' && id !== 'assets');
    expect(groupDefaultPath(group('Discover'), nav.Discover)).toBe('/search');
    expect(groupDefaultPath(group('Build'), nav.Build)).toBe('/settings/asset-types');
    expect(groupDefaultPath(group('Organization'), visibleNav((id) => id !== 'data-domains').Organization)).toBe('/settings/teams');
  });

  it('names a default child only where it is one of the parent\'s children', () => {
    for (const item of allItems().filter((i) => i.defaultChildId)) {
      expect(item.children!.map((c) => c.id)).toContain(item.defaultChildId);
    }
  });
});

describe('activeLocation (Task 16c)', () => {
  it('finds Directory in Settings', () => {
    expect(activeLocation('/settings/directory')).toEqual({ group: 'Settings', itemId: 'directory' });
  });
});

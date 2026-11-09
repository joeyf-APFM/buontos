import { describe, expect, it } from 'vitest';
import appSource from '@/app.tsx?raw';
import { NAV, activeLocation, visibleNav, type NavItem, type NavGroupId } from './nav-config';

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

// Task 11 adds the Settings → Helix & LLM page and its route.
const NOT_YET_ROUTED = new Set(['/settings/helix']);

describe('NAV', () => {
  it('points every item at a route in app.tsx', () => {
    const routes = routePaths(appSource);
    expect(routes.has('/settings/business-roles')).toBe(true); // the parser joins nested routes
    const missing = allItems()
      .map((i) => i.path)
      .filter((p): p is string => !!p && !NOT_YET_ROUTED.has(p) && !routes.has(p));
    expect(missing).toEqual([]);
  });

  it('uses each id once', () => {
    const ids = allItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

function itemIds(nav: Record<NavGroupId, unknown[]>, group: NavGroupId): string[] {
  return ((nav[group] ?? []) as { items: NavItem[] }[]).flatMap((s) => s.items.map((i) => i.id));
}

describe('visibleNav', () => {
  it('hides Settings → Roles when both role pages are denied', () => {
    const denied = new Set(['settings-roles', 'business-roles']);
    const nav = visibleNav((id) => !denied.has(id));
    expect(itemIds(nav, 'Settings')).not.toContain('roles');
    expect(itemIds(nav, 'Settings')).toContain('directory');
  });

  it('keeps a parent while one child is allowed', () => {
    const nav = visibleNav((id) => id !== 'settings-roles');
    const roles = nav.Settings.flatMap((s) => s.items).find((i) => i.id === 'roles');
    expect(roles?.children?.map((c) => c.id)).toEqual(['business-roles']);
  });

  it('hides the whole Settings group when every settings permission is denied', () => {
    const settingsPermissions = new Set(
      NAV.Settings.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])])).map((i) => i.permissionId),
    );
    const nav = visibleNav((id) => !settingsPermissions.has(id));
    expect(nav.Settings).toBeUndefined();
    expect(nav.Discover).toBeDefined();
  });

  it('drops empty sections', () => {
    const nav = visibleNav((id) => id !== 'workflows' && id !== 'settings-workflows' && id !== 'settings-delivery' && id !== 'audit');
    expect(nav.Settings.map((s) => s.titleKey)).not.toContain('shell:sections.process');
  });
});

describe('visibleNav maturity', () => {
  const gaOnly = (m: string) => m === 'ga';
  const everything = () => true;

  it('hides alpha items unless alpha is allowed', () => {
    const hidden = visibleNav(() => true, gaOnly);
    expect(itemIds(hidden, 'Govern')).not.toContain('security-features');
    expect(itemIds(hidden, 'Govern')).not.toContain('entitlements-menu'); // both sub-items are alpha
    expect(hidden.Deploy).toBeUndefined(); // estate-manager, catalog-commander

    const shown = visibleNav(() => true, (m) => m === 'ga' || m === 'alpha');
    expect(itemIds(shown, 'Govern')).toContain('security-features');
    expect(itemIds(shown, 'Deploy')).toEqual(['estate-manager', 'catalog-commander']);
  });

  it('treats items without a feature as ga', () => {
    const nav = visibleNav(() => true, gaOnly);
    expect(itemIds(nav, 'Settings')).toContain('general');
    expect(nav.Build.flatMap((s) => s.items).find((i) => i.id === 'concepts')?.children).toHaveLength(6);
  });

  it('applies on top of the permission check', () => {
    const nav = visibleNav((id) => id !== 'security-features', everything);
    expect(itemIds(nav, 'Govern')).not.toContain('security-features');
  });
});

describe('activeLocation', () => {
  it('finds a settings sub-item', () => {
    expect(activeLocation('/settings/business-roles')).toEqual({
      group: 'Settings',
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

  it('only matches whole path segments', () => {
    expect(activeLocation('/assetsx')).toBeNull();
    expect(activeLocation('/')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import i18n from '@/i18n/config';
import { SETTINGS_GATE, activeLocation, locateIn, visibleNav, type NavGroupId } from './nav-config';
import {
  buildTrail,
  navKind,
  pageCrumbs,
  storable,
  trailCrumbs,
  type Crumb,
  type NavKind,
  type PageTitles,
  type TrailRecord,
} from './breadcrumb-trail';
import { collapseTrail } from '@/mantine/page/collapse-trail';

const label = (key: string) => i18n.t(key);

/** The menu as a user sees it: everything, or without the Settings gate. */
function navFor(settingsGate = true) {
  return visibleNav((id) => settingsGate || id !== SETTINGS_GATE);
}

interface Visit {
  path: string;
  page?: PageTitles;
  kind?: NavKind;
  navGroup?: NavGroupId;
  settingsGate?: boolean;
  previous?: TrailRecord | null;
  stored?: TrailRecord | null;
  crumbIndex?: number;
}

function visit({ path, page, kind = 'menu', navGroup, settingsGate = true, previous = null, stored = null, crumbIndex }: Visit): TrailRecord {
  const [pathname, query] = path.split('?');
  const search = query ? `?${query}` : '';
  const nav = navFor(settingsGate);
  const located = (navGroup && locateIn(navGroup, pathname, search)) || activeLocation(pathname, search);
  const here = located && nav[located.group] ? located : null;
  return buildTrail({ pathname, search, nav, here, settingsGate, page, label, kind, previous, stored, crumbIndex });
}

const text = (record: TrailRecord) => trailCrumbs(record).map((c) => c.label).join(' > ');
const own = (v: Visit) => {
  const record = visit(v);
  return record.current.crumbs;
};
const links = (crumbs: Crumb[]) => crumbs.map((c) => c.to ?? null);

describe('pageCrumbs: the hierarchy from the menu', () => {
  it('gives a sub-item its group and parent: Home > Semantics > Levels > Certification', () => {
    expect(text(visit({ path: '/settings/certification-levels' }))).toBe('Home > Semantics > Levels > Certification');
  });

  it('gives a top-level item its group: Home > Discover > Marketplace', () => {
    expect(text(visit({ path: '/marketplace' }))).toBe('Home > Discover > Marketplace');
  });

  it('keeps the default child on its own page: Home > Build > Assets > Explorer', () => {
    expect(text(visit({ path: '/assets' }))).toBe('Home > Build > Assets > Explorer');
  });

  it('gives Collections its place under Concepts: Home > Build > Concepts > Collections', () => {
    expect(text(visit({ path: '/concepts/collections' }))).toBe('Home > Build > Concepts > Collections');
  });

  it('gives Settings pages the Settings group: Home > Settings > General', () => {
    expect(text(visit({ path: '/settings/general' }))).toBe('Home > Settings > General');
  });

  it('links the group to its default page and the item to its path', () => {
    const crumbs = own({ path: '/marketplace' });
    expect(links(crumbs)).toEqual(['/', '/marketplace', '/marketplace']);
    expect(links(own({ path: '/assets' }))).toEqual(['/', '/assets', '/assets', '/assets']);
  });

  it('leaves a parent with no path or default child as plain text (Levels)', () => {
    const crumbs = own({ path: '/settings/maturity-levels' });
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'Semantics', 'Levels', 'Maturity']);
    expect(crumbs[2].to).toBeUndefined();
  });

  it('links a parent with a default child to that child (Data Contracts → Explorer)', () => {
    const crumbs = own({ path: '/data-contracts?new=1' });
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'Build', 'Data Contracts', 'New Contract']);
    expect(crumbs[2].to).toBe('/data-contracts');
  });

  it('leaves the Settings group crumb as plain text: it has no default page', () => {
    expect(own({ path: '/settings/general' })[1]).toEqual({ label: 'Settings', role: 'group' });
  });

  it('puts the Govern and Deploy sections under Settings, with no section crumb', () => {
    expect(text(visit({ path: '/compliance' }))).toBe('Home > Settings > Compliance');
    expect(text(visit({ path: '/estate-manager' }))).toBe('Home > Settings > Estate Manager');
  });

  it('reads Govern for a user without the Settings gate', () => {
    expect(text(visit({ path: '/compliance', settingsGate: false }))).toBe('Home > Govern > Compliance');
  });

  it('keeps the group a menu navigation was made in (Build → Asset types)', () => {
    expect(text(visit({ path: '/settings/asset-types', navGroup: 'Build' }))).toBe('Home > Build > Assets > Asset types');
    expect(text(visit({ path: '/settings/asset-types' }))).toBe('Home > Semantics > Asset types');
  });

  it('shows a link group (Workflows) as one crumb, with its pages under it', () => {
    expect(text(visit({ path: '/settings/workflows' }))).toBe('Home > Workflows');
    expect(
      text(visit({ path: '/settings/workflows/w1', page: { staticSegments: [{ label: 'Workflows', path: '/workflows' }], dynamicTitle: 'Review' } })),
    ).toBe('Home > Workflows > Review');
  });

  it("ignores a menu page's own titles from the store: they repeat the item", () => {
    const page = { staticSegments: [{ label: 'Data Contracts', path: '/data-contracts' }], dynamicTitle: 'Data Contracts' };
    expect(text(visit({ path: '/data-contracts', page }))).toBe('Home > Build > Data Contracts > Explorer');
  });

  it("adds a page's trailing segments, even on a menu page (the explorer's tree path)", () => {
    const onSelect = () => {};
    const page = { trailingSegments: [{ label: 'Unity Catalog', onSelect }, { label: 'insights' }] };
    const crumbs = own({ path: '/assets', page });
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'Build', 'Assets', 'Explorer', 'Unity Catalog', 'insights']);
    expect(crumbs[4].onSelect).toBe(onSelect);
  });
});

describe('pageCrumbs: detail pages', () => {
  const contract = { staticSegments: [{ label: 'Data Contracts', path: '/data-contracts' }], dynamicTitle: 'Orders' };

  it("takes its nav ancestor's crumbs and adds the entity: Home > Build > Data Contracts > Orders", () => {
    const record = visit({ path: '/data-contracts/c1', page: contract });
    expect(text(record)).toBe('Home > Build > Data Contracts > Orders');
    expect(trailCrumbs(record)[3].to).toBe('/data-contracts/c1');
  });

  it('leaves the entity out while its name loads, never showing the id', () => {
    const record = visit({ path: '/data-contracts/c1', page: { ...contract, dynamicTitle: null } });
    expect(text(record)).toBe('Home > Build > Data Contracts');
    expect(text(record)).not.toContain('c1');
  });

  it('folds a child at its parent\'s own path under a detail page: Home > Build > Products > Sales orders', () => {
    const page = { staticSegments: [{ label: 'Data Products', path: '/data-products' }], dynamicTitle: 'Sales orders' };
    expect(text(visit({ path: '/data-products/p1', page }))).toBe('Home > Build > Products > Sales orders');
    expect(text(visit({ path: '/data-products' }))).toBe('Home > Build > Products > All products');
  });

  it('falls back to the page title it is given when the store has none', () => {
    const record = buildTrail({
      pathname: '/security-features', nav: {}, here: null, settingsGate: true, label, kind: 'menu', previous: null, stored: null,
      fallbackTitle: 'Security Features',
    });
    expect(text(record)).toBe('Home > Security Features');
  });

  it('drops store segments that repeat the hierarchy, Home included', () => {
    const page = { staticSegments: [{ label: 'Home', path: '/' }, { label: 'Data Catalog', path: '/data-catalog' }], dynamicTitle: 'main.sales.orders' };
    expect(text(visit({ path: '/data-catalog/main.sales.orders', page }))).toBe('Home > Discover > Data Catalog > main.sales.orders');
  });

  it('keeps a store segment the hierarchy does not show', () => {
    const page = { staticSegments: [{ label: 'Policies', path: '/compliance/policies' }], dynamicTitle: 'PII check' };
    expect(text(visit({ path: '/compliance/policies/p1', page }))).toBe('Home > Settings > Compliance > Policies > PII check');
  });

  it('places a page outside the menu under the menu page its store names', () => {
    const page = { staticSegments: [{ label: 'Estate Manager', path: '/estate-manager' }], dynamicTitle: 'Partner estate' };
    expect(text(visit({ path: '/estates/e1', page }))).toBe('Home > Settings > Estate Manager > Partner estate');
  });
});

describe('pageCrumbs: pages in no group', () => {
  it('shows Home > {page title}', () => {
    expect(text(visit({ path: '/about', page: { dynamicTitle: 'About' } }))).toBe('Home > About');
    expect(text(visit({ path: '/owner-consumers', page: { staticSegments: [{ label: 'Owners and consumers' }] } }))).toBe(
      'Home > Owners and consumers',
    );
  });

  it('shows just Home on Home, whatever the store says', () => {
    expect(text(visit({ path: '/', page: { dynamicTitle: 'Stale title' } }))).toBe('Home');
  });

  it('shows Home on a page with no title yet', () => {
    expect(pageCrumbs({ pathname: '/nowhere', nav: navFor(), here: null, settingsGate: true, label }).map((c) => c.label)).toEqual(['Home']);
  });
});

describe('the trail: following the user', () => {
  const contract = { staticSegments: [{ label: 'Data Contracts', path: '/data-contracts' }], dynamicTitle: 'Orders' };
  const domain = { staticSegments: [{ label: 'Data Domains', path: '/settings/data-domains' }], dynamicTitle: 'Finance' };
  const atContract = () => visit({ path: '/data-contracts/c1', page: contract, previous: visit({ path: '/data-contracts' }), kind: 'push' });
  const atDomain = () => visit({ path: '/settings/data-domains/d1', page: domain, previous: atContract(), kind: 'push' });

  it("replaces a list with its detail page: the list is the detail's parent", () => {
    expect(text(atContract())).toBe('Home > Build > Data Contracts > Orders');
  });

  it("extends the trail on an in-page link: the owner's contract to its domain", () => {
    const record = atDomain();
    expect(text(record)).toBe('Home > Build > Data Contracts > Orders > Data domains > Finance');
    // Every crumb but the current page links back
    expect(links(trailCrumbs(record))).toEqual([
      '/', '/assets', '/data-contracts', '/data-contracts/c1', '/settings/data-domains', '/settings/data-domains/d1',
    ]);
  });

  it('resets the trail to the hierarchy on a menu navigation', () => {
    expect(text(visit({ path: '/settings/data-domains/d1', page: domain, previous: atContract(), kind: 'menu' }))).toBe(
      'Home > Organization > Data domains > Finance',
    );
  });

  it('cuts the trail after a crumb that is clicked', () => {
    // Data domains is crumb 4 of the domain's trail
    const cut = visit({ path: '/settings/data-domains', previous: atDomain(), kind: 'crumb', crumbIndex: 4 });
    expect(text(cut)).toBe('Home > Build > Data Contracts > Orders > Data domains');
    // A crumb of the first page's hierarchy goes back to it
    const back = visit({ path: '/data-contracts/c1', page: contract, previous: atDomain(), kind: 'crumb', crumbIndex: 3 });
    expect(text(back)).toBe('Home > Build > Data Contracts > Orders');
    expect(text(visit({ path: '/', previous: atDomain(), kind: 'crumb', crumbIndex: 0 }))).toBe('Home');
  });

  it('restores the trail stored with a history entry on back and forward', () => {
    const stored = storable(atDomain());
    const restored = visit({ path: '/settings/data-domains/d1', page: domain, previous: visit({ path: '/marketplace' }), kind: 'pop', stored });
    expect(text(restored)).toBe('Home > Build > Data Contracts > Orders > Data domains > Finance');
    // With nothing stored (a typed URL), the hierarchy
    expect(text(visit({ path: '/settings/data-domains/d1', page: domain, previous: atContract(), kind: 'pop' }))).toBe(
      'Home > Organization > Data domains > Finance',
    );
  });

  it('cuts the trail back to a page already in it, rather than repeating it', () => {
    const again = visit({ path: '/data-contracts/c1', page: contract, previous: atDomain(), kind: 'push' });
    expect(text(again)).toBe('Home > Build > Data Contracts > Orders');
    const project = visit({ path: '/settings/projects/p1', page: { dynamicTitle: 'Alpha' }, previous: atDomain(), kind: 'push' });
    const domainAgain = visit({ path: '/settings/data-domains/d1', page: domain, previous: project, kind: 'push' });
    expect(text(domainAgain)).toBe('Home > Build > Data Contracts > Orders > Data domains > Finance');
  });

  it('does not add a crumb on a redirect or replace: the new page takes the last one', () => {
    // A redirect on arrival: just the target's hierarchy
    const typed = visit({ path: '/data-domains', kind: 'pop' });
    expect(text(visit({ path: '/settings/data-domains', previous: typed, kind: 'replace' }))).toBe('Home > Organization > Data domains');
    // A replace after an in-page link: it takes that page's place
    const replaced = visit({ path: '/settings/teams/t1', page: { dynamicTitle: 'Platform team' }, previous: atDomain(), kind: 'replace' });
    expect(text(replaced)).toBe('Home > Build > Data Contracts > Orders > Teams > Platform team');
  });

  it('leaves out leading crumbs of the new page that the trail already shows', () => {
    const other = visit({ path: '/data-contracts/c2', page: { ...contract, dynamicTitle: 'Returns' }, previous: atDomain(), kind: 'push' });
    expect(text(other)).toBe('Home > Build > Data Contracts > Orders > Data domains > Finance > Returns');
  });

  it('keeps no actions in a stored trail', () => {
    const record = visit({ path: '/assets', page: { trailingSegments: [{ label: 'Unity Catalog', onSelect: () => {} }] } });
    expect(trailCrumbs(storable(record)).some((c) => 'onSelect' in c)).toBe(false);
    expect(JSON.parse(JSON.stringify(storable(record)))).toEqual(storable(record));
  });
});

describe('navKind', () => {
  it('tells back and forward first, then the menu and crumbs by their state, then replace and push', () => {
    expect(navKind('POP', { nav: 'menu', navGroup: 'Build' })).toBe('pop');
    expect(navKind('PUSH', { nav: 'menu', navGroup: 'Build' })).toBe('menu');
    expect(navKind('PUSH', { nav: 'crumb', crumbIndex: 1 })).toBe('crumb');
    expect(navKind('REPLACE', null)).toBe('replace');
    expect(navKind('PUSH', null)).toBe('push');
    expect(navKind('PUSH', { other: true })).toBe('push');
  });
});

describe('collapseTrail', () => {
  const crumbs = (n: number): Crumb[] => Array.from({ length: n }, (_, i) => ({ label: `c${i}` }));

  it('keeps a trail of up to six crumbs whole', () => {
    expect(collapseTrail(crumbs(6))).toEqual({ collapsed: false, crumbs: crumbs(6) });
  });

  it('collapses the middle of a longer one, keeping Home and the last four', () => {
    const result = collapseTrail(crumbs(9));
    expect(result).toEqual({ collapsed: true, head: { label: 'c0' }, hidden: crumbs(5).slice(1), tail: crumbs(9).slice(5) });
  });
});

import { describe, expect, it } from 'vitest';
import i18n from '@/i18n/config';
import { FeatureAccessLevel } from '@/types/settings';
import { SETTINGS_GATE, activeLocation, locateIn, visibleNav, type NavGroupId } from './nav-config';
import {
  buildTrail,
  withLiveCrumbs,
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
  return buildTrail({ pathname, search, nav, here, page, label, kind, previous, stored, crumbIndex });
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
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'Build', 'Data Contracts', 'Create Contract']);
    expect(crumbs[2].to).toBe('/data-contracts');
  });

  it('leaves the Settings group crumb as plain text: it has no default page', () => {
    expect(own({ path: '/settings/general' })[1]).toEqual({ label: 'Settings', role: 'group', group: 'Settings' });
  });

  it('puts the Govern and Deploy sections under Govern, with no section crumb', () => {
    expect(text(visit({ path: '/compliance' }))).toBe('Home > Govern > Compliance');
    expect(text(visit({ path: '/estate-manager' }))).toBe('Home > Govern > Estate Manager');
  });

  it('reads Govern the same for a user without the Settings gate', () => {
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

describe('pageCrumbs: a third menu level (Task 16e)', () => {
  // What the Define page tells the store about itself (views/define.tsx)
  const definePage = { staticSegments: [{ label: 'Concepts', path: '/concepts' }, { label: 'Define', path: '/concepts/define' }] };

  it.each([
    ['author', 'Author Concepts'],
    ['generate', 'Generate Ontology'],
    ['import', 'Import RDF'],
  ])('gives ?open=%s its place under Define: Home > Build > Concepts > Define > %s', (open, name) => {
    const crumbs = own({ path: `/concepts/define?open=${open}`, page: definePage });
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'Build', 'Concepts', 'Define', name]);
    expect(links(crumbs)).toEqual(['/', '/assets', '/concepts', '/concepts/define', `/concepts/define?open=${open}`]);
  });

  it('keeps Home > Build > Concepts > Define on the plain page', () => {
    expect(text(visit({ path: '/concepts/define', page: definePage }))).toBe('Home > Build > Concepts > Define');
    expect(text(visit({ path: '/concepts/define?open=nonsense', page: definePage }))).toBe('Home > Build > Concepts > Define');
  });

  it('shows Define for a reader, who has no Author Concepts in the menu', () => {
    const nav = visibleNav((id, level) => id === 'semantic-models' && level === FeatureAccessLevel.READ_ONLY);
    const here = activeLocation('/concepts/define', '?open=author');
    const crumbs = pageCrumbs({ pathname: '/concepts/define', search: '?open=author', nav, here, page: definePage, label });
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'Build', 'Concepts', 'Define']);
  });

  it('starts over from the menu, and goes back to Define when the dialog closes (replace)', () => {
    const define = visit({ path: '/concepts/define', page: definePage });
    const author = visit({ path: '/concepts/define?open=author', page: definePage, kind: 'menu', navGroup: 'Build', previous: define });
    expect(text(author)).toBe('Home > Build > Concepts > Define > Author Concepts');
    const closed = visit({ path: '/concepts/define', page: definePage, kind: 'replace', previous: author });
    expect(text(closed)).toBe('Home > Build > Concepts > Define');
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
      pathname: '/security-features', nav: {}, here: null, label, kind: 'menu', previous: null, stored: null,
      fallbackTitle: 'Security Features',
    });
    expect(text(record)).toBe('Home > Security Features');
  });

  it('keeps an entity named like its own list (a domain named Data domains)', () => {
    const page = { staticSegments: [{ label: 'Data Domains', path: '/settings/data-domains' }], dynamicTitle: 'Data domains' };
    expect(text(visit({ path: '/settings/data-domains/d1', page }))).toBe('Home > Organization > Data domains > Data domains');
  });

  it('marks a group crumb with its group, for the breadcrumb to go there as the menu does', () => {
    expect(own({ path: '/settings/data-domains/d1', page: { dynamicTitle: 'Finance' } })[1]).toMatchObject({ role: 'group', group: 'Organization' });
  });

  it('keeps an entity named like a crumb above it (the title is compared by path)', () => {
    const page = { staticSegments: [{ label: 'Data Domains', path: '/settings/data-domains' }], dynamicTitle: 'Organization' };
    expect(text(visit({ path: '/settings/data-domains/d1', page }))).toBe('Home > Organization > Data domains > Organization');
  });

  it('drops store segments that repeat the hierarchy, Home included', () => {
    const page = { staticSegments: [{ label: 'Home', path: '/' }, { label: 'Data Catalog', path: '/data-catalog' }], dynamicTitle: 'main.sales.orders' };
    expect(text(visit({ path: '/data-catalog/main.sales.orders', page }))).toBe('Home > Discover > Data Catalog > main.sales.orders');
  });

  it('keeps a store segment the hierarchy does not show', () => {
    const page = { staticSegments: [{ label: 'Policies', path: '/compliance/policies' }], dynamicTitle: 'PII check' };
    expect(text(visit({ path: '/compliance/policies/p1', page }))).toBe('Home > Govern > Compliance > Policies > PII check');
  });

  it('places a page outside the menu under the menu page its store names', () => {
    const page = { staticSegments: [{ label: 'Estate Manager', path: '/estate-manager' }], dynamicTitle: 'Partner estate' };
    expect(text(visit({ path: '/estates/e1', page }))).toBe('Home > Govern > Estate Manager > Partner estate');
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
    expect(pageCrumbs({ pathname: '/nowhere', nav: navFor(), here: null, label }).map((c) => c.label)).toEqual(['Home']);
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

  it('cuts a crumb click right after the crumb, where an in-page link to the same page would not', () => {
    // A parent crumb: just up to Data Contracts, not the list's own hierarchy
    // (an in-page link to the list gives its place: … > Data Contracts > Explorer)
    const parent = visit({ path: '/data-contracts', previous: atDomain(), kind: 'crumb', crumbIndex: 2 });
    expect(text(parent)).toBe('Home > Build > Data Contracts');
    expect(text(visit({ path: '/data-contracts', previous: atDomain(), kind: 'push' }))).toBe('Home > Build > Data Contracts > Explorer');
    // A later of two crumbs to the same page: the trail is cut there, not at the first
    const returns = visit({ path: '/data-contracts/c2', page: { ...contract, dynamicTitle: 'Returns' }, previous: atDomain(), kind: 'push' });
    expect(text(returns)).toBe('Home > Build > Data Contracts > Orders > Data domains > Finance > Data Contracts > Returns');
    const list = visit({ path: '/data-contracts', previous: returns, kind: 'crumb', crumbIndex: 6 });
    expect(text(list)).toBe('Home > Build > Data Contracts > Orders > Data domains > Finance > Data Contracts');
    // Without a crumb index the click is an ordinary link
    expect(text(visit({ path: '/data-contracts', previous: returns, kind: 'crumb' }))).toBe(text(visit({ path: '/data-contracts', previous: returns, kind: 'push' })));
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

  it('leaves out leading crumbs the previous page already shows, and only those', () => {
    // From the domain, a contract: its Data Contracts crumb stays (Returns isn't Finance's)
    const returns = visit({ path: '/data-contracts/c2', page: { ...contract, dynamicTitle: 'Returns' }, previous: atDomain(), kind: 'push' });
    expect(text(returns)).toBe('Home > Build > Data Contracts > Orders > Data domains > Finance > Data Contracts > Returns');
    // From that contract, another: a sibling, after it
    const refunds = visit({ path: '/data-contracts/c3', page: { ...contract, dynamicTitle: 'Refunds' }, previous: returns, kind: 'push' });
    expect(text(refunds)).toBe('Home > Build > Data Contracts > Orders > Data domains > Finance > Data Contracts > Returns > Refunds');
  });

  it("doesn't take a group's default page for the parent of every page in the group", () => {
    // From the Explorer (Build's default page), a contract follows it
    const fromExplorer = visit({ path: '/data-contracts/c1', page: contract, previous: visit({ path: '/assets' }), kind: 'push' });
    expect(text(fromExplorer)).toBe('Home > Build > Assets > Explorer > Data Contracts > Orders');
  });

  it("keeps a page's live crumbs after a crumb click: its in-page crumbs and its renamed entity", () => {
    const cut = visit({ path: '/data-contracts/c1', page: contract, previous: atDomain(), kind: 'crumb', crumbIndex: 3 });
    expect(text(cut)).toBe('Home > Build > Data Contracts > Orders');
    // The page then selects something within it, and is renamed
    const own = pageCrumbs({
      pathname: '/data-contracts/c1', nav: navFor(), here: activeLocation('/data-contracts/c1'), label,
      page: { ...contract, dynamicTitle: 'Orders v2', trailingSegments: [{ label: 'Schema' }, { label: 'order_id' }] },
    });
    expect(text(withLiveCrumbs(cut, own))).toBe('Home > Build > Data Contracts > Orders v2 > Schema > order_id');
    // A crumb within the page's own in-page crumbs gives way to the page's live ones
    const explorer = visit({ path: '/assets', page: { trailingSegments: [{ label: 'Unity Catalog', path: '/assets?node=uc' }, { label: 'main' }] } });
    const toUc = visit({ path: '/assets', previous: explorer, kind: 'crumb', crumbIndex: 4 });
    const live = pageCrumbs({ pathname: '/assets', nav: navFor(), here: activeLocation('/assets'), label, page: { trailingSegments: [{ label: 'Unity Catalog' }] } });
    expect(text(withLiveCrumbs(toUc, live))).toBe('Home > Build > Assets > Explorer > Unity Catalog');
  });

  it('keeps the first page and the last nine steps of a long trail', () => {
    let record = atDomain();
    for (let i = 0; i < 12; i++) {
      record = visit({ path: `/settings/projects/p${i}`, page: { dynamicTitle: `P${i}` }, previous: record, kind: 'push' });
    }
    const steps = [...record.base, record.current];
    expect(steps).toHaveLength(10);
    // The gap the cap left is marked, after the first page, and kept in history
    expect(steps.map((st) => !!st.gapBefore)).toEqual([false, true, false, false, false, false, false, false, false, false]);
    expect(storable(record).base[1].gapBefore).toBe(true);
    expect(trailCrumbs(record)[0].label).toBe('Home');
    // The first page, then the steps from P3 on (each project a sibling of the last)
    expect(text(record)).toBe('Home > Build > Data Contracts > Orders > P3 > P4 > P5 > P6 > P7 > P8 > P9 > P10 > P11');
    // Folded, it still shows main and the sub-topic, then the last two pages
    const folded = collapseTrail(trailCrumbs(record));
    expect(folded.collapsed && [...folded.head, { label: '…' }, ...folded.tail].map((c) => c.label)).toEqual([
      'Home', 'Build', 'Data Contracts', '…', 'P10', 'P11',
    ]);
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
    expect(collapseTrail(crumbs(3))).toEqual({ collapsed: false, crumbs: crumbs(3) });
  });

  it('folds a longer one between the sub-topic and the previous page (the owner, 2026-11-10)', () => {
    // Home > main > sub-topic > … > previous page > current page
    expect(collapseTrail(crumbs(9))).toEqual({
      collapsed: true, head: crumbs(3), hidden: crumbs(7).slice(3), tail: crumbs(9).slice(7),
    });
    // Seven: just one past the threshold, two folded
    expect(collapseTrail(crumbs(7))).toEqual({
      collapsed: true, head: crumbs(3), hidden: crumbs(5).slice(3), tail: crumbs(7).slice(5),
    });
  });
});

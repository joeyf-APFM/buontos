/**
 * The shell's breadcrumb, as data (Task 16d): the current page's crumbs from
 * the menu (nav-config.ts) and the page's own titles (stores/breadcrumb-store),
 * and the trail that follows the user's path from page to page.
 *
 * A trail is a list of steps, one per page along the path; the first step is
 * a page's full hierarchy (Home, its group, …), each later one only that
 * page's crumbs after its group. The trail shown is the steps' crumbs, in
 * order; the last is the current page.
 */
import {
  NAV_GROUPS,
  activeLocation,
  groupDefaultPath,
  groupFace,
  type ActiveLocation,
  type NavGroupId,
  type NavItem,
  type NavSection,
} from './nav-config';

export interface Crumb {
  label: string;
  /** Where the crumb links (the last crumb, the current page, is plain text). */
  to?: string;
  /** Instead of a link: an action within the page (the explorer's tree path). Not kept in history. */
  onSelect?: () => void;
  /** The Home crumb, or the group's: a later step leaves them out. */
  role?: 'home' | 'group';
}

export interface TrailStep {
  /** The page this step stands for. */
  pathname: string;
  crumbs: Crumb[];
}

/** What the page says about itself through the breadcrumb store. */
export interface PageTitles {
  staticSegments?: { label: string; path?: string; onSelect?: () => void }[];
  dynamicTitle?: string | null;
  /** Crumbs within the page, after its own, on any page (setTrailingSegments). */
  trailingSegments?: { label: string; path?: string; onSelect?: () => void }[];
}

export interface PageCrumbsInput {
  pathname: string;
  search?: string;
  /** The menu as this user sees it (visibleNav). */
  nav: Partial<Record<NavGroupId, NavSection[]>>;
  /** The page's place in the menu, in a group the user sees (the shell's `here`), or null. */
  here: ActiveLocation | null;
  settingsGate: boolean;
  page?: PageTitles;
  /** An i18n key's text. */
  label: (key: string) => string;
  /** The page's title when its store gives none (a feature's name, from its route). */
  fallbackTitle?: string | null;
}

const pathOf = (to: string) => to.split(/[?#]/)[0];
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function findItem(sections: NavSection[], itemId: string): NavItem | undefined {
  return sections.flatMap((s) => s.items).find((i) => i.id === itemId);
}

/** The menu's crumbs for a place in it: Home, group, parent and item. `exact`: the page is the item's own. */
function hierarchy(here: ActiveLocation, input: PageCrumbsInput, exact: boolean): Crumb[] | null {
  const group = NAV_GROUPS.find((g) => g.id === here.group);
  const sections = input.nav[here.group];
  const item = sections && findItem(sections, here.itemId);
  if (!group || !sections || !item) return null;
  const { label } = input;
  const home: Crumb = { label: label('shell:breadcrumb.home'), to: '/', role: 'home' };
  const groupLabel = label(groupFace(group, input.settingsGate).labelKey);
  // A link group (Workflows) is its one item: the page's own crumb, kept in a later step
  if (group.link) return [home, { label: groupLabel, to: group.link }];
  const crumbs: Crumb[] = [home, { label: groupLabel, to: groupDefaultPath(group, sections) ?? undefined, role: 'group' }];
  const child = here.childId ? item.children?.find((c) => c.id === here.childId) : undefined;
  if (!child) return [...crumbs, { label: label(item.labelKey), to: item.path }];
  const parentTo = item.path ?? item.children?.find((c) => c.id === item.defaultChildId)?.path;
  crumbs.push({ label: label(item.labelKey), to: parentTo });
  // Below the page, the parent stands for its default child, or the child at
  // its own path (Data Contracts, not … > Explorer; Products, not … > All products)
  const standsForParent = child.id === item.defaultChildId || (!!child.path && child.path === item.path);
  if (exact || !standsForParent) crumbs.push({ label: label(child.labelKey), to: child.path });
  return crumbs;
}

/** The path of the place's deepest item, to tell its own page from the pages under it. */
function placePath(here: ActiveLocation, nav: PageCrumbsInput['nav']): string | undefined {
  const item = findItem(nav[here.group] ?? [], here.itemId);
  const child = here.childId ? item?.children?.find((c) => c.id === here.childId) : undefined;
  return (child ?? item)?.path;
}

/**
 * The current page's own crumbs, from Home:
 * - a menu page: `Home > {group} > {parent} > {item}`;
 * - a page under one (a detail page): its nav ancestor's crumbs, then the
 *   page's titles from the store, after any that repeat those crumbs;
 * - a page in no group: `Home > {its titles}`; Home itself: `Home`.
 * A store title still loading is left out. The page's trailing segments end it.
 */
export function pageCrumbs(input: PageCrumbsInput): Crumb[] {
  const { pathname, search = '', page = {}, label } = input;
  const url = pathname + search;
  const home: Crumb = { label: label('shell:breadcrumb.home'), to: '/', role: 'home' };
  const trailing = (page.trailingSegments ?? []).map((s) => ({ label: s.label, to: s.path, onSelect: s.onSelect }));
  if (pathname === '/') return [home, ...trailing];

  let crumbs: Crumb[] | null = null;
  let extras = page.staticSegments ?? [];
  if (input.here) {
    const own = placePath(input.here, input.nav);
    const exact = own !== undefined && pathOf(own) === pathname;
    crumbs = hierarchy(input.here, input, exact);
    // The menu page itself: its titles are the item's, already shown
    if (crumbs && exact) return withCurrent([...crumbs, ...trailing], url);
  } else {
    // A page outside the menu whose store names a menu page above it
    // (an estate under Estate manager) takes that page's place
    for (let i = extras.length - 1; i >= 0 && !crumbs; i--) {
      const path = extras[i].path;
      const found = path && path !== '/' ? activeLocation(pathOf(path)) : null;
      if (found && input.nav[found.group]) {
        crumbs = hierarchy(found, input, true);
        if (crumbs) extras = extras.slice(i + 1);
      }
    }
  }
  crumbs ??= [home];

  const shown = (c: { label: string; path?: string }) =>
    !crumbs!.some((k) => same(k.label, c.label) || (c.path && k.to && pathOf(k.to) === pathOf(c.path))) &&
    c.path !== '/';
  const middle = extras.filter(shown).map((s) => ({ label: s.label, to: s.path, onSelect: s.onSelect }));
  const all = [...crumbs, ...middle];
  const title = (page.dynamicTitle || (middle.length === 0 ? input.fallbackTitle : null))?.trim();
  if (title && !all.some((c) => same(c.label, title))) all.push({ label: title });
  return withCurrent([...all, ...trailing], url);
}

/** The page's last crumb, if it has no link, links to the page, for when a later step follows it. */
function withCurrent(crumbs: Crumb[], url: string): Crumb[] {
  const last = crumbs[crumbs.length - 1];
  if (!last || last.to || last.onSelect) return crumbs;
  return [...crumbs.slice(0, -1), { ...last, to: url }];
}

/**
 * How the user reached the page: the side menu, a crumb, back or forward
 * (`pop`, also a typed URL or a reload), a replace (a redirect), or any other
 * link in a page (`push`).
 */
export type NavKind = 'menu' | 'crumb' | 'pop' | 'replace' | 'push';

/** The router state a breadcrumb navigation carries: the crumb's place in the trail. */
export interface CrumbNavState {
  nav: 'crumb';
  crumbIndex: number;
}

export const crumbNavState = (crumbIndex: number): CrumbNavState => ({ nav: 'crumb', crumbIndex });

/** The kind of a navigation, from React Router's type and the location's state. */
export function navKind(navigationType: 'POP' | 'PUSH' | 'REPLACE', state: unknown): NavKind {
  // Back and forward come first: they bring back the entry's own state
  if (navigationType === 'POP') return 'pop';
  const nav = (state as { nav?: unknown } | null)?.nav;
  if (nav === 'menu') return 'menu';
  if (nav === 'crumb') return 'crumb';
  return navigationType === 'REPLACE' ? 'replace' : 'push';
}

/** A page's trail: the steps before it (`base`) and its own. */
export interface TrailRecord {
  base: TrailStep[];
  current: TrailStep;
}

export const allSteps = (record: TrailRecord): TrailStep[] => [...record.base, record.current];
export const trailCrumbs = (record: TrailRecord): Crumb[] => allSteps(record).flatMap((s) => s.crumbs);

/**
 * The steps before a page, as it arrives: from the previous page's trail
 * (`previous`) or, for back and forward, the one stored with the history
 * entry (`stored`). Attach the page's crumbs with `attachPage`.
 */
export function priorSteps(kind: NavKind, previous: TrailRecord | null, stored: TrailRecord | null, crumbIndex?: number): TrailStep[] {
  switch (kind) {
    case 'menu':
      return [];
    case 'pop':
      return stored?.base ?? [];
    case 'replace':
      // A redirect takes the previous page's place
      return previous?.base ?? [];
    case 'crumb': {
      if (!previous) return [];
      const steps = allSteps(previous);
      let start = 0;
      const k = steps.findIndex((s) => {
        start += s.crumbs.length;
        return crumbIndex !== undefined && crumbIndex < start;
      });
      // Within the first step: back to the hierarchy; otherwise cut before the crumb's step
      return k <= 0 ? [] : steps.slice(0, k);
    }
    case 'push':
      return previous ? allSteps(previous) : [];
  }
}

/**
 * The page's place after the steps before it:
 * - no steps before: the page's full crumbs;
 * - a page already in the trail (same pathname): the trail goes back to it;
 * - a page under the previous one (a list's detail page): it takes the
 *   previous page's place;
 * - otherwise the trail grows by the page's crumbs after its group, less
 *   any leading ones the trail already shows.
 */
export function attachPage(prior: TrailStep[], pathname: string, own: Crumb[]): TrailRecord {
  if (prior.length === 0) return { base: [], current: { pathname, crumbs: own } };
  const has = (s: TrailStep) => s.pathname === pathname || s.crumbs.some((c) => c.to && pathOf(c.to) === pathname);
  for (let k = prior.length - 1; k >= 0; k--) {
    if (has(prior[k])) return attachPage(prior.slice(0, k), pathname, own);
  }
  const last = prior[prior.length - 1];
  if (own.some((c) => c.to && pathOf(c.to) === last.pathname)) {
    return attachPage(prior.slice(0, -1), pathname, own);
  }
  const shown = new Set(prior.flatMap((s) => s.crumbs.flatMap((c) => (c.to ? [pathOf(c.to)] : []))));
  const tail = own.filter((c) => !c.role);
  let skip = 0;
  while (skip < tail.length - 1 && tail[skip].to && shown.has(pathOf(tail[skip].to!))) skip++;
  return { base: prior, current: { pathname, crumbs: tail.slice(skip) } };
}

/** Everything a page's trail depends on. */
export interface TrailInput extends PageCrumbsInput {
  kind: NavKind;
  /** The trail of the page the user came from. */
  previous: TrailRecord | null;
  /** The trail stored with this history entry (back, forward, reload). */
  stored: TrailRecord | null;
  /** For a crumb navigation: the crumb's index in the previous trail. */
  crumbIndex?: number;
}

/** The page's trail: where the user came from, then the page's own crumbs. */
export function buildTrail(input: TrailInput): TrailRecord {
  const prior = priorSteps(input.kind, input.previous, input.stored, input.crumbIndex);
  return attachPage(prior, input.pathname, pageCrumbs(input));
}

/** A trail as kept in history: links and labels only (no actions). */
export function storable(record: TrailRecord): TrailRecord {
  const step = (s: TrailStep): TrailStep => ({ pathname: s.pathname, crumbs: s.crumbs.map(({ onSelect: _onSelect, ...c }) => c) });
  return { base: record.base.map(step), current: step(record.current) };
}

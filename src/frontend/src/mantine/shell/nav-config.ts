/**
 * The shell's side menu: groups in strip order (Settings alone at the bottom),
 * each a list of items with optional sub-items. A group with a `link` is a
 * single strip button that goes to that page and opens no panel (Workflows).
 *
 * Ids, paths and permission ids come from config/features.ts and
 * components/settings/settings-layout.tsx. Every item is hidden without
 * READ_ONLY on its permission id, or the `level` it names (New Contract
 * needs READ_WRITE, as the page's own create button does).
 *
 * An item may have sub-items, and a sub-item its own (Build → Concepts →
 * Define → Author Concepts). A parent with children shows when any child
 * shows; with none, it shows as a plain page when its path is a page of its
 * own and its permission allows it (Define, for a user who can use none of
 * its children; not Entitlements, whose path is its child's page). Its own
 * `path` is kept only when its own permission allows it; without a path,
 * clicking the parent just expands it.
 *
 * Each group but Settings names a default page (`defaultItemId`), where its
 * strip button goes; a parent whose own page is one of its children names
 * that child (`defaultChildId`). Both are plain data, for the strip and the
 * breadcrumbs (groupDefaultPath).
 */
import {
  Activity,
  BookOpen,
  Bot,
  Box,
  Briefcase,
  Building2,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Contact,
  FilePlus2,
  FileTextIcon,
  FileUp,
  FolderKanban,
  FolderOpen,
  GitBranch,
  Globe,
  LayoutGrid,
  Library,
  Lock,
  Network,
  Package,
  Palette,
  PenLine,
  Plug2,
  Plus,
  ScrollText,
  Search,
  Settings,
  Shapes,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tags,
  Truck,
  UserCheck,
  UserCog,
  Users,
  WandSparkles,
  BoxSelect,
  RefreshCw,
  Compass,
  type LucideIcon,
} from 'lucide-react';
import { features, type FeatureMaturity } from '@/config/features';
import { FeatureAccessLevel } from '@/types/settings';

export type NavGroupId =
  | 'Discover'
  | 'Build'
  | 'Organization'
  | 'Semantics'
  | 'Workflows'
  | 'Settings';

export interface NavItem {
  id: string;
  labelKey: string;
  /** The page; it may carry a query (`/data-contracts?new=1`), matched as well. */
  path?: string;
  permissionId: string;
  /** The access the item needs on its permission id; READ_ONLY unless set. */
  level?: FeatureAccessLevel;
  icon: LucideIcon;
  children?: NavItem[];
  /** For a parent: the child that stands for it, at the parent's own path. */
  defaultChildId?: string;
}

export interface NavSection {
  titleKey?: string;
  items: NavItem[];
  /** Pages outside /settings/* in a settings-area group: shown without the Settings gate. */
  ungated?: boolean;
}

export interface NavGroup {
  id: NavGroupId;
  labelKey: string;
  icon: LucideIcon;
  /** A direct link: the strip button goes here and opens no panel. */
  link?: string;
  /**
   * The item (or sub-item) the strip button goes to when it opens the panel.
   * None for Settings: its button only opens the panel.
   */
  defaultItemId?: string;
  /**
   * Pages under /settings/*: hidden without the Settings area's gate, except
   * its `ungated` sections (Settings → Govern and Deploy).
   */
  settingsArea?: boolean;
  /**
   * The label and icon for a user without the Settings gate, who sees only
   * the group's ungated sections (Settings shows them as Govern).
   */
  withoutGate?: { labelKey: string; icon: LucideIcon };
}

/** The Workflows group's one item; the strip's Workflows button links to its path. */
const WORKFLOWS_ITEM = { id: 'workflows', labelKey: 'settings:tabs.workflows', path: '/settings/workflows', permissionId: 'settings-workflows', icon: GitBranch } satisfies NavItem;

// Strip order, top to bottom (Helix and Ontos follow Workflows; side-strip.tsx)
export const NAV_GROUPS: NavGroup[] = [
  { id: 'Discover', labelKey: 'navigation:groups.discover', icon: Compass, defaultItemId: 'marketplace' },
  { id: 'Build', labelKey: 'navigation:groups.build', icon: LayoutGrid, defaultItemId: 'explorer' },
  { id: 'Organization', labelKey: 'shell:sections.organization', icon: Building2, settingsArea: true, defaultItemId: 'data-domains' },
  { id: 'Semantics', labelKey: 'shell:sections.semantics', icon: Network, settingsArea: true, defaultItemId: 'semantic-models' },
  {
    id: 'Workflows', labelKey: 'settings:tabs.workflows', icon: GitBranch, link: WORKFLOWS_ITEM.path, settingsArea: true,
    defaultItemId: WORKFLOWS_ITEM.id,
  },
  {
    id: 'Settings', labelKey: 'settings:title', icon: Settings, settingsArea: true,
    withoutGate: { labelKey: 'navigation:groups.govern', icon: Shield },
  },
];

/** The groups whose strip button opens a panel (every group but a link). */
export function isPanelGroup(id: unknown): id is NavGroupId {
  return NAV_GROUPS.some((g) => g.id === id && !g.link);
}

/** The Settings area's own gate (SettingsLayout redirects home without it). */
export const SETTINGS_GATE = 'settings';

/** The label and icon a group's strip button and panel show to this user. */
export function groupFace(group: NavGroup, settingsGate: boolean): { labelKey: string; icon: LucideIcon } {
  return !settingsGate && group.withoutGate ? group.withoutGate : { labelKey: group.labelKey, icon: group.icon };
}

export const NAV: Record<NavGroupId, NavSection[]> = {
  Discover: [
    {
      items: [
        { id: 'marketplace', labelKey: 'shell:items.marketplace', path: '/marketplace', permissionId: 'data-products', icon: ShoppingCart },
        { id: 'search', labelKey: 'features:search.name', path: '/search', permissionId: 'search', icon: Search },
        { id: 'data-catalog', labelKey: 'shell:items.dataCatalog', path: '/data-catalog', permissionId: 'data-catalog', icon: BookOpen },
      ],
    },
  ],
  Build: [
    {
      items: [
        {
          id: 'assets', labelKey: 'shell:items.assets', path: '/assets', permissionId: 'assets', icon: Box, defaultChildId: 'explorer',
          children: [
            { id: 'explorer', labelKey: 'shell:items.explorer', path: '/assets', permissionId: 'assets', icon: Box },
            { id: 'asset-types', labelKey: 'shell:items.assetTypes', path: '/settings/asset-types', permissionId: 'settings-asset-types', icon: Shapes },
            { id: 'schema-importer', labelKey: 'shell:items.schemaImporter', path: '/schema-importer', permissionId: 'schema-importer', icon: Plug2 },
          ],
        },
        {
          id: 'concepts', labelKey: 'features:concepts.name', path: '/concepts', permissionId: 'semantic-models', icon: Network,
          // No Import: /concepts/import is Build → Assets → Schema importer
          // (the route stays, so existing links to it still work)
          children: [
            {
              id: 'concept-define', labelKey: 'concepts:sections.define', path: '/concepts/define', permissionId: 'semantic-models', icon: PenLine,
              // The owner's addition (Task 16e): each opens the Define page's dialog of the same
              // card (views/define.tsx), for those whose card button is enabled
              children: [
                {
                  id: 'define-author', labelKey: 'shell:items.authorConcepts', path: '/concepts/define?open=author', permissionId: 'semantic-models',
                  level: FeatureAccessLevel.READ_WRITE, icon: FilePlus2,
                },
                {
                  id: 'define-generate', labelKey: 'shell:items.generateOntology', path: '/concepts/define?open=generate', permissionId: 'semantic-models',
                  level: FeatureAccessLevel.READ_WRITE, icon: WandSparkles,
                },
                {
                  id: 'define-import', labelKey: 'shell:items.importRdf', path: '/concepts/define?open=import', permissionId: 'semantic-models',
                  level: FeatureAccessLevel.READ_WRITE, icon: FileUp,
                },
              ],
            },
            { id: 'concept-browser', labelKey: 'shell:items.conceptBrowser', path: '/concepts/browser', permissionId: 'semantic-models', icon: Network },
            { id: 'concept-search', labelKey: 'shell:items.conceptSearch', path: '/concepts/search', permissionId: 'semantic-models', icon: Search },
            { id: 'concept-hierarchy', labelKey: 'shell:items.conceptHierarchy', path: '/concepts/hierarchy', permissionId: 'semantic-models', icon: Network },
            { id: 'concept-enrich', labelKey: 'shell:items.conceptEnrich', path: '/concepts/enrich', permissionId: 'semantic-models', icon: Sparkles },
            { id: 'concept-mapping', labelKey: 'shell:items.conceptMapping', path: '/concepts/mapping', permissionId: 'semantic-models', icon: GitBranch },
            // The owner's addition (2026-11-10): the collections page, reached before only from Define
            { id: 'concept-collections', labelKey: 'shell:items.conceptCollections', path: '/concepts/collections', permissionId: 'semantic-models', icon: Library },
          ],
        },
        {
          id: 'data-contracts', labelKey: 'shell:items.dataContracts', path: '/data-contracts', permissionId: 'data-contracts', icon: FileTextIcon,
          defaultChildId: 'contracts-explorer',
          children: [
            { id: 'contracts-explorer', labelKey: 'shell:items.explorer', path: '/data-contracts', permissionId: 'data-contracts', icon: FileTextIcon },
            // Opens the page's create dialog (views/data-contracts.tsx), for those who see its create button
            {
              id: 'new-contract', labelKey: 'data-contracts:newContract', path: '/data-contracts?new=1', permissionId: 'data-contracts',
              level: FeatureAccessLevel.READ_WRITE, icon: Plus,
            },
          ],
        },
        {
          id: 'products', labelKey: 'features:data-products.name', path: '/data-products', permissionId: 'data-products', icon: Package,
          children: [
            { id: 'data-products', labelKey: 'shell:items.allProducts', path: '/data-products', permissionId: 'data-products', icon: Package },
            { id: 'my-products', labelKey: 'shell:items.myProducts', path: '/my-products', permissionId: 'my-products', icon: ShoppingCart },
          ],
        },
        { id: 'my-requests', labelKey: 'shell:items.myRequests', path: '/my-requests', permissionId: 'my-requests', icon: ClipboardList },
      ],
    },
  ],
  Organization: [
    {
      items: [
        { id: 'data-domains', labelKey: 'shell:items.dataDomains', path: '/settings/data-domains', permissionId: 'data-domains', icon: BoxSelect },
        { id: 'teams', labelKey: 'settings:tabs.teams', path: '/settings/teams', permissionId: 'teams', icon: UserCheck },
        { id: 'projects', labelKey: 'settings:tabs.projects', path: '/settings/projects', permissionId: 'projects', icon: FolderOpen },
        {
          id: 'roles', labelKey: 'shell:items.roles', permissionId: 'settings-roles', icon: UserCog,
          children: [
            { id: 'app-roles', labelKey: 'shell:items.appRoles', path: '/settings/roles', permissionId: 'settings-roles', icon: UserCog },
            { id: 'business-roles', labelKey: 'shell:items.businessRoles', path: '/settings/business-roles', permissionId: 'business-roles', icon: Briefcase },
          ],
        },
      ],
    },
  ],
  Semantics: [
    {
      items: [
        { id: 'semantic-models', labelKey: 'shell:items.semanticModels', path: '/settings/semantic-models', permissionId: 'settings-semantic-models', icon: Network },
        { id: 'settings-asset-types', labelKey: 'shell:items.assetTypes', path: '/settings/asset-types', permissionId: 'settings-asset-types', icon: Shapes },
        { id: 'tags', labelKey: 'settings:tabs.tags', path: '/settings/tags', permissionId: 'tags', icon: Tags },
        {
          id: 'levels', labelKey: 'shell:items.levels', permissionId: 'settings-certification-levels', icon: ShieldCheck,
          children: [
            { id: 'certification-levels', labelKey: 'shell:items.certification', path: '/settings/certification-levels', permissionId: 'settings-certification-levels', icon: ShieldCheck },
            { id: 'maturity-levels', labelKey: 'shell:items.maturity', path: '/settings/maturity-levels', permissionId: 'settings-maturity-levels', icon: Activity },
          ],
        },
      ],
    },
  ],
  Workflows: [
    {
      items: [
        WORKFLOWS_ITEM,
      ],
    },
  ],
  Settings: [
    {
      titleKey: 'shell:sections.platform',
      items: [
        { id: 'general', labelKey: 'settings:tabs.general', path: '/settings/general', permissionId: 'settings-general', icon: Settings },
        { id: 'helix', labelKey: 'shell:items.helix', path: '/settings/helix', permissionId: 'settings-general', icon: Sparkles },
        { id: 'appearance', labelKey: 'shell:items.appearance', path: '/settings/ui', permissionId: 'settings-ui', icon: Palette },
        { id: 'settings-search', labelKey: 'settings:tabs.search', path: '/settings/search', permissionId: 'settings-search', icon: Search },
        {
          id: 'connectors', labelKey: 'settings:tabs.connectors', path: '/settings/connectors', permissionId: 'settings-connectors', icon: Plug2,
          children: [
            { id: 'git', labelKey: 'settings:tabs.git', path: '/settings/git', permissionId: 'settings-git', icon: GitBranch },
            { id: 'mcp', labelKey: 'shell:items.mcpTokens', path: '/settings/mcp', permissionId: 'settings-mcp', icon: Bot },
            { id: 'delivery-methods', labelKey: 'shell:items.deliveryMethods', path: '/settings/delivery-methods', permissionId: 'delivery-methods', icon: Truck },
          ],
        },
        { id: 'jobs', labelKey: 'settings:tabs.jobs', path: '/settings/jobs', permissionId: 'jobs', icon: Clock },
        { id: 'directory', labelKey: 'shell:items.directory', path: '/settings/directory', permissionId: 'settings-directory', icon: Contact },
      ],
    },
    {
      titleKey: 'shell:sections.process',
      items: [
        { id: 'delivery', labelKey: 'shell:items.delivery', path: '/settings/delivery', permissionId: 'settings-delivery', icon: Briefcase },
        { id: 'audit', labelKey: 'shell:items.auditLog', path: '/settings/audit', permissionId: 'audit', icon: ScrollText },
      ],
    },
    // Not under /settings/*: no Settings gate (the owner's call, Task 16a)
    {
      titleKey: 'navigation:groups.govern',
      ungated: true,
      items: [
        { id: 'compliance', labelKey: 'features:compliance.name', path: '/compliance', permissionId: 'compliance', icon: CheckCircle },
        { id: 'master-data', labelKey: 'shell:items.masterData', path: '/master-data', permissionId: 'master-data', icon: Users },
        { id: 'data-asset-reviews', labelKey: 'features:data-asset-reviews.name', path: '/data-asset-reviews', permissionId: 'data-asset-reviews', icon: ClipboardCheck },
        { id: 'security-features', labelKey: 'features:security-features.name', path: '/security-features', permissionId: 'security-features', icon: Lock },
        {
          id: 'entitlements-menu', labelKey: 'features:entitlements.name', path: '/entitlements', permissionId: 'entitlements', icon: Shield,
          children: [
            { id: 'entitlements', labelKey: 'features:entitlements.name', path: '/entitlements', permissionId: 'entitlements', icon: Shield },
            { id: 'entitlements-sync', labelKey: 'features:entitlements-sync.name', path: '/entitlements-sync', permissionId: 'entitlements-sync', icon: RefreshCw },
          ],
        },
      ],
    },
    {
      titleKey: 'navigation:groups.deploy',
      ungated: true,
      items: [
        { id: 'estate-manager', labelKey: 'features:estate-manager.name', path: '/estate-manager', permissionId: 'estate-manager', icon: Globe },
        { id: 'catalog-commander', labelKey: 'features:catalog-commander.name', path: '/catalog-commander', permissionId: 'catalog-commander', icon: FolderKanban },
      ],
    },
  ],
};

// Maturity by feature id; items that aren't features (settings pages,
// sub-pages) count as ga
const MATURITY = new Map(features.map((f) => [f.id, f.maturity]));
const maturityOf = (id: string): FeatureMaturity => MATURITY.get(id) ?? 'ga';

function visibleItem(item: NavItem, allowed: (item: NavItem) => boolean): NavItem | null {
  if (!item.children) return allowed(item) ? item : null;
  const children = item.children.map((c) => visibleItem(c, allowed)).filter((c): c is NavItem => c !== null);
  const { path, children: _children, ...rest } = item;
  const ownPage = !!path && allowed(item);
  // Left with no children, a parent stays as a plain page only when its path
  // is a page of its own (Define), not one of its children's (Entitlements)
  const pageIsAChilds = item.children.some((c) => c.path === path || c.id === item.defaultChildId);
  if (children.length === 0) return ownPage && !pageIsAChilds ? { ...rest, path } : null;
  return { ...rest, ...(ownPage ? { path } : {}), children };
}

/**
 * The menu as one user sees it: items need their level (READ_ONLY unless set)
 * on their permission (`has`) and a feature maturity the user shows
 * (`showMaturity`, as the old sidebar did with the beta/alpha toggles).
 */
export function visibleNav(
  has: (permissionId: string, level: FeatureAccessLevel) => boolean,
  showMaturity: (maturity: FeatureMaturity) => boolean = () => true,
): Record<NavGroupId, NavSection[]> {
  const allowed = (item: NavItem) =>
    has(item.permissionId, item.level ?? FeatureAccessLevel.READ_ONLY) && showMaturity(maturityOf(item.id));
  const result = {} as Record<NavGroupId, NavSection[]>;
  const gated = !has(SETTINGS_GATE, FeatureAccessLevel.READ_ONLY);
  for (const { id, settingsArea } of NAV_GROUPS) {
    const sections = NAV[id]
      .filter((s) => !(settingsArea && gated) || s.ungated)
      .map((s) => ({ ...s, items: s.items.map((i) => visibleItem(i, allowed)).filter((i): i is NavItem => i !== null) }))
      .filter((s) => s.items.length > 0);
    if (sections.length > 0) result[id] = sections;
  }
  return result;
}

/**
 * Where a group's strip button goes, given the group's sections as this user
 * sees them (visibleNav): its default item, or the first item the user can see
 * when that one is hidden; null for Settings, which names none.
 */
export function groupDefaultPath(group: NavGroup, sections: NavSection[] | undefined): string | null {
  if (!group.defaultItemId || !sections) return null;
  const items = sections.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])]));
  return (items.find((i) => i.id === group.defaultItemId && i.path) ?? items.find((i) => i.path))?.path ?? null;
}

export interface ActiveLocation {
  group: NavGroupId;
  itemId: string;
  childId?: string;
  /** A sub-item's own sub-item (Define → Author Concepts). */
  grandchildId?: string;
}

/**
 * How well an item's path covers the location: its length, or -1. A path
 * covers its page and the pages under it; a path with a query covers only
 * its own page, while the URL has every one of those params.
 */
function coverage(path: string | undefined, pathname: string, search: string): number {
  if (!path) return -1;
  const [base, query] = path.split('?');
  if (query) {
    const here = new URLSearchParams(search);
    const needed = [...new URLSearchParams(query)];
    return pathname === base && needed.every(([k, v]) => here.get(k) === v) ? path.length : -1;
  }
  return pathname === base || pathname.startsWith(`${base}/`) ? base.length : -1;
}

/** The best match for the location within one group's sections, or null. */
function matchInGroup(sections: NavSection[], pathname: string, search: string): (Omit<ActiveLocation, 'group'> & { length: number }) | null {
  let best: (Omit<ActiveLocation, 'group'> & { length: number }) | null = null;
  let bestScore = -1;
  const consider = (path: string | undefined, found: Omit<ActiveLocation, 'group'>, depth: number) => {
    const length = coverage(path, pathname, search);
    if (length < 0) return;
    // Longer paths win; on a tie a sub-item beats its parent
    const score = length * 3 + depth;
    if (score > bestScore) {
      bestScore = score;
      best = { ...found, length };
    }
  };
  for (const section of sections) {
    for (const item of section.items) {
      consider(item.path, { itemId: item.id }, 0);
      for (const child of item.children ?? []) {
        consider(child.path, { itemId: item.id, childId: child.id }, 1);
        for (const grandchild of child.children ?? []) {
          consider(grandchild.path, { itemId: item.id, childId: child.id, grandchildId: grandchild.id }, 2);
        }
      }
    }
  }
  return best;
}

// The settings-area groups first, so a page listed in two groups belongs to the
// more specific one: Asset types (Build → Assets and Semantics) is Semantics'
const SEARCH_ORDER: NavGroupId[] = ['Settings', 'Organization', 'Semantics', 'Workflows', 'Discover', 'Build'];

/**
 * The router state a menu navigation carries (panel items, strip defaults
 * and the Workflows link): the page keeps the group it was clicked in, and
 * back and forward restore it with their history entry. Task 16d's
 * breadcrumbs read `nav: 'menu'`.
 */
export interface MenuNavState {
  nav: 'menu';
  navGroup: NavGroupId;
}

export const menuNavState = (navGroup: NavGroupId): MenuNavState => ({ nav: 'menu', navGroup });

/** The group a location's router state says the page was reached through, or null. */
export function menuNavGroup(state: unknown): NavGroupId | null {
  const group = (state as Partial<MenuNavState> | null)?.navGroup;
  return state && (state as Partial<MenuNavState>).nav === 'menu' && NAV_GROUPS.some((g) => g.id === group)
    ? (group as NavGroupId)
    : null;
}

/** The page's place within one group (Build's Asset types, say), or null when the group doesn't list it. */
export function locateIn(group: NavGroupId, pathname: string, search = ''): ActiveLocation | null {
  const found = matchInGroup(NAV[group], pathname, search);
  if (!found) return null;
  const { length: _length, ...location } = found;
  return { group, ...location };
}

/** The current page's place in the menu: `pathname` and `search` from the router's location. */
export function activeLocation(pathname: string, search = ''): ActiveLocation | null {
  let best: ActiveLocation | null = null;
  let bestLength = -1;
  for (const group of SEARCH_ORDER) {
    const found = matchInGroup(NAV[group], pathname, search);
    if (!found) continue;
    const { length, ...location } = found;
    if (length > bestLength) {
      bestLength = length;
      best = { group, ...location };
    }
  }
  return best;
}

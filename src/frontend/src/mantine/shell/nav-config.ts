/**
 * The shell's side menu: groups in strip order (Settings alone at the bottom),
 * each a list of items with optional sub-items. A group with a `link` is a
 * single strip button that goes to that page and opens no panel (Workflows).
 *
 * Ids, paths and permission ids come from config/features.ts and
 * components/settings/settings-layout.tsx. Every item is hidden without
 * READ_ONLY on its permission id.
 *
 * A parent with children shows when any child shows. Its own `path`, if it
 * has one, is kept only when its own permission allows it; without a path,
 * clicking the parent just expands it.
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
  FileTextIcon,
  FolderKanban,
  FolderOpen,
  GitBranch,
  Globe,
  LayoutGrid,
  Lock,
  Network,
  Package,
  Palette,
  Plug2,
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
  BoxSelect,
  RefreshCw,
  Compass,
  type LucideIcon,
} from 'lucide-react';
import { features, type FeatureMaturity } from '@/config/features';

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
  path?: string;
  permissionId: string;
  icon: LucideIcon;
  children?: NavItem[];
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
   * Pages under /settings/*: hidden without the Settings area's gate, except
   * its `ungated` sections (Settings → Govern and Deploy).
   */
  settingsArea?: boolean;
}

// Strip order, top to bottom (Helix and Ontos follow Workflows; side-strip.tsx)
export const NAV_GROUPS: NavGroup[] = [
  { id: 'Discover', labelKey: 'navigation:groups.discover', icon: Compass },
  { id: 'Build', labelKey: 'navigation:groups.build', icon: LayoutGrid },
  { id: 'Organization', labelKey: 'shell:sections.organization', icon: Building2, settingsArea: true },
  { id: 'Semantics', labelKey: 'shell:sections.semantics', icon: Network, settingsArea: true },
  { id: 'Workflows', labelKey: 'settings:tabs.workflows', icon: GitBranch, link: '/settings/workflows', settingsArea: true },
  { id: 'Settings', labelKey: 'settings:title', icon: Settings, settingsArea: true },
];

/** The groups whose strip button opens a panel (every group but a link). */
export function isPanelGroup(id: unknown): id is NavGroupId {
  return NAV_GROUPS.some((g) => g.id === id && !g.link);
}

/** The Settings area's own gate (SettingsLayout redirects home without it). */
const SETTINGS_GATE = 'settings';

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
          id: 'assets', labelKey: 'shell:items.assets', path: '/assets', permissionId: 'assets', icon: Box,
          children: [
            { id: 'explorer', labelKey: 'shell:items.explorer', path: '/assets', permissionId: 'assets', icon: Box },
            { id: 'asset-types', labelKey: 'shell:items.assetTypes', path: '/settings/asset-types', permissionId: 'settings-asset-types', icon: Shapes },
            { id: 'schema-importer', labelKey: 'shell:items.schemaImporter', path: '/schema-importer', permissionId: 'schema-importer', icon: Plug2 },
          ],
        },
        {
          id: 'concepts', labelKey: 'features:concepts.name', path: '/concepts', permissionId: 'semantic-models', icon: Network,
          children: [
            { id: 'concept-browser', labelKey: 'shell:items.conceptBrowser', path: '/concepts/browser', permissionId: 'semantic-models', icon: Network },
            { id: 'concept-search', labelKey: 'shell:items.conceptSearch', path: '/concepts/search', permissionId: 'semantic-models', icon: Search },
            { id: 'concept-hierarchy', labelKey: 'shell:items.conceptHierarchy', path: '/concepts/hierarchy', permissionId: 'semantic-models', icon: Network },
            { id: 'concept-enrich', labelKey: 'shell:items.conceptEnrich', path: '/concepts/enrich', permissionId: 'semantic-models', icon: Sparkles },
            { id: 'concept-mapping', labelKey: 'shell:items.conceptMapping', path: '/concepts/mapping', permissionId: 'semantic-models', icon: GitBranch },
            { id: 'concept-import', labelKey: 'shell:items.conceptImport', path: '/concepts/import', permissionId: 'semantic-models', icon: Plug2 },
          ],
        },
        { id: 'data-contracts', labelKey: 'features:data-contracts.name', path: '/data-contracts', permissionId: 'data-contracts', icon: FileTextIcon },
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
        { id: 'directory', labelKey: 'shell:items.directory', path: '/settings/directory', permissionId: 'settings-directory', icon: Contact },
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
        { id: 'workflows', labelKey: 'settings:tabs.workflows', path: '/settings/workflows', permissionId: 'settings-workflows', icon: GitBranch },
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
  const children = item.children.filter(allowed);
  if (children.length === 0) return null;
  const { path, ...rest } = item;
  return { ...rest, ...(path && allowed(item) ? { path } : {}), children };
}

/**
 * The menu as one user sees it: items need READ_ONLY on their permission
 * (`has`) and a feature maturity the user shows (`showMaturity`, as the old
 * sidebar did with the beta/alpha toggles).
 */
export function visibleNav(
  has: (permissionId: string) => boolean,
  showMaturity: (maturity: FeatureMaturity) => boolean = () => true,
): Record<NavGroupId, NavSection[]> {
  const allowed = (item: NavItem) => has(item.permissionId) && showMaturity(maturityOf(item.id));
  const result = {} as Record<NavGroupId, NavSection[]>;
  const gated = !has(SETTINGS_GATE);
  for (const { id, settingsArea } of NAV_GROUPS) {
    const sections = NAV[id]
      .filter((s) => !(settingsArea && gated) || s.ungated)
      .map((s) => ({ ...s, items: s.items.map((i) => visibleItem(i, allowed)).filter((i): i is NavItem => i !== null) }))
      .filter((s) => s.items.length > 0);
    if (sections.length > 0) result[id] = sections;
  }
  return result;
}

export interface ActiveLocation {
  group: NavGroupId;
  itemId: string;
  childId?: string;
}

function covers(path: string | undefined, pathname: string): boolean {
  return !!path && (pathname === path || pathname.startsWith(`${path}/`));
}

/** The best match for `pathname` within one group's sections, or null. */
export function matchInGroup(sections: NavSection[], pathname: string): Omit<ActiveLocation, 'group'> | null {
  let best: Omit<ActiveLocation, 'group'> | null = null;
  let bestScore = -1;
  const consider = (path: string | undefined, found: Omit<ActiveLocation, 'group'>, isChild: boolean) => {
    if (!covers(path, pathname)) return;
    // Longer paths win; on a tie a sub-item beats its parent
    const score = path!.length * 2 + (isChild ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = found;
    }
  };
  for (const section of sections) {
    for (const item of section.items) {
      consider(item.path, { itemId: item.id }, false);
      for (const child of item.children ?? []) consider(child.path, { itemId: item.id, childId: child.id }, true);
    }
  }
  return best;
}

// The settings-area groups first, so a page listed in two groups belongs to the
// more specific one: Asset types (Build → Assets and Semantics) is Semantics'
const SEARCH_ORDER: NavGroupId[] = ['Settings', 'Organization', 'Semantics', 'Workflows', 'Discover', 'Build'];

export function activeLocation(pathname: string): ActiveLocation | null {
  let best: ActiveLocation | null = null;
  let bestLength = -1;
  for (const group of SEARCH_ORDER) {
    const found = matchInGroup(NAV[group], pathname);
    if (!found) continue;
    const item = NAV[group].flatMap((s) => s.items).find((i) => i.id === found.itemId)!;
    const path = found.childId ? item.children!.find((c) => c.id === found.childId)!.path! : item.path!;
    if (path.length > bestLength) {
      bestLength = path.length;
      best = { group, ...found };
    }
  }
  return best;
}

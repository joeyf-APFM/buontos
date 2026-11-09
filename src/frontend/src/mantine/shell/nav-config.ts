/**
 * The shell's side menu: five groups (four at the top of the strip, Settings
 * at the bottom), each a list of items with optional sub-items.
 *
 * Ids, paths and permission ids come from config/features.ts and
 * components/settings/settings-layout.tsx. Every item is hidden without
 * READ_ONLY on its permission id.
 *
 * An action item (e.g. Ask Helix) has no path and no permission id: clicking
 * it runs its action, it is never the active item, and it shows only while
 * its action is available.
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
  Rocket,
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

export type NavGroupId = 'Discover' | 'Build' | 'Govern' | 'Deploy' | 'Settings';

/** What an action item does instead of navigating. */
export type NavAction = 'helix';

export interface NavItem {
  id: string;
  labelKey: string;
  path?: string;
  /** Required unless the item is an action. */
  permissionId?: string;
  icon: LucideIcon;
  children?: NavItem[];
  action?: NavAction;
}

export interface NavSection {
  titleKey?: string;
  items: NavItem[];
}

export const NAV_GROUPS: { id: NavGroupId; labelKey: string; icon: LucideIcon }[] = [
  { id: 'Discover', labelKey: 'navigation:groups.discover', icon: Compass },
  { id: 'Build', labelKey: 'navigation:groups.build', icon: LayoutGrid },
  { id: 'Govern', labelKey: 'navigation:groups.govern', icon: Shield },
  { id: 'Deploy', labelKey: 'navigation:groups.deploy', icon: Rocket },
  { id: 'Settings', labelKey: 'settings:title', icon: Settings },
];

/** The Settings area's own gate (SettingsLayout redirects home without it). */
const SETTINGS_GATE = 'settings';

export const NAV: Record<NavGroupId, NavSection[]> = {
  Discover: [
    {
      items: [
        { id: 'ask-helix', labelKey: 'shell:items.askHelix', icon: Sparkles, action: 'helix' },
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
  Govern: [
    {
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
  ],
  Deploy: [
    {
      items: [
        { id: 'estate-manager', labelKey: 'features:estate-manager.name', path: '/estate-manager', permissionId: 'estate-manager', icon: Globe },
        { id: 'catalog-commander', labelKey: 'features:catalog-commander.name', path: '/catalog-commander', permissionId: 'catalog-commander', icon: FolderKanban },
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
      titleKey: 'shell:sections.organization',
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
    {
      titleKey: 'shell:sections.semantics',
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
    {
      titleKey: 'shell:sections.process',
      items: [
        { id: 'workflows', labelKey: 'settings:tabs.workflows', path: '/settings/workflows', permissionId: 'settings-workflows', icon: GitBranch },
        { id: 'delivery', labelKey: 'shell:items.delivery', path: '/settings/delivery', permissionId: 'settings-delivery', icon: Briefcase },
        { id: 'audit', labelKey: 'shell:items.auditLog', path: '/settings/audit', permissionId: 'audit', icon: ScrollText },
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
 * sidebar did with the beta/alpha toggles). Action items show only when
 * `showAction` says their action is available.
 */
export function visibleNav(
  has: (permissionId: string) => boolean,
  showMaturity: (maturity: FeatureMaturity) => boolean = () => true,
  showAction: (action: NavAction) => boolean = () => false,
): Record<NavGroupId, NavSection[]> {
  const allowed = (item: NavItem) =>
    item.action
      ? showAction(item.action)
      : !!item.permissionId && has(item.permissionId) && showMaturity(maturityOf(item.id));
  const result = {} as Record<NavGroupId, NavSection[]>;
  for (const { id } of NAV_GROUPS) {
    if (id === 'Settings' && !has(SETTINGS_GATE)) continue;
    const sections = NAV[id]
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

// Settings first, so a page listed in two groups (Asset types) belongs to Settings
const SEARCH_ORDER: NavGroupId[] = ['Settings', 'Discover', 'Build', 'Govern', 'Deploy'];

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

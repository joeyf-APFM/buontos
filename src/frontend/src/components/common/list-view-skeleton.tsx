import type { CSSProperties } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import classes from './list-view-skeleton.module.css';

/* ============================================================================
 * Primitives
 * --------------------------------------------------------------------------
 * Thin wrappers around the base Skeleton component so other modules don't
 * have to import @/components/ui/skeleton directly. This keeps all skeleton
 * usage funneled through this shared module (see lint guard in the docs).
 *
 * The templates below are at Aura density: 28px controls and table rows,
 * 12px text lines and panes with 12px padding. Props that take a class
 * (width, height, className, ...) still apply the caller's class; without
 * one, the size is set inline.
 * ==========================================================================*/

type Size = number | string;

// Aura sizes, in px
const CONTROL = 28;
const LINE = 12;
const SMALL = 10;
const TITLE = 16;
const PAGE_TITLE = 20;
const BADGE = 18;
const ICON = 16;

/**
 * One placeholder of the given size. Without a width it fills the row,
 * unless a class (a caller's size prop) sizes it.
 */
function Bone({
  h,
  w,
  radius,
  className,
  style,
}: {
  h?: Size;
  w?: Size;
  radius?: Size;
  className?: string;
  style?: CSSProperties;
}) {
  const width = w ?? (className ? undefined : '100%');
  return (
    <Skeleton
      className={className}
      style={{
        ...(h !== undefined && { height: h }),
        ...(width !== undefined && { width }),
        ...(radius !== undefined && { borderRadius: radius }),
        flex: 'none',
        ...style,
      }}
    />
  );
}

interface SkeletonLineProps {
  /** Tailwind width class, e.g. "w-32" or "w-full". Defaults to the full width. */
  width?: string;
  /** Tailwind height class, e.g. "h-4". Defaults to 16px. */
  height?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Simple text-line skeleton. */
export function SkeletonLine({ width, height, className = '', style }: SkeletonLineProps) {
  return (
    <Skeleton
      className={cn(height, width, className) || undefined}
      style={{ ...(!height && { height: 16 }), ...(!width && { width: '100%' }), ...style }}
    />
  );
}

/** Solid block skeleton (taller than a line). */
export function SkeletonBlock({ width, height, className = '' }: SkeletonLineProps) {
  return (
    <Skeleton
      className={cn(height, width, className) || undefined}
      style={{ ...(!height && { height: 128 }), ...(!width && { width: '100%' }) }}
    />
  );
}

const times = (n: number) => Array.from({ length: Math.max(n, 0) }, (_, i) => i);

/* ============================================================================
 * Templates
 * ==========================================================================*/

interface ListViewSkeletonProps {
  /** Number of columns to show in the table header/rows */
  columns?: number;
  /** Number of rows to show */
  rows?: number;
  /** Whether to show the toolbar skeleton */
  showToolbar?: boolean;
  /** Whether to show the pagination skeleton */
  showPagination?: boolean;
  /** Number of action buttons in the toolbar */
  toolbarButtons?: number;
}

/**
 * Reusable skeleton loading state for list views with DataTable.
 * Provides a consistent loading experience across all list views.
 */
export function ListViewSkeleton({
  columns = 6,
  rows = 5,
  showToolbar = true,
  showPagination = true,
  toolbarButtons = 2,
}: ListViewSkeletonProps) {
  return (
    <div className={classes.stack}>
      {/* Toolbar skeleton */}
      {showToolbar && (
        <div className={classes.spread}>
          <div className={classes.row}>
            <Bone h={CONTROL} w={256} />
            <Bone h={CONTROL} w={96} />
          </div>
          <div className={classes.row}>
            {times(toolbarButtons).map((i) => (
              <Bone key={i} h={CONTROL} w={128} />
            ))}
          </div>
        </div>
      )}

      {/* Table skeleton */}
      <TableSkeleton columns={columns} rows={rows} />

      {/* Pagination skeleton */}
      {showPagination && (
        <div className={classes.spread}>
          <Bone h={LINE} w={128} />
          <div className={classes.row}>
            <Bone h={CONTROL} w={96} />
            <Bone h={CONTROL} w={80} />
            {times(4).map((i) => (
              <Bone key={i} h={CONTROL} w={CONTROL} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TableSkeletonProps {
  columns?: number;
  rows?: number;
  /** Show the bordered/rounded wrapper. Set to false when the consumer renders inside a Card already. */
  bordered?: boolean;
  /** Show a header row */
  showHeader?: boolean;
}

/**
 * Pure table skeleton without toolbar / pagination wrappers. Useful when
 * the parent already renders a Card or other surface around the table.
 */
export function TableSkeleton({
  columns = 6,
  rows = 5,
  bordered = true,
  showHeader = true,
}: TableSkeletonProps) {
  // Pre-compute pseudo-random column widths once per render so they stay stable
  // within a single mount. (Math.random in JSX runs on every paint otherwise.)
  const headerWidths = Array.from({ length: columns }, () => Math.round(Math.random() * 40 + 60));
  const rowWidths = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => Math.round(Math.random() * 60 + 40))
  );

  return (
    <div className={bordered ? classes.bordered : undefined}>
      {showHeader && (
        <div className={classes.tableHead}>
          <Bone h={14} w={14} />
          {headerWidths.map((w, i) => (
            <Bone key={i} h={SMALL} w={w} />
          ))}
        </div>
      )}
      {times(rows).map((rowIndex) => (
        <div key={rowIndex} className={classes.tableRow}>
          <Bone h={14} w={14} />
          {rowWidths[rowIndex].map((w, colIndex) => (
            <Bone key={colIndex} h={LINE} w={w} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface DetailHeaderSkeletonProps {
  /** Number of action buttons on the right side */
  actionButtons?: number;
  /**
   * Number of additional left-side controls to render after the back-button stub.
   * Useful for pages that include version navigators, view-mode toggles, etc.
   */
  leftControls?: number;
}

/**
 * Skeleton for detail view headers with back button and action buttons.
 * Optionally renders extra left-side stubs (e.g. version nav, S/M/L toggle).
 */
export function DetailHeaderSkeleton({
  actionButtons = 3,
  leftControls = 0,
}: DetailHeaderSkeletonProps) {
  return (
    <div className={classes.spread}>
      <div className={classes.row}>
        <Bone h={CONTROL} w={96} />
        {times(leftControls).map((i) => (
          <Bone key={i} h={CONTROL} w={112} />
        ))}
      </div>
      <div className={classes.row}>
        {times(actionButtons).map((i) => (
          <Bone key={i} h={CONTROL} w={96} />
        ))}
      </div>
    </div>
  );
}

// Tailwind's w-* steps that the title / description props take, in px
const TW_WIDTHS: Record<string, number> = {
  'w-32': 128, 'w-40': 160, 'w-48': 192, 'w-56': 224, 'w-64': 256, 'w-72': 288, 'w-80': 320, 'w-96': 384,
};

/** A caller's width prop: a known w-* step inline, anything else as its class. */
const widthOf = (value: string): { w?: Size; className?: string } =>
  TW_WIDTHS[value] !== undefined ? { w: TW_WIDTHS[value] } : { className: value };

/**
 * Skeleton for a card with title and content.
 */
export function CardSkeleton({
  titleWidth = 'w-48',
  descriptionWidth = 'w-64',
  contentRows = 3,
}: {
  titleWidth?: string;
  descriptionWidth?: string;
  contentRows?: number;
}) {
  return (
    <div className={cn(classes.pane, classes.padded, classes.stack)}>
      <div className={classes.stackSm}>
        <Bone h={TITLE} {...widthOf(titleWidth)} />
        <Bone h={LINE} {...widthOf(descriptionWidth)} />
      </div>
      <div className={classes.stackSm}>
        {times(contentRows).map((i) => (
          <Bone key={i} h={LINE} />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for metadata grid (used in detail views).
 */
export function MetadataGridSkeleton({ items = 6 }: { items?: number }) {
  return (
    <div className={classes.metaGrid}>
      {times(items).map((i) => (
        <div key={i} className={classes.row}>
          <Bone h={LINE} w={64} />
          <Bone h={LINE} w={96} />
        </div>
      ))}
    </div>
  );
}

/**
 * Comprehensive skeleton for detail views.
 * Shows header with back button, main card with metadata, and optional additional cards.
 */
export function DetailViewSkeleton({
  cards = 3,
  actionButtons = 3,
}: {
  cards?: number;
  actionButtons?: number;
}) {
  return (
    <div className={classes.page}>
      {/* Header skeleton */}
      <div className={classes.spread}>
        <Bone h={CONTROL} w={96} />
        <div className={classes.row}>
          {times(actionButtons).map((i) => (
            <Bone key={i} h={CONTROL} w={96} />
          ))}
        </div>
      </div>

      {/* Core Metadata Card skeleton */}
      <div className={classes.pane}>
        <div className={classes.paneHead}>
          <div className={classes.rowWide}>
            <Bone h={20} w={20} />
            <Bone h={PAGE_TITLE} w={256} />
          </div>
          <Bone h={LINE} w={384} />
        </div>
        <div className={cn(classes.paneBody, classes.stack)}>
          <MetadataGridSkeleton items={6} />
          <div className={classes.ruled}>
            <div className={classes.rowWide}>
              <div className={cn(classes.grow, classes.stackXs)}>
                <Bone h={SMALL} w={48} />
                <div className={classes.row}>
                  <Bone h={BADGE} w={64} />
                  <Bone h={BADGE} w={80} />
                </div>
              </div>
              <div className={cn(classes.grow, classes.stackXs)}>
                <Bone h={SMALL} w={96} />
                <Bone h={BADGE} w={128} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional cards skeleton */}
      {times(cards - 1).map((cardIndex) => (
        <div key={cardIndex} className={classes.pane}>
          <div className={classes.paneHead}>
            <div className={classes.row}>
              <Bone h={ICON} w={ICON} />
              <Bone h={TITLE} w={128} />
            </div>
            <Bone h={LINE} w={224} />
          </div>
          <div className={cn(classes.paneBody, classes.stackSm)}>
            <Bone h={CONTROL} />
            <Bone h={36} />
            <Bone h={36} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface HierarchyTreeSkeletonProps {
  /** Number of top-level groups to display */
  groups?: number;
  /** Number of items per group */
  itemsPerGroup?: number;
  /** Whether items are indented under their group label */
  indented?: boolean;
  className?: string;
}

/**
 * Skeleton for nested tree / hierarchical browsers.
 * Mirrors the layout used by the Hierarchy Browser side panel and similar
 * grouped tree components.
 */
export function HierarchyTreeSkeleton({
  groups = 3,
  itemsPerGroup = 3,
  indented = true,
  className = '',
}: HierarchyTreeSkeletonProps) {
  return (
    <div className={cn(classes.stack, classes.padded, className)}>
      {times(groups).map((g) => (
        <div key={g} className={classes.stackSm}>
          <Bone h={14} w={128} />
          <div className={cn(classes.stackXs, indented && classes.indent)}>
            {times(itemsPerGroup).map((i) => (
              <Bone key={i} h={LINE} w={Math.round(Math.random() * 30 + 130)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface PanelSkeletonProps {
  /** Show an icon next to the title */
  withHeaderIcon?: boolean;
  /** Show a description under the title */
  withDescription?: boolean;
  /** Number of stacked content rows */
  rows?: number;
  /** Height class for each row (defaults to 28px) */
  rowHeight?: string;
  /** Outer wrapper class (defaults to a bordered pane) */
  className?: string;
}

/**
 * Skeleton for a generic side / inline Panel that has an icon+title header
 * and a stack of content rows. Use for entity panels (costs, quality,
 * comments, ratings, access grants, version history, ownership, etc.).
 */
export function PanelSkeleton({
  withHeaderIcon = true,
  withDescription = true,
  rows = 2,
  rowHeight,
  className,
}: PanelSkeletonProps) {
  return (
    <div className={className ?? classes.pane}>
      <div className={classes.paneHead}>
        <div className={classes.row}>
          {withHeaderIcon && <Bone h={ICON} w={ICON} />}
          <Bone h={TITLE} w={128} />
        </div>
        {withDescription && <Bone h={LINE} w={192} />}
      </div>
      <div className={cn(classes.paneBody, classes.stackSm)}>
        {times(rows).map((i) => (
          <Bone key={i} h={rowHeight ? undefined : CONTROL} w="100%" className={rowHeight} />
        ))}
      </div>
    </div>
  );
}

interface DialogSkeletonProps {
  /** Number of varying-width lines */
  rows?: number;
  className?: string;
}

/**
 * Skeleton for dialog body content - a stack of varying-width text lines.
 */
export function DialogSkeleton({ rows = 3, className = '' }: DialogSkeletonProps) {
  // Cycle through a few canonical widths so the skeleton looks like prose
  const widths = ['75%', '50%', '66%', '83%', '60%'];
  return (
    <div className={cn(classes.stack, className)}>
      {times(rows).map((i) => (
        <Bone key={i} h={LINE} w={widths[i % widths.length]} />
      ))}
    </div>
  );
}

interface StatCardsSkeletonProps {
  /** Number of stat cards to show in a row */
  count?: number;
  /** Optional grid override (defaults to responsive 1/3 columns) */
  className?: string;
  /** Padding class for each stat card (defaults to 12px). */
  cardPadding?: string;
}

/**
 * Skeleton for a row of stat / summary cards (icon + label + value).
 */
export function StatCardsSkeleton({ count = 3, className, cardPadding }: StatCardsSkeletonProps) {
  return (
    <div className={className ?? classes.statGrid}>
      {times(count).map((i) => (
        <div key={i} className={cn(classes.pane, cardPadding ?? classes.padded)}>
          <div className={classes.rowWide}>
            <Bone h={32} w={32} radius={6} />
            <div className={cn(classes.grow, classes.stackSm)}>
              <Bone h={LINE} w={96} />
              <Bone h={PAGE_TITLE} w={64} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ListItemSkeletonProps {
  /** Number of list items to render */
  count?: number;
  /** Height class for each item (defaults to 40px) */
  height?: string;
  /** Optional class for the wrapper */
  className?: string;
}

/**
 * Skeleton for a vertical stack of list items (rounded rows).
 * Suitable for sidebars showing items, products, projects, etc.
 */
export function ListItemSkeleton({ count = 4, height, className }: ListItemSkeletonProps) {
  return (
    <div className={className ?? classes.stackXs}>
      {times(count).map((i) => (
        <Bone key={i} h={height ? undefined : 40} w="100%" className={height} radius={4} />
      ))}
    </div>
  );
}

interface CatalogColumnsTableSkeletonProps {
  /** Number of body rows */
  rows?: number;
  /**
   * Number of columns. The first column is rendered as a fixed-width name
   * cell, the rest are evenly distributed.
   */
  columns?: number;
  /** Render a header row above the body */
  showHeader?: boolean;
}

/**
 * Skeleton matching the Data Catalog page table (columns / data dictionary
 * style). Renders an optional header row plus configurable body rows.
 */
export function CatalogColumnsTableSkeleton({
  rows = 10,
  columns = 8,
  showHeader = true,
}: CatalogColumnsTableSkeletonProps) {
  // First column gets a fixed name width, remaining columns share flex space
  const cell = (j: number): CSSProperties => (j === 0 ? { width: 160 } : { flex: 1, width: 'auto' });

  return (
    <div className={cn(classes.padded, classes.stackSm)}>
      {showHeader && (
        <div className={classes.tableHead}>
          {times(columns).map((j) => (
            <Bone key={j} h={SMALL} style={cell(j)} />
          ))}
        </div>
      )}
      {times(rows).map((i) => (
        <div key={i} className={classes.tableRow}>
          {times(columns).map((j) => (
            <Bone key={j} h={LINE} style={cell(j)} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface VersionLineageSkeletonProps {
  /** Number of version cards to show stacked */
  versions?: number;
}

/**
 * Skeleton for the contract Version History panel.
 * Stacks N version-card-shaped blocks vertically.
 */
export function VersionLineageSkeleton({ versions = 2 }: VersionLineageSkeletonProps) {
  return (
    <div className={classes.stack}>
      {times(versions).map((i) => (
        <Bone key={i} h={112} />
      ))}
    </div>
  );
}

interface TabsDetailSkeletonProps {
  /** Number of tab triggers in the strip */
  tabs?: number;
  /** Number of action buttons in the header */
  actionButtons?: number;
  /** Number of left-side header controls (after back button) */
  leftControls?: number;
  /** Whether to render a hero (icon + title + description) above the tabs */
  hero?: boolean;
  /** Layout for the active tab body. 'two-col' renders 2 wide cards + 1 side card. */
  contentVariant?: 'cards' | 'two-col';
  /** Number of cards to render in the content area (cards variant only) */
  contentCards?: number;
}

/**
 * Skeleton for a tabbed detail page: header row, hero block, tab strip,
 * and a content body. Use for asset-detail, data-catalog-details, and
 * other tabbed entity detail views.
 */
export function TabsDetailSkeleton({
  tabs = 3,
  actionButtons = 3,
  leftControls = 0,
  hero = true,
  contentVariant = 'cards',
  contentCards = 2,
}: TabsDetailSkeletonProps) {
  return (
    <div className={classes.page}>
      <DetailHeaderSkeleton actionButtons={actionButtons} leftControls={leftControls} />

      {hero && (
        <div className={classes.stackSm}>
          <div className={classes.rowWide}>
            <Bone h={24} w={24} />
            <Bone h={PAGE_TITLE} w={288} />
            <Bone h={BADGE} w={64} />
          </div>
          <Bone h={LINE} w="66%" />
          <Bone h={SMALL} w="33%" />
        </div>
      )}

      {/* Tab triggers */}
      <div className={classes.tabs}>
        {times(tabs).map((i) => (
          <Bone key={i} h={30} w={96} radius={0} />
        ))}
      </div>

      {/* Tab body */}
      {contentVariant === 'two-col' ? (
        <div className={classes.mainSide}>
          <div className={classes.stack}>
            <CardSkeleton titleWidth="w-40" descriptionWidth="w-64" contentRows={4} />
            <CardSkeleton titleWidth="w-48" descriptionWidth="w-72" contentRows={3} />
          </div>
          <div className={classes.stack}>
            <PanelSkeleton rows={3} />
          </div>
        </div>
      ) : (
        <div className={classes.stack}>
          {times(contentCards).map((i) => (
            <CardSkeleton key={i} contentRows={3} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SplitPaneSkeletonProps {
  /** Width class for the sidebar (e.g. "w-64", "w-1/4"); defaults to a quarter */
  sidebarWidth?: string;
  /** Sidebar render style */
  sidebarVariant?: 'tree' | 'list' | 'cards';
  /** Number of items in the sidebar list/tree/cards */
  sidebarItems?: number;
  /** Main pane render style */
  main?: 'table' | 'panel' | 'tree' | 'cards';
  /** Number of columns when main='table' */
  tableColumns?: number;
  /** Number of rows when main='table' or items when main is list-like */
  tableRows?: number;
  /** Optional toolbar/header row above the split */
  showHeader?: boolean;
  /** Total min height class for the split; defaults to 400px */
  minHeight?: string;
}

/**
 * Skeleton for split-pane layouts (sidebar + main content). Used by
 * asset-explorer, entitlements, master-data-management, catalog-commander,
 * collections, hierarchy-browser, ontology-generator, schema-importer.
 */
export function SplitPaneSkeleton({
  sidebarWidth,
  sidebarVariant = 'list',
  sidebarItems = 6,
  main = 'table',
  tableColumns = 6,
  tableRows = 6,
  showHeader = true,
  minHeight,
}: SplitPaneSkeletonProps) {
  const renderSidebar = () => {
    if (sidebarVariant === 'tree') {
      return <HierarchyTreeSkeleton groups={Math.max(1, Math.floor(sidebarItems / 3))} itemsPerGroup={3} />;
    }
    if (sidebarVariant === 'cards') {
      return (
        <div className={cn(classes.padded, classes.stackSm)}>
          {times(sidebarItems).map((i) => (
            <div key={i} className={cn(classes.pane, classes.paddedSm, classes.stackSm)}>
              <Bone h={LINE} w="75%" />
              <Bone h={SMALL} w="50%" />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className={classes.paddedSm}>
        <ListItemSkeleton count={sidebarItems} />
      </div>
    );
  };

  const renderMain = () => {
    if (main === 'panel') {
      return <PanelSkeleton rows={tableRows} />;
    }
    if (main === 'tree') {
      return <HierarchyTreeSkeleton groups={3} itemsPerGroup={tableRows} />;
    }
    if (main === 'cards') {
      return (
        <div className={cn(classes.padded, classes.stackSm)}>
          {times(tableRows).map((i) => (
            <CardSkeleton key={i} contentRows={2} />
          ))}
        </div>
      );
    }
    return <TableSkeleton columns={tableColumns} rows={tableRows} />;
  };

  return (
    <div className={cn(classes.split, minHeight)} style={minHeight ? undefined : { minHeight: 400 }}>
      {showHeader && (
        <div className={classes.spread}>
          <Bone h={PAGE_TITLE} w={192} />
          <div className={classes.row}>
            <Bone h={CONTROL} w={128} />
          </div>
        </div>
      )}
      <div className={classes.splitBody}>
        <div className={cn(classes.pane, sidebarWidth)} style={sidebarWidth ? undefined : { width: '25%' }}>
          {renderSidebar()}
        </div>
        <div className={cn(classes.pane, classes.grow)}>{renderMain()}</div>
      </div>
    </div>
  );
}

interface SettingsFormSkeletonProps {
  /** Number of form sections */
  sections?: number;
  /** Number of fields per section */
  fieldsPerSection?: number;
  /** Show a sticky/footer save bar */
  showSaveBar?: boolean;
  /** Show the page title block at the top */
  showTitle?: boolean;
}

/**
 * Skeleton for settings form pages (general, delivery, git, etc.).
 * Renders a title block, N labeled-field sections and an optional save bar.
 */
export function SettingsFormSkeleton({
  sections = 2,
  fieldsPerSection = 3,
  showSaveBar = true,
  showTitle = true,
}: SettingsFormSkeletonProps) {
  return (
    <div className={classes.stack}>
      {showTitle && (
        <div className={classes.stackSm}>
          <Bone h={PAGE_TITLE} w={256} />
          <Bone h={LINE} w={384} />
        </div>
      )}
      {times(sections).map((s) => (
        <div key={s} className={classes.pane}>
          <div className={classes.paneHead}>
            <Bone h={TITLE} w={160} />
            <Bone h={LINE} w={288} />
          </div>
          <div className={cn(classes.paneBody, classes.stack)}>
            {times(fieldsPerSection).map((f) => (
              <div key={f} className={classes.stackXs}>
                <Bone h={LINE} w={128} />
                <Bone h={CONTROL} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {showSaveBar && (
        <div className={classes.end}>
          <Bone h={CONTROL} w={96} />
          <Bone h={CONTROL} w={128} />
        </div>
      )}
    </div>
  );
}

interface HomeDashboardSkeletonProps {
  /** Number of overview tiles */
  tileCount?: number;
  /** Whether to render the My Actions / Quick Actions card */
  showMyActions?: boolean;
  /** Whether to render role-specific sections (discovery, curation) */
  showRoleSections?: boolean;
}

/**
 * Skeleton for the personalized Home dashboard. Renders a hero search row,
 * a stat-tile grid, an optional My Actions block, and optional role sections.
 */
export function HomeDashboardSkeleton({
  tileCount = 4,
  showMyActions = true,
  showRoleSections = true,
}: HomeDashboardSkeletonProps) {
  return (
    <div className={classes.page}>
      {/* Hero (logo + title + search bar) */}
      <div className={classes.hero}>
        <Bone h={40} w={40} radius="50%" />
        <Bone h={PAGE_TITLE} w={288} />
        <Bone h={LINE} w={384} />
        <Bone h={32} radius={6} style={{ maxWidth: 672 }} />
      </div>

      {/* Tiles */}
      <div className={classes.tiles} style={{ '--cols': 4 } as CSSProperties}>
        {times(tileCount).map((i) => (
          <div key={i} className={cn(classes.pane, classes.padded, classes.stackSm)}>
            <div className={classes.row}>
              <Bone h={24} w={24} radius={4} />
              <Bone h={TITLE} w={96} />
            </div>
            <Bone h={PAGE_TITLE} w={48} />
            <Bone h={SMALL} w={128} />
          </div>
        ))}
      </div>

      {showMyActions && (
        <div className={classes.twoCol}>
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={3} />
        </div>
      )}

      {showRoleSections && (
        <div className={classes.stack}>
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={2} />
        </div>
      )}
    </div>
  );
}

interface TileGridSkeletonProps {
  /** Number of tiles */
  count?: number;
  /** Columns at the largest breakpoint */
  columns?: 1 | 2 | 3 | 4;
  /** Render an optional title row above the grid */
  withHeader?: boolean;
  /** Tile height class (defaults to 140px) */
  tileHeight?: string;
}

/**
 * Skeleton for tile/card grids (e.g. marketplace product tiles, domain pills).
 */
export function TileGridSkeleton({
  count = 8,
  columns = 4,
  withHeader = false,
  tileHeight,
}: TileGridSkeletonProps) {
  return (
    <div className={classes.stack}>
      {withHeader && (
        <div className={classes.spread}>
          <Bone h={TITLE} w={192} />
          <Bone h={CONTROL} w={128} />
        </div>
      )}
      <div className={classes.tiles} style={{ '--cols': columns } as CSSProperties}>
        {times(count).map((i) => (
          <div
            key={i}
            className={cn(classes.pane, classes.padded, classes.stackSm, tileHeight)}
            style={tileHeight ? undefined : { height: 140 }}
          >
            <Bone h={14} w="75%" />
            <Bone h={SMALL} w="50%" />
            <Bone h={SMALL} w="66%" />
            <div className={classes.row}>
              <Bone h={BADGE} w={48} />
              <Bone h={BADGE} w={64} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DocViewerSkeletonProps {
  /** Show a Table-of-Contents sidebar */
  showToc?: boolean;
  /** Number of prose paragraph rows */
  proseRows?: number;
  /** Show a page title above the body */
  showTitle?: boolean;
}

/**
 * Skeleton for documentation / user guide pages with optional TOC sidebar
 * and a markdown-prose body.
 */
export function DocViewerSkeleton({
  showToc = true,
  proseRows = 12,
  showTitle = true,
}: DocViewerSkeletonProps) {
  // Cycle through canonical widths so the prose looks varied
  const widths = ['100%', '92%', '83%', '75%', '66%'];
  return (
    <div className={classes.stack}>
      {showTitle && (
        <div className={classes.stackSm}>
          <Bone h={PAGE_TITLE} w={288} />
          <Bone h={LINE} w={384} />
        </div>
      )}
      <div className={cn(classes.docs, !showToc && classes.center)}>
        {showToc && (
          <div className={classes.toc}>
            <div className={classes.tocInner}>
              <Bone h={LINE} w={96} />
              {times(8).map((i) => (
                <Bone key={i} h={SMALL} w={Math.round(Math.random() * 40 + 100)} />
              ))}
            </div>
          </div>
        )}
        <div className={classes.prose}>
          <Bone h={TITLE} w="50%" />
          {times(proseRows).map((i) => (
            <Bone key={i} h={SMALL} w={widths[i % widths.length]} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface GraphCanvasSkeletonProps {
  /** Show a left-side filter/legend panel */
  showFilterPanel?: boolean;
  /** Show a top toolbar */
  showToolbar?: boolean;
  /** Height class for the canvas block; defaults to 600px */
  height?: string;
}

/**
 * Skeleton for graph / diagram canvases (React Flow, ER diagrams, ontology).
 */
export function GraphCanvasSkeleton({
  showFilterPanel = false,
  showToolbar = true,
  height,
}: GraphCanvasSkeletonProps) {
  return (
    <div className={classes.stack}>
      {showToolbar && (
        <div className={classes.spread}>
          <div className={classes.row}>
            <Bone h={CONTROL} w={256} />
            <Bone h={CONTROL} w={96} />
            <Bone h={CONTROL} w={96} />
          </div>
          <div className={classes.row}>
            <Bone h={CONTROL} w={CONTROL} />
            <Bone h={CONTROL} w={CONTROL} />
            <Bone h={CONTROL} w={128} />
          </div>
        </div>
      )}
      <div className={classes.canvasRow}>
        {showFilterPanel && (
          <div className={cn(classes.side, classes.pane, classes.padded, classes.stack)}>
            <Bone h={TITLE} w={128} />
            <div className={classes.stackSm}>
              {times(5).map((i) => (
                <div key={i} className={classes.row}>
                  <Bone h={14} w={14} />
                  <Bone h={LINE} style={{ flex: 1, width: 'auto' }} />
                </div>
              ))}
            </div>
          </div>
        )}
        <Bone h={height ? undefined : 600} radius={6} className={height} style={{ flex: 1, width: 'auto' }} />
      </div>
    </div>
  );
}

interface WorkflowCanvasSkeletonProps {
  /** Show the right-hand inspector panel */
  showSidebar?: boolean;
  /** Height class for the canvas; defaults to the viewport less 12rem */
  height?: string;
}

/**
 * Skeleton for the Workflow Designer full-height layout.
 * Renders a top toolbar, a flow canvas and an optional inspector panel.
 */
export function WorkflowCanvasSkeleton({ showSidebar = true, height }: WorkflowCanvasSkeletonProps) {
  return (
    <div className={cn(classes.stack, height)} style={height ? undefined : { height: 'calc(100vh - 12rem)' }}>
      {/* Toolbar */}
      <div className={classes.spread}>
        <div className={classes.row}>
          <Bone h={CONTROL} w={128} />
          <Bone h={CONTROL} w={CONTROL} />
          <Bone h={CONTROL} w={CONTROL} />
        </div>
        <div className={classes.row}>
          <Bone h={CONTROL} w={96} />
          <Bone h={CONTROL} w={112} />
        </div>
      </div>

      {/* Canvas + sidebar */}
      <div className={classes.splitBody}>
        <Bone radius={6} style={{ flex: 1, width: 'auto' }} />
        {showSidebar && (
          <div className={cn(classes.inspector, classes.pane, classes.padded, classes.stack)}>
            <Bone h={TITLE} w={160} />
            <Bone h={LINE} w={128} />
            <div className={classes.stackSm}>
              {times(5).map((i) => (
                <div key={i} className={classes.stackXs}>
                  <Bone h={SMALL} w={96} />
                  <Bone h={CONTROL} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface HierarchyDetailSkeletonProps {
  /** Show the depth / view-mode controls bar */
  showControls?: boolean;
  /** Number of tree-row placeholders */
  treeRows?: number;
}

/**
 * Skeleton for the right-hand detail pane of the Hierarchy Browser.
 * Includes an icon header, badge row, control bar, and tree rows.
 */
export function HierarchyDetailSkeleton({ showControls = true, treeRows = 6 }: HierarchyDetailSkeletonProps) {
  return (
    <div className={cn(classes.stack, classes.padded)}>
      {/* Icon + title + badges */}
      <div className={classes.rowWide}>
        <Bone h={CONTROL} w={CONTROL} />
        <div className={cn(classes.grow, classes.stackSm)}>
          <Bone h={TITLE} w={224} />
          <Bone h={SMALL} w={160} />
        </div>
        <Bone h={CONTROL} w={96} />
      </div>

      <div className={classes.row}>
        <Bone h={BADGE} w={64} />
        <Bone h={BADGE} w={80} />
        <Bone h={BADGE} w={64} />
      </div>

      {showControls && (
        <div className={cn(classes.row, classes.ruled)}>
          <Bone h={CONTROL} w={128} />
          <Bone h={CONTROL} w={112} />
          <div className={cn(classes.row, classes.pushRight)}>
            <Bone h={CONTROL} w={CONTROL} />
            <Bone h={CONTROL} w={CONTROL} />
          </div>
        </div>
      )}

      <div className={classes.stackXs}>
        {times(treeRows).map((i) => (
          <div key={i} className={classes.treeRow} style={{ paddingLeft: `${(i % 3) * 16}px` }}>
            <Bone h={14} w={14} />
            <Bone h={LINE} w={Math.round(Math.random() * 40 + 140)} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface FilterBarSkeletonProps {
  /** Number of filter dropdown stubs */
  filterCount?: number;
  /** Show a search input on the left */
  withSearch?: boolean;
  /** Show a trailing action button (e.g. clear filters) */
  withAction?: boolean;
}

/**
 * Skeleton for a filter row (search + N filter dropdowns + optional action).
 * Use above tables, hierarchical browsers, etc.
 */
export function FilterBarSkeleton({ filterCount = 3, withSearch = true, withAction = false }: FilterBarSkeletonProps) {
  return (
    <div className={cn(classes.row, classes.wrap)}>
      {withSearch && <Bone h={CONTROL} w={256} />}
      {times(filterCount).map((i) => (
        <Bone key={i} h={CONTROL} w={128} />
      ))}
      {withAction && <Bone h={CONTROL} w={96} style={{ marginLeft: 'auto' }} />}
    </div>
  );
}

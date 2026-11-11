import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Alert, Badge, UnstyledButton } from '@mantine/core';
import type { Column, ColumnDef, Table as TanStackTable } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { RelativeDate } from '@/components/common/relative-date';
import { useEnrichCoverageTableStore } from '@/stores/enrich-coverage-table-store';
import { InfoTip } from '@/components/common/info-tip';
import classes from './coverage-matrix.module.css';

// ---------------------------------------------------------------------------
// Map lane — per-concept-scheme coverage matrix.
//
// Columns: Concept scheme | Concepts | Coverage% | Products | Contracts |
//          Assets | Suggested | Last run | (Review action).
//
// Rendered with the shared DataTable (sorting, column visibility, paging).
// Sort, page size and search live in useEnrichCoverageTableStore so they
// survive navigation and reload.
//
// IMPORTANT (data provenance):
//   Ontos does NOT currently expose a per-scheme coverage read-model. The
//   counts below (concepts / coverage% / products / contracts / assets /
//   suggested) are structural PLACEHOLDERS so the frame is reviewable. They
//   are clearly flagged as such in the UI (a "sample data" note) and must be
//   replaced by a real aggregation endpoint before this ships.
//
// TODO(cb-v2): needs coverage read-model endpoint — a per-concept-scheme
//   aggregation returning {concepts, coveredWithAnyLink, productLinks,
//   contractLinks, assetLinks, pendingSuggestions}. No such endpoint exists in
//   the backend today (term-mapping runs expose run-level stats only, not
//   per-scheme coverage). Do NOT invent one client-side.
// ---------------------------------------------------------------------------

export interface CoverageRow {
  /** Concept scheme (collection) id — used as a key only. */
  id: string;
  /** Scheme display name. */
  name: string;
  /** Total concepts in the scheme. */
  concepts: number;
  /** Share of concepts with >= 1 link, 0..100. */
  coveragePct: number;
  /** Concepts linked to data products (optional extra link). */
  products: number;
  /** Concepts linked to data contracts (optional extra link). */
  contracts: number;
  /** Concepts linked directly to a platform asset (the default path). */
  assets: number;
  /** Pending suggested matches awaiting review. */
  suggested: number;
  /** ISO timestamp of the latest term-mapping run targeting this scheme. */
  lastRun?: string | null;
}

/** Where the rows come from: the live read-model, or the sample rows while it loads or once it failed. */
export type CoverageSource = 'live' | 'loading' | 'failed';

interface Props {
  rows: CoverageRow[];
  platformNoun: string;
  /** Opens the inline "Review suggested matches" modal for a scheme. */
  onReview: (row: CoverageRow) => void;
  /** Whether the current user may act on suggestions. */
  canWrite?: boolean;
  /** True when rows come from the live coverage read-model; false when the
   *  endpoint was unavailable and placeholder rows are shown. */
  isLive?: boolean;
  /** Why the rows aren't live: 'failed' adds Retry to the sample-data notice. @default 'failed' when not live */
  source?: CoverageSource;
  /** Loads the live rows again, from the sample-data notice. */
  onRetry?: () => void;
}

type Tone = 'sky' | 'amber';

function SortHeader<T>({
  column,
  label,
  align = 'right',
  tone,
}: {
  column: Column<T, unknown>;
  label: string;
  align?: 'left' | 'right';
  tone?: Tone;
}) {
  const sorted = column.getIsSorted();
  // The arrow shows on the sorted column only; the hover state signals the rest.
  const Icon = sorted === 'asc' ? ArrowUp : ArrowDown;
  return (
    <UnstyledButton
      className={classes.sort}
      data-align={align}
      data-tone={tone}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {label}
      {/* The arrow sits in the cell's side padding, so sorting never widens the header. */}
      {sorted && <Icon className={classes.sortIcon} aria-hidden />}
    </UnstyledButton>
  );
}

function CoverageBar({ pct }: { pct: number }) {
  return (
    <span className={classes.bar}>
      <span className={classes.track}>
        <span className={classes.fill} style={{ width: `${pct}%` }} />
      </span>
      <b className={classes.num}>{pct}%</b>
    </span>
  );
}

const Num = ({ value, tone }: { value: number; tone?: Tone }) => (
  <div className={classes.num} data-tone={tone}>{value}</div>
);

export default function CoverageMatrix({
  rows,
  platformNoun,
  onReview,
  canWrite = true,
  isLive = true,
  source = isLive ? 'live' : 'failed',
  onRetry,
}: Props) {
  const { t } = useTranslation(['concepts', 'common']);
  const search = useEnrichCoverageTableStore((s) => s.search);
  const setSearch = useEnrichCoverageTableStore((s) => s.setSearch);
  const sorting = useEnrichCoverageTableStore((s) => s.sorting);
  const setSorting = useEnrichCoverageTableStore((s) => s.setSorting);
  const pageSize = useEnrichCoverageTableStore((s) => s.pageSize);
  const setPageSize = useEnrichCoverageTableStore((s) => s.setPageSize);

  // Rollup over ALL rows (not the filtered/paged subset), so the totals
  // footer stays accurate on every page and for any search.
  const totals = rows.reduce(
    (acc, r) => {
      acc.concepts += r.concepts;
      acc.products += r.products;
      acc.contracts += r.contracts;
      acc.assets += r.assets;
      acc.suggested += r.suggested;
      acc.covered += Math.round((r.coveragePct / 100) * r.concepts);
      return acc;
    },
    { concepts: 0, products: 0, contracts: 0, assets: 0, suggested: 0, covered: 0 },
  );
  const totalPct = totals.concepts
    ? Math.round((totals.covered / totals.concepts) * 100)
    : 0;
  const unmapped = totals.concepts - totals.covered;

  // DataTable's controlled search does not filter client-side, so filter by
  // scheme name here and hand the result to the table.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const columns = useMemo<ColumnDef<CoverageRow>[]>(
    () => [
      {
        id: 'scheme',
        accessorKey: 'name',
        header: ({ column }) => (
          <SortHeader column={column} align="left" label={t('enrich.map.col.scheme', 'Concept scheme')} />
        ),
        // Long names truncate inside a bounded width; the full name is in the
        // tooltip, so the column never stretches.
        cell: ({ row }) => (
          <div className={classes.scheme}>
            <span className={classes.schemeName} title={row.original.name}>
              {row.original.name}
            </span>
            {row.original.lastRun && (
              <span className={classes.lastRun}>
                {t('enrich.map.col.lastRun', 'Last run')} <RelativeDate date={row.original.lastRun} />
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'concepts',
        size: 84,
        accessorKey: 'concepts',
        header: ({ column }) => (
          <SortHeader column={column} label={t('enrich.map.col.concepts', 'Concepts')} />
        ),
        cell: ({ row }) => <Num value={row.original.concepts} />,
      },
      {
        id: 'coverage',
        size: 116,
        accessorKey: 'coveragePct',
        header: ({ column }) => (
          <SortHeader column={column} label={t('enrich.map.col.coverage', 'Coverage')} />
        ),
        cell: ({ row }) => <CoverageBar pct={row.original.coveragePct} />,
      },
      {
        id: 'products',
        size: 84,
        accessorKey: 'products',
        header: ({ column }) => (
          <SortHeader column={column} tone="sky" label={t('enrich.map.col.products', 'Products')} />
        ),
        cell: ({ row }) => <Num value={row.original.products} tone="sky" />,
      },
      {
        id: 'contracts',
        size: 92,
        accessorKey: 'contracts',
        header: ({ column }) => (
          <SortHeader column={column} tone="sky" label={t('enrich.map.col.contracts', 'Contracts')} />
        ),
        cell: ({ row }) => <Num value={row.original.contracts} tone="sky" />,
      },
      {
        id: 'assets',
        size: 100,
        accessorKey: 'assets',
        header: ({ column }) => (
          <div className={classes.headWithTip}>
            <SortHeader column={column} tone="amber" label={t('enrich.map.col.assets', 'Assets')} />
            <InfoTip
              text={t(
                'enrich.map.assetNote',
                'Asset links are what Deliver enriches in step 2. Asset-direct linking works even before any product or contract exists, so it solves the chicken-and-egg case.',
              )}
            />
          </div>
        ),
        cell: ({ row }) => <Num value={row.original.assets} tone="amber" />,
      },
      {
        id: 'suggested',
        size: 92,
        accessorKey: 'suggested',
        header: ({ column }) => (
          <SortHeader column={column} label={t('enrich.map.col.suggested', 'Suggested')} />
        ),
        cell: ({ row }) => (
          <div className={classes.num}>
            {row.original.suggested > 0 ? (
              <Badge size="sm" radius="sm" variant="light" color="yellow" className={classes.suggested}>
                {row.original.suggested}
              </Badge>
            ) : (
              <span className={classes.zero}>0</span>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        size: 72,
        header: () => null,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className={classes.num}>
            <Button
              variant="outline"
              size="sm"
              disabled={!canWrite || row.original.suggested === 0}
              onClick={() => onReview(row.original)}
            >
              {t('enrich.map.review', 'Review')}
            </Button>
          </div>
        ),
      },
    ],
    [t, canWrite, onReview],
  );

  // "All selected" footer: one cell per VISIBLE column so it stays aligned
  // when the user hides columns from the Columns menu.
  const renderTotals = (table: TanStackTable<CoverageRow>) => (
    <tr className={classes.totals}>
      {table.getVisibleLeafColumns().map((col) => {
        let content: ReactNode = null;
        switch (col.id) {
          case 'scheme':
            content = t('enrich.map.allSelected', 'All selected');
            break;
          case 'concepts':
            content = <Num value={totals.concepts} />;
            break;
          case 'coverage':
            content = <CoverageBar pct={totalPct} />;
            break;
          case 'products':
            content = <Num value={totals.products} tone="sky" />;
            break;
          case 'contracts':
            content = <Num value={totals.contracts} tone="sky" />;
            break;
          case 'assets':
            content = <Num value={totals.assets} tone="amber" />;
            break;
          case 'suggested':
            content = <Num value={totals.suggested} />;
            break;
        }
        return (
          <td key={col.id} data-column={col.id} className={classes.totalCell}>
            {content}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className={classes.root}>
      {/* Disclosure only when the live coverage read-model is unavailable and
          we are showing placeholder rows. When live, no note is needed. Once
          it failed, Retry loads the live rows again. */}
      {source !== 'live' && (
        <Alert color="yellow" variant="light" className={classes.notice}>
          <span>
            {t(
              'enrich.map.placeholderNote',
              'Coverage figures are sample data — the live coverage service is unavailable right now.',
            )}{' '}
            <span className={classes.code}>({platformNoun})</span>
          </span>
          {source === 'failed' && onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className={classes.retry}>
              {t('common:retry', 'Retry')}
            </Button>
          )}
        </Alert>
      )}

      {/* The table's frame scrolls sideways inside the pane when the window is narrow */}
      <div data-enrich-matrix="" className={classes.matrix}>
        <DataTable<CoverageRow, unknown>
          columns={columns}
          data={filteredRows}
          searchColumn="scheme"
          selectable={false}
          dense
          fixedLayout
          searchValue={search}
          onSearchChange={setSearch}
          sorting={sorting}
          onSortingChange={setSorting}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          footer={rows.length > 0 ? renderTotals : undefined}
        />
      </div>

      <p className={classes.unmapped}>
        <span className={classes.dot} aria-hidden />
        {t(
          'enrich.map.unmappedNote',
          '{{unmapped}} concepts have no link yet.',
          { unmapped },
        )}
        <InfoTip
          text={t(
            'enrich.map.coverageTip',
            "Coverage = share of a concept scheme's concepts with at least one link. Products and Contracts are optional extra links, so the three counts don't sum to the total. Only Assets can be enriched in step 2.",
          )}
        />
      </p>
    </div>
  );
}

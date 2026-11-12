import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { ActionIcon, NativeSelect } from '@mantine/core';
import classes from './paginated-list.module.css';

// ---------------------------------------------------------------------------
// Reusable client-side pagination primitive (Concept Builder v2 polish).
//
// A single small helper reused by every long-list surface (Define in-progress
// runs, Enrich coverage matrix, Concepts list view, Version history) so we get
// one consistent "Prev / Page X of Y / Next" control instead of four bespoke
// paginators. On Mantine since wave 2 Task 12a (paginated-list.module.css),
// with the same props, so its callers keep working.
//
//   const { pageItems, page, setPage, pageCount } = usePagination(items, 10);
//   ...render pageItems...
//   <PaginationControls page={page} pageCount={pageCount} onPageChange={setPage} />
// ---------------------------------------------------------------------------

export interface UsePaginationResult<T> {
  /** The slice of items for the current page. */
  pageItems: T[];
  /** 1-based current page. */
  page: number;
  /** Set the current page (clamped to [1, pageCount]). */
  setPage: (page: number) => void;
  /** Total number of pages (>= 1). */
  pageCount: number;
  /** Current page size. */
  pageSize: number;
  /** Change the page size (resets to page 1). Feeds the selector in the controls. */
  setPageSize: (size: number) => void;
}

/**
 * Client-side pagination. `initialPageSize` defaults to 10 (the standard) and
 * becomes user-adjustable state — pass the chosen size into <PaginationControls>
 * so it can render a "rows per page" selector.
 */
export function usePagination<T>(items: T[], initialPageSize = 10): UsePaginationResult<T> {
  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(initialPageSize);

  const pageCount = Math.max(1, Math.ceil(items.length / Math.max(1, pageSize)));

  // Clamp the page if the underlying list shrinks (filtering, deletes) so we
  // never strand the user on an empty page past the end.
  useEffect(() => {
    if (page > pageCount) setPageRaw(pageCount);
  }, [page, pageCount]);

  const setPage = (next: number) => {
    setPageRaw(Math.min(Math.max(1, next), pageCount));
  };

  // Changing the page size resets to page 1 so the user isn't stranded past the
  // new end.
  const setPageSize = (size: number) => {
    setPageSizeRaw(Math.max(1, size));
    setPageRaw(1);
  };

  const pageItems = useMemo(() => {
    const clamped = Math.min(Math.max(1, page), pageCount);
    const start = (clamped - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageCount, pageSize]);

  return { pageItems, page: Math.min(page, pageCount), setPage, pageCount, pageSize, setPageSize };
}

interface PaginationControlsProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Show first/last jump buttons. Cheap, so on by default. */
  showEdges?: boolean;
  className?: string;
  /** Current page size. Pass this + onPageSizeChange to render the size selector. */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  /** Options for the "rows per page" selector. */
  pageSizeOptions?: number[];
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Compact Prev / "Page X of Y" / Next control, with optional first/last jumps
// and an optional "rows per page" selector. The page nav collapses when there
// is only one page, but the size selector still shows (so the user can change
// the size even on a short list) whenever onPageSizeChange is provided.
export function PaginationControls({
  page,
  pageCount,
  onPageChange,
  showEdges = true,
  className,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginationControlsProps) {
  const { t } = useTranslation('common');
  const showNav = pageCount > 1;
  const showSize = !!onPageSizeChange && pageSize != null;
  if (!showNav && !showSize) return null;

  const atStart = page <= 1;
  const atEnd = page >= pageCount;

  const pageButton = (label: string, disabled: boolean, target: number, Icon: typeof ChevronLeft) => (
    <ActionIcon
      variant="default"
      size={26}
      className={classes.pageButton}
      disabled={disabled}
      aria-label={label}
      onClick={() => onPageChange(target)}
    >
      <Icon aria-hidden />
    </ActionIcon>
  );

  return (
    <div className={className ? `${classes.controls} ${className}` : classes.controls}>
      {showSize && (
        <div className={classes.size}>
          <span className={classes.sizeLabel} aria-hidden>
            {t('pagination.rowsPerPage', 'Rows per page')}
          </span>
          <NativeSelect
            size="xs"
            classNames={{ input: classes.sizeSelect }}
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange!(Number(e.currentTarget.value))}
            aria-label={t('pagination.rowsPerPage', 'Rows per page')}
            data={pageSizeOptions.map((opt) => String(opt))}
          />
        </div>
      )}
      {showNav && showEdges && pageButton(t('pagination.first', 'First page'), atStart, 1, ChevronsLeft)}
      {showNav && pageButton(t('pagination.previous', 'Previous page'), atStart, page - 1, ChevronLeft)}
      {showNav && (
        <span className={classes.pageOf}>
          {t('pagination.pageOf', 'Page {{page}} of {{pageCount}}', { page, pageCount })}
        </span>
      )}
      {showNav && pageButton(t('pagination.next', 'Next page'), atEnd, page + 1, ChevronRight)}
      {showNav && showEdges && pageButton(t('pagination.last', 'Last page'), atEnd, pageCount, ChevronsRight)}
    </div>
  );
}

export default PaginationControls;

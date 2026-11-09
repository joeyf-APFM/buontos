import type { ReactNode } from 'react';
import { Button, Skeleton, UnstyledButton } from '@mantine/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RelativeDate } from '@/components/common/relative-date';
import type { AssetSummary } from './api';
import { STATUS_COLORS, ownerText, shortLabel } from './format';
import { ColumnSubgrid } from './column-subgrid';
import { expansionKind, hasMore, leftCount, type Expansion, type ExpansionKind } from './use-expansions';
import classes from './explorer.module.css';

export function StatusDot({ status }: { status: string }) {
  const { t } = useTranslation('asset-explorer');
  return (
    <span>
      <span className={classes.dot} style={{ background: STATUS_COLORS[status] ?? STATUS_COLORS.deprecated }} aria-hidden />
      {t(`status.${status}`, status)}
    </span>
  );
}

interface AssetTableProps {
  items: AssetSummary[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (asset: AssetSummary) => void;
  /** Whether rows with children can open (off for a flat list of matches). */
  nesting?: boolean;
  /** Open rows by row path; see useExpansions. */
  expansions?: Record<string, Expansion>;
  onToggle?: (key: string, row: AssetSummary, kind: ExpansionKind) => void;
  onMore?: (key: string) => void;
  onRetryExpansion?: (key: string) => void;
}

const COLUMNS = ['name', 'type', 'owner', 'status', 'concepts', 'updated'] as const;

/** Name-cell indent: 16px per nesting level. */
const indent = (level: number) => 10 + 16 * (level - 1);

/**
 * One page of assets: 28px rows; a row click opens its details. With nesting
 * on, a row with children opens (chevron, or the arrow keys) into its child
 * rows, or for a table into a column sub-grid.
 */
export function AssetTable({
  items, loading, error, onRetry, selectedId, onSelect,
  nesting = false, expansions = {}, onToggle = () => {}, onMore = () => {}, onRetryExpansion = () => {},
}: AssetTableProps) {
  const { t } = useTranslation('asset-explorer');

  if (error) {
    return (
      <div className={classes.error} role="alert">
        <span>{t('loadError', { message: error })}</span>
        <Button variant="default" onClick={onRetry}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  /** A full-width row under an open row: loading, an error, nothing, or Show more. */
  const wideRow = (key: string, level: number, content: ReactNode, className?: string) => (
    <tr key={key} aria-level={level} className={className}>
      <td colSpan={COLUMNS.length} style={{ paddingLeft: indent(level) + 16 }}>
        {content}
      </td>
    </tr>
  );

  const stateRows = (key: string, e: Expansion, level: number): ReactNode[] => {
    const rows: ReactNode[] = [];
    const errorRow = (k: string) =>
      wideRow(
        k,
        level,
        <span className={classes.nestError}>
          <span role="alert">{t('grid.loadError', { message: e.error })}</span>
          <Button variant="default" size="compact-xs" onClick={() => onRetryExpansion(key)}>
            {t('retry')}
          </Button>
        </span>,
        classes.nestRow,
      );
    const skeleton = (k: string) => wideRow(k, level, <Skeleton height={8} radius="sm" />, classes.nestRow);
    if (e.status === 'loading') rows.push(skeleton(`${key}:loading`));
    if (e.status === 'error') rows.push(errorRow(`${key}:error`));
    if (e.status === 'ready' && !e.items.length && !hasMore(e)) {
      rows.push(wideRow(`${key}:empty`, level, <span className={classes.nestEmpty}>{t('grid.noChildren')}</span>, classes.nestRow));
    }
    if (e.status === 'loadingMore') rows.push(skeleton(`${key}:more`));
    if (e.status === 'moreError') rows.push(errorRow(`${key}:moreError`));
    if (e.status === 'ready' && hasMore(e)) {
      rows.push(
        wideRow(
          `${key}:showMore`,
          level,
          <Button variant="subtle" size="compact-xs" onClick={() => onMore(key)}>
            {t('grid.showMore', { count: leftCount(e) })}
          </Button>,
          classes.nestRow,
        ),
      );
    }
    return rows;
  };

  const renderRows = (rows: AssetSummary[], level: number, parentPath?: string, parentName?: string): ReactNode[] =>
    rows.flatMap((a) => {
      const key = parentPath ? `${parentPath}/${a.id}` : a.id;
      const kind = nesting ? expansionKind(a) : null;
      const open = expansions[key];
      const isSelected = a.id === selectedId;
      const Chevron = open ? ChevronDown : ChevronRight;
      const toggle = () => kind && onToggle(key, a, kind);
      const out: ReactNode[] = [
        <tr
          key={key}
          aria-level={level}
          aria-expanded={kind ? !!open : undefined}
          data-selected={isSelected || undefined}
          aria-selected={isSelected}
          tabIndex={0}
          onClick={() => onSelect(a)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSelect(a);
            if ((e.key === 'ArrowRight' && kind && !open) || (e.key === 'ArrowLeft' && open)) toggle();
          }}
        >
          <td className={classes.mono} style={{ paddingLeft: indent(level) }}>
            <span className={classes.nameCell}>
              {kind ? (
                <UnstyledButton
                  className={classes.rowChevron}
                  aria-label={t(open ? 'grid.collapse' : 'grid.expand', { name: a.name })}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle();
                  }}
                >
                  <Chevron size={12} aria-hidden />
                </UnstyledButton>
              ) : (
                <span className={classes.rowChevron} aria-hidden />
              )}
              <span data-name>{parentName ? shortLabel(a.name, parentName) : a.name}</span>
            </span>
          </td>
          <td>{a.asset_type_name}</td>
          <td>{ownerText(a)}</td>
          <td>
            <StatusDot status={a.status} />
          </td>
          <td>{a.concepts.join(', ')}</td>
          <td>{a.updated_at && <RelativeDate date={a.updated_at} />}</td>
        </tr>,
      ];
      if (!open) return out;
      if (open.kind === 'children') {
        out.push(...renderRows(open.items, level + 1, key, a.name), ...stateRows(key, open, level + 1));
      } else {
        out.push(
          <tr key={`${key}:columns`} aria-level={level + 1} className={classes.subgridHost}>
            <td colSpan={COLUMNS.length} style={{ paddingLeft: indent(level + 1) + 16 }}>
              <ColumnSubgrid
                expansion={open}
                selectedId={selectedId}
                onSelect={onSelect}
                onMore={() => onMore(key)}
                onRetry={() => onRetryExpansion(key)}
              />
            </td>
          </tr>,
        );
      }
      return out;
    });

  return (
    <table className={classes.table} role="treegrid">
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c}>{t(`columns.${c}`)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading && !items.length ? (
          Array.from({ length: 3 }, (_, i) => (
            <tr key={i} aria-hidden>
              <td colSpan={COLUMNS.length}>
                <Skeleton height={10} radius="sm" />
              </td>
            </tr>
          ))
        ) : !items.length ? (
          <tr>
            <td colSpan={COLUMNS.length} className={classes.empty}>
              {t('empty')}
            </td>
          </tr>
        ) : (
          renderRows(items, 1)
        )}
      </tbody>
    </table>
  );
}

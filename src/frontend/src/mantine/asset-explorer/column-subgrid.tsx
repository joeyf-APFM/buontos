import type { ReactNode } from 'react';
import { Button, Skeleton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { AssetSummary } from './api';
import { shortLabel } from './format';
import { hasMore, leftCount, type Expansion } from './use-expansions';
import classes from './explorer.module.css';

const COLUMNS = ['column', 'dataType', 'nullable', 'description', 'concepts'] as const;

interface ColumnSubgridProps {
  expansion: Expansion;
  selectedId: string | null;
  onSelect: (column: AssetSummary) => void;
  onMore: () => void;
  onRetry: () => void;
}

/** A table's columns, under its row: 24px rows, one density step below the grid. */
export function ColumnSubgrid({ expansion, selectedId, onSelect, onMore, onRetry }: ColumnSubgridProps) {
  const { t } = useTranslation('asset-explorer');
  const { parent, items, status, error } = expansion;
  const nullable = (c: AssetSummary) =>
    c.nullable === true ? t('subgrid.yes') : c.nullable === false ? t('subgrid.no') : '—';
  const wide = (content: ReactNode, key: string) => (
    <tr key={key}>
      <td colSpan={COLUMNS.length}>{content}</td>
    </tr>
  );
  const errorRow = (key: string) =>
    wide(
      <span className={classes.nestError}>
        <span role="alert">{t('grid.loadError', { message: error })}</span>
        <Button variant="default" size="compact-xs" onClick={onRetry}>
          {t('retry')}
        </Button>
      </span>,
      key,
    );
  const skeletonRow = (key: string) => wide(<Skeleton height={8} radius="sm" aria-hidden />, key);

  return (
    <table className={classes.subgrid} aria-label={t('subgrid.label', { name: parent.name })}>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c}>{t(`subgrid.${c}`)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {status === 'loading' && skeletonRow('loading')}
        {status === 'error' && errorRow('error')}
        {items.map((c) => (
          <tr
            key={c.id}
            data-selected={c.id === selectedId || undefined}
            aria-selected={c.id === selectedId}
            tabIndex={0}
            onClick={() => onSelect(c)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(c)}
          >
            <td className={classes.mono}>{shortLabel(c.name, parent.name)}</td>
            <td className={classes.mono}>{c.data_type ?? ''}</td>
            <td>{nullable(c)}</td>
            <td>
              {c.description && (
                <span className={classes.truncate} title={c.description}>
                  {c.description}
                </span>
              )}
            </td>
            <td>{c.concepts.join(', ')}</td>
          </tr>
        ))}
        {status === 'ready' && !items.length && wide(<span className={classes.nestEmpty}>{t('grid.noChildren')}</span>, 'empty')}
        {status === 'loadingMore' && skeletonRow('more')}
        {status === 'moreError' && errorRow('moreError')}
        {status === 'ready' &&
          hasMore(expansion) &&
          wide(
            <Button variant="subtle" size="compact-xs" onClick={onMore}>
              {t('grid.showMore', { count: leftCount(expansion) })}
            </Button>,
            'more',
          )}
      </tbody>
    </table>
  );
}

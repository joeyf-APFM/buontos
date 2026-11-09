import { Button, Skeleton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { RelativeDate } from '@/components/common/relative-date';
import type { AssetSummary } from './api';
import { STATUS_COLORS, ownerText } from './format';
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
}

const COLUMNS = ['name', 'type', 'owner', 'status', 'concepts', 'updated'] as const;

/** One page of assets: 28px rows, a row click opens its details. */
export function AssetTable({ items, loading, error, onRetry, selectedId, onSelect }: AssetTableProps) {
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

  return (
    <table className={classes.table}>
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
          items.map((a) => (
            <tr
              key={a.id}
              data-selected={a.id === selectedId || undefined}
              aria-selected={a.id === selectedId}
              tabIndex={0}
              onClick={() => onSelect(a)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(a)}
            >
              <td className={classes.mono}>{a.name}</td>
              <td>{a.asset_type_name}</td>
              <td>{ownerText(a)}</td>
              <td>
                <StatusDot status={a.status} />
              </td>
              <td>{a.concepts.join(', ')}</td>
              <td>{a.updated_at && <RelativeDate date={a.updated_at} />}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

import type { ReactNode } from 'react';
import { Button, CloseButton } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RelativeDate } from '@/components/common/relative-date';
import type { AssetSummary } from './api';
import { StatusDot } from './asset-table';
import { ownerText } from './format';
import classes from './explorer.module.css';

const primaryDomainName = (a: AssetSummary) =>
  (a.domains.find((d) => d.domain_id === a.primary_domain_id) ?? a.domains.find((d) => d.is_primary))?.domain_name ?? '';

interface DetailsPanelProps {
  asset: AssetSummary;
  onClose: () => void;
  /** Opens the edit form; without it (no write access) there is no Edit button. */
  onEdit?: () => void;
  /** The asset is loading for the edit form. */
  editPending?: boolean;
  /** Why the edit form couldn't open. */
  editError?: string | null;
}

/** The selected row's summary, beside the list. */
export function DetailsPanel({ asset, onClose, onEdit, editPending = false, editError }: DetailsPanelProps) {
  const { t } = useTranslation('asset-explorer');
  const rows: [string, ReactNode][] = [
    ['type', asset.asset_type_name],
    ['fullName', <span key="fullName" className={classes.mono}>{asset.location ?? asset.name}</span>],
    ['branch', asset.data_branch ? t(`branches.${asset.data_branch}`) : ''],
    ['owner', ownerText(asset)],
    ['status', <StatusDot key="status" status={asset.status} />],
    ['columns', asset.column_count ?? ''],
    ['concepts', asset.concepts.join(', ')],
    ['domain', primaryDomainName(asset)],
    ['updated', asset.updated_at && <RelativeDate key="updated" date={asset.updated_at} />],
  ];

  return (
    <aside className={classes.details} aria-label={asset.name}>
      <div className={classes.detailsHead}>
        <span className={`${classes.detailsName} ${classes.mono}`}>{asset.name}</span>
        {onEdit && (
          <Button variant="default" size="compact-xs" onClick={onEdit} disabled={editPending} loading={editPending}>
            {t('details.edit')}
          </Button>
        )}
        <CloseButton aria-label={t('details.close')} onClick={onClose} />
      </div>
      <div className={classes.detailsBody}>
        {editError && (
          <div className={classes.detailsError} role="alert">
            {t('details.editError', { message: editError })}
          </div>
        )}
        <dl className={classes.kv}>
          {rows.map(([key, value]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt>{t(`details.${key}`)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <h5 className={classes.detailsHeading}>{t('details.description')}</h5>
        <div className={classes.description}>{asset.description || t('details.noDescription')}</div>
        <Link className={classes.fullPage} to={`/assets/${asset.id}`}>
          {t('details.openFullPage')}
        </Link>
      </div>
    </aside>
  );
}

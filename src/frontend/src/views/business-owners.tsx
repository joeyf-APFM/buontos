import { useState, useEffect, useCallback, useMemo } from 'react';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Alert, UnstyledButton } from '@mantine/core';
import { AlertCircle, ArrowUpDown } from 'lucide-react';
import { ListViewSkeleton } from '@/components/common/list-view-skeleton';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { BusinessOwnerRead } from '@/types/business-owner';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { RelativeDate } from '@/components/common/relative-date';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { PageHeader, PageLayout, Pane } from '@/mantine/page';
import grid from '@/mantine/asset-explorer/explorer.module.css';
import { useTranslation } from 'react-i18next';
import classes from './business-owners.module.css';

/** A header label that sorts its column, in the grid's header-label look. */
function SortButton({ column, label }: { column: Column<BusinessOwnerRead, unknown>; label: string }) {
  return (
    <UnstyledButton className={classes.sort} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
      {label}
      <ArrowUpDown aria-hidden className={classes.sortIcon} data-active={column.getIsSorted() ? '' : undefined} />
    </UnstyledButton>
  );
}

export default function BusinessOwnersView() {
  const [owners, setOwners] = useState<BusinessOwnerRead[]>([]);
  const [componentError, setComponentError] = useState<string | null>(null);

  const { t } = useTranslation(['business-owners', 'common']);
  const { get: apiGet, loading: apiIsLoading } = useApi();
  const { toast } = useToast();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((state) => state.setDynamicTitle);

  const featureId = 'business-owners';
  const canRead = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.READ_ONLY);

  const fetchOwners = useCallback(async () => {
    if (!canRead && !permissionsLoading) {
      setComponentError(t('permissions.deniedView'));
      return;
    }
    setComponentError(null);
    try {
      const response = await apiGet<BusinessOwnerRead[]>('/api/business-owners');
      if (response.error) throw new Error(response.error);
      setOwners(Array.isArray(response.data) ? response.data : []);
    } catch (err: any) {
      setComponentError(err.message || 'Failed to load business owners');
      setOwners([]);
      toast({ variant: 'destructive', title: t('messages.errorFetching'), description: err.message });
    }
  }, [canRead, permissionsLoading, apiGet, toast, t]);

  useEffect(() => {
    fetchOwners();
    setStaticSegments([]);
    setDynamicTitle(t('title'));
    return () => { setStaticSegments([]); setDynamicTitle(null); };
  }, [fetchOwners, setStaticSegments, setDynamicTitle, t]);

  // Memoised for the DataTable, so the cells (and a focused header) are kept across renders
  const columns = useMemo<ColumnDef<BusinessOwnerRead>[]>(() => [
    {
      accessorKey: 'user_email',
      header: ({ column }) => <SortButton column={column} label={t('table.owner')} />,
      cell: ({ row }) => (
        <div className={classes.owner}>
          <span className={classes.ownerName}>{row.original.user_name || row.original.user_email}</span>
          {row.original.user_name && (
            <span className={classes.ownerEmail}>{row.original.user_email}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'role_name',
      header: t('table.role'),
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.role_name || '-'}</Badge>
      ),
    },
    {
      accessorKey: 'object_type',
      header: t('table.objectType'),
      cell: ({ row }) => (
        <Badge variant="secondary">{t(`objectTypes.${row.original.object_type}`)}</Badge>
      ),
    },
    {
      accessorKey: 'object_id',
      header: t('table.object'),
      cell: ({ row }) => (
        <span className={`${grid.mono} ${classes.objectId}`} title={row.original.object_id}>
          {row.original.object_id}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('table.status'),
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
          {row.original.is_active ? t('statusLabels.active') : t('statusLabels.inactive')}
        </Badge>
      ),
    },
    {
      accessorKey: 'assigned_at',
      header: ({ column }) => <SortButton column={column} label={t('table.assignedAt')} />,
      cell: ({ row }) => row.original.assigned_at
        ? <RelativeDate date={row.original.assigned_at} />
        : t('common:states.notAvailable'),
    },
  ], [t]);

  return (
    <PageLayout
      fullBleed
      header={
        <>
          <PageHeader title={t('title')} />
          <p className={classes.subtitle}>{t('subtitle')}</p>
        </>
      }
    >
      <Pane flush aria-label={t('listPane')}>
        <div className={classes.body}>
          {(apiIsLoading || permissionsLoading) ? (
            <ListViewSkeleton columns={6} rows={5} toolbarButtons={0} />
          ) : !canRead ? (
            <Alert color="red" variant="light" icon={<AlertCircle />} title={t('permissions.permissionDenied')} className={classes.alert}>
              {t('permissions.deniedView')}
            </Alert>
          ) : componentError ? (
            <Alert color="red" variant="light" icon={<AlertCircle />} title={t('messages.errorLoadingData')} className={classes.alert}>
              {componentError}
            </Alert>
          ) : (
            <DataTable
              columns={columns}
              data={owners}
              searchColumn="user_email"
              storageKey="business-owners-sort"
            />
          )}
        </div>
      </Pane>
    </PageLayout>
  );
}

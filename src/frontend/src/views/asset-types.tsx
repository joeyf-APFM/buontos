import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Column, ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, PlusCircle, AlertCircle, ArrowUpDown } from 'lucide-react';
import { ActionIcon, Alert, Loader, Menu, Modal, UnstyledButton } from '@mantine/core';
import { ListViewSkeleton } from '@/components/common/list-view-skeleton';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { AssetTypeRead } from '@/types/asset';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { RelativeDate } from '@/components/common/relative-date';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import SettingsPageWrapper from '@/components/settings/settings-page-wrapper';
import { useTranslation } from 'react-i18next';
import { AssetTypeFormDialog } from '@/components/asset-types/asset-type-form-dialog';
import { Breadcrumb, PageHeader, PageLayout, Pane } from '@/mantine/page';
import classes from './asset-types.module.css';

/** A header label that sorts its column, in the grid's header-label look. */
function SortButton({ column, label }: { column: Column<AssetTypeRead, unknown>; label: string }) {
  return (
    <UnstyledButton className={classes.sort} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
      {label}
      <ArrowUpDown aria-hidden className={classes.sortIcon} data-active={column.getIsSorted() ? '' : undefined} />
    </UnstyledButton>
  );
}

interface RowActionsProps {
  assetType: AssetTypeRead;
  canWrite: boolean;
  canAdmin: boolean;
  /** Each gets this row's menu button, for focus once the dialog it opens closes. */
  onEdit: (assetType: AssetTypeRead, opener: HTMLElement | null) => void;
  onDelete: (id: string, opener: HTMLElement | null) => void;
}

/**
 * The row's actions menu. Escape or a click outside puts focus back on its
 * button; an item that opens a dialog doesn't, so the dialog keeps focus
 * (it gives focus back to the button when it closes).
 */
function RowActions({ assetType, canWrite, canAdmin, onEdit, onDelete }: RowActionsProps) {
  const { t } = useTranslation(['asset-types']);
  const [returnFocus, setReturnFocus] = useState(true);
  const trigger = useRef<HTMLButtonElement>(null);
  const openDialog = (open: (opener: HTMLElement | null) => void) => {
    setReturnFocus(false);
    open(trigger.current);
  };
  return (
    // hideDetached off: the menu stays put when its row scrolls out of view,
    // as the Radix menu did (its hideWhenDetached is off by default)
    <Menu
      position="bottom-end"
      hideDetached={false}
      returnFocus={returnFocus}
      onOpen={() => setReturnFocus(true)}
      classNames={{ label: classes.menuLabel }}
    >
      <Menu.Target>
        <ActionIcon ref={trigger} variant="subtle" color="gray" aria-label={t('openMenu')} className={classes.menuButton}>
          <MoreHorizontal aria-hidden />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('table.actions')}</Menu.Label>
        <Menu.Item disabled={!canWrite} onClick={() => openDialog((opener) => onEdit(assetType, opener))}>
          {t('editAssetType')}
        </Menu.Item>
        {/* A separator, as the Radix menu's was */}
        <Menu.Divider role="separator" />
        <Menu.Item className={classes.danger} disabled={!canAdmin} onClick={() => openDialog((opener) => onDelete(assetType.id, opener))}>
          {t('deleteAssetType')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export default function AssetTypesView() {
  const [assetTypes, setAssetTypes] = useState<AssetTypeRead[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [componentError, setComponentError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAssetType, setEditingAssetType] = useState<AssetTypeRead | null>(null);
  // The button that opened the form or the delete dialog, for focus on close
  const opener = useRef<HTMLElement | null>(null);
  // Only the latest load may set the list: an earlier one that answers late is dropped
  const loadId = useRef(0);

  const { t } = useTranslation(['asset-types', 'common']);
  const { get: apiGet, delete: apiDelete, loading: apiIsLoading } = useApi();
  const { toast } = useToast();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();

  const featureId = 'assets';
  const canRead = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.READ_ONLY);
  const canWrite = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.READ_WRITE);
  const canAdmin = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.ADMIN);

  const fetchAssetTypes = useCallback(async () => {
    const id = ++loadId.current;
    if (!canRead && !permissionsLoading) {
      setComponentError(t('permissions.deniedView'));
      return;
    }
    setComponentError(null);
    try {
      const response = await apiGet<AssetTypeRead[]>('/api/asset-types');
      if (id !== loadId.current) return;
      if (response.error) throw new Error(response.error);
      setAssetTypes(Array.isArray(response.data) ? response.data : []);
    } catch (err: any) {
      if (id !== loadId.current) return;
      setComponentError(err.message || t('messages.loadFailed'));
      setAssetTypes([]);
      toast({ variant: 'destructive', title: t('messages.errorFetching'), description: err.message });
    }
  }, [canRead, permissionsLoading, apiGet, toast, t]);

  useEffect(() => {
    fetchAssetTypes();
  }, [fetchAssetTypes]);

  const openDeleteDialog = useCallback((id: string, from: HTMLElement | null) => {
    opener.current = from;
    if (!canAdmin) {
      toast({ variant: 'destructive', title: t('permissions.permissionDenied'), description: t('permissions.deniedDelete') });
      return;
    }
    setDeletingId(id);
    setIsDeleteDialogOpen(true);
  }, [canAdmin, toast, t]);

  const openEditForm = useCallback((assetType: AssetTypeRead, from: HTMLElement | null) => {
    opener.current = from;
    setEditingAssetType(assetType);
    setIsFormOpen(true);
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deletingId || !canAdmin) return;
    try {
      const response = await apiDelete(`/api/asset-types/${deletingId}`);
      if (response.error) throw new Error(response.error);
      toast({ title: t('messages.deleted'), description: t('messages.deletedSuccess') });
      fetchAssetTypes();
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('messages.errorDeleting'), description: err.message });
    } finally {
      setIsDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  const columns = useMemo<ColumnDef<AssetTypeRead>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => <SortButton column={column} label={t('table.name')} />,
      cell: ({ row }) => (
        <div className={classes.name}>
          <span className={classes.nameText}>{row.original.name}</span>
          {row.original.is_system && (
            <Badge variant="outline" className={classes.badge}>{t('systemBadge')}</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: t('table.description'),
      cell: ({ row }) => (
        <span className={classes.description}>{row.original.description || '-'}</span>
      ),
    },
    {
      accessorKey: 'category',
      header: t('table.category'),
      cell: ({ row }) => row.original.category
        ? <Badge variant="outline">{t(`categories.${row.original.category}`)}</Badge>
        : '-',
    },
    {
      accessorKey: 'status',
      header: t('table.status'),
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'active' ? 'default' : 'secondary'}>
          {t(`statuses.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      accessorKey: 'asset_count',
      header: t('table.assetCount'),
      cell: ({ row }) => (
        <span className={classes.count}>{row.original.asset_count}</span>
      ),
    },
    {
      accessorKey: 'updated_at',
      header: ({ column }) => <SortButton column={column} label={t('table.lastUpdated')} />,
      cell: ({ row }) => row.original.updated_at
        ? <RelativeDate date={row.original.updated_at} />
        : t('common:states.notAvailable'),
    },
    {
      id: 'actions',
      header: t('table.actions'),
      cell: ({ row }) => (
        <RowActions
          assetType={row.original}
          canWrite={canWrite}
          canAdmin={canAdmin}
          onEdit={openEditForm}
          onDelete={openDeleteDialog}
        />
      ),
    },
  ], [canWrite, canAdmin, t, openEditForm, openDeleteDialog]);

  const title = t('title');
  const content = (apiIsLoading || permissionsLoading) ? (
    <ListViewSkeleton columns={7} rows={5} toolbarButtons={1} />
  ) : !canRead ? (
    <Alert color="red" variant="light" icon={<AlertCircle />} title={t('permissions.permissionDenied')} classNames={{ title: classes.alertTitle }}>
      {t('permissions.deniedView')}
    </Alert>
  ) : componentError ? (
    <Alert color="red" variant="light" icon={<AlertCircle />} title={t('messages.errorLoadingData')} classNames={{ title: classes.alertTitle }}>
      {componentError}
    </Alert>
  ) : (
    <DataTable
      columns={columns}
      data={assetTypes}
      searchColumn="name"
      storageKey="asset-types-sort"
      toolbarActions={
        <Button
          onClick={(e) => {
            opener.current = e.currentTarget;
            setEditingAssetType(null);
            setIsFormOpen(true);
          }}
          disabled={!canWrite || apiIsLoading}
        >
          <PlusCircle /> {t('addNew')}
        </Button>
      }
    />
  );

  return (
    <SettingsPageWrapper title={title} permissionId="settings-asset-types" fullBleed>
      <PageLayout
        fullBleed
        breadcrumb={<Breadcrumb items={[{ label: title }]} />}
        header={
          <>
            <PageHeader title={title} />
            <p className={classes.subtitle}>{t('subtitle')}</p>
          </>
        }
      >
        <Pane flush aria-label={t('listPane')}>
          <div className={classes.body}>{content}</div>
        </Pane>
      </PageLayout>

      <AssetTypeFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        assetType={editingAssetType}
        onSubmitSuccess={fetchAssetTypes}
        finalFocusRef={opener}
      />

      {/* As the Radix AlertDialog: no close button, a click outside leaves it
          open, Escape closes it, and Cancel has focus */}
      <Modal.Root
        opened={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        size={512}
        centered
        closeOnClickOutside={false}
        returnFocus={false}
        onExitTransitionEnd={() => {
          if (opener.current?.isConnected) opener.current.focus();
        }}
      >
        <Modal.Overlay />
        <Modal.Content className={classes.dialog}>
          <Modal.Header className={classes.dialogHeader}>
            <Modal.Title className={classes.dialogTitle}>{t('deleteDialog.title')}</Modal.Title>
          </Modal.Header>
          <Modal.Body className={classes.dialogDescription}>{t('deleteDialog.description')}</Modal.Body>
          <div className={classes.dialogFooter}>
            <Button variant="outline" data-autofocus onClick={() => { setIsDeleteDialogOpen(false); setDeletingId(null); }}>
              {t('deleteDialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={apiIsLoading}
              onClick={() => {
                // As the AlertDialog's action: it closes at once, then deletes
                setIsDeleteDialogOpen(false);
                handleDeleteConfirm();
              }}
            >
              {apiIsLoading ? <Loader size={12} color="currentColor" /> : null} {t('deleteDialog.delete')}
            </Button>
          </div>
        </Modal.Content>
      </Modal.Root>
    </SettingsPageWrapper>
  );
}

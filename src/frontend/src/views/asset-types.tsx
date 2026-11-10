import { useState, useEffect, useCallback, useId, useMemo, useRef } from 'react';
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
import { alertDialogRole } from '@/mantine/alert-dialog-role';
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

/** Where focus goes after a dialog: Add, or a row's menu button by the row's id. */
const ADD = 'add' as const;
type FocusTarget = typeof ADD | { row: string };

interface RowActionsProps {
  assetType: AssetTypeRead;
  canWrite: boolean;
  canAdmin: boolean;
  onEdit: (assetType: AssetTypeRead) => void;
  onDelete: (id: string) => void;
}

/**
 * The row's actions menu. Escape or a click outside puts focus back on its
 * button; an item that opens a dialog doesn't, so the dialog keeps focus
 * (the page puts focus back once the dialog closes, finding the button by
 * its data-row-menu, as the list may have re-rendered by then).
 */
function RowActions({ assetType, canWrite, canAdmin, onEdit, onDelete }: RowActionsProps) {
  const { t } = useTranslation(['asset-types']);
  const [returnFocus, setReturnFocus] = useState(true);
  const openDialog = (open: () => void) => {
    setReturnFocus(false);
    open();
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
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={t('openMenu')}
          className={classes.menuButton}
          data-row-menu={assetType.id}
        >
          <MoreHorizontal aria-hidden />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('table.actions')}</Menu.Label>
        <Menu.Item disabled={!canWrite} onClick={() => openDialog(() => onEdit(assetType))}>
          {t('editAssetType')}
        </Menu.Item>
        {/* A separator, as the Radix menu's was */}
        <Menu.Divider role="separator" />
        <Menu.Item className={classes.danger} disabled={!canAdmin} onClick={() => openDialog(() => onDelete(assetType.id))}>
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
  // Only the latest load may set the list: an earlier one that answers late is dropped
  const loadId = useRef(0);

  // Focus once a dialog closes, at most once per dialog. The control that
  // opened it (Add, or a row's menu button) is found again by its data
  // attribute, because a save or delete reloads the list behind a skeleton,
  // which remounts the table. Focus moves when the dialog has gone (its exit
  // transition has ended) and no reload is pending: at once after Cancel or
  // Escape, after the reload after a save or delete.
  const titleId = useId();
  const tableArea = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<FocusTarget>(ADD);
  const focusPending = useRef(false);
  const dialogGone = useRef(true);
  const awaitingReload = useRef(false);
  const [focusRequest, setFocusRequest] = useState(0);
  /** A dialog opens from `target`: focus returns there (or near) once, later. */
  const dialogOpening = useCallback((target: FocusTarget) => {
    focusTarget.current = target;
    focusPending.current = true;
    dialogGone.current = false;
  }, []);
  const maybeReturnFocus = useCallback(() => {
    if (!focusPending.current || !dialogGone.current || awaitingReload.current) return;
    focusPending.current = false;
    setFocusRequest((n) => n + 1);
  }, []);

  const { t } = useTranslation(['asset-types', 'common']);
  const { get: apiGet, delete: apiDelete, loading: apiIsLoading } = useApi();
  const { toast } = useToast();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();

  const featureId = 'assets';
  const canRead = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.READ_ONLY);
  const canWrite = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.READ_WRITE);
  const canAdmin = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.ADMIN);

  // A save or delete may be waiting for this reload to put focus back
  const settleReload = useCallback(() => {
    if (!awaitingReload.current) return;
    awaitingReload.current = false;
    maybeReturnFocus();
  }, [maybeReturnFocus]);

  const fetchAssetTypes = useCallback(async () => {
    const id = ++loadId.current;
    if (!canRead && !permissionsLoading) {
      setComponentError(t('permissions.deniedView'));
      settleReload();
      return;
    }
    setComponentError(null);
    try {
      const response = await apiGet<AssetTypeRead[]>('/api/asset-types');
      if (id !== loadId.current) return;
      if (response.error) throw new Error(response.error);
      setAssetTypes(Array.isArray(response.data) ? response.data : []);
      settleReload();
    } catch (err: any) {
      if (id !== loadId.current) return;
      setComponentError(err.message || t('messages.loadFailed'));
      setAssetTypes([]);
      toast({ variant: 'destructive', title: t('messages.errorFetching'), description: err.message });
      settleReload();
    }
  }, [canRead, permissionsLoading, apiGet, toast, t, settleReload]);

  // Focus the target once the page has rendered after the request: the
  // control if it is there and enabled, else Add, else the page title. Only
  // if focus is nowhere (body) or still in the closed dialog: if the user
  // has moved it during a slow reload, it stays where they put it
  useEffect(() => {
    if (focusRequest === 0) return;
    const active = document.activeElement;
    const free = !active || active === document.body || active.closest('[data-modal-content]') !== null;
    if (!free) return;
    const target = focusTarget.current;
    const area = tableArea.current;
    const find = (selector: string) => {
      const el = area?.querySelector<HTMLButtonElement>(selector);
      return el && !el.disabled ? el : null;
    };
    const control =
      (target !== ADD ? find(`[data-row-menu="${CSS.escape(target.row)}"]`) : null) ?? find('[data-add-asset-type]');
    if (control) {
      control.focus();
      return;
    }
    const heading = document.getElementById(titleId);
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [focusRequest, titleId]);

  /** A dialog's exit transition has ended: focus goes back, unless a reload is on its way. */
  const dialogExited = useCallback(() => {
    dialogGone.current = true;
    maybeReturnFocus();
  }, [maybeReturnFocus]);

  const saved = useCallback(() => {
    awaitingReload.current = true;
    fetchAssetTypes();
  }, [fetchAssetTypes]);

  useEffect(() => {
    fetchAssetTypes();
  }, [fetchAssetTypes]);

  const openDeleteDialog = useCallback((id: string) => {
    if (!canAdmin) {
      toast({ variant: 'destructive', title: t('permissions.permissionDenied'), description: t('permissions.deniedDelete') });
      return;
    }
    dialogOpening({ row: id });
    setDeletingId(id);
    setIsDeleteDialogOpen(true);
  }, [canAdmin, toast, t, dialogOpening]);

  const openEditForm = useCallback((assetType: AssetTypeRead) => {
    dialogOpening({ row: assetType.id });
    setEditingAssetType(assetType);
    setIsFormOpen(true);
  }, [dialogOpening]);

  const handleDeleteConfirm = async () => {
    if (!deletingId || !canAdmin) return;
    // Focus waits for the outcome: the row is gone after a delete, so Add
    // takes it; after a failure, the row's button gets it back
    const row = focusTarget.current;
    awaitingReload.current = true;
    focusTarget.current = ADD;
    try {
      const response = await apiDelete(`/api/asset-types/${deletingId}`);
      if (response.error) throw new Error(response.error);
      toast({ title: t('messages.deleted'), description: t('messages.deletedSuccess') });
      fetchAssetTypes();
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('messages.errorDeleting'), description: err.message });
      // Back to the row's button, once the dialog's exit has ended (it
      // closed on the click; maybeReturnFocus waits for dialogExited)
      awaitingReload.current = false;
      focusTarget.current = row;
      maybeReturnFocus();
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
          data-add-asset-type=""
          onClick={() => {
            dialogOpening(ADD);
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
            <PageHeader title={title} titleId={titleId} />
            <p className={classes.subtitle}>{t('subtitle')}</p>
          </>
        }
      >
        <Pane flush aria-label={t('listPane')}>
          <div ref={tableArea} className={classes.body}>{content}</div>
        </Pane>
      </PageLayout>

      <AssetTypeFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        assetType={editingAssetType}
        onSubmitSuccess={saved}
        onExited={dialogExited}
      />

      {/* As the Radix AlertDialog: an alertdialog (alertDialogRole), no close
          button, a click outside leaves it open, Escape closes it, and Cancel
          has focus */}
      <Modal.Root
        opened={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        size={512}
        centered
        closeOnClickOutside={false}
        returnFocus={false}
        onExitTransitionEnd={dialogExited}
      >
        <Modal.Overlay />
        <Modal.Content ref={alertDialogRole} className={classes.dialog}>
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

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Switch, Tooltip, UnstyledButton } from '@mantine/core';
import type { DataContractListItem, DataContractCreate } from '@/types/data-contract';
import { BatchImportResult, summarizeImport } from '@/types/import-results';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import DomainBadgeList from '@/components/ui/domain-badge-list'
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import TagChip from '@/components/ui/tag-chip';
import { Plus, Pencil, Trash2, AlertCircle, Upload, ArrowUpDown, ChevronDown, ChevronRight, KeyRound, HelpCircle, Eye } from 'lucide-react';
import { ListViewSkeleton } from '@/components/common/list-view-skeleton';
import DataContractBasicFormDialog from '@/components/data-contracts/data-contract-basic-form-dialog'
import ImportEntityDialog from '@/components/common/import-entity-dialog';
import type { Column, ColumnDef } from "@tanstack/react-table"
import { useToast } from "@/hooks/use-toast"
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { useProjectContext } from '@/stores/project-store';
import { DataTable } from '@/components/ui/data-table';
import { RelativeDate } from '@/components/common/relative-date';
import EntityInfoDialog from '@/components/metadata/entity-info-dialog';
import CertificationBadge from '@/components/common/certification-badge';
import PublicationBadge from '@/components/common/publication-badge';
import VersionCountBadge from '@/components/common/version-count-badge';
import { badgeToneStyle, type StatusTone } from '@/components/common/aura-status';
import type { CertificationLevel } from '@/types/lifecycle';
import { useApi } from '@/hooks/use-api';
import { usePermissions, usePermissionsReady } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { internalErrorText } from '@/lib/server-error-text';
import { PageHeader, PageLayout, Pane } from '@/mantine/page';
import list from '@/components/common/list-page.module.css';
import classes from './data-contracts.module.css';

/** A header label that sorts its column, in the grid's header-label look. */
function SortButton({ column, label }: { column: Column<DataContractListItem, unknown>; label: string }) {
  return (
    <UnstyledButton className={list.sort} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
      {label}
      <ArrowUpDown aria-hidden className={list.sortIcon} data-active={column.getIsSorted() ? '' : undefined} />
    </UnstyledButton>
  );
}

// A contract's lifecycle status, in the Aura status tones (draft was yellow,
// active green and deprecated red; the rest grey)
const STATUS_TONES: Record<string, StatusTone> = {
  draft: 'warning',
  active: 'good',
  deprecated: 'critical',
};
const statusTone = (status: string | undefined): StatusTone => STATUS_TONES[(status || '').toLowerCase()] ?? 'neutral';

export default function DataContracts() {
  const { t } = useTranslation(['data-contracts', 'common']);
  const { toast } = useToast();
  const [contracts, setContracts] = useState<DataContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  // "Show all versions" toggle — flips the family-collapse on the backend.
  // When false (default) the list collapses to one row per version family
  // and exposes a "N versions" badge. See PRD #442.
  const [includeHistory, setIncludeHistory] = useState(false);
  // An action's error (create, delete), dismissible
  const [error, setError] = useState<string | null>(null);
  // The list's failed load, shown with a Retry
  const [loadError, setLoadError] = useState<string | null>(null);
  // Only the latest load may set the list: an earlier one that answers late
  // (such as one from before a project switch) is dropped
  const loadId = useRef(0);
  const [openWizard, setOpenWizard] = useState(false);
  const [openUploadDialog, setOpenUploadDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<{ message: string; detail?: string } | null>(null);
  const [odcsPaste, setOdcsPaste] = useState<string>('')
  // #851: opt-in "Create missing domains" import toggle, applied per-upload to every
  // entity in the batch (default off → unresolved domains are left unassigned).
  const [createMissingDomains, setCreateMissingDomains] = useState(false)
  // #853: adopt valid, non-colliding UUIDs from the file as the PK (default on), and how
  // to handle a duplicate id already present (default skip; on = import as a new copy).
  // Default off, matching the backend-level privilege gate (#853 review): adoption
  // is opt-in both on the UI and on the route.
  const [adoptIds, setAdoptIds] = useState(false)
  const [duplicatesAsNew, setDuplicatesAsNew] = useState(false)
  const [importingPaste, setImportingPaste] = useState(false)
  const [showErrorDetail, setShowErrorDetail] = useState(false)
  const [previewContractId, setPreviewContractId] = useState<string | null>(null);
  const [previewContractTitle, setPreviewContractTitle] = useState('');
  const [certificationLevels, setCertificationLevels] = useState<CertificationLevel[]>([]);

  const { get } = useApi();
  // Permission gating — mirror the data-products list view. Contract creation
  // (POST /api/data-contracts) requires READ_WRITE; the backend enforces a 403,
  // so we must also hide the create/upload controls from personas (e.g. Data
  // Consumer) that lack write access rather than letting them open a dialog
  // that only fails on save. See CUJ ONT-RBAC-007.
  const { hasPermission } = usePermissions();
  // Known permissions only: on a fresh load the store is empty and not loading yet
  const permissionsReady = usePermissionsReady();
  const featureId = 'data-contracts';
  const canWrite = permissionsReady && hasPermission(featureId, FeatureAccessLevel.READ_WRITE);
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((state) => state.setDynamicTitle);
  const { currentProject, hasProjectContext } = useProjectContext();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // The side menu's Build → Data Contracts → New Contract links here with
  // ?new=1: it opens the create dialog, as the New Contract button does, for
  // the users who see that button. The param goes (replace) when the dialog
  // closes, so the menu highlights New Contract while it's open, and once it
  // is closed neither a reload nor back reopens it.
  const wantsNewContract = searchParams.get('new') === '1';
  const wizardOpen = openWizard || (wantsNewContract && canWrite);
  const clearNewContractParam = () =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('new');
      return next;
    }, { replace: true });
  const setWizardOpen = (open: boolean) => {
    setOpenWizard(open);
    if (!open && wantsNewContract) clearNewContractParam();
  };
  // Without the create permission, the param is dropped and nothing opens
  useEffect(() => {
    if (wantsNewContract && permissionsReady && !canWrite) clearNewContractParam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNewContract, permissionsReady, canWrite]);

  useEffect(() => {
    fetchContracts();
    // Set breadcrumbs
    setStaticSegments([]);
    setDynamicTitle(t('title'));

    // Cleanup breadcrumbs on unmount
    return () => {
        setStaticSegments([]);
        setDynamicTitle(null);
    };
    // includeHistory belongs in the deps so toggling the switch triggers a
    // re-fetch with the new query param.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setStaticSegments, setDynamicTitle, hasProjectContext, currentProject, t, includeHistory]);

  useEffect(() => {
    get<CertificationLevel[]>('/api/certification-levels').then(({ data }) => {
      if (Array.isArray(data)) setCertificationLevels(data);
    });
  }, [get]);

  // Reset the upload dialog's transient state every time it opens so a later
  // import doesn't silently carry over earlier toggles, paste text, or errors
  // (#930 review item 3). Paste survives failures within one dialog session
  // (see importPastedOdcs) but is cleared on re-open.
  useEffect(() => {
    if (openUploadDialog) {
      setCreateMissingDomains(false);
      setAdoptIds(false);
      setDuplicatesAsNew(false);
      setOdcsPaste('');
      setUploadError(null);
      setShowErrorDetail(false);
    }
  }, [openUploadDialog]);

  // Removed ODCS schema load for inline JSON validation
  // Removed inline JSON validation

  // Persist draft to store on form changes
  // Removed draft persistence for inline editor

  const fetchContracts = async () => {
    const id = ++loadId.current;
    try {
      setLoading(true);

      // Build URL with project context and include_history (PRD #442)
      const params = new URLSearchParams();
      if (hasProjectContext && currentProject) {
        params.set('project_id', currentProject.id);
      }
      if (includeHistory) {
        params.set('include_history', 'true');
      }
      const qs = params.toString();
      const endpoint = qs ? `/api/data-contracts?${qs}` : '/api/data-contracts';

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(t('data-contracts:messages.fetchError', 'Failed to fetch data contracts'));
      const data = await response.json();
      if (id !== loadId.current) return;
      setContracts(Array.isArray(data) ? data : []);
      setError(null);
      setLoadError(null);
    } catch (err) {
      if (id !== loadId.current) return;
      setLoadError(err instanceof Error ? err.message : t('data-contracts:messages.fetchError', 'Failed to fetch data contracts'));
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  };

  // Removed per-row fetch for modal; navigation handles details

  const createContract = async (formData: DataContractCreate) => {
    try {
      const response = await fetch('/api/data-contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(t('data-contracts:messages.createErrorDetail', 'Failed to create contract: {{error}}', {
          error: internalErrorText(errorText) ?? errorText,
        }));
      }
      await fetchContracts();
      toast({ 
        title: t('data-contracts:messages.success', 'Success'), 
        description: t('data-contracts:form.createSuccess', 'Data contract created successfully')
      });
      setWizardOpen(false); // Close the wizard on success
    } catch (err) {
      const message = err instanceof Error ? err.message : t('data-contracts:form.createError', 'Failed to create data contract');
      setError(message);
      toast({ 
        title: t('data-contracts:messages.error', 'Error'), 
        description: message, 
        variant: 'destructive' 
      });
      throw err; // Re-throw so wizard can handle it
    }
  };

  const deleteContract = async (id: string) => {
    try {
      const response = await fetch(`/api/data-contracts/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(t('data-contracts:messages.deleteError', 'Failed to delete data contract'));
      await fetchContracts();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('data-contracts:messages.deleteError', 'Failed to delete data contract'));
    }
  };

  const handleBulkDelete = async (selectedIds: string[]) => {
    if (selectedIds.length === 0) return;
    if (!confirm(t('data-contracts:messages.bulkDeleteConfirm', 'Are you sure you want to delete {{count}} selected contract(s)?', { count: selectedIds.length }))) return;
    try {
      const results = await Promise.allSettled(selectedIds.map(async (id) => {
        const res = await fetch(`/api/data-contracts/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(t('data-contracts:messages.bulkDeleteRowError', 'ID {{id}}: delete failed', { id }));
        return id;
      }));
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;
      if (successes > 0) {
        toast({ title: t('data-contracts:messages.bulkDeleteSuccessTitle', 'Bulk Delete Success'), description: t('data-contracts:messages.bulkDeleteSuccess', '{{count}} contract(s) deleted.', { count: successes }) });
      }
      if (failures > 0) {
        const firstError = (results.find(r => r.status === 'rejected') as PromiseRejectedResult)?.reason?.message || 'Unknown error';
        toast({ title: t('data-contracts:messages.bulkDeleteErrorTitle', 'Bulk Delete Error'), description: t('data-contracts:messages.bulkDeleteError', '{{count}} contract(s) could not be deleted. First error: {{error}}', { count: failures, error: firstError }), variant: 'destructive' });
      }
      await fetchContracts();
    } catch (e) {
      toast({ title: t('data-contracts:messages.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:messages.bulkDeleteFailed', 'Failed to bulk delete'), variant: 'destructive' });
    }
  };

  const handleBulkRequestAccess = async (selectedIds: string[]) => {
    if (selectedIds.length === 0) return;
    try {
      // Submit individual requests for each entity (Access Grants API requires single entity_id)
      const results = await Promise.all(
        selectedIds.map(id =>
          fetch('/api/access-grants/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity_type: 'data_contract', entity_id: id, permission_level: 'READ' })
          })
        )
      );
      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) throw new Error(t('data-contracts:messages.accessRequestError', 'Failed to submit access requests'));
      toast({ title: t('data-contracts:messages.requestSentTitle', 'Request Sent'), description: t('data-contracts:messages.requestSent', 'Access request submitted. You will be notified.') });
    } catch (e) {
      toast({ title: t('data-contracts:messages.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:messages.submitFailed', 'Failed to submit'), variant: 'destructive' });
    }
  };

  const handleDeleteContract = async (id: string) => {
    if (!confirm(t('data-contracts:messages.deleteConfirm', 'Are you sure you want to delete this data contract?'))) return;
    await deleteContract(id);
  };

  // Only structured ODCS files are importable (shared with the Data Products
  // uploader via <ImportEntityDialog>); free-form text is rejected server-side.
  const contractUploadAccept = {
    'application/json': ['.json'],
    'application/x-yaml': ['.yaml', '.yml'],
    'text/yaml': ['.yaml', '.yml'],
  };

  const uploadContractFiles = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    try {
      setUploading(true);
      setUploadError(null);

      // Multi-file: send every dropped file under `files` (backend
      // List[UploadFile]); each file may itself hold an ODCS array.
      const formData = new FormData();
      acceptedFiles.forEach((f) => formData.append('files', f));
      formData.append('create_missing_domains', String(createMissingDomains));
      formData.append('adopt_ids', String(adoptIds));
      formData.append('on_duplicate', duplicatesAsNew ? 'new' : 'skip');

      const response = await fetch('/api/data-contracts/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        let errorMsg = t('data-contracts:messages.uploadError', 'Failed to upload contract');
        let errorDetail: string | undefined;
        try {
          const contentType = response.headers.get('Content-Type');
          if (contentType?.includes('application/json')) {
            const errorBody = await response.json();
            if (errorBody?.detail) {
              if (typeof errorBody.detail === 'string') {
                errorMsg = errorBody.detail;
              } else {
                errorMsg = errorBody.detail.message || t('data-contracts:messages.uploadFailed', 'Upload failed');
                errorDetail = errorBody.detail.error;
              }
            } else if (errorBody?.message) {
              errorMsg = errorBody.message;
            }
          } else {
            errorMsg = await response.text() || errorMsg;
          }
        } catch {
          // Keep default error message
        }

        const combined = (errorMsg + ' ' + (errorDetail || '')).toLowerCase();
        if (combined.includes('odps') || combined.includes('outputports')) {
          errorMsg += t('data-contracts:messages.uploadOdpsHint', '\n\nHint: This page is for Data Contracts (ODCS format). If you\'re trying to upload a Data Product (ODPS format), please use the Data Products page instead.');
        }

        setUploadError({ message: errorMsg, detail: errorDetail });
        return;
      }

      // Truthful BatchImportResult summary across all files/entities.
      const result: BatchImportResult = await response.json();
      await fetchContracts();

      // Surface anything that was not created — failed entities AND files
      // skipped as the wrong type (e.g. an ODPS product dropped here).
      if (result.failed > 0 || result.skipped > 0) {
        const detail = result.items
          .filter((i) => i.status !== 'created')
          .slice(0, 5)
          .map((i) => `• ${i.name || i.source_id || `#${i.index}`}: ${i.message ?? i.status}`)
          .join('\n');
        // Keep the dialog open so the user sees which entities were skipped/failed.
        setUploadError({ message: summarizeImport(result, t), detail });
        if (result.created > 0) {
          toast({ title: t('data-contracts:messages.success', 'Success'), description: summarizeImport(result, t) });
        }
        return;
      }

      setOpenUploadDialog(false);
      toast({
        title: t('data-contracts:messages.success', 'Success'),
        description: result.skipped > 0
          ? summarizeImport(result, t)
          : t('data-contracts:messages.uploadSuccessCount', {
              count: result.created,
              defaultValue: '{{count}} contract(s) imported successfully',
            }),
      });
    } catch (err) {
      setUploadError({ message: err instanceof Error ? err.message : t('data-contracts:messages.uploadError', 'Failed to upload contract') });
    } finally {
      setUploading(false);
    }
  };

  const importPastedOdcs = async () => {
    const value = odcsPaste.trim();
    if (!value) return;
    setImportingPaste(true);
    setUploadError(null);
    try {
      const body = JSON.parse(value);
      const res = await fetch(`/api/data-contracts/odcs/import?create_missing_domains=${createMissingDomains}&adopt_ids=${adoptIds}&on_duplicate=${duplicatesAsNew ? 'new' : 'skip'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || err?.detail || t('data-contracts:import.importOdcsError', 'Failed to import ODCS JSON'));
      }
      const result: BatchImportResult = await res.json();
      await fetchContracts();
      if (result.failed > 0 || result.skipped > 0) {
        const detail = result.items
          .filter((i) => i.status !== 'created')
          .slice(0, 5)
          .map((i) => `• ${i.name || i.source_id || `#${i.index}`}: ${i.message ?? i.status}`)
          .join('\n');
        setUploadError({ message: summarizeImport(result, t), detail });
        // Partial success: keep the pasted content so the user can fix the
        // failing/skipped entries and retry (#930 review item 4).
      } else {
        setOpenUploadDialog(false);
        setOdcsPaste('');
        toast({ title: t('data-contracts:import.importedTitle', 'Imported'), description: summarizeImport(result, t) });
      }
    } catch (err) {
      setUploadError({ message: err instanceof Error ? err.message : t('data-contracts:import.importOdcsError', 'Failed to import ODCS JSON') });
    } finally {
      setImportingPaste(false);
    }
  };

  // Filter contracts based on URL parameter
  const filteredContracts = useMemo(() => {
    const statusFilter = searchParams.get('status');
    if (!statusFilter) return contracts;

    const filterLower = statusFilter.toLowerCase();
    return contracts.filter(c => {
      const contractStatus = (c.status || '').toLowerCase();
      return contractStatus === filterLower;
    });
  }, [contracts, searchParams]);

  // The columns read the row handlers through a ref, so the definitions stay
  // the same across renders and the cells keep their focus
  const rowActions = useRef({ remove: handleDeleteContract });
  useEffect(() => {
    rowActions.current = { remove: handleDeleteContract };
  });

  const columns = useMemo<ColumnDef<DataContractListItem>[]>(() => [
    {
      accessorKey: "name",
      header: ({ column }) => <SortButton column={column} label={t('table.name')} />,
      cell: ({ row }) => {
        const contract = row.original as any;
        // Multi-domain (#520): render each assigned domain as a badge (primary starred).
        const domainIds: string[] = contract.domainIds
          ?? (contract.domainId ? [contract.domainId] : (contract.domain_id ? [contract.domain_id] : []));
        const primaryId = contract.primaryDomainId || contract.domainId || contract.domain_id || domainIds[0] || null;
        return (
          <div className={list.titleCell}>
            <span className={list.title}>{row.getValue("name")}</span>
            <DomainBadgeList
              domainIds={domainIds}
              primaryDomainId={primaryId}
              onDomainClick={(id) => navigate(`/settings/data-domains/${id}`)}
            />
          </div>
        );
      },
    },
    {
      accessorKey: "owner_team_id",
      header: ({ column }) => <SortButton column={column} label={t('table.owner')} />,
      cell: ({ row }) => {
        const teamName = row.original.owner_team_name;
        return <span className={list.person} data-empty={!teamName || undefined}>{teamName || t('common:states.noOwner')}</span>;
      },
    },
    {
      accessorKey: "version",
      header: ({ column }) => <SortButton column={column} label={t('table.version')} />,
      cell: ({ row }) => {
        const id = row.original.id
        return (
          <div className={list.badges}>
            <Badge variant="secondary">{row.getValue("version")}</Badge>
            {/* Family badge — only renders for families with > 1 visible version.
                Click expands the version family for this row by routing into
                the detail view, where VersionNavigator handles prev/next. */}
            <VersionCountBadge
              count={row.original.versionCount}
              onClick={() => id && navigate(`${pathname}/${id}`)}
            />
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => <SortButton column={column} label={t('table.status')} />,
      cell: ({ row }) => {
        const contract = row.original;
        return (
          <div className={list.badges}>
            {contract.draftOwnerId && (
              <Badge variant="outline" style={badgeToneStyle('warning')}>
                {t('data-contracts:list.personal', 'Personal')}
              </Badge>
            )}
            <Badge variant="outline" style={badgeToneStyle(statusTone(row.getValue("status")))}>
              {row.getValue("status")}
            </Badge>
            <CertificationBadge
              certificationLevel={contract.certification_level}
              inheritedCertificationLevel={contract.inherited_certification_level}
              certifiedAt={contract.certified_at}
              certifiedBy={contract.certified_by}
              levels={certificationLevels}
              size="sm"
            />
            <PublicationBadge
              publicationScope={contract.publication_scope}
              publishedAt={contract.published_at}
              publishedBy={contract.published_by}
            />
          </div>
        );
      },
    },
    {
      accessorKey: "tags",
      header: t('table.tags'),
      cell: ({ row }) => {
        const tags = row.original.tags || [];
        return (
          <div className={list.badges}>
            {tags.map((tag, index) => (
              <TagChip key={index} tag={tag} size="sm" />
            ))}
          </div>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "created",
      header: ({ column }) => <SortButton column={column} label={t('table.created')} />,
      cell: ({ row }) => row.original.created ? <RelativeDate date={row.original.created} /> : t('common:states.notAvailable'),
    },
    {
      accessorKey: "updated",
      header: ({ column }) => <SortButton column={column} label={t('table.updated')} />,
      cell: ({ row }) => row.original.updated ? <RelativeDate date={row.original.updated} /> : t('common:states.notAvailable'),
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const contract = row.original;
        return (
          <div className={list.actions}>
            <ActionIcon
              variant="subtle"
              color="gray"
              className={list.action}
              onClick={(e) => { e.stopPropagation(); setPreviewContractId(contract.id ?? null); setPreviewContractTitle(contract.name ?? ''); }}
              title={t('data-contracts:table.previewMetadata', 'Preview Metadata')}
            >
              <Eye aria-hidden />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              className={list.action}
              onClick={(e) => { e.stopPropagation(); if (contract.id) navigate(`${pathname}/${contract.id}`); }}
              title={t('common:tooltips.edit')}
            >
              <Pencil aria-hidden />
            </ActionIcon>
            {contract.id && (
              <ActionIcon
                variant="subtle"
                color="gray"
                className={`${list.action} ${list.delete}`}
                onClick={(e) => { e.stopPropagation(); rowActions.current.remove(contract.id as string) }}
                title={t('common:tooltips.delete')}
              >
                <Trash2 aria-hidden />
              </ActionIcon>
            )}
          </div>
        );
      },
    },
  ], [navigate, pathname, certificationLevels, t]);

  return (
    <>
      <PageLayout fullBleed header={<PageHeader title={t('title')} />}>
        <Pane flush aria-label={t('listPane')}>
          <div className={list.body}>
            {loading ? (
              <ListViewSkeleton columns={8} rows={5} toolbarButtons={3} />
            ) : (
              <>
                {/* The list's failed load, with a Retry; the toolbar stays */}
                {loadError && (
                  <div className={classes.state}>
                    <Alert
                      color="red"
                      variant="light"
                      icon={<AlertCircle />}
                      className={`${list.alert} ${classes.stateAlert}`}
                      classNames={{ message: list.alertMessage }}
                    >
                      {loadError}
                    </Alert>
                    <Button variant="outline" onClick={fetchContracts}>{t('common:retry')}</Button>
                  </div>
                )}
                {/* An action's error (create, delete), dismissible */}
                {error && (
                  <Alert
                    color="red"
                    variant="light"
                    icon={<AlertCircle />}
                    className={list.alert}
                    classNames={{ message: list.alertMessage }}
                    withCloseButton
                    closeButtonLabel={t('common:tooltips.dismiss', 'Dismiss')}
                    onClose={() => setError(null)}
                  >
                    {error}
                  </Alert>
                )}
                <DataTable
                  columns={columns}
                  data={filteredContracts}
                  searchColumn="name"
                  storageKey="data-contracts-sort"
                  toolbarActions={
                    <>
                      {/* Family-collapse toggle. Off = one row per family + "N versions"
                          badge; On = every version is its own row (legacy behavior).
                          See PRD #442. */}
                      <Switch
                        id="contracts-include-history"
                        size="xs"
                        // Ruled off from the create and upload buttons, when they're there
                        className={canWrite ? list.history : classes.historyAlone}
                        classNames={{ label: list.historyLabel }}
                        checked={includeHistory}
                        onChange={(e) => setIncludeHistory(e.currentTarget.checked)}
                        label={t('versionFamily.showAllVersions', { defaultValue: 'Show all versions' })}
                      />
                      {/* Create/Upload actions require write permission (POST
                          /api/data-contracts). Hidden for read-only personas such as
                          Data Consumer so the dialog can't be opened. See ONT-RBAC-007. */}
                      {canWrite && (
                        <Button onClick={() => setOpenWizard(true)} title={t('common:tooltips.createDataContract')}>
                          <Plus />
                          {t('newContract')}
                        </Button>
                      )}
                      {canWrite && (
                        <Tooltip
                          multiline
                          w={280}
                          position="bottom"
                          withinPortal
                          label={
                            <div className={list.tip}>
                              <p className={list.tipTitle}>{t('data-contracts:import.uploadTooltipTitle', 'Upload Data Contract (ODCS format)')}</p>
                              <p>{t('data-contracts:import.uploadTooltipFormats', 'Accepts JSON or YAML files following the ODCS (Open Data Contract Standard) schema.')}</p>
                              <p>{t('data-contracts:import.uploadTooltipOdps', 'For Data Products (ODPS), use the Data Products page instead.')}</p>
                            </div>
                          }
                        >
                          <Button onClick={() => setOpenUploadDialog(true)} variant="outline">
                            <Upload />
                            {t('uploadFile')}
                            <HelpCircle aria-hidden className={list.help} />
                          </Button>
                        </Tooltip>
                      )}
                    </>
                  }
                  bulkActions={(selectedRows) => (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkRequestAccess(selectedRows.map(r => r.id!).filter(Boolean))}
                        title={t('common:tooltips.requestAccessForSelected')}
                      >
                        <KeyRound />
                        {t('data-contracts:list.requestAccess', 'Request Access ({{count}})', { count: selectedRows.length })}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleBulkDelete(selectedRows.map(r => r.id!).filter(Boolean))}
                        title={t('common:tooltips.deleteSelected')}
                      >
                        <Trash2 />
                        {t('common:actions.deleteSelected', 'Delete Selected ({{count}})', { count: selectedRows.length })}
                      </Button>
                    </>
                  )}
                  onRowClick={(row) => {
                    const id = row.original.id;
                    if (id) navigate(`${pathname}/${id}`);
                  }}
                />
              </>
            )}
          </div>
        </Pane>
      </PageLayout>

      {/* Upload Dialog (shared with Data Products via ImportEntityDialog) */}
      <ImportEntityDialog
        open={openUploadDialog}
        onOpenChange={setOpenUploadDialog}
        uploading={uploading}
        disabled={importingPaste}
        accept={contractUploadAccept}
        onFiles={uploadContractFiles}
        toggles={{
          createMissingDomains, setCreateMissingDomains,
          adoptIds, setAdoptIds,
          duplicatesAsNew, setDuplicatesAsNew,
        }}
        paste={{
          value: odcsPaste,
          onChange: setOdcsPaste,
          onSubmit: importPastedOdcs,
          submitting: importingPaste,
        }}
        labels={{
          title: t('data-contracts:import.uploadTitle', 'Upload Data Contract'),
          description: t('data-contracts:import.uploadDescription', 'Select one or more ODCS files (YAML/JSON). Each file may contain a single contract or an array.'),
          createMissingDomains: t('data-contracts:import.createMissingDomains', 'Create missing domains'),
          createMissingDomainsHint: t('data-contracts:import.createMissingDomainsHint', 'Auto-create domains that don\'t already exist. Off: unmatched domains are left unassigned (the original is preserved).'),
          adoptIds: t('data-contracts:import.adoptIds', 'Adopt IDs from file'),
          adoptIdsHint: t('data-contracts:import.adoptIdsHint', 'Reuse a valid, non-colliding UUID from the file as the primary key so links between entities survive import.'),
          duplicatesAsNew: t('data-contracts:import.duplicatesAsNew', 'Import duplicate IDs as new copies'),
          duplicatesAsNewHint: t('data-contracts:import.duplicatesAsNewHint', 'Off (default): an entity whose ID already exists is skipped. On: it is imported as a new copy with a fresh ID.'),
          dropActive: t('data-contracts:import.dropActive', 'Drop the file(s) here'),
          dropInactive: t('data-contracts:import.dropInactive', 'Drag and drop contract file(s) here, or click to select'),
          supportedFormats: t('data-contracts:import.supportedFormats', 'Supported formats: JSON or YAML (ODCS)'),
          pasteLabel: t('data-contracts:import.orPasteOdcs', 'Or paste ODCS JSON'),
          pastePlaceholder: t('common:placeholders.pasteODCSJSON'),
          pasteButton: t('data-contracts:import.importJsonButton', 'Import JSON'),
        }}
        alert={uploadError && (
          <Alert
            color="red"
            variant="light"
            icon={<AlertCircle />}
            classNames={{ message: list.alertMessage }}
            withCloseButton
            closeButtonLabel={t('common:tooltips.dismiss', 'Dismiss')}
            onClose={() => { setUploadError(null); setShowErrorDetail(false); }}
          >
            <span className={classes.alertText}>{uploadError.message}</span>
            {uploadError.detail && (
              <UnstyledButton
                className={classes.detailToggle}
                aria-expanded={showErrorDetail}
                onClick={() => setShowErrorDetail(!showErrorDetail)}
              >
                {showErrorDetail ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                {t('data-contracts:import.technicalDetails', 'Technical details')}
              </UnstyledButton>
            )}
            {showErrorDetail && uploadError.detail && (
              <pre className={classes.detail}>{uploadError.detail}</pre>
            )}
          </Alert>
        )}
      />

      <EntityInfoDialog
        entityType="data_contract"
        entityId={previewContractId}
        open={!!previewContractId}
        onOpenChange={(o) => { if (!o) setPreviewContractId(null); }}
        title={previewContractTitle}
      />

      {/* Basic Form Dialog */}
      <DataContractBasicFormDialog
        isOpen={wizardOpen}
        onOpenChange={setWizardOpen}
        onSubmit={createContract}
      />
    </>
  );
}

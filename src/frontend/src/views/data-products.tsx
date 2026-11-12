import { useState, useEffect, useMemo, useRef } from 'react';
import { deleteOrThrow } from '@/lib/delete-or-throw';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Loader, Switch, Tooltip, UnstyledButton } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import TagChip from '@/components/ui/tag-chip';
import { Plus, Pencil, Trash2, AlertCircle, ArrowUpDown, Upload, Sparkles, KeyRound, Table as TableIcon, Workflow, Bell, BellOff, HelpCircle, Eye } from 'lucide-react';
import { ListViewSkeleton } from '@/components/common/list-view-skeleton';
import { ViewModeToggle } from '@/components/common/view-mode-toggle';
import {
  Column,
  ColumnDef,
} from "@tanstack/react-table"
import { useApi } from '@/hooks/use-api';
import { DataProduct, DataProductStatus, DataProductOwner } from '@/types/data-product';
import { BatchImportResult, summarizeImport } from '@/types/import-results';
import { productUploadSuccessText } from '@/lib/upload-text';
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { RelativeDate } from '@/components/common/relative-date';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { DataTable } from "@/components/ui/data-table";
import DataProductCreateDialog from '@/components/data-products/data-product-create-dialog';
import EntityInfoDialog from '@/components/metadata/entity-info-dialog';
import ImportEntityDialog from '@/components/common/import-entity-dialog';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { useNotificationsStore } from '@/stores/notifications-store';
import DataProductGraphView from '@/components/data-products/data-product-graph-view';
import { useDomains } from '@/hooks/use-domains';
import DomainBadgeList from '@/components/ui/domain-badge-list';
import { useProjectContext } from '@/stores/project-store';
import CertificationBadge from '@/components/common/certification-badge';
import PublicationBadge from '@/components/common/publication-badge';
import VersionCountBadge from '@/components/common/version-count-badge';
import type { CertificationLevel } from '@/types/lifecycle';
import { PageHeader, PageLayout, Pane } from '@/mantine/page';
import list from '@/components/common/list-page.module.css';
import classes from './data-products.module.css';

// --- Helper Function Type Definition --- 
type CheckApiResponseFn = <T>(
    response: { data?: T | { detail?: string }, error?: string | null | undefined },
    name: string
) => T;

// --- Helper Function Implementation (outside component) --- 
const checkApiResponse: CheckApiResponseFn = (response, name) => {
    if (response.error) {
        throw new Error(`${name} fetch failed: ${response.error}`);
    }
    // Check if data itself contains a FastAPI error detail
    if (response.data && typeof response.data === 'object' && 'detail' in response.data && typeof response.data.detail === 'string') {
        throw new Error(`${name} fetch failed: ${response.data.detail}`);
    }
    // Ensure data is not null/undefined before returning
    if (response.data === null || response.data === undefined) {
        throw new Error(`${name} fetch returned null or undefined data.`);
    }
    // Type assertion after checks - implicit from signature
    return response.data as any; // Use 'as any' temporarily if needed, but the signature defines T
};

/** A header label that sorts its column, in the grid's header-label look. */
function SortButton({ column, label }: { column: Column<DataProduct, unknown>; label: string }) {
  return (
    <UnstyledButton className={list.sort} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
      {label}
      <ArrowUpDown aria-hidden className={list.sortIcon} data-active={column.getIsSorted() ? '' : undefined} />
    </UnstyledButton>
  );
}

/** Where the DataTable keeps the list's sort. */
const SORT_KEY = 'data-products-sort';
const COLUMN_IDS = new Set(['name', 'team_members', 'version', 'outputPorts', 'status', 'created_at', 'updated_at']);
/** The Title column's ids before it sorted by name ('info.title' never matched a product). */
const OLD_TITLE_IDS = new Set(['info_title', 'info.title']);

/**
 * A saved sort on the old Title column sorts by name now; one on a column
 * that no longer exists is dropped, so the table never asks for a missing
 * column. Run before the DataTable reads it.
 */
function migrateSavedSort() {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (!raw) return;
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved)) {
      localStorage.removeItem(SORT_KEY);
      return;
    }
    const sort = saved
      .filter((s): s is { id: string; desc?: boolean } => !!s && typeof s.id === 'string')
      .map((s) => (OLD_TITLE_IDS.has(s.id) ? { ...s, id: 'name' } : s))
      .filter((s) => COLUMN_IDS.has(s.id));
    if (sort.length > 0) localStorage.setItem(SORT_KEY, JSON.stringify(sort));
    else localStorage.removeItem(SORT_KEY);
  } catch {
    // Storage can be off or hold junk: the table then takes its default sort
    try { localStorage.removeItem(SORT_KEY); } catch { /* storage off */ }
  }
}

// Status Color Helper (used by the status column)
const getStatusColor = (status: string | undefined): "default" | "secondary" | "destructive" | "outline" => {
  const lowerStatus = status?.toLowerCase() || '';
  if (lowerStatus.includes('active')) return 'default';
  if (lowerStatus.includes('development')) return 'secondary';
  if (lowerStatus.includes('retired') || lowerStatus.includes('deprecated')) return 'outline';
  if (lowerStatus.includes('deleted') || lowerStatus.includes('archived')) return 'destructive';
  return 'default';
};

// --- Component Code ---

export default function DataProducts() {
  const { t } = useTranslation(['data-products', 'common']);
  // Once, before the table first reads the saved sort
  useState(migrateSavedSort);
  const [products, setProducts] = useState<DataProduct[]>([]);
  // "Show all versions" toggle — flips include_history on the products list
  // endpoint. Off (default) collapses each family to its newest visible
  // version and surfaces a "N versions" badge per row. See PRD #442.
  const [includeHistory, setIncludeHistory] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<DataProduct | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // #851: import options dialog + opt-in "Create missing domains" toggle (default off).
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [createMissingDomains, setCreateMissingDomains] = useState(false);
  // #853: adopt valid, non-colliding file UUIDs as PK (default on); duplicate-id handling
  // (default skip; on = import as a new copy).
  // Default off, matching the backend-level privilege gate (#853 review): adoption
  // is opt-in both on the UI and on the route.
  const [adoptIds, setAdoptIds] = useState(false);
  const [duplicatesAsNew, setDuplicatesAsNew] = useState(false);
  // Paste ODPS JSON (parity with the Data Contracts uploader).
  const [odpsPaste, setOdpsPaste] = useState('');
  const [importingProductPaste, setImportingProductPaste] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the latest load may set the list: an earlier one that answers late
  // (such as one from before a project switch) is dropped
  const loadId = useRef(0);

  // Use the imported types for state (values loaded but not directly consumed by UI)
  const [_statuses, setStatuses] = useState<DataProductStatus[]>([]);
  const [_owners, setOwners] = useState<DataProductOwner[]>([]);

  // Add state for product types (reserved for future use)
  // const [productTypes, setProductTypes] = useState<string[]>([]);

  const [viewMode, setViewMode] = useState<'table' | 'graph'>('table');
  const [previewProductId, setPreviewProductId] = useState<string | null>(null);
  const [previewProductTitle, setPreviewProductTitle] = useState('');

  // Subscription filter state
  const [showMySubscriptions, setShowMySubscriptions] = useState(false);
  const [mySubscribedProductIds, setMySubscribedProductIds] = useState<Set<string>>(new Set());
  const [_subscriptionsLoading, _setSubscriptionsLoading] = useState(false);
  const [certificationLevels, setCertificationLevels] = useState<CertificationLevel[]>([]);

  const api = useApi();
  const { get, post, delete: deleteApi } = api;
  const { toast } = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { getDomainIdByName } = useDomains();
  const refreshNotifications = useNotificationsStore((state) => state.refreshNotifications);

  // Get permissions
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const featureId = 'data-products'; // ID for this feature

  // Get project context
  const { currentProject, hasProjectContext } = useProjectContext();

  // Determine if user has specific access levels
  const canRead = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.READ_ONLY);
  const canWrite = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.READ_WRITE);
  const canAdmin = !permissionsLoading && hasPermission(featureId, FeatureAccessLevel.ADMIN);

  // Fetch initial data for the table and dropdowns
  // The shell's breadcrumb names this menu page from the menu: no titles to set
  useEffect(() => {
    const loadInitialData = async () => {
      const id = ++loadId.current;
      setLoading(true);
      setError(null);
      try {
        // Build URL with project context and include_history flag (PRD #442).
        const params = new URLSearchParams();
        if (hasProjectContext && currentProject) {
          params.set('project_id', currentProject.id);
        }
        if (includeHistory) {
          params.set('include_history', 'true');
        }
        const qs = params.toString();
        const productsEndpoint = qs ? `/api/data-products?${qs}` : '/api/data-products';

        // Fetch products and dropdown values concurrently
        const [productsResp, statusesResp, ownersResp/*, typesResp*/] = await Promise.all([
          get<DataProduct[]>(productsEndpoint),
          get<DataProductStatus[]>('/api/data-products/statuses'),
          get<DataProductOwner[]>('/api/data-products/owners'),
          // get<string[]>('/api/data-products/types'), // Fetch product types (reserved for future use)
        ]);
        if (id !== loadId.current) return;

        // Check responses using the helper
        const productsData = checkApiResponse(productsResp, 'Products');
        const statusesData = checkApiResponse(statusesResp, 'Statuses');
        const ownersData = checkApiResponse(ownersResp, 'Owners');
        // const typesData = checkApiResponse(typesResp, 'Product Types'); // (reserved for future use)

        setProducts(Array.isArray(productsData) ? productsData : []);
        setStatuses(Array.isArray(statusesData) ? statusesData : []);
        setOwners(Array.isArray(ownersData) ? ownersData : []);
        // setProductTypes(Array.isArray(typesData) ? typesData : []); // Set product types (reserved for future use)

      } catch (err: any) {
        if (id !== loadId.current) return;
        console.error('Error fetching initial data:', err);
        setError(err.message || t('messages.loadInitialError'));
        // Reset state on error
        setProducts([]);
        setStatuses([]);
        // setProductTypes([]); // Reset types on error (reserved for future use)
        setOwners([]);
      } finally {
        if (id === loadId.current) setLoading(false);
      }
    };
    // Only load initial data if the user has permission and permissions are loaded
    if (!permissionsLoading && canRead) {
        loadInitialData();
    } else if (!permissionsLoading && !canRead) {
        // Ensure loading is stopped if permissions are loaded but access denied.
        // The permission denied message is handled by the render logic.
        setLoading(false);
    }
    // includeHistory in deps so toggling re-runs the initial fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, canRead, permissionsLoading, hasProjectContext, currentProject, includeHistory]);

  // Fetch user's subscriptions
  useEffect(() => {
    const fetchMySubscriptions = async () => {
      if (!canRead) return;
      try {
        const response = await get<DataProduct[]>('/api/data-products/my-subscriptions');
        if (response.data && Array.isArray(response.data)) {
          setMySubscribedProductIds(new Set(response.data.map(p => p.id)));
        }
      } catch (err) {
        console.warn('Failed to fetch subscriptions:', err);
      }
    };
    
    if (!permissionsLoading && canRead) {
      fetchMySubscriptions();
    }
  }, [get, canRead, permissionsLoading]);

  useEffect(() => {
    get<CertificationLevel[]>('/api/certification-levels').then(({ data }) => {
      if (Array.isArray(data)) setCertificationLevels(data);
    });
  }, [get]);

  // Reset the upload dialog's transient state every time it opens so a later
  // import doesn't silently carry over earlier toggles, paste text, or errors
  // (#930 review item 3). Paste survives failures within one dialog session
  // (see importPastedOdps) but is cleared on re-open.
  useEffect(() => {
    if (uploadDialogOpen) {
      setCreateMissingDomains(false);
      setAdoptIds(false);
      setDuplicatesAsNew(false);
      setOdpsPaste('');
      setError(null);
    }
  }, [uploadDialogOpen]);

  // Toggle subscription filter
  const handleToggleMySubscriptions = () => {
    setShowMySubscriptions(!showMySubscriptions);
  };

  // Filtered products based on subscription filter and URL parameters
  const displayedProducts = useMemo(() => {
    let filtered = products;

    // Apply status filter from URL parameter
    const statusFilter = searchParams.get('status');
    if (statusFilter) {
      const filterLower = statusFilter.toLowerCase();
      filtered = filtered.filter(p => {
        const productStatus = (p.status || '').toLowerCase();
        return productStatus === filterLower;
      });
    }

    // Apply subscription filter
    if (showMySubscriptions) {
      filtered = filtered.filter(p => mySubscribedProductIds.has(p.id));
    }

    return filtered;
  }, [products, showMySubscriptions, mySubscribedProductIds, searchParams]);

  // Function to refetch products list
  const fetchProducts = async () => {
    if (!canRead) return;
    const id = ++loadId.current;
    try {
      // Mirror loadInitialData so a refetch after a create/delete keeps the
      // same view mode (collapsed vs expanded) the user already had selected.
      const params = new URLSearchParams();
      if (hasProjectContext && currentProject) {
        params.set('project_id', currentProject.id);
      }
      if (includeHistory) {
        params.set('include_history', 'true');
      }
      const qs = params.toString();
      const endpoint = qs ? `/api/data-products?${qs}` : '/api/data-products';

      const response = await get<DataProduct[]>(endpoint);
      if (id !== loadId.current) return;
      const productsData = checkApiResponse(response, 'Products Refetch');
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err: any) {
      if (id !== loadId.current) return;
      console.error('Error refetching products:', err);
      setError(err.message || t('messages.refreshError'));
      toast({ title: t('messages.error'), description: `${t('messages.fetchError')}: ${err.message}`, variant: 'destructive' });
    } finally {
      // It may have replaced a first load, whose skeleton is still up
      if (id === loadId.current) setLoading(false);
    }
  };

  // --- Create Dialog Open Handler ---
  const handleOpenCreateDialog = (product?: DataProduct) => {
      if (!canWrite && !product) { // Need write permission to create
          toast({ title: t('permissions.denied'), description: t('permissions.noCreate'), variant: "destructive" });
          return;
      }
       if (!canWrite && product) { // Need write permission to edit
          toast({ title: t('permissions.denied'), description: t('permissions.noEdit'), variant: "destructive" });
          return;
      }
      setProductToEdit(product || null);
      setIsCreateDialogOpen(true);
  };

  // --- Create Dialog Success Handler ---
  const handleCreateSuccess = (savedProduct: DataProduct) => {
    fetchProducts();
    // Navigate to details view for newly created product
    if (savedProduct.id && !productToEdit) {
      navigate(`${pathname}/${savedProduct.id}`);
    }
  };

  // --- CRUD Handlers (Keep Delete and Upload here) ---
  const handleDeleteProduct = async (id: string, skipConfirm = false) => {
      if (!canAdmin) {
          toast({ title: t('permissions.denied'), description: t('permissions.noDelete'), variant: "destructive" });
          return;
      }
      if (!skipConfirm && !confirm(t('messages.deleteConfirm'))) {
          return;
      }
      try {
          await deleteOrThrow(deleteApi, `/api/data-products/${id}`);
          toast({ title: t('messages.success'), description: t('messages.deleteSuccess') });
          fetchProducts();
      } catch (err: any) {
          const errorMsg = err.message || t('messages.deleteError');
          toast({ title: t('messages.error'), description: errorMsg, variant: 'destructive' });
          setError(errorMsg);
          if (skipConfirm) throw err;
      }
  };

  // Bulk Delete Handler
  const handleBulkDelete = async (selectedRows: DataProduct[]) => {
      if (!canAdmin) {
          toast({ title: t('permissions.denied'), description: t('permissions.noBulkDelete'), variant: "destructive" });
          return;
      }
      const selectedIds = selectedRows.map(r => r.id).filter((id): id is string => !!id);
      if (selectedIds.length === 0) return;
      if (!confirm(t('bulk.deleteConfirm', { count: selectedIds.length }))) return;

      // Track individual delete statuses
      const results = await Promise.allSettled(selectedIds.map(async (id) => {
          try {
              await deleteOrThrow(deleteApi, `/api/data-products/${id}`);
              return id; // Return ID on success
          } catch (err: any) {
              // Re-throw the error with the ID for better context in the main handler
              throw new Error(`ID ${id}: ${err.message || 'Unknown delete error'}`);
          }
      }));

      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;

      if (successes > 0) {
          toast({ title: t('bulk.deleteSuccess'), description: t('bulk.deleteSuccessCount', { count: successes }) });
      }
      if (failures > 0) {
          const firstError = (results.find(r => r.status === 'rejected') as PromiseRejectedResult)?.reason?.message || t('messages.error');
          toast({ 
              title: t('bulk.deleteError'), 
              description: t('bulk.deleteErrorCount', { count: failures, error: firstError }), 
              variant: 'destructive' 
          });
      }
      fetchProducts();
  };

  // Bulk Request Access
  const handleBulkRequestAccess = async (selectedRows: DataProduct[]) => {
      const selectedIds = selectedRows.map(r => r.id).filter((id): id is string => !!id);
      if (selectedIds.length === 0) return;
      try {
          toast({ title: t('access.submitting'), description: t('access.requestingAccess', { count: selectedIds.length }) });
          // Submit individual requests for each entity (Access Grants API requires single entity_id)
          const results = await Promise.all(
            selectedIds.map(id =>
              fetch('/api/access-grants/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entity_type: 'data_product', entity_id: id, permission_level: 'READ' })
              })
            )
          );
          const failed = results.filter(r => !r.ok);
          if (failed.length > 0) throw new Error(t('access.requestError'));
          toast({ title: t('access.requestSent'), description: t('access.requestSubmitted') });
          refreshNotifications();
      } catch (e: any) {
          toast({ title: t('messages.error'), description: e.message || t('access.requestError'), variant: 'destructive' });
      }
  };

  // Helper to extract human-readable error message from API error responses
  const extractErrorMessage = (error: any): string => {
    if (!error) return t('messages.unknownError');
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
      // Handle structured error objects from the API
      if (error.message) return error.message;
      if (error.detail) {
        if (typeof error.detail === 'string') return error.detail;
        if (error.detail.message) return error.detail.message;
      }
      // Handle array of errors
      if (error.errors && Array.isArray(error.errors)) {
        const firstError = error.errors[0];
        if (typeof firstError === 'string') return firstError;
        if (firstError?.message) return firstError.message;
        return t('messages.validationErrors', { count: error.errors.length });
      }
      // Try to stringify, but limit length
      try {
        const str = JSON.stringify(error);
        return str.length > 200 ? str.substring(0, 200) + '...' : str;
      } catch {
        return t('messages.unknownErrorFormat');
      }
    }
    return String(error);
  };

  // File upload handler shared by the dropzone and the paste box (via
  // <ImportEntityDialog>). Each file may hold a single ODPS product or an array.
  // Returns true iff every entity was created successfully; callers that need to
  // preserve input on failure (paste box) check this before clearing (#930 review).
  const uploadProductFiles = async (files: File[]): Promise<boolean> => {
    if (!canWrite) {
      toast({ title: t('permissions.denied'), description: t('permissions.noUpload'), variant: "destructive" });
      return false;
    }
    if (!files || files.length === 0) return false;
    setIsUploading(true);
    setError(null);
    const formData = new FormData();
    // Multi-file: append every selected file under the `files` field, matching
    // the backend `List[UploadFile]`. Each file may itself hold an ODPS array.
    files.forEach((f) => formData.append('files', f));
    // #851: opt-in "Create missing domains" toggle, applied per-upload to every entity.
    formData.append('create_missing_domains', String(createMissingDomains));
    // #853: id adoption + duplicate handling.
    formData.append('adopt_ids', String(adoptIds));
    formData.append('on_duplicate', duplicatesAsNew ? 'new' : 'skip');
    try {
      // The upload endpoint returns a truthful BatchImportResult summary
      // (created/skipped/failed) across all files and entities.
      const response = await post<BatchImportResult>('/api/data-products/upload', formData);

      if (response.error) {
        // Extract meaningful message from potentially complex error object
        const errorMsg = extractErrorMessage(response.error);

        // Check if this might be a Data Contract file uploaded by mistake
        const isLikelyODCSContract = errorMsg.toLowerCase().includes('validation') ||
          errorMsg.toLowerCase().includes('schema') ||
          errorMsg.toLowerCase().includes('odcs');

        if (isLikelyODCSContract) {
          throw new Error(`${errorMsg}\n\n${t('upload.odcsHint')}`);
        }
        throw new Error(errorMsg);
      }

      const result = response.data;
      // Surface anything not created: failed entities AND files skipped as the
      // wrong type (e.g. an ODCS contract dropped here).
      const unimportedItems = result?.items?.filter((i) => i.status !== 'created') ?? [];
      const allCreated = !!result && result.failed === 0 && result.skipped === 0;
      if (result && (result.failed > 0 || result.skipped > 0)) {
        // Partial success: surface the truthful summary plus the first issues.
        const detail = unimportedItems
          .slice(0, 5)
          .map((i) => `• ${i.name || i.source_id || `#${i.index}`}: ${i.message ?? i.status}`)
          .join('\n');
        toast({
          title: result.created > 0 ? t('upload.partialSuccess', 'Imported with issues') : t('upload.failed'),
          description: `${summarizeImport(result, t)}${detail ? `\n${detail}` : ''}`,
          variant: result.failed > 0 && result.created === 0 ? 'destructive' : 'default',
          duration: 10000,
        });
        if (unimportedItems.length > 0) setError(`${summarizeImport(result, t)}\n${detail}`);
      } else {
        setUploadDialogOpen(false);
        toast({
          title: t('upload.success'),
          description: productUploadSuccessText(files, result?.created ?? 0, t),
        });
      }
      await fetchProducts();
      return allCreated;

    } catch (err: any) {
      console.error('Error uploading file:', err);
      const errorMsg = err.message || t('upload.unexpectedError');
      toast({
          title: t('upload.failed'),
          description: errorMsg,
          variant: "destructive",
          duration: 10000, // Show longer for detailed errors
      });
      setError(errorMsg);
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  // Paste ODPS JSON: wrap the text as a .json file and reuse the batch endpoint.
  // Only clear the textarea on full success — otherwise the user loses the input
  // they would need to fix and retry (#930 review).
  const importPastedOdps = async () => {
    const value = odpsPaste.trim();
    if (!value) return;
    setImportingProductPaste(true);
    try {
      const file = new File([value], 'pasted.json', { type: 'application/json' });
      const allCreated = await uploadProductFiles([file]);
      if (allCreated) setOdpsPaste('');
    } finally {
      setImportingProductPaste(false);
    }
  };

  // --- Genie Space Handler ---
  const handleCreateGenieSpace = async (selectedRows: DataProduct[]) => {
      if (!canWrite) {
          toast({ title: t('permissions.denied'), description: t('permissions.noGenieSpace'), variant: "destructive" });
          return;
      }
      const selectedIds = selectedRows.map(r => r.id).filter((id): id is string => !!id);
      if (selectedIds.length === 0) {
          toast({ title: t('genie.noSelection'), description: t('genie.selectAtLeastOne'), variant: "default" });
          return;
      }

      if (!confirm(t('genie.createConfirm', { count: selectedIds.length }))) {
          return;
      }

      toast({ title: t('genie.initiating'), description: t('genie.requestingCreation', { count: selectedIds.length }) });

      try {
          const response = await post('/api/data-products/genie-space', { product_ids: selectedIds });
          
          if (response.error) {
              throw new Error(response.error);
          }
          if (response.data && typeof response.data === 'object' && 'detail' in response.data) {
              throw new Error(response.data.detail as string);
          }

          toast({ title: t('genie.requestSubmitted'), description: t('genie.willBeNotified') });
          refreshNotifications();

      } catch (err: any) {
          console.error('Error initiating Genie Space creation:', err);
          const errorMsg = err.message || t('genie.creationError');
          toast({ title: t('messages.error'), description: errorMsg, variant: 'destructive' });
          setError(errorMsg);
      }
  };

  // --- Define these outside the columns definition --- 
  const handleEditClick = (product: DataProduct) => {
      handleOpenCreateDialog(product);
  };

  const handleDeleteClick = (product: DataProduct) => {
       if (product.id) {
          handleDeleteProduct(product.id, false);
       }
  };


  // The columns read the row handlers through a ref, so the definitions stay
  // the same across renders and the cells keep their focus
  const rowActions = useRef({ edit: handleEditClick, remove: handleDeleteClick });
  useEffect(() => {
    rowActions.current = { edit: handleEditClick, remove: handleDeleteClick };
  });

  // --- Column Definitions (memoised for the DataTable) ---
  const columns = useMemo<ColumnDef<DataProduct>[]>(() => [
    {
      // The product's name: what the filter box searches and Title sorts
      accessorKey: "name",
      header: ({ column }) => <SortButton column={column} label={t('table.title')} />,
      cell: ({ row }) => {
        const product = row.original;
        // Multi-domain (#520): render each assigned domain as a badge (primary starred).
        const domainIds = product.domain_ids ?? [];
        const primaryId = product.primary_domain_id || getDomainIdByName(product.domain) || domainIds[0] || null;
        return (
          <div className={list.titleCell}>
            <span className={list.title}>{product.name || t('table.unnamedProduct')}</span>
            <DomainBadgeList
              domains={product.domains}
              domainIds={domainIds}
              primaryDomainId={primaryId}
              onDomainClick={(id) => navigate(`/settings/data-domains/${id}`)}
            />
          </div>
        );
      },
    },
    {
      accessorKey: "team.members",
      header: ({ column }) => <SortButton column={column} label={t('table.owner')} />,
      cell: ({ row }) => {
        const owner = row.original.team?.members?.find(m => m.role === 'owner');
        return <span className={list.person}>{owner?.name || owner?.username || t('common:states.notAvailable')}</span>;
      },
    },
    {
      accessorKey: "version",
      header: ({ column }) => <SortButton column={column} label={t('table.version')} />,
      cell: ({ row }) => {
        const id = row.original.id
        return (
          <div className={list.badges}>
            <Badge variant="secondary">{row.original.version}</Badge>
            {/* Family badge — same UX as on contracts. Click routes into
                the detail view where VersionNavigator handles version
                navigation. See PRD #442. */}
            <VersionCountBadge
              count={row.original.versionCount}
              onClick={() => id && navigate(`${pathname}/${id}`)}
            />
          </div>
        )
      },
    },
    {
      accessorKey: "outputPorts",
      header: ({ column }) => <SortButton column={column} label={t('table.type')} />,
      cell: ({ row }) => {
        const firstOutputPort = row.original.outputPorts?.[0];
        const productType = firstOutputPort?.type;
        return productType ?
          <Badge variant="outline">{productType}</Badge> : t('common:states.notAvailable');
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => <SortButton column={column} label={t('table.status')} />,
      cell: ({ row }) => (
        row.original.status ? (
          <div className={list.badges}>
            <Badge variant={getStatusColor(row.original.status)}>{row.original.status}</Badge>
            {row.original.draftOwnerId && (
              <Badge variant="info">{t('data-products:status.personalDraft')}</Badge>
            )}
            <CertificationBadge
              certificationLevel={row.original.certification_level}
              inheritedCertificationLevel={row.original.inherited_certification_level}
              certifiedAt={row.original.certified_at}
              certifiedBy={row.original.certified_by}
              levels={certificationLevels}
              size="sm"
            />
            <PublicationBadge
              publicationScope={row.original.publication_scope}
              publishedAt={row.original.published_at}
              publishedBy={row.original.published_by}
            />
          </div>
        ) : t('common:states.notAvailable')
      ),
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
      accessorKey: "created_at",
      header: ({ column }) => <SortButton column={column} label={t('table.created')} />,
      cell: ({ row }) => row.original.created_at ? <RelativeDate date={row.original.created_at} /> : t('common:states.notAvailable'),
    },
    {
      accessorKey: "updated_at",
      header: ({ column }) => <SortButton column={column} label={t('table.updated')} />,
      cell: ({ row }) => <RelativeDate date={row.original.updated_at} />,
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div className={list.actions}>
            <ActionIcon
                variant="subtle"
                color="gray"
                className={list.action}
                onClick={(e) => { e.stopPropagation(); setPreviewProductId(product.id ?? null); setPreviewProductTitle(product.name ?? ''); }}
                title={t('data-products:table.previewMetadata')}
            >
              <Eye aria-hidden />
            </ActionIcon>
            <ActionIcon
                variant="subtle"
                color="gray"
                className={list.action}
                onClick={() => rowActions.current.edit(product)}
                disabled={!canWrite || permissionsLoading}
                title={canWrite ? t('common:actions.edit') : t('table.editDenied')}
            >
              <Pencil aria-hidden />
            </ActionIcon>
            {product.id && (
              <ActionIcon
                variant="subtle"
                color="gray"
                className={`${list.action} ${list.delete}`}
                onClick={(e) => {
                    e.stopPropagation();
                    rowActions.current.remove(product);
                }}
                disabled={!canAdmin || permissionsLoading}
                title={canAdmin ? t('common:actions.delete') : t('table.deleteDenied')}
              >
                <Trash2 aria-hidden />
              </ActionIcon>
            )}
          </div>
        );
      },
    },
  ], [canWrite, canAdmin, permissionsLoading, navigate, pathname, certificationLevels, getDomainIdByName, t]);

  const showList = !permissionsLoading && canRead && !loading;

  // --- Render Logic ---
  return (
    <>
      <PageLayout
        fullBleed
        header={
          <PageHeader
            title={t('title')}
            actions={showList && (
              <ViewModeToggle
                currentView={viewMode}
                onViewChange={setViewMode}
                tableViewIcon={<TableIcon />}
                graphViewIcon={<Workflow />}
              />
            )}
          />
        }
      >
        <Pane flush aria-label={t('listPane')}>
          <div className={`${list.body} ${classes.view}`} data-view={showList ? viewMode : undefined}>
            {/* 1. Check Permissions Loading */}
            {permissionsLoading ? (
              <ListViewSkeleton columns={9} rows={5} toolbarButtons={3} />
            ) : !canRead ? (
              // 2. Check Read Permission (if permissions loaded)
              <Alert color="red" variant="light" icon={<AlertCircle />} className={list.alert}>
                {t('permissions.noView')}
              </Alert>
            ) : loading ? (
              // 3. Check Data Loading (if permissions OK)
              <ListViewSkeleton columns={9} rows={5} toolbarButtons={3} />
            ) : (
              // 4. Render Content (if permissions OK and data loaded)
              <>
                {/* A dismissible error (such as an upload failure) */}
                {error && (
                  <Alert
                    color="red"
                    variant="light"
                    icon={<AlertCircle />}
                    className={list.alert}
                    classNames={{ message: list.alertMessage }}
                    withCloseButton
                    closeButtonLabel={t('common:actions.dismiss')}
                    onClose={() => setError(null)}
                  >
                    {error}
                  </Alert>
                )}

                {viewMode === 'table' ? (
                  <DataTable
                    columns={columns}
                    data={displayedProducts}
                    searchColumn="name"
                    storageKey={SORT_KEY}
                    toolbarActions={
                      <>
                        {/* Family-collapse toggle. Mirrors the contracts list view.
                            See PRD #442. */}
                        <Switch
                          id="products-include-history"
                          size="xs"
                          className={list.history}
                          classNames={{ label: list.historyLabel }}
                          checked={includeHistory}
                          onChange={(e) => setIncludeHistory(e.currentTarget.checked)}
                          label={t('versionFamily.showAllVersions', { defaultValue: 'Show all versions' })}
                        />
                        {/* My Subscriptions Filter Toggle */}
                        <Button
                          onClick={handleToggleMySubscriptions}
                          variant={showMySubscriptions ? "default" : "outline"}
                          title={showMySubscriptions ? t('toolbar.showAll') : t('toolbar.showSubscriptions')}
                        >
                          {showMySubscriptions ? <Bell /> : <BellOff />}
                          {showMySubscriptions ? t('toolbar.mySubscriptionsCount', { count: mySubscribedProductIds.size }) : t('filters.mySubscriptions')}
                        </Button>
                        {/* Create Button - Conditionally enabled */}
                        <Button
                            onClick={() => handleOpenCreateDialog()}
                            disabled={!canWrite || permissionsLoading}
                            title={canWrite ? t('toolbar.createProduct') : t('permissions.denied')}
                        >
                          <Plus />
                          {t('toolbar.createProduct')}
                        </Button>
                        {/* Upload Button - Conditionally enabled */}
                        <Tooltip
                          multiline
                          w={280}
                          position="bottom"
                          withinPortal
                          label={
                            <div className={list.tip}>
                              <p className={list.tipTitle}>{t('upload.tooltipTitle')}</p>
                              <p>{t('upload.tooltipDescription')}</p>
                              <p>{t('upload.tooltipHint')}</p>
                            </div>
                          }
                        >
                          <Button
                              onClick={() => setUploadDialogOpen(true)}
                              variant="outline"
                              disabled={isUploading || !canWrite || permissionsLoading}
                          >
                            <Upload />
                            {isUploading ? (<><Loader size={12} color="currentColor" /> {t('upload.uploading')}</>) : t('toolbar.uploadFile')}
                            <HelpCircle aria-hidden className={list.help} />
                          </Button>
                        </Tooltip>
                        {/* Upload dialog (shared with Data Contracts via ImportEntityDialog) */}
                        <ImportEntityDialog
                          open={uploadDialogOpen}
                          onOpenChange={setUploadDialogOpen}
                          uploading={isUploading}
                          disabled={importingProductPaste}
                          accept={{
                            'application/json': ['.json'],
                            'application/x-yaml': ['.yaml', '.yml'],
                            'text/yaml': ['.yaml', '.yml'],
                          }}
                          onFiles={uploadProductFiles}
                          toggles={{
                            createMissingDomains, setCreateMissingDomains,
                            adoptIds, setAdoptIds,
                            duplicatesAsNew, setDuplicatesAsNew,
                          }}
                          paste={{
                            value: odpsPaste,
                            onChange: setOdpsPaste,
                            onSubmit: importPastedOdps,
                            submitting: importingProductPaste,
                          }}
                          labels={{
                            title: t('upload.dialogTitle', 'Upload Data Products'),
                            description: t('upload.dialogDescription', 'Select one or more ODPS files (YAML/JSON). Each file may contain a single product or an array.'),
                            createMissingDomains: t('upload.createMissingDomains', 'Create missing domains'),
                            createMissingDomainsHint: t('upload.createMissingDomainsHint', "Auto-create domains that don't already exist. Off: unmatched domains are left unassigned (the original is preserved)."),
                            adoptIds: t('upload.adoptIds', 'Adopt IDs from file'),
                            adoptIdsHint: t('upload.adoptIdsHint', 'Reuse a valid, non-colliding UUID from the file as the primary key so links between entities survive import.'),
                            duplicatesAsNew: t('upload.duplicatesAsNew', 'Import duplicate IDs as new copies'),
                            duplicatesAsNewHint: t('upload.duplicatesAsNewHint', 'Off (default): a product whose ID already exists is skipped. On: it is imported as a new copy with a fresh ID.'),
                            dropActive: t('upload.dropActive', 'Drop the file(s) here'),
                            dropInactive: t('upload.dropInactive', 'Drag and drop product file(s) here, or click to select'),
                            supportedFormats: t('upload.supportedFormats', 'Supported formats: JSON or YAML (ODPS)'),
                            pasteLabel: t('upload.orPasteOdps', 'Or paste ODPS JSON'),
                            pastePlaceholder: t('upload.pasteOdpsPlaceholder', 'Paste ODPS product JSON here'),
                            pasteButton: t('upload.importJsonButton', 'Import JSON'),
                          }}
                        />
                      </>
                    }
                    bulkActions={(selectedRows) => (
                      <>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleBulkRequestAccess(selectedRows)}
                            disabled={selectedRows.length === 0}
                            title={t('bulk.requestAccessTitle')}
                        >
                            <KeyRound />
                            {t('bulk.requestAccess', { count: selectedRows.length })}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateGenieSpace(selectedRows)}
                            disabled={selectedRows.length === 0 || !canWrite}
                            title={canWrite ? t('bulk.createGenieSpaceTitle') : t('permissions.denied')}
                        >
                            <Sparkles />
                            {t('bulk.createGenieSpace', { count: selectedRows.length })}
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleBulkDelete(selectedRows)}
                            disabled={selectedRows.length === 0 || !canAdmin}
                            title={canAdmin ? t('bulk.deleteTitle') : t('permissions.denied')}
                        >
                            <Trash2 />
                            {t('bulk.deleteSelected', { count: selectedRows.length })}
                        </Button>
                      </>
                    )}
                    onRowClick={(row) => {
                      const productId = row.original.id;
                      if (productId) {
                        navigate(`${pathname}/${productId}`);
                      } else {
                        console.warn("Cannot navigate: Product ID is missing.", row.original);
                        toast({ title: t('navigation.error'), description: t('navigation.missingId'), variant: "default" });
                      }
                    }}
                  />
                ) : (
                  <DataProductGraphView
                      products={displayedProducts}
                      viewMode={viewMode}
                      setViewMode={setViewMode}
                      navigate={navigate}
                  />
                )}
              </>
            )}
          </div>
        </Pane>
      </PageLayout>

      <EntityInfoDialog
        entityType="data_product"
        entityId={previewProductId}
        open={!!previewProductId}
        onOpenChange={(o) => { if (!o) setPreviewProductId(null); }}
        title={previewProductTitle}
      />

      {/* Render the Simple Create Dialog */}
      <DataProductCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleCreateSuccess}
        product={productToEdit || undefined}
        mode={productToEdit ? 'edit' : 'create'}
      />

      {/* Render Toaster component (ideally place in root layout like App.tsx) */}
      <Toaster />
    </>
  );
}

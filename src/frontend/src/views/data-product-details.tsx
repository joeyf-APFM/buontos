import { useState, useEffect, useCallback } from 'react';
import { deleteOrThrow } from '@/lib/delete-or-throw';
import { subscribeResponseErrorText } from '@/lib/subscribe-error';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DataProduct, InputPort, OutputPort, ManagementPort, TeamMember, Support, SubscriptionResponse, SubscribersListResponse } from '@/types/data-product';
import DataProductCreateDialog from '@/components/data-products/data-product-create-dialog';
import InputPortFormDialog from '@/components/data-products/input-port-form-dialog';
import OutputPortFormDialog from '@/components/data-products/output-port-form-dialog';
import ManagementPortFormDialog from '@/components/data-products/management-port-form-dialog';
import TeamMemberFormDialog from '@/components/data-products/team-member-form-dialog';
import SupportChannelFormDialog from '@/components/data-products/support-channel-form-dialog';
import ImportExportDialog from '@/components/data-products/import-export-dialog';
import { useApi } from '@/hooks/use-api';
import { useApprovalWizardTrigger } from '@/hooks/use-approval-wizard-trigger';
import { Button } from '@/components/ui/button';
import { Loader2, Pencil, Trash2, AlertCircle, Sparkles, CopyPlus, ArrowLeft, KeyRound, Plus, FileText, Download, Bell, BellOff, ShieldCheck, Globe } from 'lucide-react';
import { Alert } from '@mantine/core';
import { DetailViewSkeleton } from '@/components/common/list-view-skeleton';
import { Badge } from '@/components/ui/badge';
import TagChip from '@/components/ui/tag-chip';
import { useToast } from '@/hooks/use-toast';
import { usePageBreadcrumb } from '@/stores/breadcrumb-store';
import { usePermissions } from '@/stores/permissions-store';
import { useUserStore } from '@/stores/user-store';
import { FeatureAccessLevel } from '@/types/settings';
import * as Settings from '@/types/settings';
import { useNotificationsStore } from '@/stores/notifications-store';
import CreateVersionDialog from '@/components/data-products/create-version-dialog';
import ConceptSelectDialog from '@/components/semantic/concept-select-dialog';
import LinkedConceptChips from '@/components/semantic/linked-concept-chips';
import type { EntitySemanticLink } from '@/types/semantic-link';
import EntityMetadataPanel from '@/components/metadata/entity-metadata-panel';
import { OwnershipPanel } from '@/components/common/ownership-panel';
import { CommentSidebar } from '@/components/comments';
import { RatingPanel } from '@/components/ratings';
import AccessGrantsPanel from '@/components/access/access-grants-panel';
import { useDomains } from '@/hooks/use-domains';
import RequestProductActionDialog from '@/components/data-products/request-product-action-dialog';
import CommitDraftDialog from '@/components/data-products/commit-draft-dialog';
import ApprovalWizardDialog from '@/components/workflows/approval-wizard-dialog';
import EntityCostsPanel from '@/components/costs/entity-costs-panel';
import EntityQualityPanel from '@/components/quality/entity-quality-panel';
import LinkContractToPortDialog from '@/components/data-products/link-contract-to-port-dialog';
import VersioningRecommendationDialog from '@/components/common/versioning-recommendation-dialog';
import VersionNavigator from '@/components/common/version-navigator';
import { Link2, Unlink, GitBranch } from 'lucide-react';
import { AssetSelector } from '@/components/common/asset-selector';
import { EntityTreePanel } from '@/components/common/entity-tree-panel';
import { BusinessLineageView } from '@/components/lineage';
import { MaturityInline } from '@/components/common/maturity-inline';
import { LineageEditor } from '@/components/common/lineage-editor';
import { useCopilotContext } from '@/hooks/use-copilot-context';
import type { QualitySummary } from '@/types/quality';
import CertificationBadge from '@/components/common/certification-badge';
import PublicationScopeBadge from '@/components/common/publication-scope-badge';
import { DirectCertifyDialog, DirectPublishDialog } from '@/components/common/direct-lifecycle-dialogs';
import type { CertificationLevel, PublicationScope } from '@/types/lifecycle';
import { userHasApprovalPrivilege } from '@/lib/permissions';
import { ApprovalEntity } from '@/types/settings';
import { DetailsGrid, PageHeader, PageLayout, Pane, PaneStack, type DetailsRow } from '@/mantine/page';
import classes from './data-product-details.module.css';
import common from '@/components/common/detail-page.module.css';

/**
 * ODPS v1.0.0 Data Product Details View
 *
 * Displays product with sections for all ODPS entities.
 * Complex nested entities are edited via form dialogs (to be created).
 */

type ViewMode = 'minimal' | 'medium' | 'large'
const VIEW_MODE_STORAGE_KEY = 'data-product-view-mode'

const VIEW_MODES: ReadonlyArray<ViewMode> = ['minimal', 'medium', 'large'];

// The view-size buttons: S, M and L, each with its tooltip
const VIEW_MODE_BUTTONS = [
  { mode: 'minimal', label: 'S', tooltip: 'common:tooltips.smallView' },
  { mode: 'medium', label: 'M', tooltip: 'common:tooltips.mediumView' },
  { mode: 'large', label: 'L', tooltip: 'common:tooltips.largeView' },
] as const satisfies ReadonlyArray<{ mode: ViewMode; label: string; tooltip: string }>;

/**
 * Parse a value retrieved from `localStorage[VIEW_MODE_STORAGE_KEY]`. Returns
 * the value when it's one of the known modes, otherwise `null` so the caller
 * can apply its default.
 */
export function parseStoredViewMode(stored: string | null | undefined): ViewMode | null {
  if (!stored) return null;
  return (VIEW_MODES as ReadonlyArray<string>).includes(stored) ? (stored as ViewMode) : null;
}

/**
 * Pure helper that maps (product owner team membership, permission level)
 * to the default ViewMode. Owner-team members get the full 'large' view;
 * write/admin users get 'medium'; everyone else 'minimal'.
 */
export function computeDefaultViewMode(args: {
  ownerTeamId?: string | null;
  userGroups?: ReadonlyArray<string> | null;
  permissionLevel?: FeatureAccessLevel | null;
}): ViewMode {
  const { ownerTeamId, userGroups, permissionLevel } = args;
  if (ownerTeamId && userGroups && userGroups.includes(ownerTeamId)) {
    return 'large';
  }
  if (
    permissionLevel === FeatureAccessLevel.READ_WRITE ||
    permissionLevel === FeatureAccessLevel.ADMIN ||
    permissionLevel === FeatureAccessLevel.FULL
  ) {
    return 'medium';
  }
  return 'minimal';
}

/**
 * Pure ViewMode → section visibility predicate. The component-level wrapper
 * just closes over the current `viewMode`.
 */
export function shouldShowSectionForViewMode(viewMode: ViewMode, section: string): boolean {
  switch (viewMode) {
    case 'minimal':
      return ['deliverables', 'description', 'hierarchy'].includes(section);
    case 'medium':
      return !['management-ports', 'support-channels', 'metadata-panel', 'ratings', 'costs', 'quality', 'authoritative-definitions', 'custom-properties'].includes(section);
    case 'large':
      return true;
    default:
      return false;
  }
}

/**
 * Format an ISO date string for display. Falls back to `fallback` when input
 * is empty / undefined, and to a literal `Invalid Date` when `Date` rejects it.
 */
export function formatDateString(dateString: string | undefined | null, fallback: string = 'N/A'): string {
  if (!dateString) return fallback;
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleString();
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Map a Data Product status string to a Shadcn Badge variant.
 * Lower-cased internally so `Active`, `ACTIVE`, `active` all map identically.
 */
export function getStatusBadgeVariant(
  status: string | undefined | null,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const lowerStatus = status?.toLowerCase() || '';
  if (lowerStatus === 'active') return 'default';
  if (lowerStatus === 'draft' || lowerStatus === 'proposed') return 'secondary';
  if (lowerStatus === 'retired' || lowerStatus === 'deprecated') return 'outline';
  return 'default';
}

/**
 * Statuses where a Data Product can still be edited in-place. Anything with a
 * higher lifecycle status (`active`, `retired`, `deprecated`) must be cloned
 * for editing instead.
 */
export const IN_PLACE_EDITABLE_STATUSES: ReadonlyArray<string> = [
  'draft',
  'sandbox',
  'proposed',
  'under_review',
  'approved',
];

export function isStatusEditableInPlace(status: string | undefined | null): boolean {
  if (!status) return false;
  return IN_PLACE_EDITABLE_STATUSES.includes(status.toLowerCase());
}

/**
 * A "personal draft" is a product owned by a single user (not a team) — these
 * stay editable for that user even when the product status would otherwise be
 * locked. The signal is a non-null `draftOwnerId` on the product.
 */
export function isPersonalDraftProduct(product: { draftOwnerId?: string | null } | null | undefined): boolean {
  return product != null && product.draftOwnerId != null;
}

/**
 * Read-only iff the user is not an admin AND the product is neither
 * editable-in-place nor a personal draft. Pure function over the three flags.
 */
export function isProductReadOnly(args: {
  canAdmin: boolean;
  canEditInPlace: boolean;
  isPersonalDraft: boolean;
}): boolean {
  return !args.canAdmin && !args.canEditInPlace && !args.isPersonalDraft;
}

/**
 * Final "can the user modify this product" gate combining role + status flags.
 * Admins can always modify; write-class users can modify when the product is
 * editable-in-place or a personal draft.
 */
export function canUserModifyProduct(args: {
  canAdmin: boolean;
  canWrite: boolean;
  canEditInPlace: boolean;
  isPersonalDraft: boolean;
}): boolean {
  if (args.canAdmin) return true;
  return args.canWrite && (args.canEditInPlace || args.isPersonalDraft);
}

/**
 * Resolve the human-readable domain label for a product. Falls back to the
 * raw domain id when the lookup misses, and to a "not assigned" sentinel when
 * the product has no domain at all.
 */
export function resolveDomainLabel(args: {
  domain: string | undefined | null;
  resolveName: (id: string) => string | undefined | null;
  notAssignedLabel: string;
}): string {
  const { domain, resolveName, notAssignedLabel } = args;
  if (!domain) return notAssignedLabel;
  return resolveName(domain) || domain;
}

/**
 * Whether the product is in the "active" lifecycle state. Centralised so the
 * "active" magic string lives in one place — used by the lifecycle approve /
 * deprecate gates.
 */
export function isProductActive(status: string | undefined | null): boolean {
  return (status?.toLowerCase() || '') === 'active';
}

/**
 * Output port → asset relationship predicates.
 *
 * Mirrors the `portHas*` predicates declared in `ontos-ontology.ttl` (lines
 * 838–891). The ontology intentionally restricts these relationships to
 * *deliverable* asset types — not container types like Catalog or Schema.
 * The picker filter and the POST predicate selection both flow from this map,
 * so they stay in lock-step with the ontology.
 *
 * If a new deliverable type is added to the TTL, add it here. If a caller
 * tries to link an unsupported type the POST is skipped with a warning;
 * the backend at `entity_relationships_manager.py` is the actual security
 * gate and will return 422 for any invalid (predicate, range) tuple.
 */
export const PORT_TO_ASSET_PREDICATE: Readonly<Record<string, string>> = {
  Table: 'portHasTable',
  View: 'portHasView',
  // ontos:MetricView is a subclass of ontos:View, so a port delivers it as a view
  'Metric View': 'portHasView',
  Dataset: 'portHasDataset',
  APIEndpoint: 'portHasEndpoint',
  MLModel: 'portHasModel',
};

const PORT_DELIVERABLE_ASSET_TYPES = Object.keys(PORT_TO_ASSET_PREDICATE);

/**
 * Look up the ontology predicate for a port → asset relationship.
 * Returns `undefined` for unsupported / missing asset types so callers can
 * skip the POST instead of building a `portHas<X>` the backend will 422 on.
 */
export function selectPortAssetPredicate(assetTypeName: string | undefined | null): string | undefined {
  if (!assetTypeName) return undefined;
  return PORT_TO_ASSET_PREDICATE[assetTypeName];
}

/**
 * Build the POST body for `/api/entity-relationships` from an asset and the
 * owning port id. Returns `null` when the asset type has no port predicate
 * in the ontology — caller should skip + warn rather than send the request.
 */
export function buildLinkAssetRequestBody(
  asset: any,
  portId: string,
): { source_type: string; source_id: string; target_type: string; target_id: string; relationship_type: string } | null {
  const predicate = selectPortAssetPredicate(asset?.asset_type_name);
  if (!predicate) return null;
  return {
    source_type: 'OutputPort',
    source_id: portId,
    target_type: asset.asset_type_name,
    target_id: asset.id,
    relationship_type: predicate,
  };
}

/** Label / value rows, leaving out the empty ones. */
const rowsOf = (rows: (DetailsRow | false | null | undefined | '')[]): DetailsRow[] =>
  rows.filter((r): r is DetailsRow => !!r);

type CheckApiResponseFn = <T>(
  response: { data?: T | { detail?: string }, error?: string | null | undefined },
  name: string
) => T;

const checkApiResponse: CheckApiResponseFn = (response, name) => {
  if (response.error) {
    throw new Error(`${name} fetch failed: ${response.error}`);
  }
  if (response.data && typeof response.data === 'object' && 'detail' in response.data && typeof response.data.detail === 'string') {
    throw new Error(`${name} fetch failed: ${response.data.detail}`);
  }
  if (response.data === null || response.data === undefined) {
    throw new Error(`${name} fetch returned null or undefined data.`);
  }
  return response.data as any;
};

/**
 * Per-port linked assets sub-component.
 * Shows assets linked to a specific output port via entity relationships,
 * and provides a button to link new assets.
 */
function PortLinkedAssets({ portId, portName, canEdit }: { portId: string; portName: string; canEdit: boolean }) {
  const { t } = useTranslation(['data-products', 'common']);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchRelationships = useCallback(async () => {
    try {
      const res = await fetch(`/api/entities/OutputPort/${portId}/relationships`);
      if (!res.ok) return;
      const data = await res.json();
      const rels = Array.isArray(data)
        ? data
        : [...(data.outgoing || []), ...(data.incoming || [])];
      setRelationships(rels);
    } catch {
      // Silently fail for non-critical display
    } finally {
      setIsLoading(false);
    }
  }, [portId]);

  useEffect(() => {
    fetchRelationships();
  }, [fetchRelationships]);

  const handleLinkAssets = async (assets: any[]) => {
    try {
      let linkedCount = 0;
      for (const asset of assets) {
        // The picker is filtered to deliverable types, but be defensive:
        // if an asset of an unsupported type slips through, skip + warn rather
        // than build a `portHas<X>` predicate that the backend will 422 on.
        const body = buildLinkAssetRequestBody(asset, portId);
        if (!body) {
          // eslint-disable-next-line no-console
          console.warn(
            `[link-asset] Skipping asset ${asset.id}: type "${asset.asset_type_name}" has no port relationship in the ontology.`
          );
          continue;
        }
        const res = await fetch('/api/entity-relationships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Failed to link asset: ${res.statusText}`);
        linkedCount += 1;
      }
      toast({ title: t('data-products:details.deliverables.assetsLinkedTitle'), description: t('data-products:details.deliverables.assetsLinked', { count: linkedCount, portName }) });
      fetchRelationships();
    } catch (error: any) {
      toast({ title: t('common:toast.error'), description: error?.message || t('data-products:details.deliverables.linkAssetsFailed'), variant: 'destructive' });
    }
  };

  const handleUnlinkAsset = async (relId: string) => {
    try {
      const res = await fetch(`/api/entity-relationships/${relId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to unlink asset');
      toast({ title: t('data-products:details.deliverables.assetUnlinked') });
      fetchRelationships();
    } catch (error: any) {
      toast({ title: t('common:toast.error'), description: error?.message || t('data-products:details.deliverables.unlinkAssetFailed'), variant: 'destructive' });
    }
  };

  if (isLoading) return null;

  const linkedAssets = relationships.filter(r => r.source_id === portId);

  return (
    <div className={classes.assets}>
      {linkedAssets.length > 0 && (
        <div className={classes.chips}>
          {linkedAssets.map((rel) => (
            <Badge
              key={rel.id}
              variant="outline"
              className={classes.assetBadge}
              onClick={() => {
                if (rel.target_type && rel.target_id) {
                  navigate(`/assets/${rel.target_id}`);
                }
              }}
            >
              {rel.target_name || rel.target_id}
              {canEdit && (
                <button
                  type="button"
                  className={classes.unlink}
                  aria-label={t('data-products:details.deliverables.unlinkAsset', { name: rel.target_name || rel.target_id })}
                  title={t('data-products:details.deliverables.unlinkAsset', { name: rel.target_name || rel.target_id })}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnlinkAsset(rel.id);
                  }}
                >
                  ×
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {canEdit && (
        <>
          <Button
            size="sm"
            variant="ghost"
            className={classes.inlineAction}
            onClick={() => setIsAssetSelectorOpen(true)}
          >
            <Plus />
            Link Asset
          </Button>
          <AssetSelector
            isOpen={isAssetSelectorOpen}
            onOpenChange={setIsAssetSelectorOpen}
            onConfirm={handleLinkAssets}
            relationshipLabel={t('data-products:details.deliverables.linkedToPort')}
            targetAssetTypes={PORT_DELIVERABLE_ASSET_TYPES}
            title={t('data-products:details.deliverables.linkAssetsTitle', { portName })}
            description={t('data-products:details.deliverables.linkAssetsDescription')}
          />
        </>
      )}
    </div>
  );
}

export default function DataProductDetails() {
  const { t } = useTranslation(['data-products', 'common', 'business-owners', 'metadata']);
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const listPath = pathname.replace(/\/[^/]+$/, '');
  const api = useApi();
  const { get, post, delete: deleteApi } = api;
  const { lookupWorkflowId } = useApprovalWizardTrigger();
  const { toast } = useToast();
  // Ignored once the page has gone, so a late answer can't name the next page
  const { setStaticSegments, setDynamicTitle } = usePageBreadcrumb();
  const {
    hasPermission,
    isLoading: permissionsLoading,
    getPermissionLevel,
    availableRoles,
    appliedRoleId,
  } = usePermissions();
  const { userInfo, fetchUserInfo } = useUserStore();
  const refreshNotifications = useNotificationsStore((state) => state.refreshNotifications);
  const { getDomainName, getDomainIdByName } = useDomains();

  const [product, setProduct] = useState<DataProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOwners, setSidebarOwners] = useState<Array<{ user_name?: string | null; user_email: string; role_name?: string | null }>>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  const [iriDialogOpen, setIriDialogOpen] = useState(false);
  const [links, setLinks] = useState<EntitySemanticLink[]>([]);
  const [isCommentSidebarOpen, setIsCommentSidebarOpen] = useState(false);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [isVersioningDialogOpen, setIsVersioningDialogOpen] = useState(false);
  const [versioningAnalysis, setVersioningAnalysis] = useState<any>(null);
  const [versioningUserCanOverride, setVersioningUserCanOverride] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<any>(null);

  // Dialog states for nested entities
  const [isInputPortDialogOpen, setIsInputPortDialogOpen] = useState(false);
  const [isOutputPortDialogOpen, setIsOutputPortDialogOpen] = useState(false);
  const [isManagementPortDialogOpen, setIsManagementPortDialogOpen] = useState(false);
  const [isTeamMemberDialogOpen, setIsTeamMemberDialogOpen] = useState(false);
  const [isSupportChannelDialogOpen, setIsSupportChannelDialogOpen] = useState(false);
  const [isImportExportDialogOpen, setIsImportExportDialogOpen] = useState(false);

  // Editing state for nested entities
  const [editingInputPortIndex, setEditingInputPortIndex] = useState<number | null>(null);
  const [editingOutputPortIndex, setEditingOutputPortIndex] = useState<number | null>(null);
  const [editingManagementPortIndex, setEditingManagementPortIndex] = useState<number | null>(null);
  const [editingTeamMemberIndex, setEditingTeamMemberIndex] = useState<number | null>(null);
  const [editingSupportChannelIndex, setEditingSupportChannelIndex] = useState<number | null>(null);

  // Contract linking states
  const [isLinkContractDialogOpen, setIsLinkContractDialogOpen] = useState(false);
  const [isLineageEditorOpen, setIsLineageEditorOpen] = useState(false);
  const [selectedPortForLinking, setSelectedPortForLinking] = useState<number | null>(null);

  // Subscription state
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionResponse | null>(null);
  const [subscribers, setSubscribers] = useState<SubscribersListResponse | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionWizardOpen, setSubscriptionWizardOpen] = useState(false);
  const [subscriptionWorkflowId, setSubscriptionWorkflowId] = useState<string | null>(null);

  // Quality summary for sidebar
  const [qualitySummary, setQualitySummary] = useState<QualitySummary | null>(null);

  // Lifecycle direct actions
  const [certificationLevels, setCertificationLevels] = useState<CertificationLevel[]>([]);
  const [certifyDialogOpen, setCertifyDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [selectedCertifyLevel, setSelectedCertifyLevel] = useState<number | null>(null);
  const [selectedPublishScope, setSelectedPublishScope] = useState<PublicationScope>('organization');
  const [lifecycleActionSubmitting, setLifecycleActionSubmitting] = useState(false);

  // Clone/Commit draft states
  const [isCommitDraftDialogOpen, setIsCommitDraftDialogOpen] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  // Permissions
  const featureId = 'data-products';
  const canRead = !permissionsLoading && hasPermission(featureId, Settings.FeatureAccessLevel.READ_ONLY);
  const canWrite = !permissionsLoading && hasPermission(featureId, Settings.FeatureAccessLevel.READ_WRITE);
  const canAdmin = !permissionsLoading && hasPermission(featureId, Settings.FeatureAccessLevel.ADMIN);

  const canApproveProductLifecycle = userHasApprovalPrivilege(
    ApprovalEntity.PRODUCTS,
    userInfo?.groups,
    availableRoles,
    appliedRoleId
  );

  // Versioned editing: determine if product can be edited in place based on status
  // Products with status 'draft', 'sandbox', 'proposed' can be edited directly
  // Products with status 'active' and above must be cloned for editing
  const canEditInPlace = isStatusEditableInPlace(product?.status);
  const isPersonalDraft = isPersonalDraftProduct(product);
  const isReadOnly = isProductReadOnly({ canAdmin, canEditInPlace, isPersonalDraft });

  // Combined permission check: admin can always edit; others need write + editable status
  const canModify = canUserModifyProduct({ canAdmin, canWrite, canEditInPlace, isPersonalDraft });

  // View mode state for filtering sections - initialize from localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => parseStoredViewMode(localStorage.getItem(VIEW_MODE_STORAGE_KEY)) ?? 'minimal',
  );

  const getDefaultViewMode = useCallback((): ViewMode => {
    return computeDefaultViewMode({
      ownerTeamId: product?.owner_team_id,
      userGroups: userInfo?.groups,
      permissionLevel: getPermissionLevel('data-products'),
    });
  }, [product?.owner_team_id, userInfo?.groups, getPermissionLevel]);

  useEffect(() => {
    if (!userInfo) {
      fetchUserInfo();
    }
  }, [userInfo, fetchUserInfo]);

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (!stored) {
      setViewMode(getDefaultViewMode());
    }
  }, [getDefaultViewMode]);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    get<CertificationLevel[]>('/api/certification-levels').then(({ data }) => {
      if (Array.isArray(data)) setCertificationLevels(data);
    });
  }, [get]);

  useCopilotContext(
    'Data Product Details',
    `/data-products/${productId}`,
    product ? { type: 'data_product', name: product.name || 'Unnamed', id: productId || '' } : null,
  );

  const formatDate = (dateString: string | undefined, fallback: string = 'N/A'): string =>
    formatDateString(dateString, fallback);

  const getStatusColor = getStatusBadgeVariant;

  const fetchProductDetails = async () => {
    if (!productId) {
      setError(t('data-products:navigation.missingId'));
      setDynamicTitle(null);
      setLoading(false);
      return;
    }
    if (!canRead && !permissionsLoading) {
      setError(t('data-products:permissions.noView'));
      setDynamicTitle(t('data-products:permissions.denied'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setStaticSegments([{ label: t('data-products:title'), path: listPath }]);
    setDynamicTitle(null);

    try {
      const [productResp, linksResp, qualityResp] = await Promise.all([
        get<DataProduct>(`/api/data-products/${productId}`),
        get<EntitySemanticLink[]>(`/api/semantic-links/entity/data_product/${productId}`),
        get<QualitySummary>(`/api/data-products/${productId}/quality-summary`).catch(() => ({ data: null, error: null })),
      ]);

      const productData = checkApiResponse(productResp, 'Product Details');
      setProduct(productData);
      setLinks(Array.isArray(linksResp.data) ? linksResp.data : []);
      setQualitySummary(qualityResp.data ?? null);

      // Fetch subscription status for current user
      try {
        const subscriptionResp = await get<SubscriptionResponse>(`/api/data-products/${productId}/subscription`);
        if (subscriptionResp.data) {
          setSubscriptionStatus(subscriptionResp.data);
        }
      } catch (subErr) {
        console.warn('Failed to fetch subscription status:', subErr);
      }

      // Fetch subscribers (for owners/admins)
      if (canWrite || canAdmin) {
        try {
          const subscribersResp = await get<SubscribersListResponse>(`/api/data-products/${productId}/subscribers`);
          if (subscribersResp.data) {
            setSubscribers(subscribersResp.data);
          }
        } catch (subErr) {
          console.warn('Failed to fetch subscribers:', subErr);
        }
      }

      // ODPS v1.0.0: name is at root level
      setDynamicTitle(productData.name || t('data-products:details.unnamedProduct'));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(errorMessage);
      setProduct(null);
      setDynamicTitle(t('common:toast.error'));
      toast({ title: t('common:toast.error'), description: t('data-products:details.toasts.loadError', { error: errorMessage }), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDirectCertify = async () => {
    if (!productId || selectedCertifyLevel == null) return;
    setLifecycleActionSubmitting(true);
    try {
      const response = await post<unknown>(`/api/data-products/${productId}/certify`, {
        certification_level: selectedCertifyLevel,
      });
      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : 'Certify failed');
      }
      toast({ title: t('data-products:details.toasts.certifyTitle'), description: t('data-products:details.toasts.certifySuccess') });
      setCertifyDialogOpen(false);
      await fetchProductDetails();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to certify';
      toast({ title: t('common:toast.error'), description: msg, variant: 'destructive' });
    } finally {
      setLifecycleActionSubmitting(false);
    }
  };

  const handleDirectPublish = async () => {
    if (!productId) return;
    setLifecycleActionSubmitting(true);
    try {
      const response = await post<unknown>(`/api/data-products/${productId}/set-publication-scope`, {
        scope: selectedPublishScope,
      });
      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : 'Publish scope update failed');
      }
      toast({ title: t('data-products:details.toasts.publishTitle'), description: t('data-products:details.toasts.publishSuccess') });
      setPublishDialogOpen(false);
      await fetchProductDetails();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to set publication scope';
      toast({ title: t('common:toast.error'), description: msg, variant: 'destructive' });
    } finally {
      setLifecycleActionSubmitting(false);
    }
  };

  useEffect(() => {
    fetchProductDetails();
    return () => {
      setStaticSegments([]);
      setDynamicTitle(null);
    };
  }, [productId, canRead, permissionsLoading]);

  useEffect(() => {
    if (!productId) return;
    (async () => {
      try {
        const res = await get<Array<{ user_name?: string | null; user_email: string; role_name?: string | null; is_active: boolean }>>(
          `/api/business-owners/by-object/data_product/${productId}?active_only=true`
        );
        if (!res.error && Array.isArray(res.data)) {
          setSidebarOwners(res.data.filter((o) => o.is_active));
        }
      } catch { /* sidebar contacts are best-effort */ }
    })();
  }, [productId, get]);

  const handleEdit = () => {
    if (!canWrite) {
      toast({ title: t('data-products:permissions.denied'), description: t('data-products:permissions.noEdit'), variant: 'destructive' });
      return;
    }
    setIsEditDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!canAdmin || !productId || !product) return;
    if (!confirm(t('data-products:details.confirms.deleteProduct', { name: product.name }))) return;

    try {
      await deleteOrThrow(deleteApi, `/api/data-products/${productId}`);
      toast({ title: t('common:toast.success'), description: t('data-products:details.deleteSuccess') });
      navigate(listPath);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete product';
      toast({ title: t('common:toast.error'), description: t('data-products:details.toasts.deleteError', { error: errorMessage }), variant: 'destructive' });
    }
  };

  // Clone for editing (creates personal draft)
  const handleCloneForEditing = async () => {
    if (!canWrite || !productId) return;
    setIsCloning(true);
    try {
      const response = await post<DataProduct>(`/api/data-products/${productId}/clone-for-editing`, {});
      if (response.error) {
        throw new Error(response.error);
      }
      if (response.data) {
        toast({ title: t('data-products:details.toasts.draftCreatedTitle'), description: t('data-products:details.toasts.draftCreatedMessage') });
        // Navigate to the new draft
        navigate(`${listPath}/${response.data.id}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create draft';
      toast({ title: t('common:toast.error'), description: errorMessage, variant: 'destructive' });
    } finally {
      setIsCloning(false);
    }
  };

  // Discard personal draft
  const handleDiscardDraft = async () => {
    if (!canWrite || !productId || !product) return;
    if (!confirm(t('data-products:details.confirms.discardDraft'))) return;
    setIsDiscarding(true);
    try {
      await deleteOrThrow(deleteApi, `/api/data-products/${productId}/discard`);
      toast({ title: t('data-products:details.toasts.draftDiscardedTitle'), description: t('data-products:details.toasts.draftDiscardedMessage') });
      // Navigate back to products list or parent product
      if (product.parentProductId) {
        navigate(`${listPath}/${product.parentProductId}`);
      } else {
        navigate(listPath);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to discard draft';
      toast({ title: t('common:toast.error'), description: errorMessage, variant: 'destructive' });
    } finally {
      setIsDiscarding(false);
    }
  };

  // Subscription: open approval wizard (or fallback to direct subscribe)
  const handleSubscribeClick = async () => {
    if (!productId) return;
    const workflowId = await lookupWorkflowId('for_subscribe');
    if (workflowId) {
      setSubscriptionWorkflowId(workflowId);
      setSubscriptionWizardOpen(true);
    } else {
      toast({
        title: t('data-products:details.toasts.approvalNotConfiguredTitle'),
        description: t('data-products:details.toasts.approvalNotConfiguredMessage'),
        variant: 'default',
      });
      await handleSubscribeDirect();
    }
  };

  const handleSubscribeDirect = async () => {
    if (!productId) return;
    setSubscriptionLoading(true);
    try {
      const response = await post<SubscriptionResponse>(`/api/data-products/${productId}/subscribe`, {});
      if (response.error) {
        toast({
          title: t('common:toast.error'),
          description: subscribeResponseErrorText(response, t, 'Failed to subscribe'),
          variant: 'destructive',
        });
        return;
      }
      if (response.data) {
        setSubscriptionStatus(response.data);
        toast({ title: t('data-products:details.toasts.subscribedTitle'), description: t('data-products:details.toasts.subscribedMessage') });
        if (canWrite || canAdmin) {
          const subscribersResp = await get<SubscribersListResponse>(`/api/data-products/${productId}/subscribers`);
          if (subscribersResp.data) setSubscribers(subscribersResp.data);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to subscribe';
      toast({ title: t('common:toast.error'), description: errorMessage, variant: 'destructive' });
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleSubscriptionWizardComplete = async () => {
    setSubscriptionWizardOpen(false);
    setSubscriptionWorkflowId(null);
    toast({ title: t('data-products:details.toasts.subscribedTitle'), description: t('data-products:details.toasts.subscribedMessage') });
    if (!productId) return;
    try {
      const subscriptionResp = await get<SubscriptionResponse>(`/api/data-products/${productId}/subscription`);
      if (subscriptionResp.data) setSubscriptionStatus(subscriptionResp.data);
      if (canWrite || canAdmin) {
        const subscribersResp = await get<SubscribersListResponse>(`/api/data-products/${productId}/subscribers`);
        if (subscribersResp.data) setSubscribers(subscribersResp.data);
      }
    } catch (err) {
      setSubscriptionStatus({ subscribed: true });
    }
  };

  const handleUnsubscribe = async () => {
    if (!productId) return;
    setSubscriptionLoading(true);
    try {
      const response = await deleteApi<SubscriptionResponse>(`/api/data-products/${productId}/subscribe`);
      if (!response.error) {
        // Handle both cases: server returns SubscriptionResponse or 204 No Content
        const subscriptionData: SubscriptionResponse = response.data && 'subscribed' in response.data 
          ? response.data 
          : { subscribed: false };
        setSubscriptionStatus(subscriptionData);
        toast({ title: t('data-products:details.toasts.unsubscribedTitle'), description: t('data-products:details.toasts.unsubscribedMessage') });
        // Refresh subscribers count
        if (canWrite || canAdmin) {
          const subscribersResp = await get<SubscribersListResponse>(`/api/data-products/${productId}/subscribers`);
          if (subscribersResp.data) {
            setSubscribers(subscribersResp.data);
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to unsubscribe';
      toast({ title: t('common:toast.error'), description: errorMessage, variant: 'destructive' });
    } finally {
      setSubscriptionLoading(false);
    }
  };

  // Check if product is subscribable (active or certified)
  const isSubscribable = product?.status && product.status.toLowerCase() === 'active';

  // Helper function to update product with 409 handling
  const updateProduct = async (updatedProduct: DataProduct, forceUpdate: boolean = false) => {
    if (!productId) return;
    
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (forceUpdate) {
      headers['X-Force-Update'] = 'true';
    }
    
    const res = await fetch(`/api/data-products/${productId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updatedProduct),
    });
    
    // Handle 409 Conflict - versioning required
    if (res.status === 409) {
      const conflictData = await res.json();
      const detail = conflictData.detail;
      
      if (detail && typeof detail === 'object' && detail.requires_versioning) {
        // Store the pending update and show versioning dialog
        setPendingUpdate(updatedProduct);
        setVersioningAnalysis(detail.change_analysis);
        setVersioningUserCanOverride(detail.user_can_override);
        setIsVersioningDialogOpen(true);
        return; // Don't throw, let the dialog handle it
      }
    }
    
    if (!res.ok) throw new Error(`Update failed (${res.status})`);
    await fetchProductDetails();
  };

  // Handlers for versioning dialog
  const handleVersioningUpdateInPlace = async () => {
    if (!pendingUpdate) return;
    try {
      await updateProduct(pendingUpdate, true); // Force update
      setIsVersioningDialogOpen(false);
      setPendingUpdate(null);
      setVersioningAnalysis(null);
      toast({ title: t('data-products:details.toasts.updatedTitle'), description: t('data-products:details.toasts.updatedMessage') });
    } catch (e: any) {
      toast({ title: t('common:toast.error'), description: e?.message || 'Failed to update', variant: 'destructive' });
    }
  };

  const handleVersioningCreateNewVersion = async () => {
    if (!productId) return;
    setIsVersioningDialogOpen(false);
    // Open the version creation dialog instead
    setIsVersionDialogOpen(true);
    // The pending update will be discarded - user needs to apply it to the new version
    toast({
      title: t('data-products:details.toasts.createNewVersionTitle'),
      description: t('data-products:details.toasts.createNewVersionMessage'),
    });
  };

  // Nested entity handlers
  const handleAddInputPort = async (port: InputPort) => {
    if (!productId || !product) return;
    try {
      const updatedPorts = [...(product.inputPorts || []), port];
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, inputPorts: updatedPorts }),
      });
      if (!res.ok) throw new Error(`Failed to add consumable (${res.status})`);
      await fetchProductDetails();
    } catch (e: any) {
      throw new Error(e?.message || 'Failed to add consumable');
    }
  };

  const handleUpdateInputPort = async (port: InputPort) => {
    if (!productId || !product || editingInputPortIndex === null) return;
    try {
      const updatedPorts = [...(product.inputPorts || [])];
      updatedPorts[editingInputPortIndex] = port;
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, inputPorts: updatedPorts }),
      });
      if (!res.ok) throw new Error(`Failed to update consumable (${res.status})`);
      await fetchProductDetails();
      setEditingInputPortIndex(null);
      toast({ title: t('data-products:details.toasts.consumableUpdatedTitle'), description: t('data-products:details.toasts.consumableUpdatedMessage') });
    } catch (e: any) {
      toast({ title: t('common:toast.error'), description: e?.message || 'Failed to update consumable', variant: 'destructive' });
      throw e;
    }
  };

  const handleDeleteInputPort = async (index: number) => {
    if (!productId || !product) return;
    if (!confirm(t('data-products:details.confirms.deleteConsumable'))) return;
    try {
      const updatedPorts = (product.inputPorts || []).filter((_, i) => i !== index);
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, inputPorts: updatedPorts }),
      });
      if (!res.ok) throw new Error(`Failed to delete consumable (${res.status})`);
      await fetchProductDetails();
      toast({ title: t('data-products:details.toasts.consumableDeletedTitle'), description: t('data-products:details.toasts.consumableDeletedMessage') });
    } catch (e: any) {
      toast({ title: t('common:toast.error'), description: e?.message || 'Failed to delete consumable', variant: 'destructive' });
    }
  };

  const handleAddOutputPort = async (port: OutputPort) => {
    if (!productId || !product) return;
    try {
      const updatedPorts = [...(product.outputPorts || []), port];
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, outputPorts: updatedPorts }),
      });
      if (!res.ok) throw new Error(`Failed to add deliverable (${res.status})`);
      await fetchProductDetails();
    } catch (e: any) {
      throw new Error(e?.message || 'Failed to add deliverable');
    }
  };

  const handleUpdateOutputPort = async (port: OutputPort) => {
    if (!productId || !product || editingOutputPortIndex === null) return;
    try {
      const updatedPorts = [...(product.outputPorts || [])];
      updatedPorts[editingOutputPortIndex] = port;
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, outputPorts: updatedPorts }),
      });
      if (!res.ok) throw new Error(`Failed to update deliverable (${res.status})`);
      await fetchProductDetails();
      setEditingOutputPortIndex(null);
      toast({ title: t('data-products:details.toasts.deliverableUpdatedTitle'), description: t('data-products:details.toasts.deliverableUpdatedMessage') });
    } catch (e: any) {
      toast({ title: t('common:toast.error'), description: e?.message || 'Failed to update deliverable', variant: 'destructive' });
      throw e;
    }
  };

  const handleDeleteOutputPort = async (index: number) => {
    if (!productId || !product) return;
    if (!confirm(t('data-products:details.confirms.deleteDeliverable'))) return;
    try {
      const updatedPorts = (product.outputPorts || []).filter((_, i) => i !== index);
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, outputPorts: updatedPorts }),
      });
      if (!res.ok) throw new Error(`Failed to delete deliverable (${res.status})`);
      await fetchProductDetails();
      toast({ title: t('data-products:details.toasts.deliverableDeletedTitle'), description: t('data-products:details.toasts.deliverableDeletedMessage') });
    } catch (e: any) {
      toast({ title: t('common:toast.error'), description: e?.message || 'Failed to delete deliverable', variant: 'destructive' });
    }
  };

  const handleAddManagementPort = async (port: ManagementPort) => {
    if (!productId || !product) return;
    try {
      const updatedPorts = [...(product.managementPorts || []), port];
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, managementPorts: updatedPorts }),
      });
      if (!res.ok) throw new Error(`Failed to add management port (${res.status})`);
      await fetchProductDetails();
    } catch (e: any) {
      throw new Error(e?.message || 'Failed to add management port');
    }
  };

  const handleUpdateManagementPort = async (port: ManagementPort) => {
    if (!productId || !product || editingManagementPortIndex === null) return;
    try {
      const updatedPorts = [...(product.managementPorts || [])];
      updatedPorts[editingManagementPortIndex] = port;
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, managementPorts: updatedPorts }),
      });
      if (!res.ok) throw new Error(`Failed to update management port (${res.status})`);
      await fetchProductDetails();
      setEditingManagementPortIndex(null);
      toast({ title: t('data-products:details.toasts.managementPortUpdatedTitle'), description: t('data-products:details.toasts.managementPortUpdatedMessage') });
    } catch (e: any) {
      toast({ title: t('common:toast.error'), description: e?.message || 'Failed to update management port', variant: 'destructive' });
      throw e;
    }
  };

  const handleDeleteManagementPort = async (index: number) => {
    if (!productId || !product) return;
    if (!confirm(t('data-products:details.confirms.deleteManagementPort'))) return;
    try {
      const updatedPorts = (product.managementPorts || []).filter((_, i) => i !== index);
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, managementPorts: updatedPorts }),
      });
      if (!res.ok) throw new Error(`Failed to delete management port (${res.status})`);
      await fetchProductDetails();
      toast({ title: t('data-products:details.toasts.managementPortDeletedTitle'), description: t('data-products:details.toasts.managementPortDeletedMessage') });
    } catch (e: any) {
      toast({ title: t('common:toast.error'), description: e?.message || 'Failed to delete management port', variant: 'destructive' });
    }
  };

  const handleAddTeamMember = async (member: TeamMember) => {
    if (!productId || !product) return;
    try {
      const updatedMembers = [...(product.team?.members || []), member];
      const updatedTeam = { ...product.team, members: updatedMembers };
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, team: updatedTeam }),
      });
      if (!res.ok) throw new Error(`Failed to add team member (${res.status})`);
      await fetchProductDetails();
      toast({
        title: t('data-products:details.toasts.teamMemberAddedTitle'),
        description: t('data-products:details.toasts.teamMemberAddedMessage'),
      });
    } catch (e: any) {
      toast({
        title: t('common:toast.error'),
        description: e?.message || 'Failed to add team member',
        variant: 'destructive',
      });
      throw new Error(e?.message || 'Failed to add team member');
    }
  };

  const handleUpdateTeamMember = async (member: TeamMember) => {
    if (!productId || !product || editingTeamMemberIndex === null) return;
    try {
      const updatedMembers = [...(product.team?.members || [])];
      updatedMembers[editingTeamMemberIndex] = member;
      const updatedTeam = { ...product.team, members: updatedMembers };
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, team: updatedTeam }),
      });
      if (!res.ok) throw new Error(`Failed to update team member (${res.status})`);
      await fetchProductDetails();
      setEditingTeamMemberIndex(null);
      toast({
        title: t('data-products:details.toasts.teamMemberUpdatedTitle'),
        description: t('data-products:details.toasts.teamMemberUpdatedMessage'),
      });
    } catch (e: any) {
      toast({
        title: t('common:toast.error'),
        description: e?.message || 'Failed to update team member',
        variant: 'destructive',
      });
      throw new Error(e?.message || 'Failed to update team member');
    }
  };

  const handleAddSupportChannel = async (channel: Support) => {
    if (!productId || !product) return;
    try {
      const updatedChannels = [...(product.support || []), channel];
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, support: updatedChannels }),
      });
      if (!res.ok) throw new Error(`Failed to add support channel (${res.status})`);
      await fetchProductDetails();
    } catch (e: any) {
      throw new Error(e?.message || 'Failed to add support channel');
    }
  };

  const handleUpdateSupportChannel = async (channel: Support) => {
    if (!productId || !product || editingSupportChannelIndex === null) return;
    try {
      const updatedChannels = [...(product.support || [])];
      updatedChannels[editingSupportChannelIndex] = channel;
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, support: updatedChannels }),
      });
      if (!res.ok) throw new Error(`Failed to update support channel (${res.status})`);
      await fetchProductDetails();
      setEditingSupportChannelIndex(null);
      toast({ title: t('data-products:details.toasts.supportChannelUpdatedTitle'), description: t('data-products:details.toasts.supportChannelUpdatedMessage') });
    } catch (e: any) {
      toast({ title: t('common:toast.error'), description: e?.message || 'Failed to update support channel', variant: 'destructive' });
      throw e;
    }
  };

  const handleDeleteSupportChannel = async (index: number) => {
    if (!productId || !product) return;
    if (!confirm(t('data-products:details.confirms.deleteSupportChannel'))) return;
    try {
      const updatedChannels = (product.support || []).filter((_, i) => i !== index);
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...product, support: updatedChannels }),
      });
      if (!res.ok) throw new Error(`Failed to delete support channel (${res.status})`);
      await fetchProductDetails();
      toast({ title: t('data-products:details.toasts.supportChannelDeletedTitle'), description: t('data-products:details.toasts.supportChannelDeletedMessage') });
    } catch (e: any) {
      toast({ title: t('common:toast.error'), description: e?.message || 'Failed to delete support channel', variant: 'destructive' });
    }
  };

  const handleLinkContract = (portIndex: number) => {
    setSelectedPortForLinking(portIndex);
    setIsLinkContractDialogOpen(true);
  };

  const handleUnlinkContract = async (portIndex: number) => {
    if (!productId || !product) return;
    if (!confirm(t('data-products:details.confirms.unlinkContract'))) return;
    
    try {
      const updatedPorts = [...(product.outputPorts || [])];
      updatedPorts[portIndex] = { ...updatedPorts[portIndex], contractId: undefined };
      
      // Normalize tags to FQN strings or tag_id objects for backend compatibility
      const normalizedTags = product.tags?.map((tag: any) => 
        typeof tag === 'string' ? tag : (tag.fully_qualified_name || { tag_id: tag.tag_id, assigned_value: tag.assigned_value })
      );
      
      const res = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...product, 
          tags: normalizedTags,
          outputPorts: updatedPorts 
        }),
      });
      
      if (!res.ok) throw new Error(`Failed to unlink contract (${res.status})`);
      
      await fetchProductDetails();
      toast({
        title: t('data-products:details.toasts.contractUnlinkedTitle'),
        description: t('data-products:details.toasts.contractUnlinkedMessage'),
      });
    } catch (e: any) {
      toast({
        title: t('common:toast.error'),
        description: e?.message || 'Failed to unlink contract',
        variant: 'destructive',
      });
    }
  };

  const addIri = async (iri: string) => {
    if (!productId) return;
    try {
      const res = await post<EntitySemanticLink>(`/api/semantic-links/`, {
        entity_id: productId,
        entity_type: 'data_product',
        iri,
      });
      if (res.error) throw new Error(res.error);
      await fetchProductDetails();
      setIriDialogOpen(false);
      toast({ title: t('data-products:details.toasts.iriLinkedTitle'), description: t('data-products:details.toasts.iriLinkedMessage') });
    } catch (e: any) {
      toast({ title: t('common:toast.error'), description: e.message || 'Failed to link IRI', variant: 'destructive' });
    }
  };

  const removeLink = async (linkId: string) => {
    try {
      const res = await fetch(`/api/semantic-links/${linkId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove link');
      await fetchProductDetails();
      toast({ title: t('data-products:details.toasts.iriRemovedTitle'), description: t('data-products:details.toasts.iriRemovedMessage') });
    } catch (e: any) {
      toast({ title: t('common:toast.error'), description: e.message || 'Failed to remove link', variant: 'destructive' });
    }
  };

  const handleCreateGenieSpace = async () => {
    if (!canWrite || !productId || !product) return;
    if (!confirm(t('data-products:details.confirms.createGenieSpace', { name: product.name }))) return;

    toast({ title: t('data-products:genie.initiating'), description: t('data-products:details.toasts.genieSpaceRequesting') });

    try {
      const response = await post('/api/data-products/genie-space', { product_ids: [productId] });
      if (response.error) throw new Error(response.error);
      toast({ title: t('data-products:genie.requestSubmitted'), description: t('data-products:details.toasts.genieSpaceInitiated') });
      refreshNotifications();
    } catch (err: any) {
      toast({ title: t('common:toast.error'), description: err.message || t('data-products:genie.creationError'), variant: 'destructive' });
    }
  };

  const handleCreateNewVersion = () => {
    if (!canWrite || !productId || !product) return;
    setIsVersionDialogOpen(true);
  };

  const submitNewVersion = async (newVersionString: string) => {
    if (!productId) return;
    toast({ title: t('data-products:details.toasts.creatingVersionTitle'), description: t('data-products:details.toasts.creatingVersionMessage', { version: newVersionString }) });

    try {
      const response = await post<DataProduct>(`/api/data-products/${productId}/versions`, { new_version: newVersionString.trim() });
      const newProduct = response.data;
      if (!newProduct || !newProduct.id) throw new Error('Invalid response when creating version.');

      toast({ title: t('common:toast.success'), description: t('data-products:details.toasts.versionCreatedMessage', { version: newVersionString }) });
      navigate(`${listPath}/${newProduct.id}`);
    } catch (err: any) {
      toast({ title: t('common:toast.error'), description: err.message || 'Failed to create version.', variant: 'destructive' });
    }
  };

  const shouldShowSection = (section: string): boolean =>
    shouldShowSectionForViewMode(viewMode, section);

  const backButton = (
    <Button variant="outline" onClick={() => navigate(listPath)} size="sm">
      <ArrowLeft />
      {t('data-products:details.backToList')}
    </Button>
  );

  if (loading || permissionsLoading) {
    return (
      <div className={classes.state}>
        <DetailViewSkeleton cards={4} actionButtons={6} />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className={classes.state}>
        <div className={classes.stateBack}>{backButton}</div>
        <Alert
          color={error ? 'red' : 'gray'}
          variant="light"
          icon={<AlertCircle size={16} />}
          title={error ? t('common:toast.error') : undefined}
        >
          {error || t('data-products:details.notFound')}
        </Alert>
      </div>
    );
  }

  const domainLabel = resolveDomainLabel({
    domain: product.domain,
    resolveName: getDomainName,
    notAssignedLabel: t('common:states.notAssigned'),
  });

  const none = <span className={common.muted}>—</span>;
  const domainId = product.domain ? getDomainIdByName(domainLabel) : undefined;
  const qualityTone = qualitySummary
    ? qualitySummary.overall_score_percent >= 80 ? 'good' : qualitySummary.overall_score_percent >= 50 ? 'warning' : 'critical'
    : undefined;

  const detailRows: DetailsRow[] = [
    {
      label: t('data-products:details.coreMetadata.version'),
      value: product.version ? <Badge variant="outline">{product.version}</Badge> : none,
    },
    {
      label: t('data-products:details.coreMetadata.domain'),
      value: product.domain && domainId ? (
        <span className={classes.link} onClick={() => navigate(`/settings/data-domains/${domainId}`)}>
          {domainLabel}
        </span>
      ) : product.domain ? <span className={common.muted}>{domainLabel}</span> : none,
    },
    {
      label: t('data-products:details.coreMetadata.project'),
      value: (product as any).project_id && product.project_name ? (
        // No route shows one project, so the name is text, with the id in its title
        <span title={`Project ID: ${(product as any).project_id}`}>{product.project_name}</span>
      ) : none,
    },
    {
      label: t('data-products:details.coreMetadata.tenant'),
      value: product.tenant ? <span className={common.muted}>{product.tenant}</span> : none,
    },
    {
      label: t('data-products:details.coreMetadata.ownerTeam'),
      value: product.owner_team_id && product.owner_team_name ? (
        // No route shows one team, so the name is text, with the id in its title
        <span title={`Team ID: ${product.owner_team_id}`}>{product.owner_team_name}</span>
      ) : none,
    },
    {
      label: t('data-products:details.coreMetadata.apiVersion'),
      value: product.apiVersion ? <Badge variant="outline">{product.apiVersion}</Badge> : none,
    },
    {
      label: t('data-products:details.coreMetadata.created'),
      value: product.created_at ? <span className={common.muted}>{formatDate(product.created_at)}</span> : none,
    },
    {
      label: t('data-products:details.coreMetadata.updated'),
      value: product.updated_at ? <span className={common.muted}>{formatDate(product.updated_at)}</span> : none,
    },
    {
      label: t('data-products:details.coreMetadata.certification'),
      value: (product.certification_level || product.inherited_certification_level) ? (
        <CertificationBadge
          certificationLevel={product.certification_level}
          inheritedCertificationLevel={product.inherited_certification_level}
          certifiedAt={product.certified_at}
          certifiedBy={product.certified_by}
          levels={certificationLevels}
          size="sm"
        />
      ) : none,
    },
    {
      label: t('data-products:details.coreMetadata.publishedLabel'),
      value: product.publication_scope && product.publication_scope !== 'none' ? (
        <PublicationScopeBadge
          scope={product.publication_scope as PublicationScope}
          publishedAt={product.published_at}
          publishedBy={product.published_by}
          size="sm"
        />
      ) : none,
    },
    {
      label: t('data-products:details.coreMetadata.tags'),
      value: (product.tags || []).length > 0 ? (
        <span className={classes.chips}>
          {(product.tags || []).map((tag, index) => (
            <TagChip key={index} tag={tag} size="sm" />
          ))}
        </span>
      ) : <span className={common.muted}>{t('data-products:details.coreMetadata.noTags')}</span>,
    },
    {
      label: t('data-products:details.coreMetadata.linkedConcepts'),
      value: (
        <LinkedConceptChips
          links={links}
          onRemove={canModify ? removeLink : undefined}
          trailing={canModify ? <Button size="sm" variant="outline" onClick={() => setIriDialogOpen(true)}>{t('common:actions.add')}</Button> : undefined}
        />
      ),
    },
  ];

  // Contacts: the assigned owners, else the imported ODPS owners, else the owner team
  const ownerContacts = product.team?.members?.filter(
    (m) => m.role && ['owner', 'data owner', 'data steward', 'steward'].includes(m.role.toLowerCase())
  );
  const contactSource = sidebarOwners.length > 0
    ? 'owners'
    : (ownerContacts && ownerContacts.length > 0)
      ? 'imported'
      : product.owner_team_name
        ? 'team_only'
        : 'none';
  const initialsOf = (text: string, split: RegExp = /[\s.@]+/) =>
    text.split(split).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  const contact = (key: string | number, initials: string, name: string, role: string) => (
    <div key={key} className={classes.contact}>
      <span className={classes.initials} aria-hidden>{initials}</span>
      <div className={classes.contactText}>
        <span className={classes.contactName} title={name}>{name}</span>
        <span className={common.muted}>{role}</span>
      </div>
    </div>
  );

  /** A row's icon-only edit and delete buttons, named for their action. */
  const rowActions = (onEdit: () => void, onDelete: () => void, editTitle?: string, deleteTitle?: string) => (
    <div className={classes.itemActions}>
      <Button
        size="icon"
        variant="ghost"
        className={common.iconButton}
        onClick={onEdit}
        title={editTitle}
        aria-label={editTitle ? undefined : t('common:actions.edit')}
      >
        <Pencil />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className={`${common.iconButton} ${common.danger}`}
        onClick={onDelete}
        title={deleteTitle}
        aria-label={deleteTitle ? undefined : t('common:actions.delete')}
      >
        <Trash2 />
      </Button>
    </div>
  );

  return (
    <>
      <PageLayout
        header={
          <>
            <PageHeader
              title={product.name || t('data-products:details.unnamedProduct')}
              badges={
                <>
                  <Badge variant={getStatusColor(product.status)}>{product.status || '—'}</Badge>
                  {qualitySummary && qualitySummary.items_count > 0 && (
                    <span className={classes.metric}>
                      <span className={classes.metricLabel}>{t('data-products:details.coreMetadata.quality')}</span>
                      <span className={classes.score} data-tone={qualityTone}>
                        {Math.round(qualitySummary.overall_score_percent)}%
                      </span>
                    </span>
                  )}
                  {productId && <MaturityInline entityType="DataProduct" entityId={productId} compact />}
                </>
              }
              wrapActions
              actions={
                <>
                  {backButton}
                  <Button variant="outline" onClick={() => setIsRequestDialogOpen(true)} size="sm">
                    <KeyRound /> {t('data-products:details.actions.requestAccess')}
                  </Button>
                  {isProductActive(product.status) && canApproveProductLifecycle && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const first = certificationLevels[0]?.level_order ?? null;
                        setSelectedCertifyLevel(first);
                        setCertifyDialogOpen(true);
                      }}
                    >
                      <ShieldCheck /> {t('data-products:details.actions.certify')}
                    </Button>
                  )}
                  {isProductActive(product.status) && canWrite && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const cur = (product.publication_scope || 'none') as PublicationScope;
                        setSelectedPublishScope(cur === 'none' ? 'organization' : cur);
                        setPublishDialogOpen(true);
                      }}
                    >
                      <Globe /> {t('data-products:details.publish')}
                    </Button>
                  )}
                  <CommentSidebar
                    entityType="data_product"
                    entityId={productId!}
                    isOpen={isCommentSidebarOpen}
                    onToggle={() => setIsCommentSidebarOpen(!isCommentSidebarOpen)}
                  />
                  <Button variant="outline" onClick={handleCreateGenieSpace} disabled={!canModify} size="sm">
                    <Sparkles /> {t('data-products:details.actions.createGenieSpace')}
                  </Button>
                  {/* Clone for Editing - shown when product is read-only */}
                  {isReadOnly && canWrite && (
                    <Button variant="outline" onClick={handleCloneForEditing} disabled={isCloning} size="sm">
                      {isCloning ? <Loader2 className={common.spin} /> : <CopyPlus />}
                      {t('data-products:details.actions.cloneForEditing')}
                    </Button>
                  )}
                  {/* Commit Draft - shown when this is a personal draft */}
                  {isPersonalDraft && canWrite && (
                    <Button variant="default" onClick={() => setIsCommitDraftDialogOpen(true)} size="sm">
                      <FileText /> {t('data-products:details.actions.commitChanges')}
                    </Button>
                  )}
                  {/* Discard Draft - shown when this is a personal draft */}
                  {isPersonalDraft && canWrite && (
                    <Button variant="outline" onClick={handleDiscardDraft} disabled={isDiscarding} size="sm">
                      {isDiscarding ? <Loader2 className={common.spin} /> : <Trash2 />}
                      {t('data-products:details.actions.discardDraft')}
                    </Button>
                  )}
                  {/* New Version - only for editable products */}
                  {!isReadOnly && (
                    <Button variant="outline" onClick={handleCreateNewVersion} disabled={!canModify} size="sm">
                      <CopyPlus /> {t('data-products:details.actions.newVersion')}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setIsImportExportDialogOpen(true)} size="sm">
                    <Download /> {t('data-products:details.actions.exportODPS')}
                  </Button>
                  {/* Subscribe/Unsubscribe Button */}
                  {isSubscribable && (
                    subscriptionStatus?.subscribed ? (
                      <Button variant="outline" onClick={handleUnsubscribe} disabled={subscriptionLoading} size="sm">
                        {subscriptionLoading ? <Loader2 className={common.spin} /> : <BellOff />}
                        {t('data-products:details.unsubscribe')}
                      </Button>
                    ) : (
                      <Button variant="default" onClick={handleSubscribeClick} disabled={subscriptionLoading} size="sm">
                        {subscriptionLoading ? <Loader2 className={common.spin} /> : <Bell />}
                        {t('data-products:details.subscribe')}
                      </Button>
                    )
                  )}
                  {/* Edit - only enabled for editable products */}
                  {canModify && (
                    <Button variant="outline" onClick={handleEdit} size="sm">
                      <Pencil /> {t('data-products:details.edit')}
                    </Button>
                  )}
                  <Button variant="outline" className={common.danger} onClick={handleDelete} disabled={!canAdmin} size="sm">
                    <Trash2 /> {t('data-products:details.delete')}
                  </Button>
                </>
              }
            />
            <p className={classes.description}>
              {product.description?.purpose || t('data-products:details.noDescription')}
            </p>
          </>
        }
      >
        <div className={classes.body}>
          {/* Personal Draft Banner */}
          {isPersonalDraft && (
            <Alert color="blue" variant="light" icon={<AlertCircle size={16} />} className={classes.banner}>
              <strong>{t('data-products:details.banners.personalDraftTitle')}</strong> - {t('data-products:details.banners.personalDraftMessage')}
            </Alert>
          )}

          {/* Read-Only Banner */}
          {isReadOnly && (
            <Alert color="yellow" variant="light" icon={<AlertCircle size={16} />} className={classes.banner}>
              <strong>{t('data-products:details.banners.readOnlyTitle')}</strong> - {t('data-products:details.banners.readOnlyMessage', { status: product?.status?.toLowerCase() })}
            </Alert>
          )}

          {/* The view controls, above the stack (which holds only panes) */}
          <div className={classes.toolbar}>
            {/* Version Navigation — unified across contracts and products (PRD #442). */}
            <VersionNavigator
              entityKind="product"
              currentEntityId={productId!}
              currentVersion={product?.version}
              onVersionChange={(id) => navigate(`${listPath}/${id}`)}
            />
            {/* View Mode Toggle */}
            <div className={classes.sizes}>
              {VIEW_MODE_BUTTONS.map(({ mode, label, tooltip }) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={viewMode === mode ? 'default' : 'outline'}
                  className={classes.size}
                  aria-pressed={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  title={t(tooltip)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <PaneStack>
            <Pane title={t('common:labels.details')}>
              <DetailsGrid rows={detailRows} />
            </Pane>

            <Pane title={t('data-products:details.contacts.title')}>
              {contactSource === 'imported' && (
                <p className={classes.lead}><span className={classes.italic}>{t('data-products:details.contacts.fromImportedData')}</span></p>
              )}
              {contactSource === 'team_only' && (
                <p className={classes.lead}><span className={classes.italic}>{t('data-products:details.contacts.teamAssignmentOnly')}</span></p>
              )}
              {contactSource === 'owners' && sidebarOwners.map((owner, idx) =>
                contact(
                  idx,
                  initialsOf(owner.user_name || owner.user_email || '?'),
                  owner.user_name || owner.user_email,
                  owner.role_name || t('data-products:details.contacts.defaultRole'),
                ))}
              {contactSource === 'imported' && ownerContacts!.map((member, idx) =>
                contact(idx, initialsOf(member.name || member.username || '?'), member.name || member.username || '', member.role || ''))}
              {contactSource === 'team_only' &&
                contact('team', initialsOf(product.owner_team_name!, /\s+/), product.owner_team_name!, t('data-products:details.contacts.teamRole'))}
              {contactSource === 'none' && (
                <p className={classes.empty}>{t('data-products:details.contacts.noContactsAssigned')}</p>
              )}
            </Pane>

            {/* Deliverables (Output Ports) – primary composition surface */}
            <Pane
              title={t('data-products:details.deliverables.titleWithCount', { count: product.outputPorts?.length || 0 })}
              actions={canModify && (
                <Button size="sm" onClick={() => setIsOutputPortDialogOpen(true)}>
                  <Plus />{t('data-products:details.deliverables.addDeliverable')}
                </Button>
              )}
            >
              <p className={classes.lead}>{t('data-products:details.deliverables.subtitle')}</p>
              {product.outputPorts && product.outputPorts.length > 0 ? (
                <div className={classes.list}>
                  {product.outputPorts.map((port, idx) => (
                    <div key={port.id || idx} className={classes.item}>
                      <div className={classes.itemMain}>
                        <div className={classes.itemLine}>
                          <span className={classes.itemName}>{port.name}</span>
                          <Badge variant="outline">v{port.version}</Badge>
                          {port.deliveryMethodName && <Badge variant="secondary">{port.deliveryMethodName}</Badge>}
                          {port.status && <Badge variant="outline">{port.status}</Badge>}
                          {port.containsPii && <Badge variant="destructive">PII</Badge>}
                        </div>
                        {port.description && <span className={common.muted}>{port.description}</span>}
                        {port.contractId ? (
                          <div className={classes.itemLine}>
                            {/* Only render as a navigable link when the backend resolved
                                the id to a contract (contractName is set); otherwise the
                                id is dangling and the link would 404 (#854 review). */}
                            {port.contractName ? (
                              <Badge
                                variant="secondary"
                                className={classes.clickable}
                                onClick={() => navigate(`/data-contracts/${port.contractId}`)}
                              >
                                Contract: {port.contractName}
                              </Badge>
                            ) : (
                              <Badge variant="outline" title={t('data-products:details.contractDangling', 'Contract no longer exists')}>
                                Contract: {port.contractId}
                              </Badge>
                            )}
                            {canModify && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className={common.iconButton}
                                onClick={() => handleUnlinkContract(idx)}
                                title={t('common:tooltips.unlinkContract')}
                              >
                                <Unlink />
                              </Button>
                            )}
                          </div>
                        ) : canModify && (
                          <Button size="sm" variant="ghost" className={classes.inlineAction} onClick={() => handleLinkContract(idx)}>
                            <Link2 />
                            {t('common:tooltips.linkContract')}
                          </Button>
                        )}

                        {/* Per-port linked assets */}
                        {port.id && <PortLinkedAssets portId={port.id} portName={port.name} canEdit={canModify} />}
                      </div>
                      {canModify && rowActions(
                        () => {
                          setEditingOutputPortIndex(idx);
                          setIsOutputPortDialogOpen(true);
                        },
                        () => handleDeleteOutputPort(idx),
                        t('data-products:details.deliverables.editTitle'),
                        t('data-products:details.deliverables.deleteTitle'),
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className={classes.empty}>
                  {canModify
                    ? t('data-products:details.deliverables.noDeliverablesWithEdit')
                    : t('data-products:details.deliverables.noDeliverables')}
                </p>
              )}
            </Pane>

            {/* ODPS Structured Description */}
            {product.description && (
              <Pane
                title={t('data-products:details.sections.description')}
                actions={canModify && (
                  <Button
                    size="icon"
                    variant="outline"
                    className={common.iconButton}
                    onClick={handleEdit}
                    aria-label={t('data-products:details.editDescription')}
                    title={t('data-products:details.editDescription')}
                  >
                    <Pencil />
                  </Button>
                )}
              >
                <DetailsGrid
                  rows={rowsOf([
                    product.description.purpose && {
                      label: t('data-products:details.description.purposeLabel'),
                      value: <span className={classes.prose}>{product.description.purpose}</span>,
                    },
                    product.description.limitations && {
                      label: t('data-products:details.description.limitationsLabel'),
                      value: <span className={classes.prose}>{product.description.limitations}</span>,
                    },
                    product.description.usage && {
                      label: t('data-products:details.description.usageLabel'),
                      value: <span className={classes.prose}>{product.description.usage}</span>,
                    },
                  ])}
                />
              </Pane>
            )}

            {/* Business Lineage Graph */}
            {shouldShowSection('lineage') && productId && (
              <Pane
                flush
                title={t('data-products:details.lineage.businessLineageTitle')}
                actions={canModify && (
                  <Button size="sm" variant="outline" onClick={() => setIsLineageEditorOpen(true)}>
                    <GitBranch /> {t('data-products:details.actions.manageLineage')}
                  </Button>
                )}
              >
                <BusinessLineageView entityType="DataProduct" entityId={productId} className={classes.graph} bare />
              </Pane>
            )}

            {/* Consumables (Input Ports) */}
            {shouldShowSection('consumables') && (
              <Pane
                title={t('data-products:details.consumables.titleWithCount', { count: product.inputPorts?.length || 0 })}
                actions={canModify && (
                  <Button size="sm" onClick={() => setIsInputPortDialogOpen(true)}>
                    <Plus />{t('data-products:details.consumables.addConsumable')}
                  </Button>
                )}
              >
                {product.inputPorts && product.inputPorts.length > 0 ? (
                  <div className={classes.list}>
                    {product.inputPorts.map((port, idx) => (
                      <div key={idx} className={classes.item}>
                        <div className={classes.itemMain}>
                          <span className={classes.itemName}>{port.name} (v{port.version})</span>
                          {/* #854: resolve input-port contractId to a navigable name (mirrors output ports).
                              Dangling id → no link (would 404), per #864 review. */}
                          {port.contractId ? (
                            port.contractName ? (
                              <span className={classes.itemLine}>
                                <Badge
                                  variant="secondary"
                                  className={classes.clickable}
                                  onClick={() => navigate(`/data-contracts/${port.contractId}`)}
                                >
                                  {t('data-products:details.consumables.contractLabel', { contractId: port.contractName })}
                                </Badge>
                              </span>
                            ) : (
                              <span className={classes.itemLine}>
                                <Badge variant="outline" title={t('data-products:details.contractDangling', 'Contract no longer exists')}>
                                  {t('data-products:details.consumables.contractLabel', { contractId: port.contractId })}
                                </Badge>
                              </span>
                            )
                          ) : (
                            <span className={common.muted}>{t('data-products:details.consumables.contractLabel', { contractId: port.contractId })}</span>
                          )}
                        </div>
                        {canModify && rowActions(
                          () => {
                            setEditingInputPortIndex(idx);
                            setIsInputPortDialogOpen(true);
                          },
                          () => handleDeleteInputPort(idx),
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={classes.empty}>{t('data-products:details.consumables.noConsumables')}</p>
                )}
              </Pane>
            )}

            {/* Management Ports Section (NEW in ODPS v1.0.0) */}
            {shouldShowSection('management-ports') && (
              <Pane
                title={t('data-products:details.managementPorts.titleWithCount', { count: product.managementPorts?.length || 0 })}
                actions={canModify && (
                  <Button size="sm" onClick={() => setIsManagementPortDialogOpen(true)}>
                    <Plus />{t('data-products:details.managementPorts.addManagementPort')}
                  </Button>
                )}
              >
                <p className={classes.lead}>{t('data-products:details.managementPorts.subtitle')}</p>
                {product.managementPorts && product.managementPorts.length > 0 ? (
                  <div className={classes.list}>
                    {product.managementPorts.map((port, idx) => (
                      <div key={idx} className={classes.item}>
                        <div className={classes.itemMain}>
                          <span className={classes.itemName}>{port.name}</span>
                          <span>{t('data-products:details.managementPorts.contentLabel')}: {port.content}</span>
                          {port.url && <span className={common.muted}>{t('data-products:details.managementPorts.urlLabel')}: {port.url}</span>}
                        </div>
                        {canModify && rowActions(
                          () => {
                            setEditingManagementPortIndex(idx);
                            setIsManagementPortDialogOpen(true);
                          },
                          () => handleDeleteManagementPort(idx),
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={classes.empty}>{t('data-products:details.managementPorts.noManagementPorts')}</p>
                )}
              </Pane>
            )}

            {/* ODPS Team Metadata (read-only provenance) */}
            {shouldShowSection('team') && product.team?.members && product.team.members.length > 0 && (
              <Pane title={t('data-products:details.teamMetadata.titleWithCount', { count: product.team.members.length })}>
                <p className={classes.lead}>{t('data-products:details.teamMetadata.subtitle')}</p>
                <div className={classes.list}>
                  {product.team.members.map((member, idx) => (
                    <div key={idx} className={classes.item}>
                      <Badge variant="outline">{member.role || t('data-products:details.teamMetadata.defaultRole')}</Badge>
                      <span className={classes.itemMain}>{member.name || member.username}</span>
                    </div>
                  ))}
                </div>
              </Pane>
            )}

            {/* Support Channels */}
            {shouldShowSection('support-channels') && (
              <Pane
                title={t('data-products:details.supportChannels.titleWithCount', { count: product.support?.length || 0 })}
                actions={canModify && (
                  <Button size="sm" onClick={() => setIsSupportChannelDialogOpen(true)}>
                    <Plus />{t('data-products:details.supportChannels.addChannel')}
                  </Button>
                )}
              >
                {product.support && product.support.length > 0 ? (
                  <div className={classes.list}>
                    {product.support.map((channel, idx) => (
                      <div key={idx} className={classes.item}>
                        <div className={classes.itemMain}>
                          <span className={classes.itemName}>{channel.channel}</span>
                          <span>
                            {t('data-products:details.managementPorts.urlLabel')}:{' '}
                            <a href={channel.url} target="_blank" rel="noopener noreferrer" className={classes.link}>{channel.url}</a>
                          </span>
                          {channel.tool && <span className={common.muted}>{t('data-products:details.supportChannels.toolLabel')}: {channel.tool}</span>}
                        </div>
                        {canModify && rowActions(
                          () => {
                            setEditingSupportChannelIndex(idx);
                            setIsSupportChannelDialogOpen(true);
                          },
                          () => handleDeleteSupportChannel(idx),
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={classes.empty}>{t('data-products:details.supportChannels.noChannels')}</p>
                )}
              </Pane>
            )}

            {/* Authoritative Definitions (read-only provenance from imported product YAML).
                Large-view only, mirroring the contract detail view. */}
            {shouldShowSection('authoritative-definitions') && product.authoritativeDefinitions && product.authoritativeDefinitions.length > 0 && (
              <Pane title={`Authoritative Definitions (${product.authoritativeDefinitions.length})`}>
                <p className={classes.lead}>ODPS authoritative sources for this product</p>
                <div className={classes.list}>
                  {product.authoritativeDefinitions.map((def, idx) => (
                    <div key={idx} className={classes.item}>
                      <div className={classes.itemMain}>
                        <span className={classes.itemLine}><Badge variant="outline">{def.type}</Badge></span>
                        <a href={def.url} target="_blank" rel="noopener noreferrer" className={classes.link}>{def.url}</a>
                        {def.description && <span className={common.muted}>{def.description}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </Pane>
            )}

            {/* Custom Properties (read-only provenance from imported product YAML).
                Large-view only, mirroring the contract detail view. The ODPS API
                returns customProperties as an array of {property, value}; null values
                may arrive as the literal string "null" from the importer, so treat
                both null and "null" as empty. */}
            {shouldShowSection('custom-properties') && product.customProperties && product.customProperties.length > 0 && (
              <Pane title={`Custom Properties (${product.customProperties.length})`}>
                <p className={classes.lead}>Additional metadata from the imported product profile</p>
                <DetailsGrid
                  rows={product.customProperties.map((prop) => {
                    const v = prop.value;
                    const isEmpty = v === null || v === undefined || v === '' || v === 'null';
                    const display = isEmpty ? null : (typeof v === 'object' ? JSON.stringify(v) : String(v));
                    return {
                      label: prop.property,
                      value: isEmpty
                        ? <span className={classes.italic}>null</span>
                        : <span className={classes.mono}>{display}</span>,
                    };
                  })}
                />
              </Pane>
            )}

            {/* Subscribers Section (only visible to owners/admins) */}
            {shouldShowSection('subscribers') && (canWrite || canAdmin) && subscribers && (
              <Pane title={t('data-products:details.subscribers.titleWithCount', { count: subscribers.subscriber_count })}>
                <p className={classes.lead}>{t('data-products:details.subscribers.notificationSubtitle')}</p>
                {Array.isArray(subscribers.subscribers) && subscribers.subscribers.length > 0 ? (
                  <div className={classes.list}>
                    {subscribers.subscribers.map((subscriber, idx) => (
                      <div key={idx} className={classes.item}>
                        <div className={classes.itemMain}>
                          <span className={classes.itemName}>{subscriber.email}</span>
                          {subscriber.reason && <span className={common.muted}>{subscriber.reason}</span>}
                        </div>
                        <span className={common.muted}>{formatDate(subscriber.subscribed_at)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={classes.empty}>{t('data-products:details.subscribers.noSubscribers')}</p>
                )}
              </Pane>
            )}

            {/* Access Grants Panel */}
            {shouldShowSection('access-grants') && productId && (
              <AccessGrantsPanel
                entityType="data_product"
                entityId={productId}
                canManage={canModify}
                showPendingRequests={canModify}
              />
            )}

            {/* Ownership Panel (with imported ODPS contacts) */}
            {shouldShowSection('ownership') && (
              <Pane aria-label={t('business-owners:panel.title')}>
                <OwnershipPanel
                  flush
                  objectType="data_product"
                  objectId={productId!}
                  canAssign={canModify}
                  importedContacts={product.team?.members?.map((m) => ({
                    username: m.username,
                    name: m.name,
                    role: m.role,
                    description: m.description,
                  }))}
                  importedContactsLabel={t('data-products:details.contacts.importedContactsLabel')}
                  ownerTeamId={product.owner_team_id}
                  ownerTeamName={product.owner_team_name}
                />
              </Pane>
            )}

            {/* Entity Relationships Panel (tree-based with drill-down) */}
            {shouldShowSection('entity-relationships') && (
              <EntityTreePanel
                entityType="DataProduct"
                entityId={productId!}
                title={t('data-products:details.relatedEntities.title')}
                canEdit={canModify}
                pane
              />
            )}

            {/* Metadata Panel */}
            {shouldShowSection('metadata-panel') && (
              <Pane aria-label={t('metadata:title')}>
                <EntityMetadataPanel entityId={productId!} entityType="data_product" flush />
              </Pane>
            )}

            {/* Ratings Panel */}
            {shouldShowSection('ratings') && (
              <Pane aria-label={t('data-products:details.ratings.title')}>
                <RatingPanel
                  entityType="data_product"
                  entityId={productId!}
                  title={t('data-products:details.ratings.title')}
                  showDistribution
                  allowSubmit={canRead}
                  flush
                />
              </Pane>
            )}

            {/* Costs Panel */}
            {shouldShowSection('costs') && (
              <EntityCostsPanel entityId={productId!} entityType="data_product" pane />
            )}

            {/* Quality Panel */}
            {shouldShowSection('quality') && (
              <Pane aria-label={t('metadata:quality.title')}>
                <EntityQualityPanel entityId={productId!} entityType="data_product" productAggregation flush />
              </Pane>
            )}
          </PaneStack>
        </div>
      </PageLayout>
      {/* Lineage Editor */}
      {productId && product && (
        <LineageEditor
          isOpen={isLineageEditorOpen}
          onOpenChange={setIsLineageEditorOpen}
          entityType="DataProduct"
          entityId={productId}
          entityName={product.name || productId}
          onSuccess={() => fetchProductDetails()}
        />
      )}

      {/* Dialogs */}
      <DataProductCreateDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={() => {
          setIsEditDialogOpen(false);
          fetchProductDetails();
        }}
        product={product || undefined}
        mode="edit"
      />

      <CreateVersionDialog
        isOpen={isVersionDialogOpen}
        onOpenChange={setIsVersionDialogOpen}
        onSubmit={submitNewVersion}
        currentVersion={product.version || '1.0.0'}
        productTitle={product.info?.title || product.id || ''}
      />

      <ConceptSelectDialog
        isOpen={iriDialogOpen}
        onOpenChange={setIriDialogOpen}
        onSelect={addIri}
        mappingSource={
          product?.id
            ? {
                entity_type: 'data_product',
                entity_id: product.id,
                ...(product.info?.title ? { name: product.info.title } : {}),
              }
            : undefined
        }
      />

      <RequestProductActionDialog
        isOpen={isRequestDialogOpen}
        onOpenChange={setIsRequestDialogOpen}
        productId={productId!}
        productName={product.name}
        productStatus={product.status}
        onSuccess={() => fetchProductDetails()}
        canDirectStatusChange={canWrite || canAdmin}
      />

      {/* Commit Draft Dialog */}
      <CommitDraftDialog
        isOpen={isCommitDraftDialogOpen}
        onOpenChange={setIsCommitDraftDialogOpen}
        productId={productId!}
        productName={product.name}
        onSuccess={() => fetchProductDetails()}
      />

      {/* Subscription approval wizard */}
      {subscriptionWizardOpen && productId && subscriptionWorkflowId && (
        <ApprovalWizardDialog
          isOpen={subscriptionWizardOpen}
          onOpenChange={setSubscriptionWizardOpen}
          entityType="data_product"
          entityId={productId}
          preselectedWorkflowId={subscriptionWorkflowId}
          completionAction="subscribe"
          autoStartWithPreselected
          onComplete={handleSubscriptionWizardComplete}
        />
      )}

      {/* Nested Entity Form Dialogs */}
      <InputPortFormDialog
        isOpen={isInputPortDialogOpen}
        onOpenChange={(open) => {
          setIsInputPortDialogOpen(open);
          if (!open) setEditingInputPortIndex(null);
        }}
        onSubmit={editingInputPortIndex !== null ? handleUpdateInputPort : handleAddInputPort}
        initial={editingInputPortIndex !== null ? product?.inputPorts?.[editingInputPortIndex] : undefined}
      />

      <OutputPortFormDialog
        isOpen={isOutputPortDialogOpen}
        onOpenChange={(open) => {
          setIsOutputPortDialogOpen(open);
          if (!open) setEditingOutputPortIndex(null);
        }}
        onSubmit={editingOutputPortIndex !== null ? handleUpdateOutputPort : handleAddOutputPort}
        product={product || undefined}
        initial={editingOutputPortIndex !== null ? product?.outputPorts?.[editingOutputPortIndex] : undefined}
      />

      <ManagementPortFormDialog
        isOpen={isManagementPortDialogOpen}
        onOpenChange={(open) => {
          setIsManagementPortDialogOpen(open);
          if (!open) setEditingManagementPortIndex(null);
        }}
        onSubmit={editingManagementPortIndex !== null ? handleUpdateManagementPort : handleAddManagementPort}
        initial={editingManagementPortIndex !== null ? product?.managementPorts?.[editingManagementPortIndex] : undefined}
      />

      <TeamMemberFormDialog
        isOpen={isTeamMemberDialogOpen}
        onOpenChange={(open) => {
          setIsTeamMemberDialogOpen(open);
          if (!open) setEditingTeamMemberIndex(null);
        }}
        onSubmit={editingTeamMemberIndex !== null ? handleUpdateTeamMember : handleAddTeamMember}
        initial={editingTeamMemberIndex !== null ? product?.team?.members?.[editingTeamMemberIndex] : undefined}
      />

      <SupportChannelFormDialog
        isOpen={isSupportChannelDialogOpen}
        onOpenChange={(open) => {
          setIsSupportChannelDialogOpen(open);
          if (!open) setEditingSupportChannelIndex(null);
        }}
        onSubmit={editingSupportChannelIndex !== null ? handleUpdateSupportChannel : handleAddSupportChannel}
        initial={editingSupportChannelIndex !== null ? product?.support?.[editingSupportChannelIndex] : undefined}
      />

      {/* ODPS v1.0.0 Import/Export */}
      <ImportExportDialog
        isOpen={isImportExportDialogOpen}
        onOpenChange={setIsImportExportDialogOpen}
        currentProduct={product}
      />


      {/* Link Contract to Port Dialog */}
      <LinkContractToPortDialog
        isOpen={isLinkContractDialogOpen}
        onOpenChange={setIsLinkContractDialogOpen}
        productId={productId!}
        portIndex={selectedPortForLinking!}
        currentPort={selectedPortForLinking !== null ? product?.outputPorts?.[selectedPortForLinking] : undefined}
        onSuccess={() => {
          fetchProductDetails();
          setIsLinkContractDialogOpen(false);
          setSelectedPortForLinking(null);
        }}
      />

      {/* Versioning Recommendation Dialog */}
      <VersioningRecommendationDialog
        isOpen={isVersioningDialogOpen}
        onOpenChange={setIsVersioningDialogOpen}
        analysis={versioningAnalysis}
        userCanOverride={versioningUserCanOverride}
        onUpdateInPlace={handleVersioningUpdateInPlace}
        onCreateNewVersion={handleVersioningCreateNewVersion}
      />

      <DirectCertifyDialog
        open={certifyDialogOpen}
        onOpenChange={setCertifyDialogOpen}
        certificationLevels={certificationLevels}
        selectedLevelOrder={selectedCertifyLevel}
        onSelectedLevelOrderChange={setSelectedCertifyLevel}
        isSubmitting={lifecycleActionSubmitting}
        onConfirm={handleDirectCertify}
      />
      <DirectPublishDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        selectedScope={selectedPublishScope}
        onSelectedScopeChange={setSelectedPublishScope}
        isSubmitting={lifecycleActionSubmitting}
        onConfirm={handleDirectPublish}
      />
    </>
  );
}

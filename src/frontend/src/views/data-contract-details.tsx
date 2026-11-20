import { useEffect, useState, useCallback, useMemo, useId } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from '@/components/ui/button'
import { AlertCircle, Download, Pencil, Trash2, Loader2, ArrowLeft, KeyRound, CopyPlus, Plus, Shapes, Columns2, Database, Sparkles, Package, ShieldCheck, Globe, Link2, type LucideIcon } from 'lucide-react'
import { DetailViewSkeleton, SkeletonBlock } from '@/components/common/list-view-skeleton'
import { Badge } from '@/components/ui/badge'
import { Alert as MantineAlert, Popover, Select } from '@mantine/core'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { useToast } from '@/hooks/use-toast'
import EntityMetadataPanel from '@/components/metadata/entity-metadata-panel'
import EntityQualityPanel from '@/components/quality/entity-quality-panel'
import { OwnershipPanel } from '@/components/common/ownership-panel'
import { EntityTreePanel } from '@/components/common/entity-tree-panel'
import { MaturityInline } from '@/components/common/maturity-inline'
import { useHoverFocusCard } from '@/components/common/use-hover-focus-card'
import { CommentSidebar } from '@/components/comments'
import { HeaderActions, type HeaderAction } from '@/components/common/header-actions'
import { DetailLevelToggle } from '@/components/common/detail-level-toggle'
import ConceptSelectDialog from '@/components/semantic/concept-select-dialog'
import LinkedConceptChips from '@/components/semantic/linked-concept-chips'
import TagChip from '@/components/ui/tag-chip'
import { useDomains } from '@/hooks/use-domains'
import { usePermissions } from '@/stores/permissions-store'
import { useUserStore } from '@/stores/user-store'
import { FeatureAccessLevel } from '@/types/settings'
import type { EntitySemanticLink } from '@/types/semantic-link'
import type { DataContract, SchemaObject, QualityRule, TeamMember, ServerConfig, SLARequirements } from '@/types/data-contract'
import { usePageBreadcrumb } from '@/stores/breadcrumb-store'
import { useJobCapabilitiesStore } from '@/stores/job-capabilities-store'
import RequestContractActionDialog from '@/components/data-contracts/request-contract-action-dialog'
import CreateVersionDialog from '@/components/data-products/create-version-dialog'
import DataContractBasicFormDialog from '@/components/data-contracts/data-contract-basic-form-dialog'
import SchemaFormDialog from '@/components/data-contracts/schema-form-dialog'
import QualityRuleFormDialog from '@/components/data-contracts/quality-rule-form-dialog'
import TeamMemberFormDialog from '@/components/data-contracts/team-member-form-dialog'
import ServerConfigFormDialog from '@/components/data-contracts/server-config-form-dialog'
import SLAFormDialog from '@/components/data-contracts/sla-form-dialog'
import InferFromCatalogDialog from '@/components/data-contracts/infer-from-catalog-dialog'
import type { CatalogSchemaResult } from '@/components/data-contracts/infer-from-catalog-dialog'
import InferFromAssetDialog from '@/components/data-contracts/infer-from-asset-dialog'
import type { InferredSchemaObject } from '@/components/data-contracts/infer-from-asset-dialog'
import CreateFromContractDialog from '@/components/data-products/create-from-contract-dialog'
import DqxSchemaSelectDialog from '@/components/data-contracts/dqx-schema-select-dialog'
import DqxSuggestionsDialog from '@/components/data-contracts/dqx-suggestions-dialog'
import AuthoritativeDefinitionFormDialog from '@/components/data-contracts/authoritative-definition-form-dialog'
import LinkProductToContractDialog from '@/components/data-contracts/link-product-to-contract-dialog'
import VersioningRecommendationDialog from '@/components/common/versioning-recommendation-dialog'
import CustomPropertyFormDialog from '@/components/data-contracts/custom-property-form-dialog'
import CommitDraftDialog from '@/components/data-contracts/commit-draft-dialog'
import VersionNavigator from '@/components/common/version-navigator'
import { contractActionErrorText } from '@/lib/contract-action-error'
import type { DataProduct } from '@/types/data-product'
import type { DataProfilingRun } from '@/types/data-contract'
import { useCopilotContext } from '@/hooks/use-copilot-context'
import { useApi } from '@/hooks/use-api'
import { contractDraftErrorText, contractVersionErrorText } from '@/lib/contract-version-error'
import CertificationBadge from '@/components/common/certification-badge'
import PublicationScopeBadge from '@/components/common/publication-scope-badge'
import { DirectCertifyDialog, DirectPublishDialog } from '@/components/common/direct-lifecycle-dialogs'
import type { CertificationLevel, PublicationScope } from '@/types/lifecycle'
import { userHasApprovalPrivilege } from '@/lib/permissions'
import { ApprovalEntity } from '@/types/settings'
import { apiErrorOf, statusChangeErrorText } from '@/lib/status-change-error'
import { DetailsGrid, PageHeader, PageLayout, Pane, PaneStack, Tabs, type DetailsRow } from '@/mantine/page'
import classes from './data-contract-details.module.css'
import common from '@/components/common/detail-page.module.css'

// Status-based editability constants
// Only draft/proposed contracts can be edited in place
const EDITABLE_STATUSES = ['draft', 'proposed']

// View mode for filtering contract details sections
type ViewMode = 'minimal' | 'medium' | 'large'
const VIEW_MODE_STORAGE_KEY = 'data-contract-view-mode'

// Define column structure for schema properties
type SchemaProperty = {
  name: string
  logicalType?: string
  logical_type?: string  // API response uses underscore
  required: boolean
  unique: boolean
  description?: string
  stableId?: string
  relationships?: { id?: string; type: string; to: string | string[]; from?: string | string[]; customProperties?: any[] }[]
}

// A concept's name: its label, unless the label is only an IRI or URN
const conceptLabel = (link: EntitySemanticLink): string =>
  (link.label && !/^https?:\/\//.test(link.label) && !/^urn:/.test(link.label))
    ? link.label
    : (link.iri.split(/[/#]/).pop() || link.iri)

/** A schema's or a column's linked concepts, each opening the catalog in a new tab. */
function ConceptLinks({ links, icon: Icon }: { links: EntitySemanticLink[] | undefined; icon: LucideIcon }) {
  if (!links || links.length === 0) return null
  return (
    <span className={classes.concepts}>
      {links.map((link, idx) => {
        const label = conceptLabel(link)
        return (
          <a
            key={idx}
            className={classes.concept}
            href={`/data-catalog?concept=${encodeURIComponent(label)}`}
            target="_blank"
            rel="noopener noreferrer"
            title={link.iri}
          >
            <Icon aria-hidden />
            {label}
          </a>
        )
      })}
    </span>
  )
}

// Define this as a function to access component state
const createSchemaPropertyColumns = (
  contract: DataContract | null,
  selectedSchemaIndex: number,
  propertyLinks: Record<string, EntitySemanticLink[]>,
  t: TFunction<readonly ["data-contracts", "common"]>,
): ColumnDef<SchemaProperty>[] => [
  {
    accessorKey: 'name',
    header: t('data-contracts:detailsView.columns.name', 'Column Name'),
    cell: ({ row }) => {
      const property = row.original
      const schemaName = contract?.schema?.[selectedSchemaIndex]?.name || ''
      const propertyKey = `${schemaName}#${property.name}`
      const links = propertyLinks[propertyKey] || []

      return (
        <div className={classes.propName}>
          <span className={classes.propLine}>
            <span className={classes.mono}>{property.name}</span>
            {property.stableId && (
              <span className={classes.stableId} title={t('data-contracts:detailsView.stableIdTitle', 'ODCS StableId')}>{property.stableId}</span>
            )}
          </span>
          <ConceptLinks links={links} icon={Columns2} />
        </div>
      )
    },
  },
  {
    accessorKey: 'logicalType',
    header: t('data-contracts:detailsView.columns.dataType', 'Data Type'),
    cell: ({ row }) => {
      const property = row.original
      const logicalType = property.logicalType || (property as any).logical_type
      return <Badge variant="secondary">{logicalType || '-'}</Badge>
    },
  },
  {
    accessorKey: 'required',
    header: t('data-contracts:detailsView.columns.required', 'Required'),
    cell: ({ row }) => (
      <span className={classes.flag}>
        {row.getValue('required') ? '✓' : '✗'}
      </span>
    ),
  },
  {
    accessorKey: 'unique',
    header: t('data-contracts:detailsView.columns.unique', 'Unique'),
    cell: ({ row }) => (
      <span className={classes.flag}>
        {row.getValue('unique') ? '✓' : '✗'}
      </span>
    ),
  },
  {
    id: 'fk',
    header: '',
    size: 32,
    cell: ({ row }) => {
      const rels = row.original.relationships
      if (!rels || rels.length === 0) return null
      return (
        <Popover position="right" withArrow shadow="md" trapFocus returnFocus>
          <Popover.Target>
            <button
              type="button"
              className={classes.fkTrigger}
              aria-label={t('data-contracts:detailsView.columns.fkRelationship', 'Foreign key relationship')}
              title={t('data-contracts:detailsView.columns.fkRelationship', 'Foreign key relationship')}
            >
              <Link2 aria-hidden />
            </button>
          </Popover.Target>
          <Popover.Dropdown className={classes.fkDropdown}>
            <p className={classes.fkTitle}>{t('data-contracts:detailsView.columns.relationships', 'Relationships')}</p>
            {rels.map((rel, i) => (
              <div key={i} className={classes.fkRow}>
                <Badge variant="outline">{rel.type}</Badge>
                <span className={classes.mono}>→ {typeof rel.to === 'string' ? rel.to : JSON.stringify(rel.to)}</span>
              </div>
            ))}
          </Popover.Dropdown>
        </Popover>
      )
    },
  },
  {
    accessorKey: 'description',
    header: t('common:labels.description', 'Description'),
    cell: ({ row }) => (
      <span className={classes.propDescription}>
        {row.getValue('description') || '-'}
      </span>
    ),
  },
]

const formatDate = (dateString: string | undefined, fallback: string = 'N/A'): string => {
  if (!dateString) return fallback;
  try {
    return new Date(dateString).toLocaleString();
  } catch (e) {
    return 'Invalid Date';
  }
};

const getStatusColor = (status: string | undefined): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const lowerStatus = status?.toLowerCase() || '';
  if (lowerStatus === 'active' || lowerStatus === 'approved') return 'default';
  if (lowerStatus === 'draft' || lowerStatus === 'proposed') return 'secondary';
  if (lowerStatus === 'retired' || lowerStatus === 'deprecated' || lowerStatus === 'rejected') return 'outline';
  return 'default';
};

export default function DataContractDetails() {
  const { t } = useTranslation(['data-contracts', 'common'])
  const { contractId } = useParams<{ contractId: string }>()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const listPath = pathname.replace(/\/[^/]+$/, '')
  const productBasePath = '/data-products'
  const { toast } = useToast()
  const { getDomainName } = useDomains()
  const {
    getPermissionLevel,
    hasPermission,
    isLoading: permissionsLoading,
    availableRoles,
    appliedRoleId,
  } = usePermissions()
  const { post, get } = useApi()
  const { userInfo, fetchUserInfo } = useUserStore()

  // Ignored once the page has gone, so a late answer can't name the next page
  const { setStaticSegments, setDynamicTitle } = usePageBreadcrumb()

  const [contract, setContract] = useState<DataContract | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCommentSidebarOpen, setIsCommentSidebarOpen] = useState(false)
  const [iriDialogOpen, setIriDialogOpen] = useState(false)
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false)
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false)
  const [isVersioningDialogOpen, setIsVersioningDialogOpen] = useState(false)
  const [versioningAnalysis, setVersioningAnalysis] = useState<any>(null)
  const [versioningUserCanOverride, setVersioningUserCanOverride] = useState(false)
  const [pendingUpdate, setPendingUpdate] = useState<any>(null)
  const [links, setLinks] = useState<EntitySemanticLink[]>([])
  const [selectedSchemaIndex, setSelectedSchemaIndex] = useState(0)
  const [schemaLinks, setSchemaLinks] = useState<Record<string, EntitySemanticLink[]>>({})
  const [propertyLinks, setPropertyLinks] = useState<Record<string, EntitySemanticLink[]>>({})

  // Lazy-loaded schema properties with pagination
  const [schemaProperties, setSchemaProperties] = useState<Record<string, SchemaProperty[]>>({})
  const [schemaPropTotal, setSchemaPropTotal] = useState<Record<string, number>>({})
  const [schemaPropPage, setSchemaPropPage] = useState<Record<string, number>>({})
  const [loadingSchemaProps, setLoadingSchemaProps] = useState(false)
  const PROPS_PAGE_SIZE = 50

  // All properties for the edit dialog (fetched with limit=0, bypasses pagination)
  const [allSchemaProperties, setAllSchemaProperties] = useState<Record<string, SchemaProperty[]>>({})
  const [loadingEditProperties, setLoadingEditProperties] = useState(false)

  // Linked products state
  const [linkedProducts, setLinkedProducts] = useState<DataProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [isCreateProductDialogOpen, setIsCreateProductDialogOpen] = useState(false)

  // Team import state

  // Team metadata (ODCS v3.1.0)
  const [, setTeamMetadata] = useState<{ name?: string; description?: string }>({})
  const [teamMetaName, setTeamMetaName] = useState('')
  const [teamMetaDesc, setTeamMetaDesc] = useState('')
  // Link product dialog state
  const [isLinkProductDialogOpen, setIsLinkProductDialogOpen] = useState(false)

  // Commit draft dialog state
  const [isCommitDraftDialogOpen, setIsCommitDraftDialogOpen] = useState(false)

  const [certificationLevels, setCertificationLevels] = useState<CertificationLevel[]>([])
  const [certifyDialogOpen, setCertifyDialogOpen] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [selectedCertifyLevel, setSelectedCertifyLevel] = useState<number | null>(null)
  const [selectedPublishScope, setSelectedPublishScope] = useState<PublicationScope>('organization')
  const [lifecycleActionSubmitting, setLifecycleActionSubmitting] = useState(false)

  // Admin permission check — admins can edit/delete regardless of status
  const contractPermissionLevel = getPermissionLevel('data-contracts')
  const isContractAdmin = contractPermissionLevel === FeatureAccessLevel.ADMIN || contractPermissionLevel === FeatureAccessLevel.FULL
  const canWriteContracts =
    !permissionsLoading && hasPermission('data-contracts', FeatureAccessLevel.READ_WRITE)
  // The notes and quality routes check data-domains; concept links check semantic-models
  const canWriteDomains =
    !permissionsLoading && hasPermission('data-domains', FeatureAccessLevel.READ_WRITE)
  const canWriteSemantic =
    !permissionsLoading && hasPermission('semantic-models', FeatureAccessLevel.READ_WRITE)
  // The owner routes check business-owners (R66)
  const canWriteOwners =
    !permissionsLoading && hasPermission('business-owners', FeatureAccessLevel.READ_WRITE)
  // Related Entities' Add and Remove check entity_relationships
  const canWriteRelationships =
    !permissionsLoading && hasPermission('entity_relationships', FeatureAccessLevel.READ_WRITE)
  const canEditPanels = canWriteContracts && canWriteDomains
  // Linking or creating a product writes the product
  const canWriteProducts =
    !permissionsLoading && hasPermission('data-products', FeatureAccessLevel.READ_WRITE)
  const canApproveContractLifecycle = userHasApprovalPrivilege(
    ApprovalEntity.CONTRACTS,
    userInfo?.groups,
    availableRoles,
    appliedRoleId
  )

  // Editability: the status allows editing in place (draft/proposed), and the
  // user may write. Admins bypass the status restriction.
  const isEditableStatus = !!(contract?.status && EDITABLE_STATUSES.includes(contract.status.toLowerCase()))
  const canEditInPlace = isContractAdmin || (canWriteContracts && isEditableStatus)
  // Personal drafts have draft status, so their owner (who has write access) edits them in place
  const isPersonalDraft = contract?.draftOwnerId != null
  // Locked by its status (not by the user's permission): the read-only banner and Clone for Editing
  const isReadOnly = !(isContractAdmin || isEditableStatus)

  // View mode state for filtering sections - initialize from localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (stored && ['minimal', 'medium', 'large'].includes(stored)) {
      return stored as ViewMode
    }
    return 'minimal' // Default, will be updated by getDefaultViewMode effect if needed
  })

  // Authoritative Definitions state (contract-level)
  type AuthoritativeDefinition = { id: string; url: string; type: string }
  const [contractAuthDefs, setContractAuthDefs] = useState<AuthoritativeDefinition[]>([])
  const [editingContractAuthDefIndex, setEditingContractAuthDefIndex] = useState<number | null>(null)

  // Authoritative Definitions state (schema-level) - keyed by schema ID
  const [schemaAuthDefs, setSchemaAuthDefs] = useState<Record<string, AuthoritativeDefinition[]>>({})
  const [editingSchemaAuthDef, setEditingSchemaAuthDef] = useState<{ schemaId: string; index: number } | null>(null)
  const [isSchemaAuthDefFormOpen, setIsSchemaAuthDefFormOpen] = useState(false)
  const [activeSchemaIdForAuthDef, setActiveSchemaIdForAuthDef] = useState<string | null>(null)

  // Authoritative Definitions state (property-level) - keyed by propertyId
  const [propertyAuthDefs, setPropertyAuthDefs] = useState<Record<string, AuthoritativeDefinition[]>>({})
  const [editingPropertyAuthDef, setEditingPropertyAuthDef] = useState<{ schemaId: string; propertyId: string; index: number } | null>(null)
  const [isPropertyAuthDefFormOpen, setIsPropertyAuthDefFormOpen] = useState(false)
  const [_activePropertyForAuthDef, _setActivePropertyForAuthDef] = useState<{ schemaId: string; propertyId: string } | null>(null)

  // Dialog states for CRUD operations
  const [isInferFromCatalogOpen, setIsInferFromCatalogOpen] = useState(false)
  const [isInferFromAssetOpen, setIsInferFromAssetOpen] = useState(false)
  const [isBasicFormOpen, setIsBasicFormOpen] = useState(false)
  const [isSchemaFormOpen, setIsSchemaFormOpen] = useState(false)
  const [isQualityRuleFormOpen, setIsQualityRuleFormOpen] = useState(false)
  const [isTeamMemberFormOpen, setIsTeamMemberFormOpen] = useState(false)
  const [isServerConfigFormOpen, setIsServerConfigFormOpen] = useState(false)
  const [isSLAFormOpen, setIsSLAFormOpen] = useState(false)
  const [isContractAuthDefFormOpen, setIsContractAuthDefFormOpen] = useState(false)
  const [isCustomPropertyFormOpen, setIsCustomPropertyFormOpen] = useState(false)
  const [editingCustomPropertyKey, setEditingCustomPropertyKey] = useState<string | null>(null)

  // Schema inference state
  const [isInferringSchema, setIsInferringSchema] = useState(false)

  // DQX Profiling states
  const [isDqxSchemaSelectOpen, setIsDqxSchemaSelectOpen] = useState(false)
  const [isDqxSuggestionsOpen, setIsDqxSuggestionsOpen] = useState(false)
  const [selectedProfileRunId, setSelectedProfileRunId] = useState<string | null>(null)
  const [latestProfileRun, setLatestProfileRun] = useState<DataProfilingRun | null>(null)
  const [pendingSuggestionsCount, setPendingSuggestionsCount] = useState(0)
  const [isProfilingRunning, setIsProfilingRunning] = useState(false)
  const [isRequestingDqxJob, setIsRequestingDqxJob] = useState(false)

  // The DQX profiling button is backed by a background job an admin has to enable;
  // without it, clicking through only produces an error.
  const fetchJobCapabilities = useJobCapabilitiesStore(state => state.fetchCapabilities)
  const isDqxJobInstalled = useJobCapabilitiesStore(state => state.isWorkflowInstalled('dqx_profile_datasets'))
  const canRequestJobEnablement = useJobCapabilitiesStore(state => state.enablementRequestsAllowed)
  const requestJobEnablement = useJobCapabilitiesStore(state => state.requestEnablement)

  // Editing states
  const [editingSchemaIndex, setEditingSchemaIndex] = useState<number | null>(null)
  const [editingQualityRuleIndex, setEditingQualityRuleIndex] = useState<number | null>(null)
  const [editingTeamMemberIndex, setEditingTeamMemberIndex] = useState<number | null>(null)
  const [editingServerIndex, setEditingServerIndex] = useState<number | null>(null)

  useCopilotContext(
    'Data Contract Details',
    `/data-contracts/${contractId}`,
    contract ? { type: 'data_contract', name: contract.name || 'Unnamed', id: contractId || '' } : null,
  )

  const fetchLinkedProducts = async () => {
    if (!contractId) return
    setLoadingProducts(true)
    try {
      const response = await fetch(`/api/data-products/by-contract/${contractId}`)
      if (response.ok) {
        const data = await response.json()
        setLinkedProducts(Array.isArray(data) ? data : [])
      } else {
        setLinkedProducts([])
      }
    } catch (e) {
      console.warn('Failed to fetch linked products:', e)
      setLinkedProducts([])
    } finally {
      setLoadingProducts(false)
    }
  }


  const fetchContractAuthDefs = async () => {
    if (!contractId) return
    try {
      const response = await fetch(`/api/data-contracts/${contractId}/authoritative-definitions`)
      if (response.ok) {
        const data = await response.json()
        setContractAuthDefs(Array.isArray(data) ? data : [])
      } else {
        setContractAuthDefs([])
      }
    } catch (e) {
      console.warn('Failed to fetch contract authoritative definitions:', e)
      setContractAuthDefs([])
    }
  }

  const fetchSchemaAuthDefs = async (schemaId: string) => {
    if (!contractId) return
    try {
      const response = await fetch(`/api/data-contracts/${contractId}/schemas/${encodeURIComponent(schemaId)}/authoritative-definitions`)
      if (response.ok) {
        const data = await response.json()
        setSchemaAuthDefs(prev => ({ ...prev, [schemaId]: Array.isArray(data) ? data : [] }))
      } else {
        setSchemaAuthDefs(prev => ({ ...prev, [schemaId]: [] }))
      }
    } catch (e) {
      console.warn("Failed to fetch schema authoritative definitions for", schemaId, ":", e)
      setSchemaAuthDefs(prev => ({ ...prev, [schemaId]: [] }))
    }
  }

  const fetchSelectedSchemaAuthDefs = () => {
    if (!contract?.schema || contract.schema.length === 0) return
    const schema = contract.schema[selectedSchemaIndex]
    if (!schema) return
    const schemaId = (schema as any).id || schema.name
    if (schemaId && !schemaAuthDefs[schemaId]) {
      fetchSchemaAuthDefs(schemaId)
    }
  }

  const fetchSchemaSemanticLinks = useCallback(async (schemaName: string) => {
    if (!contractId || !schemaName) return
    try {
      const schemaEntityId = `${contractId}#${schemaName}`
      const schemaLinksRes = await fetch(`/api/semantic-links/entity/data_contract_schema/${encodeURIComponent(schemaEntityId)}`)
      if (schemaLinksRes.ok) {
        const data = await schemaLinksRes.json()
        setSchemaLinks(prev => ({ ...prev, [schemaName]: Array.isArray(data) ? data : [] }))
      }
    } catch (e) {
      console.warn('Failed to fetch schema links for', schemaName, ':', e)
    }
  }, [contractId])

  // Fetch column-level concept assignments for a schema in one call. Links are
  // stored with entity_id "{contractId}#{schema}#{property}"; we key state by
  // "{schema}#{property}" to match the column renderer (see propertyLinks use).
  const fetchPropertySemanticLinks = useCallback(async (schemaName: string) => {
    if (!contractId || !schemaName) return
    try {
      const prefix = `${contractId}#${schemaName}#`
      const res = await fetch(`/api/semantic-links/entity-prefix/data_contract_property/${encodeURIComponent(prefix)}`)
      if (!res.ok) return
      const data = await res.json()
      const byKey: Record<string, EntitySemanticLink[]> = {}
      for (const link of (Array.isArray(data) ? data : [])) {
        // entity_id: "{contractId}#{schema}#{property}" -> key "{schema}#{property}"
        const parts = String(link.entity_id).split('#')
        const propName = parts.slice(2).join('#')
        if (!propName) continue
        const key = `${schemaName}#${propName}`
        ;(byKey[key] = byKey[key] || []).push(link)
      }
      // The prefix response is the authoritative full set for this schema, so
      // replace every "{schemaName}#*" entry rather than merging — otherwise a
      // property whose last assignment was removed would keep showing a stale
      // link until a full reload.
      setPropertyLinks(prev => {
        const next: Record<string, EntitySemanticLink[]> = {}
        for (const [key, value] of Object.entries(prev)) {
          if (!key.startsWith(`${schemaName}#`)) next[key] = value
        }
        return { ...next, ...byKey }
      })
    } catch (e) {
      console.warn('Failed to fetch property links for', schemaName, ':', e)
    }
  }, [contractId])

  const fetchSchemaProperties = useCallback(async (schemaName: string, page: number = 0) => {
    if (!contractId || !schemaName) return
    setLoadingSchemaProps(true)
    try {
      const skip = page * PROPS_PAGE_SIZE
      const res = await fetch(
        `/api/data-contracts/${contractId}/schemas/${encodeURIComponent(schemaName)}/properties?skip=${skip}&limit=${PROPS_PAGE_SIZE}`
      )
      if (res.ok) {
        const data = await res.json()
        const items = data.items ?? []
        setSchemaProperties(prev => ({ ...prev, [schemaName]: items }))
        setSchemaPropTotal(prev => ({ ...prev, [schemaName]: data.total ?? 0 }))
        setSchemaPropPage(prev => ({ ...prev, [schemaName]: page }))
      }
    } catch (e) {
      console.warn('Failed to fetch schema properties for', schemaName, ':', e)
    } finally {
      setLoadingSchemaProps(false)
    }
  }, [contractId, fetchSchemaSemanticLinks])

  const fetchAllSchemaProperties = useCallback(async (schemaName: string): Promise<SchemaProperty[]> => {
    if (!contractId || !schemaName) return []
    setLoadingEditProperties(true)
    try {
      const res = await fetch(
        `/api/data-contracts/${contractId}/schemas/${encodeURIComponent(schemaName)}/properties?skip=0&limit=0`
      )
      if (res.ok) {
        const data = await res.json()
        const items: SchemaProperty[] = data.items ?? []
        setAllSchemaProperties(prev => ({ ...prev, [schemaName]: items }))
        return items
      }
    } catch (e) {
      console.warn('Failed to fetch all schema properties for', schemaName, ':', e)
    } finally {
      setLoadingEditProperties(false)
    }
    return []
  }, [contractId])

  const fetchDetails = async () => {
    if (!contractId) return
    setLoading(true)
    setError(null)
    setDynamicTitle(null)
    try {
      const [contractRes, linksRes] = await Promise.all([
        fetch(`/api/data-contracts/${contractId}`),
        fetch(`/api/semantic-links/entity/data_contract/${contractId}`)
      ])

      if (!contractRes.ok) throw new Error(t('data-contracts:detailsView.errors.loadContractFailed', 'Failed to load contract'))
      const contractData: DataContract = await contractRes.json()
      console.log('[DEBUG] Contract data loaded:', {
        id: contractData.id,
        name: contractData.name,
        owner_team_id: contractData.owner_team_id,
        hasOwnerTeamId: !!contractData.owner_team_id,
        schema: contractData.schema,
        schemaCount: contractData.schema?.length
      })
      setContract(contractData)
      setDynamicTitle(contractData.name)

      // Fetch team metadata (ODCS v3.1.0)
      try {
        const tmRes = await fetch(`/api/data-contracts/${contractId}/team-metadata`)
        if (tmRes.ok) {
          const tm = await tmRes.json()
          setTeamMetadata(tm || {})
          setTeamMetaName(tm?.name || '')
          setTeamMetaDesc(tm?.description || '')
        }
      } catch { /* ignore */ }

      if (linksRes.ok) {
        const linksData = await linksRes.json()
        setLinks(Array.isArray(linksData) ? linksData : [])
      } else {
        setLinks([])
      }

      // Schema and property semantic links are now fetched on-demand
      // when the user selects a schema (see fetchSchemaSemanticLinks)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('data-contracts:detailsView.errors.loadFailed', 'Failed to load'))
      setDynamicTitle(t('common:status.error', 'Error'))
    } finally {
      setLoading(false)
    }
  }

  const handleDirectCertify = async () => {
    if (!contractId || selectedCertifyLevel == null) return
    setLifecycleActionSubmitting(true)
    try {
      const response = await post<unknown>(`/api/data-contracts/${contractId}/certify`, {
        certification_level: selectedCertifyLevel,
      })
      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : t('data-contracts:detailsView.errors.certifyFailed', 'Certify failed'))
      }
      toast({ title: t('data-contracts:detailsView.toast.certifiedTitle', 'Certified'), description: t('data-contracts:detailsView.toast.certifiedDesc', 'Certification level has been applied.') })
      setCertifyDialogOpen(false)
      await fetchDetails()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('data-contracts:detailsView.errors.certifyFailedGeneric', 'Failed to certify')
      toast({ title: t('common:status.error', 'Error'), description: msg, variant: 'destructive' })
    } finally {
      setLifecycleActionSubmitting(false)
    }
  }

  const handleDirectPublish = async () => {
    if (!contractId) return
    setLifecycleActionSubmitting(true)
    try {
      const response = await post<unknown>(`/api/data-contracts/${contractId}/set-publication-scope`, {
        scope: selectedPublishScope,
      })
      if (response.error) {
        throw new Error(typeof response.error === 'string' ? response.error : t('data-contracts:detailsView.errors.publishScopeUpdateFailed', 'Publish scope update failed'))
      }
      toast({ title: t('data-contracts:detailsView.toast.publicationUpdatedTitle', 'Publication updated'), description: t('data-contracts:detailsView.toast.publicationUpdatedDesc', 'Publication scope has been saved.') })
      setPublishDialogOpen(false)
      await fetchDetails()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('data-contracts:detailsView.errors.publishScopeFailed', 'Failed to set publication scope')
      toast({ title: t('common:status.error', 'Error'), description: msg, variant: 'destructive' })
    } finally {
      setLifecycleActionSubmitting(false)
    }
  }

  // DQX Profiling handlers - defined early to be used in initial useEffect
  const fetchProfileRuns = useCallback(async () => {
    if (!contractId) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/profile-runs`)
      if (res.ok) {
        const runs: DataProfilingRun[] = await res.json()
        if (runs.length > 0) {
          const latest = runs[0]
          const wasRunning = isProfilingRunning
          
          setLatestProfileRun(latest)
          setPendingSuggestionsCount(latest.suggestion_counts?.pending || 0)
          
          // Check if profiling is still running. Nothing can advance a run while the
          // DQX job is not installed, so a lingering 'pending'/'running' record is
          // stale (e.g. left behind by an earlier failed start) rather than live work.
          const isRunning =
            (latest.status === 'running' || latest.status === 'pending') && isDqxJobInstalled
          setIsProfilingRunning(isRunning)
          
          // Notify when profiling completes
          if (wasRunning && !isRunning && latest.status === 'completed') {
            const suggestionsCount = latest.suggestion_counts?.pending || 0
            if (suggestionsCount > 0) {
              toast({
                title: t('data-contracts:detailsView.toast.dqxCompleteTitle', 'DQX Profiling Complete'),
                description: t('data-contracts:detailsView.toast.dqxSuggestionsAvailable', '{{count}} quality check suggestions available for review.', { count: suggestionsCount })
              })
            } else {
              toast({
                title: t('data-contracts:detailsView.toast.dqxCompleteTitle', 'DQX Profiling Complete'),
                description: t('data-contracts:detailsView.toast.dqxNoSuggestions', 'Profiling completed but no suggestions were generated.')
              })
            }
          } else if (wasRunning && !isRunning && latest.status === 'failed') {
            toast({
              title: t('data-contracts:detailsView.toast.dqxFailedTitle', 'DQX Profiling Failed'),
              description: latest.error_message || t('data-contracts:detailsView.toast.dqxFailedDesc', 'Profiling failed. Check the job logs for details.'),
              variant: 'destructive'
            })
          }
        } else {
          setIsProfilingRunning(false)
        }
      }
    } catch (e) {
      console.warn('Failed to fetch profile runs:', e)
      setIsProfilingRunning(false)
    }
  }, [contractId, isProfilingRunning, isDqxJobInstalled, toast])

  // Determine default view mode based on user role and ownership
  const getDefaultViewMode = useCallback((): ViewMode => {
    // Check if user is owner or member of owning team
    if (contract?.owner_team_id && userInfo?.groups?.includes(contract.owner_team_id)) {
      return 'large'
    }

    // Check permission level for data-contracts feature
    const permissionLevel = getPermissionLevel('data-contracts')
    if (permissionLevel === FeatureAccessLevel.READ_WRITE ||
        permissionLevel === FeatureAccessLevel.ADMIN ||
        permissionLevel === FeatureAccessLevel.FULL) {
      return 'medium'
    }

    // Default to minimal
    return 'minimal'
  }, [contract?.owner_team_id, userInfo?.groups, getPermissionLevel])

  // Fetch user info on mount if not already loaded
  useEffect(() => {
    if (!userInfo) {
      fetchUserInfo()
    }
  }, [userInfo, fetchUserInfo])

  // Set default view mode only if no stored preference exists
  useEffect(() => {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (!stored) {
      // No stored preference - set based on user's role/permissions
      setViewMode(getDefaultViewMode())
    }
  }, [getDefaultViewMode])

  // Save view mode to localStorage when changed
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    get<CertificationLevel[]>('/api/certification-levels').then(({ data }) => {
      if (Array.isArray(data)) setCertificationLevels(data)
    })
  }, [get])

  useEffect(() => {
    fetchJobCapabilities()
  }, [fetchJobCapabilities])

  useEffect(() => {
    setStaticSegments([{ label: 'Data Contracts', path: listPath }])
    fetchDetails()
    fetchLinkedProducts()
    fetchContractAuthDefs()
    fetchProfileRuns()

    return () => {
      setStaticSegments([])
      setDynamicTitle(null)
    }
  }, [contractId, setStaticSegments, setDynamicTitle, fetchProfileRuns])

  // Fetch authoritative definitions for the currently selected schema only
  useEffect(() => {
    fetchSelectedSchemaAuthDefs()
  }, [contract?.schema, selectedSchemaIndex])

  // Lazy-load properties and schema-level semantic links for the currently selected schema
  useEffect(() => {
    if (!contract?.schema || contract.schema.length === 0) return
    const schema = contract.schema[selectedSchemaIndex]
    if (!schema) return
    if (!schemaProperties[schema.name]) {
      fetchSchemaProperties(schema.name, 0)
    }
    if (!schemaLinks[schema.name]) {
      fetchSchemaSemanticLinks(schema.name)
    }
    fetchPropertySemanticLinks(schema.name)
  }, [contract?.schema, selectedSchemaIndex, fetchSchemaProperties, fetchSchemaSemanticLinks, fetchPropertySemanticLinks])

  // Poll for profiling updates while profiling is running
  useEffect(() => {
    if (!isProfilingRunning || !contractId) return

    console.log('Starting profiling poll interval...')
    const pollInterval = setInterval(() => {
      console.log('Polling for profiling updates...')
      fetchProfileRuns()
    }, 5000) // Poll every 5 seconds

    return () => {
      console.log('Stopping profiling poll interval')
      clearInterval(pollInterval)
    }
  }, [isProfilingRunning, contractId, fetchProfileRuns])

  const handleDelete = async () => {
    if (!contractId) return
    if (!confirm(t('data-contracts:detailsView.confirm.deleteContract', 'Delete this contract?'))) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.deleteFailed', 'Delete failed'))
      toast({ title: t('data-contracts:detailsView.toast.deletedTitle', 'Deleted'), description: t('data-contracts:detailsView.toast.contractDeleted', 'Contract deleted.') })
      navigate(listPath)
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.failedToDelete', 'Failed to delete'), variant: 'destructive' })
    }
  }

  const handleCloneForEditing = async () => {
    if (!contractId) return
    try {
      const response = await post<{ id: string }>(`/api/data-contracts/${contractId}/clone-for-editing`, {})
      if (response.error || !response.data?.id) {
        throw new Error(contractDraftErrorText(response, contract?.version, t))
      }
      const data = response.data
      toast({
        title: t('data-contracts:detailsView.toast.draftCreatedTitle', 'Personal Draft Created'),
        description: t('data-contracts:detailsView.toast.draftCreatedDesc', 'You can now edit this draft. It will only be visible to you until committed.'),
      })
      // Navigate to the new draft
      navigate(`${listPath}/${data.id}`)
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.cloneFailed', 'Failed to clone'), variant: 'destructive' })
    }
  }

  const handleDiscardDraft = async () => {
    if (!contractId) return
    if (!confirm(t('data-contracts:detailsView.confirm.discardDraft', 'Discard this personal draft? This cannot be undone.'))) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/discard`, { method: 'DELETE' })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || t('data-contracts:detailsView.errors.discardDraftFailed', 'Failed to discard draft'))
      }
      toast({ title: t('data-contracts:detailsView.toast.draftDiscardedTitle', 'Draft Discarded'), description: t('data-contracts:detailsView.toast.draftDiscardedDesc', 'Your personal draft has been deleted.') })
      // Navigate back to contracts list or parent contract
      if (contract?.parentContractId) {
        navigate(`${listPath}/${contract.parentContractId}`)
      } else {
        navigate(listPath)
      }
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.discardFailed', 'Failed to discard'), variant: 'destructive' })
    }
  }

  const handleCommitSuccess = () => {
    // Refresh the contract details after successful commit
    fetchDetails()
  }

  const exportOdcs = async () => {
    if (!contractId || !contract) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/odcs/export`)
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.exportOdcsFailed', 'Export ODCS failed'))
      const text = await res.text()
      const contentDisposition = res.headers.get('Content-Disposition') || ''
      const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
      const suggestedName = filenameMatch?.[1]
      const blob = new Blob([text], { type: 'application/x-yaml; charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = suggestedName || `${contract.name.toLowerCase().replace(/\s+/g, '_')}-odcs.yaml`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast({ title: t('data-contracts:detailsView.toast.exportFailedTitle', 'Export failed'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.toast.exportFailedDesc', 'Unable to export'), variant: 'destructive' })
    }
  }

  const addIri = async (iri: string) => {
    if (!contractId) return
    try {
      const res = await fetch(`/api/semantic-links/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id: contractId,
          entity_type: 'data_contract',
          iri,
        })
      })
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.addConceptFailed', 'Failed to add concept'))
      await fetchDetails()
      setIriDialogOpen(false)
      toast({ title: t('common:toast.linked', 'Linked'), description: t('data-contracts:detailsView.toast.conceptLinked', 'Business concept linked to data contract.') })
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.linkConceptFailed', 'Failed to link business concept'), variant: 'destructive' })
    }
  }

  const removeLink = async (linkId: string) => {
    try {
      const res = await fetch(`/api/semantic-links/${linkId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.removeConceptFailed', 'Failed to remove concept'))
      await fetchDetails()
      toast({ title: t('common:toast.unlinked', 'Unlinked'), description: t('data-contracts:detailsView.toast.conceptUnlinked', 'Business concept unlinked from data contract.') })
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.unlinkConceptFailed', 'Failed to unlink business concept'), variant: 'destructive' })
    }
  }

  const handleCreateNewVersion = () => {
    if (!contractId || !contract) {
      toast({ title: t('data-contracts:detailsView.toast.cannotVersionTitle', 'Permission Denied or Data Missing'), description: t('data-contracts:detailsView.toast.cannotVersionDesc', 'Cannot create new version.'), variant: 'destructive' })
      return
    }
    setIsVersionDialogOpen(true)
  }

  const submitNewVersion = async (newVersionString: string) => {
    if (!contractId) return
    toast({ title: t('data-contracts:detailsView.toast.creatingVersionTitle', 'Creating New Version'), description: t('data-contracts:detailsView.toast.creatingVersionDesc', 'Creating version {{version}}...', { version: newVersionString }) })
    try {
      // A full copy (schema, quality, servers ...), like the versioning dialog
      const response = await post<{ id?: string }>(`/api/data-contracts/${contractId}/clone`, {
        new_version: newVersionString.trim(),
      })
      if (response.error) {
        throw new Error(contractVersionErrorText(response, newVersionString.trim(), t))
      }
      const newId = response.data?.id
      if (!newId) throw new Error(t('data-contracts:detailsView.errors.invalidVersionResponse', 'Invalid response when creating version.'))
      toast({ title: t('common:status.success', 'Success'), description: t('data-contracts:detailsView.toast.versionCreated', 'Version {{version}} created successfully!', { version: newVersionString }) })
      setIsVersionDialogOpen(false)
      navigate(`${listPath}/${newId}`)
    } catch (e: any) {
      toast({ title: t('common:status.error', 'Error'), description: e?.message || t('data-contracts:detailsView.errors.createVersionFailed', 'Failed to create new version.'), variant: 'destructive' })
    }
  }

  // CRUD handlers for main metadata
  const handleUpdateMetadata = async (payload: any) => {
    console.log('[DEBUG] handleUpdateMetadata called with payload.owner_team_id:', payload.owner_team_id)
    console.log('[DEBUG] Full payload:', JSON.stringify(payload, null, 2))
    try {
      const updatePayload = {
        name: payload.name,
        version: payload.version,
        status: payload.status,
        owner_team_id: payload.owner_team_id,
        project_id: payload.project_id,
        tenant: payload.tenant,
        domainId: payload.domainId,
        descriptionUsage: payload.description?.usage,
        descriptionPurpose: payload.description?.purpose,
        descriptionLimitations: payload.description?.limitations,
        tags: payload.tags || [],
      }
      console.log('[DEBUG] Update payload owner_team_id:', updatePayload.owner_team_id)
      console.log('[DEBUG] Sending update request:', JSON.stringify(updatePayload, null, 2))
      
      const res = await fetch(`/api/data-contracts/${contractId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      })
      
      console.log('[DEBUG] Update response status:', res.status)
      
      // Handle version conflict (breaking changes detected)
      if (res.status === 409) {
        const errorData = await res.json()
        console.log('[DEBUG] 409 error data:', errorData)
        
        // Show dialog with breaking changes and options
        if (errorData.detail?.user_can_override) {
          // Admin can force update or create new version
          toast({
            title: t('data-contracts:detailsView.toast.breakingChangesTitle', 'Breaking Changes Detected'),
            description: t('data-contracts:detailsView.toast.breakingChangesAdmin', '{{message}}. As an admin, you can force this update or create a new version.', { message: errorData.detail.message }),
            variant: 'destructive',
            duration: 10000
          })
        } else {
          // Non-admin must create new version
          toast({
            title: t('data-contracts:detailsView.toast.breakingChangesTitle', 'Breaking Changes Detected'),
            description: t('data-contracts:detailsView.toast.breakingChangesNonAdmin', '{{message}}. You must create a new version.', { message: errorData.detail.message }),
            variant: 'destructive',
            duration: 10000
          })
        }
        throw new Error(errorData.detail?.message || t('data-contracts:detailsView.errors.breakingChangesDetected', 'Breaking changes detected'))
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(statusChangeErrorText(
          apiErrorOf(body, t('data-contracts:detailsView.errors.updateFailed', 'Update failed')),
          t,
          'data-contracts',
        ))
      }
      
      console.log('[DEBUG] Calling fetchDetails()...')
      await fetchDetails()
      
      toast({ title: t('data-contracts:detailsView.toast.updatedTitle', 'Updated'), description: t('data-contracts:detailsView.toast.metadataUpdated', 'Contract metadata updated.') })
    } catch (e) {
      console.error('[DEBUG] Update error:', e)
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.failedToUpdate', 'Failed to update'), variant: 'destructive' })
      throw e
    }
  }

  // Pre-fetch all properties then open the schema edit dialog
  const handleEditSchema = async (schemaIndex: number) => {
    const schemaName = contract?.schema?.[schemaIndex]?.name
    if (!schemaName) return
    await fetchAllSchemaProperties(schemaName)
    setEditingSchemaIndex(schemaIndex)
    setIsSchemaFormOpen(true)
  }

  const clearSchemaCache = () => {
    setSchemaProperties({})
    setSchemaPropTotal({})
    setSchemaPropPage({})
    setAllSchemaProperties({})
    setSchemaLinks({})
    setSchemaAuthDefs({})
  }

  // Schema CRUD handlers
  const handleAddSchema = async (schema: SchemaObject) => {
    if (!contractId) return
    const res = await fetch(`/api/data-contracts/${contractId}/schemas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schema),
    })
    if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.addSchemaFailed', 'Failed to add schema'))
    clearSchemaCache()
    await fetchDetails()
  }

  const handleUpdateSchema = async (schema: SchemaObject) => {
    if (!contract || editingSchemaIndex === null) return
    const updatedSchemas = [...(contract.schema || [])]
    updatedSchemas[editingSchemaIndex] = schema
    await updateContract({ schema: updatedSchemas })
    clearSchemaCache()
    setEditingSchemaIndex(null)
  }

  // Enrich schema with property-level semantic links from propertyLinks so the Edit Schema dialog loads them.
  // Properties are sourced from allSchemaProperties (fetched with limit=0 before opening the edit dialog)
  // rather than contract.schema[].properties which is always [] due to lazy loading.
  const schemaFormInitial = useMemo(() => {
    if (editingSchemaIndex === null || !contract?.schema?.[editingSchemaIndex]) return undefined
    const baseSchema = contract.schema[editingSchemaIndex]
    const SEMANTIC_ASSIGNMENT_TYPE = 'http://databricks.com/ontology/uc/semanticAssignment'
    const sourceProperties = allSchemaProperties[baseSchema.name] || baseSchema.properties || []
    const enrichedProperties = sourceProperties.map((prop: any) => {
      const propertyKey = `${baseSchema.name}#${prop.name}`
      const links: EntitySemanticLink[] = propertyLinks[propertyKey] || []
      const authoritativeDefinitions = links.length > 0
        ? links.map(l => ({ url: l.iri, type: SEMANTIC_ASSIGNMENT_TYPE }))
        : (prop.authoritativeDefinitions || [])
      const semanticConcepts = links.length > 0
        ? links.map(l => ({ iri: l.iri, label: l.label }))
        : ((prop as any).semanticConcepts || (prop.authoritativeDefinitions || []).map((d: { url: string }) => ({ iri: d.url })))
      return {
        ...prop,
        authoritativeDefinitions: authoritativeDefinitions.length > 0 ? authoritativeDefinitions : undefined,
        semanticConcepts: semanticConcepts.length > 0 ? semanticConcepts : undefined,
      }
    })
    return { ...baseSchema, properties: enrichedProperties }
  }, [contract, editingSchemaIndex, propertyLinks, allSchemaProperties])

  const handleDeleteSchema = async (index: number) => {
    if (!contract || !contractId) return
    if (!confirm(t('data-contracts:detailsView.confirm.deleteSchema', 'Delete this schema?'))) return
    const schemaName = contract.schema?.[index]?.name
    if (!schemaName) return
    const res = await fetch(`/api/data-contracts/${contractId}/schemas/${encodeURIComponent(schemaName)}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.deleteSchemaFailed', 'Failed to delete schema'))
    clearSchemaCache()
    if (selectedSchemaIndex >= (contract.schema?.length || 1) - 1) {
      setSelectedSchemaIndex(Math.max(0, selectedSchemaIndex - 1))
    }
    await fetchDetails()
  }

  // Quality Rule CRUD handlers
  const handleAddQualityRule = async (rule: QualityRule) => {
    if (!contract) return
    const updatedRules = [...(contract.qualityRules || []), rule]
    await updateContract({ qualityRules: updatedRules })
  }

  const handleUpdateQualityRule = async (rule: QualityRule) => {
    if (!contract || editingQualityRuleIndex === null) return
    const updatedRules = [...(contract.qualityRules || [])]
    updatedRules[editingQualityRuleIndex] = rule
    await updateContract({ qualityRules: updatedRules })
    setEditingQualityRuleIndex(null)
  }

  const handleDeleteQualityRule = async (index: number) => {
    if (!contract) return
    if (!confirm(t('data-contracts:detailsView.confirm.deleteQualityRule', 'Delete this quality rule?'))) return
    const updatedRules = (contract.qualityRules || []).filter((_, i) => i !== index)
    await updateContract({ qualityRules: updatedRules })
  }

  // Team Member CRUD handlers
  const handleAddTeamMember = async (member: TeamMember) => {
    if (!contract) return
    const updatedTeam = [...(contract.team || []), member]
    await updateContract({ team: updatedTeam })
  }

  const handleUpdateTeamMember = async (member: TeamMember) => {
    if (!contract || editingTeamMemberIndex === null) return
    const updatedTeam = [...(contract.team || [])]
    updatedTeam[editingTeamMemberIndex] = member
    await updateContract({ team: updatedTeam })
    setEditingTeamMemberIndex(null)
  }

  // Server Config CRUD handlers
  const handleAddServer = async (server: ServerConfig) => {
    if (!contract) return
    const currentServers = Array.isArray(contract.servers) ? contract.servers : (contract.servers ? [contract.servers] : [])
    const updatedServers = [...currentServers, server]
    await updateContract({ servers: updatedServers })
  }

  const handleUpdateServer = async (server: ServerConfig) => {
    if (!contract || editingServerIndex === null) return
    const currentServers = Array.isArray(contract.servers) ? contract.servers : (contract.servers ? [contract.servers] : [])
    const updatedServers = [...currentServers]
    updatedServers[editingServerIndex] = server
    await updateContract({ servers: updatedServers })
    setEditingServerIndex(null)
  }

  const handleDeleteServer = async (index: number) => {
    if (!contract) return
    if (!confirm(t('data-contracts:detailsView.confirm.deleteServer', 'Delete this server configuration?'))) return
    const currentServers = Array.isArray(contract.servers) ? contract.servers : (contract.servers ? [contract.servers] : [])
    const updatedServers = currentServers.filter((_, i) => i !== index)
    await updateContract({ servers: updatedServers })
  }

  // SLA handler
  const handleUpdateSLA = async (sla: SLARequirements) => {
    await updateContract({ sla })
  }

  // Contract-level Authoritative Definition handlers
  const handleAddContractAuthDef = async (definition: { url: string; type: string }) => {
    if (!contractId) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/authoritative-definitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(definition)
      })
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.createAuthDefFailed', 'Failed to create authoritative definition'))
      await fetchContractAuthDefs()
      toast({ title: t('data-contracts:detailsView.toast.addedTitle', 'Added'), description: t('data-contracts:detailsView.toast.authDefAdded', 'Authoritative definition added successfully.') })
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.addFailed', 'Failed to add'), variant: 'destructive' })
      throw e
    }
  }

  const handleUpdateContractAuthDef = async (definition: { url: string; type: string }) => {
    if (!contractId || editingContractAuthDefIndex === null) return
    const defId = contractAuthDefs[editingContractAuthDefIndex]?.id
    if (!defId) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/authoritative-definitions/${defId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(definition)
      })
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.updateAuthDefFailed', 'Failed to update authoritative definition'))
      await fetchContractAuthDefs()
      setEditingContractAuthDefIndex(null)
      toast({ title: t('data-contracts:detailsView.toast.updatedTitle', 'Updated'), description: t('data-contracts:detailsView.toast.authDefUpdated', 'Authoritative definition updated successfully.') })
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.failedToUpdate', 'Failed to update'), variant: 'destructive' })
      throw e
    }
  }

  const handleDeleteContractAuthDef = async (index: number) => {
    if (!contractId) return
    if (!confirm(t('data-contracts:detailsView.confirm.deleteAuthDef', 'Delete this authoritative definition?'))) return
    const defId = contractAuthDefs[index]?.id
    if (!defId) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/authoritative-definitions/${defId}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.deleteAuthDefFailed', 'Failed to delete authoritative definition'))
      await fetchContractAuthDefs()
      toast({ title: t('data-contracts:detailsView.toast.deletedTitle', 'Deleted'), description: t('data-contracts:detailsView.toast.authDefDeleted', 'Authoritative definition deleted successfully.') })
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.failedToDelete', 'Failed to delete'), variant: 'destructive' })
    }
  }

  // Custom Property CRUD handlers
  const handleAddCustomProperty = async (data: { property: string; value: string }) => {
    if (!contract) return
    const updatedProps = { ...(contract.customProperties || {}), [data.property]: data.value }
    await updateContract({ customProperties: updatedProps })
    setIsCustomPropertyFormOpen(false)
  }

  const handleUpdateCustomProperty = async (data: { property: string; value: string }) => {
    if (!contract || !editingCustomPropertyKey) return
    const updatedProps = { ...(contract.customProperties || {}) }
    // If key changed, remove old key
    if (editingCustomPropertyKey !== data.property) {
      delete updatedProps[editingCustomPropertyKey]
    }
    updatedProps[data.property] = data.value
    await updateContract({ customProperties: updatedProps })
    setEditingCustomPropertyKey(null)
    setIsCustomPropertyFormOpen(false)
  }

  const handleDeleteCustomProperty = async (key: string) => {
    if (!contract) return
    if (!confirm(t('data-contracts:detailsView.confirm.deleteCustomProperty', 'Delete custom property "{{key}}"?', { key }))) return
    const updatedProps = { ...(contract.customProperties || {}) }
    delete updatedProps[key]
    await updateContract({ customProperties: updatedProps })
  }

  // Schema-level Authoritative Definition handlers
  const handleAddSchemaAuthDef = async (definition: { url: string; type: string }) => {
    if (!contractId || !activeSchemaIdForAuthDef) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/schemas/${encodeURIComponent(activeSchemaIdForAuthDef)}/authoritative-definitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(definition)
      })
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.createSchemaAuthDefFailed', 'Failed to create schema authoritative definition'))
      await fetchSchemaAuthDefs(activeSchemaIdForAuthDef)
      toast({ title: t('data-contracts:detailsView.toast.addedTitle', 'Added'), description: t('data-contracts:detailsView.toast.schemaAuthDefAdded', 'Schema authoritative definition added successfully.') })
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.addFailed', 'Failed to add'), variant: 'destructive' })
      throw e
    }
  }

  const handleUpdateSchemaAuthDef = async (definition: { url: string; type: string }) => {
    if (!contractId || !editingSchemaAuthDef) return
    const { schemaId, index } = editingSchemaAuthDef
    const defs = schemaAuthDefs[schemaId] || []
    const defId = defs[index]?.id
    if (!defId) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/schemas/${encodeURIComponent(schemaId)}/authoritative-definitions/${defId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(definition)
      })
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.updateSchemaAuthDefFailed', 'Failed to update schema authoritative definition'))
      await fetchSchemaAuthDefs(schemaId)
      setEditingSchemaAuthDef(null)
      toast({ title: t('data-contracts:detailsView.toast.updatedTitle', 'Updated'), description: t('data-contracts:detailsView.toast.schemaAuthDefUpdated', 'Schema authoritative definition updated successfully.') })
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.failedToUpdate', 'Failed to update'), variant: 'destructive' })
      throw e
    }
  }

  const handleDeleteSchemaAuthDef = async (schemaId: string, index: number) => {
    if (!contractId) return
    if (!confirm(t('data-contracts:detailsView.confirm.deleteSchemaAuthDef', 'Delete this schema authoritative definition?'))) return
    const defs = schemaAuthDefs[schemaId] || []
    const defId = defs[index]?.id
    if (!defId) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/schemas/${encodeURIComponent(schemaId)}/authoritative-definitions/${defId}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.deleteSchemaAuthDefFailed', 'Failed to delete schema authoritative definition'))
      await fetchSchemaAuthDefs(schemaId)
      toast({ title: t('data-contracts:detailsView.toast.deletedTitle', 'Deleted'), description: t('data-contracts:detailsView.toast.schemaAuthDefDeleted', 'Schema authoritative definition deleted successfully.') })
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.failedToDelete', 'Failed to delete'), variant: 'destructive' })
    }
  }

  // Property-level Authoritative Definition fetch and handlers
  const fetchPropertyAuthDefs = async (schemaId: string, propertyId: string) => {
    if (!contractId) return
    try {
      const response = await fetch(`/api/data-contracts/${contractId}/schemas/${encodeURIComponent(schemaId)}/properties/${encodeURIComponent(propertyId)}/authoritative-definitions`)
      if (response.ok) {
        const data = await response.json()
        setPropertyAuthDefs(prev => ({ ...prev, [propertyId]: Array.isArray(data) ? data : [] }))
      } else {
        setPropertyAuthDefs(prev => ({ ...prev, [propertyId]: [] }))
      }
    } catch (e) {
      console.warn("Failed to fetch property authoritative definitions for", propertyId, ":", e)
      setPropertyAuthDefs(prev => ({ ...prev, [propertyId]: [] }))
    }
  }

  const handleAddPropertyAuthDef = async (definition: { url: string; type: string }) => {
    if (!contractId || !_activePropertyForAuthDef) return
    const { schemaId, propertyId } = _activePropertyForAuthDef
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/schemas/${encodeURIComponent(schemaId)}/properties/${encodeURIComponent(propertyId)}/authoritative-definitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(definition)
      })
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.createPropertyAuthDefFailed', 'Failed to create property authoritative definition'))
      await fetchPropertyAuthDefs(schemaId, propertyId)
      toast({ title: t('data-contracts:detailsView.toast.addedTitle', 'Added'), description: t('data-contracts:detailsView.toast.propertyAuthDefAdded', 'Property authoritative definition added successfully.') })
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.addFailed', 'Failed to add'), variant: 'destructive' })
      throw e
    }
  }

  const handleUpdatePropertyAuthDef = async (definition: { url: string; type: string }) => {
    if (!contractId || !editingPropertyAuthDef) return
    const { schemaId, propertyId, index } = editingPropertyAuthDef
    const defs = propertyAuthDefs[propertyId] || []
    const defId = defs[index]?.id
    if (!defId) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/schemas/${encodeURIComponent(schemaId)}/properties/${encodeURIComponent(propertyId)}/authoritative-definitions/${defId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(definition)
      })
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.updatePropertyAuthDefFailed', 'Failed to update property authoritative definition'))
      await fetchPropertyAuthDefs(schemaId, propertyId)
      setEditingPropertyAuthDef(null)
      toast({ title: t('data-contracts:detailsView.toast.updatedTitle', 'Updated'), description: t('data-contracts:detailsView.toast.propertyAuthDefUpdated', 'Property authoritative definition updated successfully.') })
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.failedToUpdate', 'Failed to update'), variant: 'destructive' })
      throw e
    }
  }

  // Available for future use - commented out to prevent unused variable errors
  // const handleDeletePropertyAuthDef = async (schemaId: string, propertyId: string, index: number) => {
  //   if (!contractId) return
  //   if (!confirm('Delete this property authoritative definition?')) return
  //   const defs = propertyAuthDefs[propertyId] || []
  //   const defId = defs[index]?.id
  //   if (!defId) return
  //   try {
  //     const res = await fetch(`/api/data-contracts/${contractId}/schemas/${encodeURIComponent(schemaId)}/properties/${encodeURIComponent(propertyId)}/authoritative-definitions/${defId}`, {
  //       method: 'DELETE'
  //     })
  //     if (!res.ok) throw new Error('Failed to delete property authoritative definition')
  //     await fetchPropertyAuthDefs(schemaId, propertyId)
  //     toast({ title: 'Deleted', description: 'Property authoritative definition deleted successfully.' })
  //   } catch (e) {
  //     toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to delete', variant: 'destructive' })
  //   }
  // }

  // Available for future use - commented out to prevent unused variable errors
  // const handleManagePropertyAuthDefs = (schemaId: string, propertyName: string, propertyId: string) => {
  //   // Fetch property auth defs if not already loaded
  //   if (!propertyAuthDefs[propertyId]) {
  //     fetchPropertyAuthDefs(schemaId, propertyId)
  //   }
  //   setActivePropertyForAuthDef({ schemaId, propertyId })
  //   setEditingPropertyAuthDef(null)
  //   setIsPropertyAuthDefFormOpen(true)
  // }

  // Helper to update contract (read-modify-write pattern)
  const updateContract = async (updates: Partial<any>, showToast: boolean = true, forceUpdate: boolean = false) => {
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (forceUpdate) {
        headers['X-Force-Update'] = 'true'
      }
      
      const res = await fetch(`/api/data-contracts/${contractId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates)
      })
      
      // Handle 409 Conflict - versioning required
      if (res.status === 409) {
        const conflictData = await res.json()
        const detail = conflictData.detail
        
        if (detail && typeof detail === 'object' && detail.requires_versioning) {
          // Store the pending update and show versioning dialog
          setPendingUpdate(updates)
          setVersioningAnalysis(detail.change_analysis)
          setVersioningUserCanOverride(detail.user_can_override)
          setIsVersioningDialogOpen(true)
          return // Don't throw, let the dialog handle it
        }
      }
      
      if (!res.ok) throw new Error(t('data-contracts:detailsView.errors.updateFailed', 'Update failed'))
      await fetchDetails()
      if (showToast) {
        toast({ title: t('data-contracts:detailsView.toast.updatedTitle', 'Updated'), description: t('data-contracts:detailsView.toast.contractUpdated', 'Contract updated successfully.') })
      }
    } catch (e) {
      toast({ title: t('common:status.error', 'Error'), description: e instanceof Error ? e.message : t('data-contracts:detailsView.errors.failedToUpdate', 'Failed to update'), variant: 'destructive' })
      throw e
    }
  }

  // Handlers for versioning dialog
  const handleVersioningUpdateInPlace = async () => {
    if (!pendingUpdate) return
    try {
      await updateContract(pendingUpdate, true, true) // Force update
      setIsVersioningDialogOpen(false)
      setPendingUpdate(null)
      setVersioningAnalysis(null)
    } catch (e) {
      // Error already handled by updateContract
    }
  }

  const handleVersioningCreateNewVersion = async () => {
    if (!contractId) return
    setIsVersioningDialogOpen(false)
    // Open the version creation dialog instead
    setIsVersionDialogOpen(true)
    // The pending update will be discarded - user needs to apply it to the new version
    toast({
      title: t('data-contracts:detailsView.header.createNewVersion', 'Create New Version'),
      description: t('data-contracts:detailsView.toast.createNewVersionDesc', 'Creating a new version will clone this contract. Apply your changes to the new version after creation.')
    })
  }

  // Handler for inferring schema from a connected catalog (via schema-importer)
  const handleInferFromCatalog = async (schemas: CatalogSchemaResult[]) => {
    setIsInferringSchema(true)
    try {
      for (const schema of schemas) {
        const newSchema: SchemaObject = {
          name: schema.name,
          physicalName: schema.physicalName,
          description: schema.description || undefined,
          physicalType: schema.physicalType || 'table',
          properties: schema.properties.map(p => ({
            name: p.name,
            physicalType: p.physicalType,
            logicalType: p.logicalType || 'string',
            required: p.required,
            description: p.description,
            partitioned: p.partitioned,
          })),
        }
        await handleAddSchema(newSchema)
      }

      const totalCols = schemas.reduce((sum, s) => sum + s.properties.length, 0)
      toast({
        title: t('data-contracts:detailsView.toast.schemaInferredTitle', 'Schema inferred successfully'),
        description: t('data-contracts:detailsView.toast.schemaInferredDesc', 'Added {{count}} schemas with {{columns}} total columns', { count: schemas.length, columns: totalCols }),
      })
      setIsInferFromCatalogOpen(false)
    } catch (e) {
      toast({
        title: t('data-contracts:detailsView.toast.inferFailedTitle', 'Failed to infer schema'),
        description: e instanceof Error ? e.message : t('data-contracts:detailsView.toast.inferFromCatalogFailed', 'Could not infer schema from catalog'),
        variant: 'destructive',
      })
    } finally {
      setIsInferringSchema(false)
    }
  }

  // Handler for inferring schema from an existing Ontos asset
  const handleInferFromAsset = async (schemas: InferredSchemaObject[]) => {
    setIsInferringSchema(true)
    try {
      for (const schema of schemas) {
        const newSchema: SchemaObject = {
          name: schema.name,
          physicalName: schema.physicalName,
          description: schema.description || undefined,
          physicalType: schema.physicalType || 'table',
          properties: schema.properties.map(p => ({
            name: p.name,
            physicalType: p.physicalType,
            logicalType: p.logicalType || 'string',
            required: p.required,
            description: p.description,
            partitioned: p.partitioned,
          })),
        }
        await handleAddSchema(newSchema)
      }

      const totalCols = schemas.reduce((sum, s) => sum + s.properties.length, 0)
      toast({
        title: t('data-contracts:detailsView.toast.schemaInferredTitle', 'Schema inferred successfully'),
        description: t('data-contracts:detailsView.toast.schemaInferredFromAssetDesc', 'Added {{count}} schemas with {{columns}} total columns from asset', { count: schemas.length, columns: totalCols }),
      })
    } catch (e) {
      toast({
        title: t('data-contracts:detailsView.toast.inferFailedTitle', 'Failed to infer schema'),
        description: e instanceof Error ? e.message : t('data-contracts:detailsView.toast.inferFromAssetFailed', 'Could not infer schema from asset'),
        variant: 'destructive',
      })
    } finally {
      setIsInferringSchema(false)
    }
  }

  const handleApprove = async () => {
    if (!contractId) return;
    try {
      const response = await post(`/api/data-contracts/${contractId}/approve`, {});
      if (response.error) {
        throw new Error(contractActionErrorText(response, t, t('data-contracts:detailsView.errors.approveFailed', 'Approve failed')));
      }
      await fetchDetails();
      toast({ title: t('data-contracts:detailsView.toast.approvedTitle', 'Approved'), description: t('data-contracts:detailsView.toast.contractApproved', 'Contract approved.') });
    } catch (e: any) {
      toast({ title: t('common:status.error', 'Error'), description: e?.message || t('data-contracts:detailsView.errors.approveFailed', 'Approve failed'), variant: 'destructive' });
    }
  };

  const handleReject = async () => {
    if (!contractId) return;
    try {
      const response = await post(`/api/data-contracts/${contractId}/reject`, {});
      if (response.error) {
        throw new Error(contractActionErrorText(response, t, t('data-contracts:detailsView.errors.rejectFailed', 'Reject failed')));
      }
      await fetchDetails();
      toast({ title: t('data-contracts:detailsView.toast.rejectedTitle', 'Rejected'), description: t('data-contracts:detailsView.toast.contractRejected', 'Contract rejected.') });
    } catch (e: any) {
      toast({ title: t('common:status.error', 'Error'), description: e?.message || t('data-contracts:detailsView.errors.rejectFailed', 'Reject failed'), variant: 'destructive' });
    }
  };

  const handleStartProfiling = async (selectedSchemaNames: string[]) => {
    if (!contractId) return
    try {
      const res = await fetch(`/api/data-contracts/${contractId}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema_names: selectedSchemaNames })
      })
      if (!res.ok) {
        // The backend returns an actionable `detail` (e.g. the DQX job is not enabled);
        // prefer it over the raw response body.
        const errorDetail = await res.json().catch(() => null)
        throw new Error(errorDetail?.detail || t('data-contracts:detailsView.errors.startProfilingFailed', 'Failed to start profiling'))
      }
      await res.json()
      toast({
        title: t('data-contracts:detailsView.toast.dqxStartedTitle', 'DQX Profiling Started'),
        description: t('data-contracts:detailsView.toast.dqxStartedDesc', 'The profiler is analyzing your data. You will be notified when complete.')
      })
      setIsDqxSchemaSelectOpen(false)
      
      // Immediately mark as running and fetch status
      setIsProfilingRunning(true)
      fetchProfileRuns()
    } catch (e) {
      toast({
        title: t('data-contracts:detailsView.toast.dqxStartFailedTitle', 'Failed to start profiling'),
        description: e instanceof Error ? e.message : t('data-contracts:detailsView.toast.dqxStartFailedDesc', 'Could not start DQX profiling'),
        variant: 'destructive'
      })
    }
  }

  const handleRequestDqxJob = async () => {
    setIsRequestingDqxJob(true)
    try {
      const result = await requestJobEnablement('dqx_profile_datasets')
      if (result === 'already_installed') {
        toast({
          title: t('data-contracts:detailsView.toast.dqxAlreadyEnabledTitle', 'DQX profiling is already enabled'),
          description: t('data-contracts:detailsView.toast.dqxAlreadyEnabledDesc', 'Reload the page to start profiling.')
        })
      } else if (result === 'already_requested') {
        toast({
          title: t('data-contracts:detailsView.toast.dqxRequestPendingTitle', 'Request already pending'),
          description: t('data-contracts:detailsView.toast.dqxRequestPendingDesc', 'An administrator has already been notified about this job.')
        })
      } else {
        toast({
          title: t('data-contracts:detailsView.toast.dqxAdminsNotifiedTitle', 'Administrators notified'),
          description: t('data-contracts:detailsView.toast.dqxAdminsNotifiedDesc', 'They have been asked to enable the DQX profiling background job.')
        })
      }
    } catch (e) {
      toast({
        title: t('data-contracts:detailsView.toast.dqxNotifyFailedTitle', 'Failed to notify administrators'),
        description: e instanceof Error ? e.message : t('data-contracts:detailsView.toast.dqxNotifyFailedDesc', 'Could not submit the request'),
        variant: 'destructive'
      })
    } finally {
      setIsRequestingDqxJob(false)
    }
  }

  const handleOpenSuggestions = (runId?: string) => {
    const profileId = runId || latestProfileRun?.id
    if (profileId) {
      setSelectedProfileRunId(profileId)
      setIsDqxSuggestionsOpen(true)
    }
  }

  const handleSuggestionsSuccess = () => {
    fetchDetails()
    fetchProfileRuns()
  }


  // Helper functions for conditional rendering based on view mode
  const shouldShowSection = (section: string): boolean => {
    switch (viewMode) {
      case 'minimal':
        return ['metadata', 'description', 'schemas'].includes(section)
      case 'medium':
        return !['quality-rules', 'sla', 'access-control', 'custom-properties', 'support', 'authoritative-definitions'].includes(section)
      case 'large':
        return true
      default:
        return false
    }
  }

  // Special case for linked products in minimal mode
  const shouldShowLinkedProducts = (): boolean => {
    if (viewMode === 'minimal') {
      return linkedProducts.length > 0
    }
    return shouldShowSection('linked-products')
  }

  // The schema table's columns, memoised so its cells keep their focus across renders
  const schemaPropertyColumns = useMemo(
    () => createSchemaPropertyColumns(contract, selectedSchemaIndex, propertyLinks, t),
    [contract, selectedSchemaIndex, propertyLinks, t],
  )
  // The DQX hint, beside a Profile button that is disabled until the job is installed
  const dqxHint = useHoverFocusCard()
  const dqxHintId = useId()

  const backButton = (
    <Button variant="outline" onClick={() => navigate(listPath)} size="sm">
      <ArrowLeft />
      {t('data-contracts:details.backToList', 'Back to List')}
    </Button>
  )

  if (loading) {
    return (
      <div className={classes.state}>
        <DetailViewSkeleton cards={4} actionButtons={5} />
      </div>
    )
  }
  if (error || !contract) {
    return (
      <div className={classes.state}>
        <div className={classes.stateBack}>{backButton}</div>
        <MantineAlert
          color={error ? 'red' : 'gray'}
          variant="light"
          icon={<AlertCircle size={16} />}
          title={error ? t('common:status.error', 'Error') : undefined}
        >
          {error || t('data-contracts:detailsView.errors.contractNotFound', 'Contract not found.')}
        </MantineAlert>
      </div>
    )
  }

  const serversList = Array.isArray(contract.servers) ? contract.servers : (contract.servers ? [contract.servers] : [])

  const renderSchemaPropertiesTable = () => {
    const schemaName = contract?.schema?.[selectedSchemaIndex]?.name || ''
    const props = schemaProperties[schemaName] || []
    const totalProps = schemaPropTotal[schemaName] || 0
    const currentPage = schemaPropPage[schemaName] || 0
    const totalPages = Math.ceil(totalProps / PROPS_PAGE_SIZE)

    if (loadingSchemaProps && props.length === 0) {
      return <SkeletonBlock />
    }
    if (props.length === 0 && totalProps === 0) return null
    return (
      <div className={classes.properties}>
        {/* A long schema's rows scroll inside the table's own box (.properties in
            the module), so the page, its header and the table's toolbar and pager stay put */}
        <DataTable
          columns={schemaPropertyColumns}
          data={props}
          searchColumn="name"
        />
        {totalPages > 1 && (
          <div className={classes.pagination}>
            <span className={common.muted}>{t('data-contracts:detailsView.schemas.pagination', 'Showing {{from}}–{{to}} of {{total}} columns', { from: currentPage * PROPS_PAGE_SIZE + 1, to: Math.min((currentPage + 1) * PROPS_PAGE_SIZE, totalProps), total: totalProps })}</span>
            <div className={classes.paginationButtons}>
              <Button size="sm" variant="outline" disabled={currentPage === 0 || loadingSchemaProps} onClick={() => fetchSchemaProperties(schemaName, currentPage - 1)}>{t('common:pagination.previous', 'Previous')}</Button>
              <Button size="sm" variant="outline" disabled={currentPage >= totalPages - 1 || loadingSchemaProps} onClick={() => fetchSchemaProperties(schemaName, currentPage + 1)}>{t('common:pagination.next', 'Next')}</Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  /** A row's icon-only edit and delete buttons, named for what they act on. */
  const rowActions = (name: string, onEdit: () => void, onDelete: () => void, editing = false) => {
    const editLabel = t('data-contracts:detailsView.rowActions.edit', 'Edit {{name}}', { name })
    const deleteLabel = t('data-contracts:detailsView.rowActions.delete', 'Delete {{name}}', { name })
    return (
      <>
        <Button size="icon" variant="ghost" className={common.iconButton} disabled={editing} onClick={onEdit} aria-label={editLabel} title={editLabel}>
          {editing ? <Loader2 className={common.spin} /> : <Pencil />}
        </Button>
        <Button size="icon" variant="ghost" className={`${common.iconButton} ${common.danger}`} onClick={onDelete} aria-label={deleteLabel} title={deleteLabel}>
          <Trash2 />
        </Button>
      </>
    )
  }

  /** One schema: its name and ids, its table link and actions, its columns, then its definitions. */
  const renderSchemaDetail = (index: number, showIds: boolean) => {
    const schemaObj = contract.schema?.[index]
    if (!schemaObj) return null
    const name = schemaObj.name || t('data-contracts:detailsView.schemas.tableFallback', 'Table {{number}}', { number: index + 1 })
    const schemaId = (schemaObj as any).id || schemaObj.name
    const defs = schemaAuthDefs[schemaId] || []
    return (
      <div className={classes.schema}>
        <div className={classes.item}>
          <div className={classes.itemMain}>
            <div className={classes.itemLine}>
              <h3 className={classes.schemaName}>{name}</h3>
              {showIds && schemaObj.stableId && (
                <span className={classes.stableId} title={t('data-contracts:detailsView.stableIdTitle', 'ODCS StableId')}>{schemaObj.stableId}</span>
              )}
              {showIds && schemaObj.relationships && schemaObj.relationships.length > 0 && (
                <Badge variant="outline">
                  <Link2 aria-hidden className={classes.badgeIcon} />
                  {t('data-contracts:detailsView.schemas.fkCount', '{{count}} FK', { count: schemaObj.relationships.length })}
                </Badge>
              )}
            </div>
            {schemaObj.name && <ConceptLinks links={schemaLinks[schemaObj.name]} icon={Shapes} />}
          </div>
          <div className={classes.itemActions}>
            {schemaObj.physicalName && (
              <a
                href={`/catalog-commander?table=${encodeURIComponent(schemaObj.physicalName)}`}
                className={classes.tableLink}
                target="_blank"
                rel="noopener noreferrer"
                title={t('data-contracts:detailsView.schemas.openInCatalogCommander', 'Open {{name}} in Catalog Commander', { name: schemaObj.physicalName })}
              >
                <Database aria-hidden />
                {schemaObj.physicalName}
              </a>
            )}
            {canEditInPlace && rowActions(name, () => handleEditSchema(index), () => handleDeleteSchema(index), loadingEditProperties)}
          </div>
        </div>
        {renderSchemaPropertiesTable()}

        {/* Schema Authoritative Definitions */}
        {shouldShowSection('authoritative-definitions') && (
          <div className={classes.subsection}>
            <div className={classes.subhead}>
              <h4 className={classes.subtitle}>{t('data-contracts:detailsView.authDefs.schemaTitle', 'Authoritative Definitions ({{count}})', { count: defs.length })}</h4>
              {canEditInPlace && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActiveSchemaIdForAuthDef(schemaId)
                    setEditingSchemaAuthDef(null)
                    setIsSchemaAuthDefFormOpen(true)
                  }}
                >
                  <Plus />
                  {t('common:actions.add', 'Add')}
                </Button>
              )}
            </div>
            {defs.length === 0 ? (
              <p className={classes.empty}>{t('data-contracts:detailsView.authDefs.noneForSchema', 'No authoritative definitions for this schema.')}</p>
            ) : (
              <div className={classes.list} role="list">
                {defs.map((def, idx) => (
                  <div key={def.id} className={classes.item} role="listitem">
                    <div className={classes.itemMain}>
                      <span><Badge variant="secondary">{def.type}</Badge></span>
                      <a href={def.url} target="_blank" rel="noreferrer" className={classes.url}>{def.url}</a>
                    </div>
                    {canEditInPlace && (
                      <div className={classes.itemActions}>
                        {rowActions(
                          def.url,
                          () => {
                            setEditingSchemaAuthDef({ schemaId, index: idx })
                            setIsSchemaAuthDefFormOpen(true)
                          },
                          () => handleDeleteSchemaAuthDef(schemaId, idx),
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const dqxDisabled = !contract.schema || contract.schema.length === 0 || !isDqxJobInstalled
  const profileButton = (
    <Button size="sm" variant="outline" onClick={() => setIsDqxSchemaSelectOpen(true)} disabled={dqxDisabled}>
      <Sparkles />
      {t('data-contracts:detailsView.schemas.profileWithDqx', 'Profile with DQX')}
    </Button>
  )
  const isActiveOrApproved = ['active', 'approved'].includes((contract.status || '').toLowerCase())
  const customProperties = Object.entries(contract.customProperties || {})

  const none = <span className={common.muted}>—</span>
  const domainId = contract.domainId
  const domainName = getDomainName(domainId) || contract.domain
  const projectId = (contract as any).project_id

  const detailRows: DetailsRow[] = [
    {
      label: t('data-contracts:detailsView.metadata.version', 'Version'),
      value: contract.version ? <Badge variant="outline">{contract.version}</Badge> : none,
    },
    {
      label: t('data-contracts:detailsView.metadata.domain', 'Domain'),
      value: domainName && domainId ? (
        <Link className={classes.link} to={`/settings/data-domains/${domainId}`}>
          {domainName}
        </Link>
      ) : domainName ? <span className={common.muted}>{domainName}</span> : none,
    },
    {
      label: t('data-contracts:detailsView.metadata.project', 'Project'),
      value: projectId && contract.project_name ? (
        // No route shows one project, so the name is text, with the id in its title
        <span title={t('data-contracts:detailsView.metadata.projectIdTitle', 'Project ID: {{id}}', { id: projectId })}>
          {contract.project_name}
        </span>
      ) : none,
    },
    {
      label: t('data-contracts:detailsView.metadata.tenant', 'Tenant'),
      value: contract.tenant ? <span className={common.muted}>{contract.tenant}</span> : none,
    },
    {
      // #854: the contract's dataProduct reference, resolved to its product
      label: t('data-contracts:detailsView.metadata.dataProduct', 'Data Product'),
      value: contract.dataProductId ? (
        <Link
          className={classes.link}
          to={`/data-products/${contract.dataProductId}`}
          title={t('data-contracts:detailsView.metadata.dataProductIdTitle', 'Product ID: {{id}}', { id: contract.dataProductId })}
        >
          {contract.dataProductName || contract.dataProduct}
        </Link>
      ) : contract.dataProduct ? <span className={common.muted}>{contract.dataProduct}</span> : none,
    },
    {
      label: t('data-contracts:detailsView.metadata.team', 'Team'),
      value: contract.owner_team_id && contract.owner_team_name ? (
        // No route shows one team, so the name is text, with the id in its title
        <span title={t('data-contracts:detailsView.metadata.teamIdTitle', 'Team ID: {{id}}', { id: contract.owner_team_id })}>
          {contract.owner_team_name}
        </span>
      ) : none,
    },
    {
      label: t('data-contracts:detailsView.metadata.apiVersion', 'API Ver'),
      value: contract.apiVersion ? <Badge variant="outline">{contract.apiVersion}</Badge> : none,
    },
    {
      label: t('data-contracts:detailsView.metadata.created', 'Created'),
      value: contract.created ? <span className={common.muted}>{formatDate(contract.created)}</span> : none,
    },
    {
      label: t('data-contracts:detailsView.metadata.updated', 'Updated'),
      value: contract.updated ? <span className={common.muted}>{formatDate(contract.updated)}</span> : none,
    },
    {
      label: t('data-contracts:detailsView.metadata.cert', 'Cert'),
      value: (contract.certification_level || contract.inherited_certification_level) ? (
        <CertificationBadge
          certificationLevel={contract.certification_level}
          inheritedCertificationLevel={contract.inherited_certification_level}
          certifiedAt={contract.certified_at}
          certifiedBy={contract.certified_by}
          levels={certificationLevels}
          size="sm"
        />
      ) : none,
    },
    {
      label: t('data-contracts:detailsView.metadata.published', 'Published'),
      value: contract.publication_scope && contract.publication_scope !== 'none' ? (
        <PublicationScopeBadge
          scope={contract.publication_scope as PublicationScope}
          publishedAt={contract.published_at}
          publishedBy={contract.published_by}
          size="sm"
        />
      ) : none,
    },
    {
      label: t('data-contracts:detailsView.metadata.tags', 'Tags'),
      value: (contract.tags || []).length > 0 ? (
        <span className={classes.chips}>
          {(contract.tags || []).map((tag, index) => (
            <TagChip key={index} tag={tag} size="sm" />
          ))}
        </span>
      ) : <span className={common.muted}>{t('data-contracts:details.coreMetadata.noTags', 'No tags')}</span>,
    },
    {
      label: t('data-contracts:detailsView.metadata.linkedBusinessConcepts', 'Linked Business Concepts'),
      value: (
        <LinkedConceptChips
          links={links}
          onRemove={canEditInPlace && canWriteSemantic ? (id) => removeLink(id) : undefined}
          trailing={canEditInPlace && canWriteSemantic ? <Button size="sm" variant="outline" onClick={() => setIriDialogOpen(true)}>{t('common:actions.add', 'Add')}</Button> : undefined}
        />
      ),
    },
  ]

  const description = contract.description
  const descriptionRows: DetailsRow[] = description ? [
    ...(description.purpose ? [{ label: t('data-contracts:detailsView.description.purpose', 'Purpose'), value: <span className={classes.prose}>{description.purpose}</span> }] : []),
    ...(description.limitations ? [{ label: t('data-contracts:detailsView.description.limitations', 'Limitations'), value: <span className={classes.prose}>{description.limitations}</span> }] : []),
    ...(description.usage ? [{ label: t('data-contracts:detailsView.description.usage', 'Usage'), value: <span className={classes.prose}>{description.usage}</span> }] : []),
  ] : []
  const status = (contract.status || '').toLowerCase()

  // The header shows one primary action for the state the contract is in, and at most one
  // more; everything else is under More. A reviewer approves or rejects, a producer commits
  // a draft or edits, and anyone else can clone a read-only contract or make a request.
  const inReview = ['proposed', 'under_review'].includes(status) && !!canApproveContractLifecycle
  const publishable = ['active', 'approved'].includes(status) && !!canWriteContracts
  const cloneable = !!(isReadOnly && !isPersonalDraft && canWriteContracts)
  const headerActions: HeaderAction[] = [
    { key: 'approve', show: inReview, label: t('data-contracts:detailsView.header.approve', 'Approve'), onClick: handleApprove },
    { key: 'reject', show: inReview, danger: true, className: common.danger, label: t('data-contracts:detailsView.header.reject', 'Reject'), onClick: handleReject },
    { key: 'commit', show: !!isPersonalDraft, icon: <CopyPlus />, label: t('data-contracts:detailsView.header.commitChanges', 'Commit Changes'), onClick: () => setIsCommitDraftDialogOpen(true) },
    { key: 'edit', show: !!canEditInPlace, icon: <Pencil />, label: t('data-contracts:detailsView.header.editMetadata', 'Edit Metadata'), onClick: () => setIsBasicFormOpen(true) },
    { key: 'clone', show: cloneable, icon: <CopyPlus />, label: t('data-contracts:detailsView.header.cloneForEditing', 'Clone for Editing'), onClick: handleCloneForEditing },
    {
      key: 'publish', show: publishable, icon: <Globe />, label: t('data-contracts:detailsView.header.publish', 'Publish'),
      onClick: () => {
        const cur = (contract.publication_scope || 'none') as PublicationScope
        setSelectedPublishScope(cur === 'none' ? 'organization' : cur)
        setPublishDialogOpen(true)
      },
    },
    { key: 'request', icon: <KeyRound />, label: t('data-contracts:detailsView.header.request', 'Request...'), onClick: () => setIsRequestDialogOpen(true) },
    {
      key: 'certify', show: status === 'active' && !!canApproveContractLifecycle, icon: <ShieldCheck />, label: t('data-contracts:detailsView.header.certify', 'Certify'),
      onClick: () => {
        const first = certificationLevels[0]?.level_order ?? null
        setSelectedCertifyLevel(first)
        setCertifyDialogOpen(true)
      },
    },
    { key: 'discard', show: !!isPersonalDraft, icon: <Trash2 />, label: t('data-contracts:detailsView.header.discardDraft', 'Discard Draft'), onClick: handleDiscardDraft },
    { key: 'new-version', show: !isPersonalDraft && !!canWriteContracts, icon: <CopyPlus />, label: t('data-contracts:detailsView.header.createNewVersion', 'Create New Version'), onClick: handleCreateNewVersion },
    { key: 'export', icon: <Download />, label: t('data-contracts:detailsView.header.exportOdcs', 'Export ODCS'), onClick: exportOdcs },
    { key: 'delete', show: !!canEditInPlace, danger: true, className: common.danger, icon: <Trash2 />, label: t('common:actions.delete', 'Delete'), onClick: handleDelete },
  ]
  const primaryKey = inReview ? 'approve' : isPersonalDraft ? 'commit' : canEditInPlace ? 'edit' : cloneable ? 'clone' : 'request'
  const secondaryKey = inReview
    ? 'reject'
    : primaryKey === 'commit' ? (canEditInPlace ? 'edit' : null)
    : primaryKey === 'request' ? null
    : publishable ? 'publish' : 'request'
  const headerVisible = [primaryKey, secondaryKey].filter((k): k is string => k !== null)

  return (
    <>
      <PageLayout
        header={
          <>
            <PageHeader
              title={contract.name || '—'}
              badges={
                <>
                  <Badge variant={getStatusColor(contract.status)}>{contract.status || '—'}</Badge>
                  {contract.id && <MaturityInline entityType="DataContract" entityId={contract.id} compact />}
                </>
              }
              wrapActions
              actions={
                <>
                  {backButton}
                  <HeaderActions
                    actions={headerActions}
                    visible={headerVisible}
                    afterVisible={
                      <CommentSidebar
                        entityType="data_contract"
                        entityId={contractId!}
                        isOpen={isCommentSidebarOpen}
                        onToggle={() => setIsCommentSidebarOpen(!isCommentSidebarOpen)}
                      />
                    }
                  />
                </>
              }
            />
            <p className={classes.description}>
              {contract.description?.purpose || t('data-contracts:details.noDescription', 'No description provided')}
            </p>
          </>
        }
      >
        <div className={classes.body}>
          {/* Personal Draft Banner */}
          {isPersonalDraft && (
            <MantineAlert color="yellow" variant="light" icon={<AlertCircle size={16} />} className={classes.banner}>
              <strong>{t('data-contracts:detailsView.banners.personalDraftTitle', 'Personal Draft')}</strong> — {t('data-contracts:detailsView.banners.personalDraftText', 'Only visible to you. Commit to share with your team.')}
              {contract.parentContractId && (
                <span className={classes.basedOn}>
                  {t('data-contracts:detailsView.banners.basedOn', 'Based on')}{' '}
                  <button type="button" className={classes.inlineLink} onClick={() => navigate(`${listPath}/${contract.parentContractId}`)}>
                    v{contract.version?.replace('-draft', '') || 'parent'}
                  </button>
                </span>
              )}
            </MantineAlert>
          )}

          {/* Read-Only Banner (for active+ contracts that aren't personal drafts) */}
          {isReadOnly && !isPersonalDraft && (
            <MantineAlert color="blue" variant="light" icon={<AlertCircle size={16} />} className={classes.banner}>
              <strong>{t('data-contracts:detailsView.banners.readOnlyTitle', 'Read-Only')}</strong> — {t('data-contracts:detailsView.banners.readOnlyText', 'This contract is {{status}}. Clone to create a new version for editing.', { status })}
            </MantineAlert>
          )}

          {/* The view controls, above the stack (which holds only panes) */}
          <div className={classes.toolbar}>
            {/* Version Navigation — unified across contracts and products (PRD #442). */}
            <VersionNavigator
              entityKind="contract"
              currentEntityId={contractId!}
              currentVersion={contract.version}
              onVersionChange={(id) => navigate(`${listPath}/${id}`)}
            />
            <DetailLevelToggle value={viewMode} onChange={setViewMode} />
          </div>

          <PaneStack>
            <Pane title={t('common:labels.details', 'Details')}>
              <DetailsGrid rows={detailRows} />
            </Pane>

            {/* Structured Description (ODCS) */}
            {shouldShowSection('description') && descriptionRows.length > 0 && (
              <Pane
                title={t('common:labels.description', 'Description')}
                actions={canEditInPlace ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={common.iconButton}
                    onClick={() => setIsBasicFormOpen(true)}
                    aria-label={t('data-contracts:detailsView.description.edit', 'Edit description')}
                    title={t('data-contracts:detailsView.description.edit', 'Edit description')}
                  >
                    <Pencil />
                  </Button>
                ) : undefined}
              >
                <DetailsGrid rows={descriptionRows} />
              </Pane>
            )}
            {/* Schemas Section */}
            <Pane
              title={t('data-contracts:detailsView.schemas.title', 'Schemas ({{count}})', { count: contract.schema?.length || 0 })}
              actions={
                <>
                  {canWriteContracts && (isDqxJobInstalled ? (
                    // Wrapper span: a disabled button emits no pointer events of its own
                    <span tabIndex={-1}>{profileButton}</span>
                  ) : (
                    // A plain popover, not a tooltip: it can hold an action. It isn't
                    // portalled, so Tab from the wrapper goes on into it.
                    <Popover opened={dqxHint.opened} onClose={dqxHint.close} position="bottom-end" withinPortal={false} shadow="md" returnFocus={false} withRoles={false}>
                      <Popover.Target>
                        <span tabIndex={0} aria-describedby={dqxHint.opened ? dqxHintId : undefined} {...dqxHint.target}>
                          {profileButton}
                        </span>
                      </Popover.Target>
                      <Popover.Dropdown className={classes.hint} {...dqxHint.dropdown}>
                        <p id={dqxHintId} className={classes.hintText}>{t('data-contracts:detailsView.schemas.dqxAdminHint', 'Ask your admin to enable the background job.')}</p>
                        {canRequestJobEnablement && (
                          <button
                            type="button"
                            onClick={handleRequestDqxJob}
                            disabled={isRequestingDqxJob}
                            className={classes.notify}
                          >
                            {isRequestingDqxJob && <Loader2 aria-hidden className={`${classes.inlineIcon} ${common.spin}`} />}
                            {isRequestingDqxJob ? t('data-contracts:detailsView.schemas.notifyingAdmin', 'Notifying admin...') : t('data-contracts:detailsView.schemas.notifyAdmin', 'Notify admin')}
                          </button>
                        )}
                      </Popover.Dropdown>
                    </Popover>
                  ))}
                  {canEditInPlace && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setIsInferFromCatalogOpen(true)} disabled={isInferringSchema}>
                        {isInferringSchema ? <Loader2 className={common.spin} /> : <Database />}
                        {isInferringSchema ? t('data-contracts:detailsView.schemas.inferring', 'Inferring...') : t('data-contracts:detailsView.schemas.inferFromCatalog', 'Infer from Catalog')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsInferFromAssetOpen(true)} disabled={isInferringSchema}>
                        <Package />
                        {t('data-contracts:detailsView.schemas.inferFromAsset', 'Infer from Asset')}
                      </Button>
                      <Button size="sm" onClick={() => { setEditingSchemaIndex(null); setIsSchemaFormOpen(true); }}>
                        <Plus />
                        {t('data-contracts:schemaEditor.addSchema', 'Add Schema')}
                      </Button>
                    </>
                  )}
                </>
              }
            >
              <p className={classes.lead}>{t('data-contracts:detailsView.schemas.subtitle', 'Database schema definitions')}</p>
              {isProfilingRunning && (
                <MantineAlert color="blue" variant="light" icon={<Loader2 size={16} className={common.spin} />} className={classes.notice}>
                  {t('data-contracts:detailsView.schemas.profilingInProgress', 'DQX profiling in progress... Results will appear here when complete.')}
                </MantineAlert>
              )}
              {!isProfilingRunning && pendingSuggestionsCount > 0 && (
                <MantineAlert color="blue" variant="light" icon={<Sparkles size={16} />} className={classes.notice}>
                  <div className={classes.noticeRow}>
                    <span>
                      {t('data-contracts:detailsView.schemas.suggestionsAvailable', '{{count}} quality check suggestions available from DQX profiling', { count: pendingSuggestionsCount })}
                    </span>
                    {canWriteContracts && (
                      <Button size="sm" variant="outline" onClick={() => handleOpenSuggestions()}>
                        {t('data-contracts:detailsView.schemas.reviewSuggestions', 'Review Suggestions')}
                      </Button>
                    )}
                  </div>
                </MantineAlert>
              )}
              {isInferringSchema && (
                <MantineAlert color="blue" variant="light" icon={<Loader2 size={16} className={common.spin} />} className={classes.notice}>
                  {t('data-contracts:detailsView.schemas.inferringSchemaWait', 'Inferring schema... This may take a moment.')}
                </MantineAlert>
              )}
              {!contract.schema || contract.schema.length === 0 ? (
                <div className={classes.emptyBlock}>
                  <p className={classes.emptyTitle}>{t('data-contracts:detailsView.schemas.noSchemasYet', 'No schemas defined yet')}</p>
                  <p>
                    {canEditInPlace
                      ? t('data-contracts:detailsView.schemas.defineStructure', 'Define the structure of your data by adding schemas')
                      : t('data-contracts:detailsView.schemas.noSchemasReadOnly', 'This contract has no schemas defined')}
                  </p>
                  {canEditInPlace && (
                    <div className={classes.emptyActions}>
                      <Button variant="outline" size="sm" onClick={() => setIsInferFromCatalogOpen(true)} disabled={isInferringSchema}>
                        {isInferringSchema ? <Loader2 className={common.spin} /> : <Database />}
                        {isInferringSchema ? t('data-contracts:detailsView.schemas.inferringSchema', 'Inferring Schema...') : t('data-contracts:detailsView.schemas.inferFromCatalog', 'Infer from Catalog')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setIsInferFromAssetOpen(true)} disabled={isInferringSchema}>
                        <Package />
                        {t('data-contracts:detailsView.schemas.inferFromAsset', 'Infer from Asset')}
                      </Button>
                      <Button size="sm" onClick={() => { setEditingSchemaIndex(null); setIsSchemaFormOpen(true); }}>
                        <Plus />
                        {t('data-contracts:detailsView.schemas.addSchemaManually', 'Add Schema Manually')}
                      </Button>
                    </div>
                  )}
                </div>
              ) : contract.schema.length === 1 ? (
                // Single schema - simple view
                renderSchemaDetail(0, false)
              ) : contract.schema.length > 6 ? (
                // Many schemas - a dropdown selector
                <div className={classes.schemas}>
                  <Select
                    size="xs"
                    className={classes.schemaPicker}
                    label={t('data-contracts:detailsView.schemas.selectSchema', 'Select Schema')}
                    aria-label={t('data-contracts:detailsView.schemas.selectSchema', 'Select Schema')}
                    data={contract.schema.map((schemaObj, idx) => ({
                      value: String(idx),
                      label: `${schemaObj.name || t('data-contracts:detailsView.schemas.tableFallback', 'Table {{number}}', { number: idx + 1 })} ${t('data-contracts:detailsView.schemas.columnsCount', '({{count}} columns)', { count: schemaPropTotal[schemaObj.name] ?? schemaObj.propertyCount ?? 0 })}`,
                    }))}
                    value={String(selectedSchemaIndex)}
                    onChange={(value) => value !== null && setSelectedSchemaIndex(parseInt(value))}
                    allowDeselect={false}
                    maxDropdownHeight={320}
                  />
                  {renderSchemaDetail(selectedSchemaIndex, true)}
                </div>
              ) : (
                // Few schemas - tabs, which scroll sideways when they don't fit
                <Tabs value={String(selectedSchemaIndex)} onChange={(value) => value !== null && setSelectedSchemaIndex(parseInt(value))}>
                  <div className={classes.tabScroll}>
                    <Tabs.List>
                      {contract.schema.map((schemaObj, idx) => (
                        <Tabs.Tab key={idx} value={String(idx)}>
                          {schemaObj.name || t('data-contracts:detailsView.schemas.tableFallback', 'Table {{number}}', { number: idx + 1 })}
                          <span className={classes.tabCount}>
                            ({schemaPropTotal[schemaObj.name] ?? schemaObj.propertyCount ?? schemaObj.properties?.length ?? 0})
                          </span>
                        </Tabs.Tab>
                      ))}
                    </Tabs.List>
                  </div>
                  {contract.schema.map((_, idx) => (
                    <Tabs.Panel key={idx} value={String(idx)}>
                      {idx === selectedSchemaIndex && renderSchemaDetail(idx, true)}
                    </Tabs.Panel>
                  ))}
                </Tabs>
              )}
            </Pane>

            {/* Linked Data Products Section */}
            {shouldShowLinkedProducts() && (
              <Pane
                title={t('data-contracts:detailsView.linkedProducts.title', 'Linked Data Products ({{count}})', { count: linkedProducts.length })}
                actions={canWriteProducts ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setIsLinkProductDialogOpen(true)} disabled={!isActiveOrApproved}>
                      <Plus />
                      {t('data-contracts:detailsView.linkedProducts.linkExisting', 'Link to Existing Product')}
                    </Button>
                    <Button size="sm" onClick={() => setIsCreateProductDialogOpen(true)} disabled={!isActiveOrApproved}>
                      <Plus />
                      {t('data-contracts:detailsView.linkedProducts.createProduct', 'Create Data Product')}
                    </Button>
                  </>
                ) : undefined}
              >
                <p className={classes.lead}>{t('data-contracts:detailsView.linkedProducts.subtitle', 'Data Products using this contract for deliverables')}</p>
                {loadingProducts ? (
                  <div className={classes.loading}>
                    <Loader2 aria-hidden className={common.spin} />
                  </div>
                ) : linkedProducts.length === 0 ? (
                  <div className={classes.emptyBlock}>
                    <Package aria-hidden className={classes.emptyIcon} />
                    <p className={classes.emptyTitle}>{t('data-contracts:detailsView.linkedProducts.noneYet', 'No linked data products yet')}</p>
                    <p>{t('data-contracts:detailsView.linkedProducts.emptyHint', 'Create a data product that uses this contract to govern a deliverable')}</p>
                    {isActiveOrApproved ? (canWriteProducts && (
                      <Button size="sm" onClick={() => setIsCreateProductDialogOpen(true)}>
                        <Plus />
                        {t('data-contracts:detailsView.linkedProducts.createProduct', 'Create Data Product')}
                      </Button>
                    )) : (
                      <p className={classes.italic}>
                        {t('data-contracts:detailsView.linkedProducts.statusRequirement', "Contract must be in 'active' or 'approved' status")}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className={classes.list} role="list">
                    {linkedProducts.map((product) => {
                      // Find output ports that use this contract
                      const linkedPorts = product.outputPorts?.filter(port => port.contractId === contractId) || [];
                      return (
                        <div
                          key={product.id}
                          role="listitem"
                          className={`${classes.item} ${classes.clickableRow}`}
                          onClick={() => navigate(`${productBasePath}/${product.id}`)}
                        >
                          <div className={classes.itemMain}>
                            {/* The name is the row's link, for the keyboard; the row stays clickable */}
                            <Link className={classes.itemName} to={`${productBasePath}/${product.id}`} onClick={(e) => e.stopPropagation()}>
                              {product.name || t('data-contracts:detailsView.linkedProducts.unnamedProduct', 'Unnamed Product')}
                            </Link>
                            {product.description?.purpose && (
                              <span className={common.muted}>{product.description.purpose}</span>
                            )}
                            <div className={classes.itemLine}>
                              <Badge variant="outline">v{product.version}</Badge>
                              <Badge variant="secondary">{product.status}</Badge>
                            </div>
                            {linkedPorts.length > 0 && (
                              <span className={common.muted}>
                                {t('data-contracts:detailsView.linkedProducts.deliverables', 'Deliverables: {{ports}}', { count: linkedPorts.length, ports: linkedPorts.map(port => `${port.name} (v${port.version})`).join(', ') })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Pane>
            )}

            {/* Quality Rules Section */}
            {shouldShowSection('quality-rules') && (
              <Pane
                title={t('data-contracts:detailsView.qualityRules.title', 'Quality Rules ({{count}})', { count: contract.qualityRules?.length || 0 })}
                actions={canEditInPlace ? (
                  <Button size="sm" onClick={() => { setEditingQualityRuleIndex(null); setIsQualityRuleFormOpen(true); }}>
                    <Plus />
                    {t('data-contracts:details.qualityRules.addRule', 'Add Rule')}
                  </Button>
                ) : undefined}
              >
                <p className={classes.lead}>{t('data-contracts:detailsView.qualityRules.subtitle', 'Data quality checks and validations')}</p>
                {contract.qualityRules && contract.qualityRules.length > 0 ? (
                  <div className={classes.list} role="list">
                    {contract.qualityRules.map((rule, idx) => (
                      <div key={idx} className={classes.item} role="listitem">
                        <div className={classes.itemMain}>
                          <span className={classes.itemName}>{rule.name}</span>
                          <div className={classes.itemLine}>
                            <Badge variant="outline">{rule.dimension}</Badge>
                            <Badge variant="secondary">{rule.severity}</Badge>
                            <span className={common.muted}>{rule.type}</span>
                          </div>
                        </div>
                        {canEditInPlace && (
                          <div className={classes.itemActions}>
                            {rowActions(
                              rule.name || String(idx + 1),
                              () => { setEditingQualityRuleIndex(idx); setIsQualityRuleFormOpen(true); },
                              () => handleDeleteQualityRule(idx),
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={classes.empty}>{t('data-contracts:detailsView.qualityRules.empty', 'No quality rules defined. Click "Add Rule" to create one.')}</p>
                )}
              </Pane>
            )}

            {/* ODCS Team Metadata (read-only provenance) */}
            {shouldShowSection('team-members') && (contract.team?.length || teamMetaName || teamMetaDesc) && (
              <Pane title={t('data-contracts:detailsView.teamMetadata.title', 'ODCS Team Metadata')} collapsible defaultCollapsed>
                <p className={classes.lead}>{t('data-contracts:detailsView.teamMetadata.subtitle', 'Read-only provenance from imported contract YAML. Manage ownership via the Owners panel above.')}</p>
                {/* Team metadata (ODCS v3.1.0) */}
                {(teamMetaName || teamMetaDesc) && (
                  <DetailsGrid
                    rows={[
                      { label: t('data-contracts:detailsView.teamMetadata.teamName', 'Team Name'), value: <span className={classes.prose}>{teamMetaName || '—'}</span> },
                      { label: t('data-contracts:detailsView.teamMetadata.teamDescription', 'Team Description'), value: <span className={classes.prose}>{teamMetaDesc || '—'}</span> },
                    ]}
                  />
                )}

                {/* Team members list (read-only) */}
                {contract.team && contract.team.length > 0 ? (
                  <div className={classes.list} role="list">
                    {contract.team.map((member, idx) => (
                      <div key={idx} className={classes.item} role="listitem">
                        <div className={classes.itemMain}>
                          <div className={classes.itemLine}>
                            <Badge variant="outline">{member.role}</Badge>
                            <span>{member.name || member.username || member.email}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={classes.empty}>{t('data-contracts:detailsView.teamMetadata.noMembers', 'No imported team members.')}</p>
                )}
              </Pane>
            )}

            {/* SLA & Infrastructure Section */}
            {shouldShowSection('sla') && (
              <Pane title={t('data-contracts:detailsView.sla.title', 'SLA & Infrastructure')} collapsible defaultCollapsed>
                <p className={classes.lead}>{t('data-contracts:detailsView.sla.subtitle', 'Service level agreements and server configurations')}</p>
                {/* SLA Requirements */}
                <div className={classes.subsection}>
                  <div className={classes.subhead}>
                    <h3 className={classes.subtitle}>{t('data-contracts:detailsView.sla.requirements', 'SLA Requirements')}</h3>
                    {canEditInPlace && (
                      <Button size="sm" variant="outline" onClick={() => setIsSLAFormOpen(true)}>
                        <Pencil />
                        {t('data-contracts:detailsView.sla.editSla', 'Edit SLA')}
                      </Button>
                    )}
                  </div>
                  {contract.sla && Object.values(contract.sla).some(v => v != null) ? (
                    <DetailsGrid
                      rows={[
                        ...(contract.sla.uptimeTarget != null ? [{ label: t('data-contracts:detailsView.sla.uptimeTarget', 'Uptime Target'), value: `${contract.sla.uptimeTarget}%` }] : []),
                        ...(contract.sla.maxDowntimeMinutes != null ? [{ label: t('data-contracts:detailsView.sla.maxDowntime', 'Max Downtime'), value: t('data-contracts:detailsView.sla.minutesUnit', '{{value}} min', { value: contract.sla.maxDowntimeMinutes }) }] : []),
                        ...(contract.sla.queryResponseTimeMs != null ? [{ label: t('data-contracts:detailsView.sla.queryResponseTime', 'Query Response Time'), value: t('data-contracts:detailsView.sla.msUnit', '{{value}} ms', { value: contract.sla.queryResponseTimeMs }) }] : []),
                        ...(contract.sla.dataFreshnessMinutes != null ? [{ label: t('data-contracts:detailsView.sla.dataFreshness', 'Data Freshness'), value: t('data-contracts:detailsView.sla.minutesUnit', '{{value}} min', { value: contract.sla.dataFreshnessMinutes }) }] : []),
                      ]}
                    />
                  ) : (
                    <p className={classes.empty}>{t('data-contracts:detailsView.sla.noRequirements', 'No SLA requirements defined.')}</p>
                  )}
                </div>

                {/* Server Configurations */}
                <div className={classes.subsection}>
                  <div className={classes.subhead}>
                    <h3 className={classes.subtitle}>{t('data-contracts:detailsView.sla.serverConfigs', 'Server Configurations ({{count}})', { count: serversList.length })}</h3>
                    {canEditInPlace && (
                      <Button size="sm" onClick={() => { setEditingServerIndex(null); setIsServerConfigFormOpen(true); }}>
                        <Plus />
                        {t('data-contracts:detailsView.sla.addServer', 'Add Server')}
                      </Button>
                    )}
                  </div>
                  {serversList.length > 0 ? (
                    <div className={classes.list} role="list">
                      {serversList.map((server, idx) => (
                        <div key={idx} className={classes.item} role="listitem">
                          <div className={classes.itemMain}>
                            <span className={classes.itemName}>{server.server}</span>
                            <div className={classes.itemLine}>
                              <Badge variant="outline">{server.type}</Badge>
                              <Badge variant="secondary">{server.environment}</Badge>
                              {server.host && <span className={`${classes.mono} ${common.muted}`}>{server.host}</span>}
                            </div>
                          </div>
                          {canEditInPlace && (
                            <div className={classes.itemActions}>
                              {rowActions(
                                server.server || String(idx + 1),
                                () => { setEditingServerIndex(idx); setIsServerConfigFormOpen(true); },
                                () => handleDeleteServer(idx),
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={classes.empty}>{t('data-contracts:detailsView.sla.noServers', 'No server configurations defined.')}</p>
                  )}
                </div>
              </Pane>
            )}

            {/* Access Control (read-only for now, can add edit later) */}
            {shouldShowSection('access-control') && contract.accessControl && (
              <Pane title={t('data-contracts:details.accessControl.title', 'Access Control')} collapsible defaultCollapsed>
                <DetailsGrid
                  rows={[
                    ...(contract.accessControl.classification ? [{
                      label: t('data-contracts:detailsView.accessControl.classification', 'Classification'),
                      value: <Badge variant="secondary">{contract.accessControl.classification}</Badge>,
                    }] : []),
                    {
                      label: t('data-contracts:detailsView.accessControl.containsPii', 'Contains PII'),
                      value: contract.accessControl.containsPii ? t('data-contracts:detailsView.common.yes', 'Yes') : t('data-contracts:detailsView.common.no', 'No'),
                    },
                  ]}
                />
              </Pane>
            )}

            {/* Custom Properties */}
            {shouldShowSection('custom-properties') && (
              <Pane
                title={t('data-contracts:detailsView.customProperties.title', 'Custom Properties ({{count}})', { count: customProperties.length })}
                actions={canEditInPlace ? (
                  <Button size="sm" onClick={() => { setEditingCustomPropertyKey(null); setIsCustomPropertyFormOpen(true); }}>
                    <Plus />
                    {t('data-contracts:detailsView.customProperties.addProperty', 'Add Property')}
                  </Button>
                ) : undefined}
              >
                <p className={classes.lead}>{t('data-contracts:detailsView.customProperties.subtitle', 'Additional metadata and configuration')}</p>
                {customProperties.length === 0 ? (
                  <p className={classes.empty}>{t('data-contracts:detailsView.customProperties.empty', 'No custom properties defined. Click "Add Property" to create one.')}</p>
                ) : (
                  // A table, as before: the key, its value and the row's actions under their headers
                  <div className={classes.tableBox}>
                    <table className={classes.propsTable}>
                      <thead>
                        <tr>
                          <th className={classes.keyColumn}>{t('data-contracts:detailsView.customProperties.property', 'Property')}</th>
                          <th>{t('data-contracts:detailsView.customProperties.value', 'Value')}</th>
                          {canEditInPlace && (
                            <th className={classes.actionsColumn}>{t('common:labels.actions', 'Actions')}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {customProperties.map(([key, value]) => {
                          const valueStr = String(value)
                          const isJson = valueStr.startsWith('[') || valueStr.startsWith('{')
                          return (
                            <tr key={key}>
                              <td>
                                <code className={classes.propertyKey}>{key}</code>
                              </td>
                              <td>
                                {isJson ? (
                                  <pre className={classes.json}>
                                    {(() => {
                                      try {
                                        return JSON.stringify(JSON.parse(valueStr), null, 2)
                                      } catch {
                                        return valueStr
                                      }
                                    })()}
                                  </pre>
                                ) : (
                                  <span className={`${common.muted} ${classes.prose}`}>{valueStr}</span>
                                )}
                              </td>
                              {canEditInPlace && (
                                <td>
                                  <div className={classes.cellActions}>
                                    {rowActions(
                                      key,
                                      () => {
                                        setEditingCustomPropertyKey(key)
                                        setIsCustomPropertyFormOpen(true)
                                      },
                                      () => handleDeleteCustomProperty(key),
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Pane>
            )}

            {/* Support Channels (read-only for now) */}
            {shouldShowSection('support') && contract.support && Object.keys(contract.support).length > 0 && (
              <Pane title={t('data-contracts:detailsView.support.title', 'Support')} collapsible defaultCollapsed>
                {/* The channels' names, capitalised as their badges were */}
                <div className={classes.support}>
                  <DetailsGrid
                    rows={Object.entries(contract.support).map(([channel, url]) => ({
                      label: channel,
                      value: url ? (
                        <a href={url} target="_blank" rel="noreferrer" className={classes.url}>{url}</a>
                      ) : (
                        <span className={common.muted}>{t('common:states.notAvailable', 'N/A')}</span>
                      ),
                    }))}
                  />
                </div>
              </Pane>
            )}

            {/* Authoritative Definitions - Contract Level (ODCS) */}
            {shouldShowSection('authoritative-definitions') && (
              <Pane
                title={t('data-contracts:detailsView.authDefs.title', 'Authoritative Definitions')}
                actions={canEditInPlace ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingContractAuthDefIndex(null)
                      setIsContractAuthDefFormOpen(true)
                    }}
                  >
                    <Plus />
                    {t('data-contracts:detailsView.authDefs.addDefinition', 'Add Definition')}
                  </Button>
                ) : undefined}
              >
                <p className={classes.lead}>{t('data-contracts:detailsView.authDefs.subtitle', 'ODCS authoritative sources for this contract ({{count}})', { count: contractAuthDefs.length })}</p>
                {contractAuthDefs.length === 0 ? (
                  <p className={classes.empty}>{t('data-contracts:detailsView.authDefs.noneYet', 'No authoritative definitions defined yet.')}</p>
                ) : (
                  <div className={classes.list} role="list">
                    {contractAuthDefs.map((def, idx) => (
                      <div key={def.id} className={classes.item} role="listitem">
                        <div className={classes.itemMain}>
                          <span><Badge variant="secondary">{def.type}</Badge></span>
                          <a href={def.url} target="_blank" rel="noreferrer" className={classes.url}>{def.url}</a>
                        </div>
                        {canEditInPlace && (
                          <div className={classes.itemActions}>
                            {rowActions(
                              def.url,
                              () => {
                                setEditingContractAuthDefIndex(idx)
                                setIsContractAuthDefFormOpen(true)
                              },
                              () => handleDeleteContractAuthDef(idx),
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Pane>
            )}

            {/* Ownership Panel (with imported ODCS contacts) */}
            {shouldShowSection('metadata-panel') && contract.id && (
              <Pane aria-label={t('business-owners:panel.title', 'Owners')}>
                <OwnershipPanel
                  flush
                  objectType="data_contract"
                  objectId={contract.id}
                  canAssign={canEditInPlace && canWriteOwners}
                  importedContacts={contract.team?.map((m) => ({
                    username: m.username,
                    name: m.name,
                    email: m.email,
                    role: m.role,
                    description: m.description,
                    dateIn: m.dateIn,
                    dateOut: m.dateOut,
                  }))}
                  importedContactsLabel={t('data-contracts:detailsView.panels.importedContacts', 'Imported Contacts')}
                  ownerTeamId={contract.owner_team_id}
                  ownerTeamName={contract.owner_team_name}
                />
              </Pane>
            )}

            {/* Entity Relationships Panel */}
            {shouldShowSection('metadata-panel') && contract.id && (
              <EntityTreePanel
                entityType="DataContract"
                entityId={contract.id}
                title={t('data-contracts:detailsView.panels.relatedEntities', 'Related Entities')}
                canEdit={canEditInPlace && canWriteRelationships}
                pane
              />
            )}

            {/* Metadata Panel */}
            {shouldShowSection('metadata-panel') && contract.id && (
              <Pane aria-label={t('metadata:title', 'Metadata')}>
                <EntityMetadataPanel entityId={contract.id} entityType="data_contract" flush canEdit={canEditPanels} />
              </Pane>
            )}

            {/* Quality Panel */}
            {contract.id && (
              <Pane aria-label={t('metadata:quality.title', 'Data Quality')}>
                <EntityQualityPanel entityId={contract.id} entityType="data_contract" flush canEdit={canEditPanels} />
              </Pane>
            )}
          </PaneStack>
        </div>
      </PageLayout>
      {/* Dialogs */}
      <DataContractBasicFormDialog
        isOpen={isBasicFormOpen}
        onOpenChange={setIsBasicFormOpen}
        initial={{
          name: contract.name,
          version: contract.version,
          status: contract.status,
          owner_team_id: contract.owner_team_id,
          project_id: (contract as any).project_id,
          domain: contract.domainId,
          tenant: contract.tenant,
          descriptionUsage: contract.description?.usage,
          descriptionPurpose: contract.description?.purpose,
          descriptionLimitations: contract.description?.limitations,
          tags: contract.tags || [],
        }}
        onSubmit={handleUpdateMetadata}
      />

      <SchemaFormDialog
        isOpen={isSchemaFormOpen}
        onOpenChange={setIsSchemaFormOpen}
        initial={schemaFormInitial}
        onSubmit={editingSchemaIndex !== null ? handleUpdateSchema : handleAddSchema}
      />

      <QualityRuleFormDialog
        isOpen={isQualityRuleFormOpen}
        onOpenChange={setIsQualityRuleFormOpen}
        initial={editingQualityRuleIndex !== null ? contract.qualityRules?.[editingQualityRuleIndex] : undefined}
        onSubmit={editingQualityRuleIndex !== null ? handleUpdateQualityRule : handleAddQualityRule}
      />

      <TeamMemberFormDialog
        isOpen={isTeamMemberFormOpen}
        onOpenChange={setIsTeamMemberFormOpen}
        initial={editingTeamMemberIndex !== null ? contract.team?.[editingTeamMemberIndex] : undefined}
        onSubmit={editingTeamMemberIndex !== null ? handleUpdateTeamMember : handleAddTeamMember}
      />

      <ServerConfigFormDialog
        isOpen={isServerConfigFormOpen}
        onOpenChange={setIsServerConfigFormOpen}
        initial={editingServerIndex !== null ? serversList[editingServerIndex] : undefined}
        onSubmit={editingServerIndex !== null ? handleUpdateServer : handleAddServer}
      />

      <SLAFormDialog
        isOpen={isSLAFormOpen}
        onOpenChange={setIsSLAFormOpen}
        initial={contract.sla}
        onSubmit={handleUpdateSLA}
      />

      <ConceptSelectDialog
        isOpen={iriDialogOpen}
        onOpenChange={setIriDialogOpen}
        onSelect={addIri}
        mappingSource={
          contractId
            ? {
                entity_type: 'data_contract',
                entity_id: contractId,
                ...(contract?.name ? { name: contract.name } : {}),
              }
            : undefined
        }
      />

      {contract && (
        <CreateVersionDialog
          isOpen={isVersionDialogOpen}
          onOpenChange={setIsVersionDialogOpen}
          currentVersion={contract.version}
          productTitle={contract.name}
          onSubmit={submitNewVersion}
          requireSemver
        />
      )}

      {contract && (
        <RequestContractActionDialog
          isOpen={isRequestDialogOpen}
          onOpenChange={setIsRequestDialogOpen}
          contractId={contractId!}
          contractName={contract.name}
          contractStatus={contract.status}
          onSuccess={() => fetchDetails()}
          canDirectStatusChange={(() => {
            const permLevel = getPermissionLevel('data-contracts')
            return permLevel === FeatureAccessLevel.READ_WRITE ||
                   permLevel === FeatureAccessLevel.ADMIN ||
                   permLevel === FeatureAccessLevel.FULL
          })()}
        />
      )}

      <InferFromCatalogDialog
        isOpen={isInferFromCatalogOpen}
        onOpenChange={setIsInferFromCatalogOpen}
        onInfer={handleInferFromCatalog}
      />

      <InferFromAssetDialog
        isOpen={isInferFromAssetOpen}
        onOpenChange={setIsInferFromAssetOpen}
        onInfer={handleInferFromAsset}
      />

      {contract && (
        <CreateFromContractDialog
          isOpen={isCreateProductDialogOpen}
          onOpenChange={setIsCreateProductDialogOpen}
          contractId={contractId!}
          contractName={contract.name}
          onSuccess={(productId) => {
            fetchLinkedProducts()
            navigate(`${productBasePath}/${productId}`)
          }}
        />
      )}

      {/* DQX Profiling Dialogs */}
      <DqxSchemaSelectDialog
        isOpen={isDqxSchemaSelectOpen}
        onOpenChange={setIsDqxSchemaSelectOpen}
        contract={contract}
        onConfirm={handleStartProfiling}
      />

      {selectedProfileRunId && (
        <DqxSuggestionsDialog
          isOpen={isDqxSuggestionsOpen}
          onOpenChange={setIsDqxSuggestionsOpen}
          contractId={contractId!}
          contract={contract}
          profileRunId={selectedProfileRunId}
          onSuccess={handleSuggestionsSuccess}
        />
      )}

      <AuthoritativeDefinitionFormDialog
        isOpen={isContractAuthDefFormOpen}
        onOpenChange={setIsContractAuthDefFormOpen}
        initial={editingContractAuthDefIndex !== null ? contractAuthDefs[editingContractAuthDefIndex] : undefined}
        onSubmit={editingContractAuthDefIndex !== null ? handleUpdateContractAuthDef : handleAddContractAuthDef}
        level="contract"
      />

      <AuthoritativeDefinitionFormDialog
        isOpen={isSchemaAuthDefFormOpen}
        onOpenChange={setIsSchemaAuthDefFormOpen}
        initial={editingSchemaAuthDef !== null && activeSchemaIdForAuthDef ? schemaAuthDefs[editingSchemaAuthDef.schemaId]?.[editingSchemaAuthDef.index] : undefined}
        onSubmit={editingSchemaAuthDef !== null ? handleUpdateSchemaAuthDef : handleAddSchemaAuthDef}
        level="schema"
      />

      <AuthoritativeDefinitionFormDialog
        isOpen={isPropertyAuthDefFormOpen}
        onOpenChange={setIsPropertyAuthDefFormOpen}
        initial={editingPropertyAuthDef !== null && _activePropertyForAuthDef ? propertyAuthDefs[editingPropertyAuthDef.propertyId]?.[editingPropertyAuthDef.index] : undefined}
        onSubmit={editingPropertyAuthDef !== null ? handleUpdatePropertyAuthDef : handleAddPropertyAuthDef}
        level="property"
      />


      {/* Link Product to Contract Dialog */}
      <LinkProductToContractDialog
        isOpen={isLinkProductDialogOpen}
        onOpenChange={setIsLinkProductDialogOpen}
        contractId={contractId!}
        contractName={contract?.name || t('data-contracts:detailsView.common.thisContract', 'this contract')}
        onSuccess={() => {
          fetchLinkedProducts();
          setIsLinkProductDialogOpen(false);
          toast({
            title: t('data-contracts:detailsView.toast.contractLinkedTitle', 'Contract Linked'),
            description: t('data-contracts:detailsView.toast.contractLinkedDesc', 'Contract successfully linked to product deliverable.')
          });
        }}
      />

      <VersioningRecommendationDialog
        isOpen={isVersioningDialogOpen}
        onOpenChange={setIsVersioningDialogOpen}
        analysis={versioningAnalysis}
        userCanOverride={versioningUserCanOverride}
        onUpdateInPlace={handleVersioningUpdateInPlace}
        onCreateNewVersion={handleVersioningCreateNewVersion}
      />

      <CustomPropertyFormDialog
        isOpen={isCustomPropertyFormOpen}
        onOpenChange={setIsCustomPropertyFormOpen}
        initial={editingCustomPropertyKey && contract?.customProperties ? {
          property: editingCustomPropertyKey,
          value: String(contract.customProperties[editingCustomPropertyKey] || '')
        } : undefined}
        existingKeys={Object.keys(contract?.customProperties || {})}
        onSubmit={editingCustomPropertyKey ? handleUpdateCustomProperty : handleAddCustomProperty}
      />

      {/* Commit Draft Dialog */}
      <CommitDraftDialog
        isOpen={isCommitDraftDialogOpen}
        onOpenChange={setIsCommitDraftDialogOpen}
        contractId={contractId!}
        contractName={contract?.name || t('data-contracts:detailsView.common.thisContract', 'this contract')}
        onSuccess={handleCommitSuccess}
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
  )
}

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ActionIcon, Collapse, Loader, Select, UnstyledButton } from '@mantine/core'
import {
  ChevronDown,
  ChevronRight,
  Columns2,
  Database,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Link2,
  Package,
  Plus,
  Shapes,
  Table,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { badgeToneStyle, type StatusTone } from '@/components/common/aura-status'
import { SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form'
import { Dialog } from '@/mantine/page'
import panel from '@/components/common/panel.module.css'
import form from '@/components/common/dialog-form.module.css'
import classes from './linked-objects-panel.module.css'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/hooks/use-toast'
import { useKnowledgeGraphStore } from '@/stores/knowledge-graph-store'

interface SemanticLink {
  id: string
  entity_id: string
  entity_type: string
  iri: string
  label?: string
  // Optional chain hint: when an asset link resolves *through* a data
  // contract or data product, the backend may point it at that parent so we
  // can render it as a nested child row. Absent for direct concept->asset
  // links, which stay at the top level.
  parent_entity_id?: string
}

interface EnrichedSemanticLink extends SemanticLink {
  entity_name?: string
}

interface LinkedObjectsPanelProps {
  conceptIri: string
  conceptLabel: string
  canAssign: boolean
  onChanged?: () => void
  // When set, the linked-objects list scrolls internally past this row
  // count instead of growing the page (rows are ~32px high).
  maxVisibleRows?: number
}

const ENTITY_ICONS: Record<string, typeof FileText> = {
  data_contract: FileText,
  data_product: Package,
  asset: Database,
  data_domain: Globe,
  uc_catalog: Folder,
  uc_schema: FolderOpen,
  uc_table: Table,
  uc_column: Columns2,
  data_contract_schema: Shapes,
  data_contract_property: Columns2,
}

// Each entity type's Aura tone (wave 2 Task 15; were Tailwind colours, the
// same vocabulary as NodeLinksPanel's relationshipColors)
const ENTITY_TYPE_TONES: Record<string, StatusTone> = {
  data_product: 'emerald',
  data_contract: 'info',
  asset: 'accent',
  data_domain: 'cyan',
  uc_catalog: 'gold',
  uc_schema: 'gold',
  uc_table: 'warning',
  uc_column: 'warning',
  data_contract_schema: 'accent',
  data_contract_property: 'accent',
}

const iconFor = (entityType: string) => ENTITY_ICONS[entityType] ?? FileText

const formatEntityType = (entityType: string) =>
  entityType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function LinkedObjectsPanel({
  conceptIri,
  conceptLabel,
  canAssign,
  onChanged,
  maxVisibleRows,
}: LinkedObjectsPanelProps) {
  const ROW_HEIGHT_PX = 32
  const listMaxHeight = maxVisibleRows
    ? { maxHeight: ROW_HEIGHT_PX * maxVisibleRows }
    : undefined
  const { get, post, delete: deleteLink } = useApi()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { t } = useTranslation(['search', 'common', 'semantic-models'])
  const bumpKnowledgeGraphRefresh = useKnowledgeGraphStore((s) => s.bumpRefreshNonce)

  const [links, setLinks] = useState<EnrichedSemanticLink[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(true)
  const titleId = useId()
  const bodyId = useId()
  const addButtonRef = useRef<HTMLButtonElement>(null)
  // Where focus goes once the remove confirm has closed: its opener (the
  // row's Remove) by default; Add, once the row has gone with its link
  const removeReturnRef = useRef<HTMLElement | null>(null)

  // Assign dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedEntityType, setSelectedEntityType] = useState('')
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [availableEntities, setAvailableEntities] = useState<any[]>([])

  // Single-link removal confirm dialog: holds the link awaiting confirmation.
  const [linkPendingRemoval, setLinkPendingRemoval] = useState<EnrichedSemanticLink | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  const enrichLinks = useCallback(
    async (raw: SemanticLink[]): Promise<EnrichedSemanticLink[]> => {
      const enriched: EnrichedSemanticLink[] = []
      for (const link of raw) {
        try {
          let endpoint = ''
          let entityName: string | undefined = link.entity_id

          switch (link.entity_type) {
            case 'data_product':
              endpoint = `/api/data-products/${link.entity_id}`
              break
            case 'data_contract':
              endpoint = `/api/data-contracts/${link.entity_id}`
              break
            case 'asset':
              endpoint = `/api/assets/${link.entity_id}`
              break
            case 'data_domain':
              endpoint = `/api/data-domains/${link.entity_id}`
              break
            case 'data_contract_schema': {
              const [contractId, schemaName] = String(link.entity_id).split('#')
              if (contractId) {
                const contractRes = await get<any>(`/api/data-contracts/${contractId}`)
                const title =
                  contractRes.data?.name || contractRes.data?.info?.title || contractId
                entityName = `${title}#${schemaName || ''}`.trim()
              }
              enriched.push({ ...link, entity_name: entityName })
              continue
            }
            case 'data_contract_property': {
              const [contractId, schemaName, propertyName] = String(link.entity_id).split('#')
              if (contractId) {
                const contractRes = await get<any>(`/api/data-contracts/${contractId}`)
                const title =
                  contractRes.data?.name || contractRes.data?.info?.title || contractId
                entityName = `${title}#${schemaName || ''}.${propertyName || ''}`.trim()
              }
              enriched.push({ ...link, entity_name: entityName })
              continue
            }
            case 'uc_catalog':
            case 'uc_schema':
            case 'uc_table':
            case 'uc_column':
              // entity_id is already the human-readable full name
              enriched.push({ ...link, entity_name: link.entity_id })
              continue
            default:
              enriched.push({ ...link, entity_name: link.entity_id })
              continue
          }

          if (endpoint) {
            const entityRes = await get<any>(endpoint)
            if (entityRes.data && !entityRes.error) {
              entityName =
                entityRes.data.name ||
                entityRes.data.info?.title ||
                entityRes.data.title ||
                link.entity_id
            }
          }
          enriched.push({ ...link, entity_name: entityName })
        } catch (error) {
          console.error('LinkedObjectsPanel: failed to enrich link', link, error)
          enriched.push({ ...link, entity_name: link.entity_id })
        }
      }
      return enriched
    },
    [get]
  )

  // Each load's turn: an answer for a concept the page has moved on from is dropped
  const loadSeq = useRef(0)
  const fetchLinks = useCallback(async () => {
    const seq = ++loadSeq.current
    if (!conceptIri) {
      setLinks([])
      return
    }
    setIsLoading(true)
    try {
      // Query-param form (``?iri=``) is required: IRIs containing ``//`` (e.g.
      // ``https://...#Invoice``) get their ``%2F%2F`` collapsed by the Apps
      // proxy on the path form, which 301s to a mangled path and returns [].
      const res = await get<SemanticLink[]>(
        `/api/semantic-links/by-iri?iri=${encodeURIComponent(conceptIri)}`
      )
      const raw = Array.isArray(res.data) ? res.data : []
      const enriched = await enrichLinks(raw)
      if (seq !== loadSeq.current) return
      setLinks(enriched)
    } catch (error) {
      console.error('LinkedObjectsPanel: failed to load links', error)
      if (seq === loadSeq.current) setLinks([])
    } finally {
      if (seq === loadSeq.current) setIsLoading(false)
    }
  }, [conceptIri, get, enrichLinks])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  const loadEntitiesForType = useCallback(
    async (entityType: string) => {
      try {
        if (entityType === 'asset') {
          // /api/assets returns a PaginatedAssetSummary { items, total, ... }
          const res = await get<{ items: any[] }>('/api/assets?limit=500')
          setAvailableEntities(Array.isArray(res.data?.items) ? res.data.items : [])
          return
        }

        let endpoint = ''
        switch (entityType) {
          case 'data_product':
            endpoint = '/api/data-products'
            break
          case 'data_contract':
            endpoint = '/api/data-contracts'
            break
          default:
            setAvailableEntities([])
            return
        }
        const res = await get<any[]>(endpoint)
        setAvailableEntities(Array.isArray(res.data) ? res.data : [])
      } catch (error) {
        console.error('LinkedObjectsPanel: failed to load entities for', entityType, error)
        setAvailableEntities([])
      }
    },
    [get]
  )

  const handleEntityTypeChange = (entityType: string) => {
    setSelectedEntityType(entityType)
    setSelectedEntityId('')
    loadEntitiesForType(entityType)
  }

  const getEntityTypeLabel = (entityType: string): string => {
    switch (entityType) {
      case 'data_product':
        return t('search:concepts.assignDialog.dataProduct')
      case 'data_contract':
        return t('search:concepts.assignDialog.dataContract')
      case 'asset':
        return t('search:concepts.assignDialog.asset', { defaultValue: 'Asset' })
      case 'data_domain':
        return t('search:concepts.assignDialog.dataDomain')
      case 'uc_catalog':
        return t('search:concepts.assignDialog.ucCatalog')
      case 'uc_schema':
        return t('search:concepts.assignDialog.ucSchema')
      case 'uc_table':
        return t('search:concepts.assignDialog.ucTable')
      default:
        return formatEntityType(entityType)
    }
  }

  const navigateToEntity = (link: EnrichedSemanticLink) => {
    switch (link.entity_type) {
      case 'data_product':
        // A link's entity_id is the product's real id (the "Link asset" action
        // stores the resolved id). Navigate straight to its detail page.
        navigate(`/data-products/${link.entity_id}`)
        return
      case 'data_contract':
        navigate(`/data-contracts/${link.entity_id}`)
        return
      case 'data_contract_schema':
      case 'data_contract_property': {
        // entity_id is {contractId}#{schema}[#{property}] — navigate to the
        // parent contract (the schema/property live inside it).
        const contractId = String(link.entity_id).split('#')[0]
        navigate(`/data-contracts/${contractId}`)
        return
      }
      case 'asset':
        navigate(`/assets/${link.entity_id}`)
        return
      case 'data_domain':
        navigate(`/settings/data-domains/${link.entity_id}`)
        return
      case 'uc_catalog':
      case 'uc_schema':
      case 'uc_table':
      case 'uc_column': {
        // Deep-link into catalog-commander. The route accepts a ?table=<fqn>
        // param (see navigateToTable in catalog-commander.tsx) that expands the
        // catalog/schema and pre-selects the table. It needs a full
        // catalog.schema.table FQN (>=3 parts); for a column FQN
        // (catalog.schema.table.column) we pass just the table portion so the
        // parent table is selected. Catalog/schema-level links have no table to
        // pre-select, so they open the browser root.
        const fqn = String(link.entity_id)
        const parts = fqn.split('.')
        let tableParam: string | null = null
        if (link.entity_type === 'uc_table' && parts.length >= 3) {
          tableParam = fqn
        } else if (link.entity_type === 'uc_column' && parts.length >= 4) {
          tableParam = parts.slice(0, 3).join('.')
        }
        navigate(
          tableParam
            ? `/catalog-commander?table=${encodeURIComponent(tableParam)}`
            : '/catalog-commander',
        )
        const ucLabel =
          link.entity_type === 'uc_catalog'
            ? t('search:concepts.linkedUCCatalog')
            : link.entity_type === 'uc_schema'
              ? t('search:concepts.linkedUCSchema')
              : link.entity_type === 'uc_column'
                ? t('search:concepts.linkedUCColumn')
                : t('search:concepts.linkedUCTable')
        toast({ title: ucLabel, description: link.entity_name || link.entity_id })
        return
      }
      default:
        toast({
          title: t('common:toast.error'),
          description: t('search:concepts.messages.navigationError', {
            entityType: link.entity_type,
          }),
          variant: 'destructive',
        })
    }
  }

  const completeAssignment = async (
    entityType: string,
    _entityId: string,
    successDescriptionId: string
  ) => {
    bumpKnowledgeGraphRefresh('semantic-link-mutated')
    onChanged?.()
    await fetchLinks()
    toast({
      title: t('common:toast.success'),
      description: t('search:concepts.messages.linkedSuccess', {
        label: conceptLabel,
        entityType: getEntityTypeLabel(entityType),
        entityId: successDescriptionId,
      }),
    })
  }

  const handleAssignToObject = async () => {
    if (!conceptIri || !selectedEntityType || !selectedEntityId) {
      toast({
        title: t('common:toast.error'),
        description: t('search:concepts.messages.assignError'),
        variant: 'destructive',
      })
      return
    }
    try {
      const res = await post('/api/semantic-links/', {
        entity_id: selectedEntityId,
        entity_type: selectedEntityType,
        iri: conceptIri,
      })
      if (res.error) throw new Error(res.error)

      setAssignDialogOpen(false)
      const finishedType = selectedEntityType
      const finishedId = selectedEntityId
      setSelectedEntityType('')
      setSelectedEntityId('')
      await completeAssignment(finishedType, finishedId, finishedId)
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error?.message || t('search:concepts.messages.assignFailed'),
        variant: 'destructive',
      })
    }
  }

  const handleRemoveLink = async () => {
    const link = linkPendingRemoval
    if (!link) return
    setIsRemoving(true)
    try {
      const res = await deleteLink(`/api/semantic-links/${link.id}`)
      if (res.error) throw new Error(res.error)

      // The row (and its Remove) goes with the link: focus goes to Add
      removeReturnRef.current = addButtonRef.current
      setLinkPendingRemoval(null)
      bumpKnowledgeGraphRefresh('semantic-link-mutated')
      onChanged?.()
      await fetchLinks()
      toast({
        title: t('common:toast.success'),
        description: t('semantic-models:linkedObjects.removed', {
          label: link.entity_name || link.entity_id,
          defaultValue: 'Removed link to "{{label}}".',
        }),
      })
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description:
          error?.message ||
          t('semantic-models:linkedObjects.removeFailed', {
            defaultValue: 'Failed to remove link.',
          }),
        variant: 'destructive',
      })
    } finally {
      setIsRemoving(false)
    }
  }

  // One flat list, but assets that resolve *through* a linked contract or
  // product are nested as indented child rows under that parent (chain:
  // concept -> contract/product -> asset). Links without a resolvable parent
  // stay at the top level (direct concept -> asset). Data fetching is
  // untouched; this only reorders/indents what fetchLinks already produced.
  const orderedLinks = (() => {
    const byId = new Map(links.map((l) => [l.entity_id, l]))
    const children = new Map<string, EnrichedSemanticLink[]>()
    const roots: EnrichedSemanticLink[] = []
    for (const link of links) {
      const parentId = link.parent_entity_id
      if (parentId && byId.has(parentId) && parentId !== link.entity_id) {
        const bucket = children.get(parentId) ?? []
        bucket.push(link)
        children.set(parentId, bucket)
      } else {
        roots.push(link)
      }
    }
    const out: Array<{ link: EnrichedSemanticLink; depth: number }> = []
    for (const root of roots) {
      out.push({ link: root, depth: 0 })
      for (const child of children.get(root.entity_id) ?? []) {
        out.push({ link: child, depth: 1 })
      }
    }
    return out
  })()

  // Aligned columns: [icon] name … [type chip] [Open] [remove]. The name cell
  // flexes; the trailing cells keep a fixed footprint so every row lines up.
  const renderLinkRow = (link: EnrichedSemanticLink, depth = 0) => {
    const Icon = iconFor(link.entity_type)
    const typeLabel = getEntityTypeLabel(link.entity_type)
    const tone = ENTITY_TYPE_TONES[link.entity_type] ?? 'neutral'
    return (
      <div
        key={link.id}
        data-testid={`linked-object-${link.id}`}
        data-depth={depth}
        className={classes.row}
      >
        <Icon className={classes.icon} aria-hidden />
        <UnstyledButton
          className={classes.name}
          onClick={() => navigateToEntity(link)}
          title={`${typeLabel}: ${link.entity_name || link.entity_id} • ${link.iri}`}
        >
          {link.entity_name || link.entity_id}
        </UnstyledButton>
        <Badge variant="outline" className={classes.type} style={badgeToneStyle(tone)}>
          {typeLabel}
        </Badge>
        <UnstyledButton
          className={classes.open}
          onClick={() => navigateToEntity(link)}
          aria-label={t('semantic-models:linkedObjects.open', {
            defaultValue: 'Open',
          })}
        >
          {t('semantic-models:linkedObjects.open', { defaultValue: 'Open' })}
          <ExternalLink aria-hidden />
        </UnstyledButton>
        {canAssign ? (
          <ActionIcon
            variant="subtle"
            color="gray"
            size={24}
            data-testid={`linked-object-remove-${link.id}`}
            aria-label={t('semantic-models:linkedObjects.removeAria', {
              defaultValue: 'Remove linked entity',
            })}
            className={classes.remove}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              removeReturnRef.current = null
              setLinkPendingRemoval(link)
            }}
          >
            <Trash2 size={14} />
          </ActionIcon>
        ) : (
          <span className={classes.spacer} aria-hidden="true" />
        )}
      </div>
    )
  }

  const typeOptions = [
    { value: 'data_product', label: t('search:concepts.assignDialog.dataProduct') },
    { value: 'data_contract', label: t('search:concepts.assignDialog.dataContract') },
    { value: 'asset', label: t('search:concepts.assignDialog.asset', { defaultValue: 'Asset' }) },
  ]
  // One option per entity; an asset's type shows after its name
  const entityOptions = uniqueOptions(
    availableEntities
      .filter((entity) => entity?.id != null)
      .map((entity) => ({
        value: String(entity.id),
        label: String(entity.name || entity.info?.title || entity.title || entity.id),
        sub: selectedEntityType === 'asset' && entity.asset_type_name ? String(entity.asset_type_name) : null,
      })),
  )
  const subLabels = new Map(entityOptions.map((o) => [o.value, o.sub]))

  const closeAssign = () => setAssignDialogOpen(false)

  return (
    <>
      <div className={panel.pane} data-flush aria-labelledby={titleId}>
        <div className={panel.head}>
          <h3 id={titleId} className={panel.title}>
            <UnstyledButton
              className={classes.fold}
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
              <Link2 aria-hidden />
              {t('semantic-models:linkedObjects.title', {
                defaultValue: 'Linked Entities',
              })}
              <Badge variant="secondary">{links.length}</Badge>
            </UnstyledButton>
          </h3>
          {canAssign && (
            <div className={panel.actions}>
              <Button
                ref={addButtonRef}
                variant="ghost"
                size="sm"
                data-testid="linked-objects-assign-button"
                onClick={() => setAssignDialogOpen(true)}
              >
                <Plus aria-hidden />
                {t('common:actions.add')}
              </Button>
            </div>
          )}
        </div>

        <Collapse in={open} id={bodyId} transitionDuration={0}>
          <div
            className={classes.list}
            data-capped={maxVisibleRows ? '' : undefined}
            style={listMaxHeight}
            data-testid="linked-objects-list"
          >
            {isLoading && links.length === 0 ? (
              <p className={classes.state}>
                <Loader size={12} color="currentColor" />
                {t('semantic-models:linkedObjects.loading', {
                  defaultValue: 'Loading linked entities...',
                })}
              </p>
            ) : links.length === 0 ? (
              <p className={classes.state}>
                {t('semantic-models:linkedObjects.empty', {
                  defaultValue: 'No entities linked to this concept.',
                })}
              </p>
            ) : (
              orderedLinks.map(({ link, depth }) => renderLinkRow(link, depth))
            )}
          </div>
        </Collapse>
      </div>

      {/* Assign dialog */}
      <Dialog
        opened={assignDialogOpen}
        onClose={closeAssign}
        size="sm"
        title={t('search:concepts.assignDialog.title')}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeAssign}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleAssignToObject}
              disabled={!selectedEntityType || !selectedEntityId}
              data-testid="linked-objects-assign-confirm"
            >
              {t('common:actions.assign')}
            </Button>
          </>
        }
      >
        <div className={form.form}>
          <div className={classes.concept}>
            <p className={classes.conceptLabel}>{conceptLabel}</p>
            <p className={classes.conceptIri}>{conceptIri}</p>
          </div>

          <Select
            label={t('search:concepts.assignDialog.entityType')}
            placeholder={t('search:concepts.assignDialog.selectEntityType')}
            data={typeOptions}
            value={selectedEntityType || null}
            onChange={(value) => value && handleEntityTypeChange(value)}
            allowDeselect={false}
            classNames={SELECT_CLASSES}
          />

          {selectedEntityType && (
            <Select
              label={getEntityTypeLabel(selectedEntityType)}
              placeholder={t('search:concepts.assignDialog.selectEntity', {
                entityType: getEntityTypeLabel(selectedEntityType),
              })}
              data={entityOptions.map(({ value, label }) => ({ value, label }))}
              value={selectedEntityId || null}
              onChange={(value) => setSelectedEntityId(value ?? '')}
              allowDeselect={false}
              maxDropdownHeight={288}
              classNames={SELECT_CLASSES}
              renderOption={({ option }) => {
                const sub = subLabels.get(option.value)
                return (
                  <span className={classes.optionLine}>
                    <span>{option.label}</span>
                    {sub && <span className={classes.optionSub}>· {sub}</span>}
                  </span>
                )
              }}
            />
          )}
        </div>
      </Dialog>

      {/* Remove-link confirm dialog */}
      <Dialog
        opened={linkPendingRemoval !== null}
        onClose={() => {
          if (!isRemoving) setLinkPendingRemoval(null)
        }}
        size="sm"
        role="alertdialog"
        returnFocusTo={removeReturnRef}
        title={t('semantic-models:linkedObjects.removeConfirmTitle', {
          defaultValue: 'Remove this link?',
        })}
        description={t('semantic-models:linkedObjects.removeConfirmBody', {
          label: linkPendingRemoval?.entity_name || linkPendingRemoval?.entity_id,
          defaultValue:
            'This unlinks "{{label}}" from this concept. It does not delete the entity itself.',
        })}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isRemoving}
              onClick={() => setLinkPendingRemoval(null)}
            >
              {t('common:actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="linked-object-remove-confirm-button"
              disabled={isRemoving}
              // Keeps the dialog open until the request resolves, so an error
              // toast shows without it closing underneath
              onClick={() => void handleRemoveLink()}
            >
              {isRemoving && <Loader size={12} color="currentColor" />}
              {t('common:actions.remove', { defaultValue: 'Remove' })}
            </Button>
          </>
        }
      />
    </>
  )
}

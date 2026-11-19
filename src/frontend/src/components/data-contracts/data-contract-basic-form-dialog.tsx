import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Loader, Select, TextInput, Textarea } from '@mantine/core'
import { Button } from '@/components/ui/button'
import DomainMultiSelector from '@/components/ui/domain-multi-selector'
import { useToast } from '@/hooks/use-toast'
import { Dialog } from '@/mantine/page'
import type { DataContractCreate } from '@/types/data-contract'
import type { TeamSummary } from '@/types/team'
import TagSelector from '@/components/ui/tag-selector'
import type { AssignedTag } from '@/components/ui/tag-chip'
import { useProjectContext } from '@/stores/project-store'
import { FormMoreDetails } from '@/components/common/form-more-details'
import classes from './data-contract-basic-form-dialog.module.css'

type BasicFormProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: DataContractCreate) => Promise<void>
  initial?: {
    name?: string
    version?: string
    status?: string
    owner_team_id?: string
    project_id?: string
    domain?: string
    domainIds?: string[]
    primaryDomainId?: string | null
    tenant?: string
    descriptionUsage?: string
    descriptionPurpose?: string
    descriptionLimitations?: string
    tags?: (string | AssignedTag)[]
  }
}

// The lifecycle statuses of a contract (src.models.lifecycle). Certification
// is a separate field, and an existing contract's status changes only through
// Change Status.
const statuses = ['draft', 'proposed', 'under_review', 'approved', 'active', 'deprecated', 'retired']

/** The owner team's and project's "None": sent as no team or project. */
const NONE = '__none__'

/** One option per value, first one kept: Mantine's Select throws on a repeated value. */
const unique = (options: { value: string; label: string }[]) =>
  options.filter((o, i) => options.findIndex((p) => p.value === o.value) === i)

// Hints sit under their field
const HINT_BELOW = ['label', 'input', 'description', 'error'] as ('label' | 'input' | 'description' | 'error')[]
const FIELD_CLASSES = { label: classes.label, description: classes.hint }
const SELECT_CLASSES = { ...FIELD_CLASSES, option: classes.option }

export default function DataContractBasicFormDialog({ isOpen, onOpenChange, onSubmit, initial }: BasicFormProps) {
  const { t } = useTranslation(['data-contracts', 'common'])
  const { toast } = useToast()
  const { currentProject, availableProjects, fetchUserProjects, isLoading: projectsLoading } = useProjectContext()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const isEdit = Boolean(initial)
  // Creating shows only what a new contract needs; the rest sits behind "Add details"
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [version, setVersion] = useState('0.0.1')
  const [status, setStatus] = useState('draft')
  const [ownerTeamId, setOwnerTeamId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [domainIds, setDomainIds] = useState<string[]>([])
  const [primaryDomainId, setPrimaryDomainId] = useState<string | null>(null)
  const [tenant, setTenant] = useState('')
  const [descriptionUsage, setDescriptionUsage] = useState('')
  const [descriptionPurpose, setDescriptionPurpose] = useState('')
  const [descriptionLimitations, setDescriptionLimitations] = useState('')
  const [tags, setTags] = useState<(string | AssignedTag)[]>([])

  // Teams state
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)

  // Track initial form values to detect changes
  const [initialFormValues, setInitialFormValues] = useState<any>(null)

  // Fetch teams and projects when dialog opens
  useEffect(() => {
    if (!isOpen) return
    // A close (or a reopen) drops the answer of the load before it
    let live = true
    setTeamsLoading(true)
    fetch('/api/teams/summary')
      .then(res => res.json())
      .then(data => { if (live) setTeams(Array.isArray(data) ? data : []) })
      .catch(err => {
        console.error('Failed to fetch teams:', err)
        if (live) setTeams([])
      })
      .finally(() => { if (live) setTeamsLoading(false) })

    // Fetch user projects
    fetchUserProjects()
    return () => { live = false }
  }, [isOpen, fetchUserProjects])

  // Initialize form state when dialog opens or initial data changes
  // Only reset state when dialog opens, not when currentProject changes mid-edit
  useEffect(() => {
    if (!isOpen) return; // Don't reset if dialog is closed
    setDetailsOpen(false)
    
    const initValues = initial ? {
      name: initial.name || '',
      version: initial.version || '0.0.1',
      status: initial.status || 'draft',
      ownerTeamId: initial.owner_team_id || '',
      projectId: initial.project_id || '',
      domainIds: initial.domainIds || (initial.domain ? [initial.domain] : []),
      primaryDomainId: initial.primaryDomainId ?? initial.domain ?? null,
      tenant: initial.tenant || '',
      descriptionUsage: initial.descriptionUsage || '',
      descriptionPurpose: initial.descriptionPurpose || '',
      descriptionLimitations: initial.descriptionLimitations || '',
      tags: initial.tags || [],
    } : {
      name: '',
      version: '0.0.1',
      status: 'draft',
      ownerTeamId: '',
      projectId: currentProject?.id || '',
      domainIds: [],
      primaryDomainId: null,
      tenant: '',
      descriptionUsage: '',
      descriptionPurpose: '',
      descriptionLimitations: '',
      tags: [],
    }
    
    setName(initValues.name)
    setVersion(initValues.version)
    setStatus(initValues.status)
    setOwnerTeamId(initValues.ownerTeamId)
    setProjectId(initValues.projectId)
    setDomainIds(initValues.domainIds)
    setPrimaryDomainId(initValues.primaryDomainId)
    setTenant(initValues.tenant)
    setDescriptionUsage(initValues.descriptionUsage)
    setDescriptionPurpose(initValues.descriptionPurpose)
    setDescriptionLimitations(initValues.descriptionLimitations)
    setTags(initValues.tags)
    setInitialFormValues(initValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Check if form has been modified
  const isFormDirty = useMemo(() => {
    if (!initialFormValues) return false
    
    // Normalize tags for comparison
    const normalizeTag = (tag: any) => typeof tag === 'string' ? tag : (tag.fully_qualified_name || tag.tag_id || tag.tag_name || tag)
    const currentTagsNormalized = tags.map(normalizeTag).sort().join(',')
    const initialTagsNormalized = initialFormValues.tags.map(normalizeTag).sort().join(',')
    
    return (
      name !== initialFormValues.name ||
      version !== initialFormValues.version ||
      status !== initialFormValues.status ||
      ownerTeamId !== initialFormValues.ownerTeamId ||
      projectId !== initialFormValues.projectId ||
      domainIds.join(',') !== (initialFormValues.domainIds || []).join(',') ||
      (primaryDomainId || '') !== (initialFormValues.primaryDomainId || '') ||
      tenant !== initialFormValues.tenant ||
      descriptionUsage !== initialFormValues.descriptionUsage ||
      descriptionPurpose !== initialFormValues.descriptionPurpose ||
      descriptionLimitations !== initialFormValues.descriptionLimitations ||
      currentTagsNormalized !== initialTagsNormalized
    )
  }, [initialFormValues, name, version, status, ownerTeamId, projectId, domainIds, primaryDomainId, tenant, descriptionUsage, descriptionPurpose, descriptionLimitations, tags])

  const handleCloseAttempt = () => {
    if (isFormDirty && !isSubmitting) {
      setShowDiscardConfirm(true)
    } else {
      onOpenChange(false)
    }
  }

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false)
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    // Validate required fields
    if (!name || !name.trim()) {
      toast({ title: t('data-contracts:form.validationErrorTitle', 'Validation Error'), description: t('data-contracts:form.nameRequired', 'Contract name is required'), variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    try {
      // Normalize tags to FQNs (strings) for backend compatibility
      // Use fully_qualified_name so backend can look up existing tags by FQN
      const normalizedTags = tags.map((tag: any) => {
        if (typeof tag === 'string') return tag;
        // Prefer fully_qualified_name for existing tags, fallback to tag_id object
        return tag.fully_qualified_name || { tag_id: tag.tag_id, assigned_value: tag.assigned_value };
      });

      const payload: DataContractCreate = {
        name: name.trim(),
        version: version.trim() || '0.0.1',
        status: status || 'draft',
        owner_team_id: ownerTeamId && ownerTeamId !== NONE ? ownerTeamId : undefined,
        project_id: projectId && projectId !== NONE ? projectId : undefined,
        kind: 'DataContract',
        apiVersion: 'v3.1.0',
        domainIds: domainIds,
        primaryDomainId: primaryDomainId,
        tenant: tenant.trim() || undefined,
        tags: normalizedTags.length > 0 ? normalizedTags as any : undefined,
        description: {
          usage: descriptionUsage.trim() || undefined,
          purpose: descriptionPurpose.trim() || undefined,
          limitations: descriptionLimitations.trim() || undefined,
        },
      }

      await onSubmit(payload)
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: t('data-contracts:messages.error', 'Error'),
        description: error?.message || t('data-contracts:form.saveError', 'Failed to save contract'),
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const statusOptions = useMemo(
    () => (statuses.includes(status) ? statuses : [status, ...statuses])
      .map((s) => ({ value: s, label: t(`data-contracts:status.${s}`, s) })),
    [status, t],
  )
  const teamOptions = useMemo(
    () => unique([
      { value: NONE, label: t('common:states.none', 'None') },
      ...teams.map((team) => ({ value: team.id, label: team.name })),
    ]),
    [teams, t],
  )
  const projectOptions = useMemo(
    () => unique([
      { value: NONE, label: t('common:states.none', 'None') },
      ...(Array.isArray(availableProjects) ? availableProjects : []).map((project) => ({
        value: project.id,
        label: t('data-contracts:basicForm.projectOption', '{{name}} ({{count}} teams)', { name: project.name, count: project.team_count }),
      })),
    ]),
    [availableProjects, t],
  )

  // The fields beyond what a new contract needs: behind "Add details" when creating, always shown when editing
  const detailsFields = (
    <>
      <div className={classes.row}>
        <TextInput
          id="version"
          label={t('data-contracts:form.version', 'Version')}
          value={version}
          onChange={(e) => setVersion(e.currentTarget.value)}
          placeholder="0.0.1"
          classNames={FIELD_CLASSES}
        />
        <Select
          id="status"
          label={t('data-contracts:form.status', 'Status')}
          data={statusOptions}
          value={status}
          onChange={(value) => value && setStatus(value)}
          allowDeselect={false}
          disabled={isEdit}
          description={isEdit ? t('data-contracts:form.statusChangeHint') : undefined}
          inputWrapperOrder={HINT_BELOW}
          classNames={SELECT_CLASSES}
        />
      </div>

      <Select
        id="projectId"
        label={t('data-contracts:form.project', 'Project')}
        placeholder={t('data-contracts:basicForm.selectProjectOptional', 'Select a project (optional)')}
        data={projectOptions}
        value={projectId || NONE}
        onChange={(value) => value && setProjectId(value === NONE ? '' : value)}
        allowDeselect={false}
        disabled={projectsLoading}
        description={t('data-contracts:basicForm.projectHint', 'You can only select projects you are a member of')}
        inputWrapperOrder={HINT_BELOW}
        classNames={SELECT_CLASSES}
      />

      <TextInput
        id="tenant"
        label={t('data-contracts:form.tenant', 'Tenant')}
        value={tenant}
        onChange={(e) => setTenant(e.currentTarget.value)}
        placeholder={t('data-contracts:basicForm.tenantPlaceholder', 'e.g., retail-demo')}
        classNames={FIELD_CLASSES}
      />

      <Textarea
        id="descriptionUsage"
        label={t('data-contracts:basicForm.usage', 'Usage')}
        value={descriptionUsage}
        onChange={(e) => setDescriptionUsage(e.currentTarget.value)}
        placeholder={t('data-contracts:basicForm.usagePlaceholder', 'How should this data be used?')}
        autosize
        minRows={2}
        maxRows={8}
        classNames={FIELD_CLASSES}
      />
      <Textarea
        id="descriptionLimitations"
        label={t('data-contracts:basicForm.limitations', 'Limitations')}
        value={descriptionLimitations}
        onChange={(e) => setDescriptionLimitations(e.currentTarget.value)}
        placeholder={t('data-contracts:basicForm.limitationsPlaceholder', 'What are the limitations or restrictions?')}
        autosize
        minRows={2}
        maxRows={8}
        classNames={FIELD_CLASSES}
      />

      <section className={classes.section}>
        <Input.Wrapper
          label={t('data-contracts:form.tags', 'Tags')}
          labelElement="div"
          description={t('data-contracts:basicForm.tagsHint', 'Add tags to categorize and organize this data contract')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        >
          <TagSelector
            value={tags}
            onChange={setTags}
            placeholder={t('data-contracts:basicForm.tagsPlaceholder', 'Search and select tags for this data contract...')}
            allowCreate={true}
          />
        </Input.Wrapper>
      </section>
    </>
  )

  return (
    <>
      <Dialog
        opened={isOpen}
        onClose={handleCloseAttempt}
        size="lg"
        title={initial ? t('data-contracts:basicForm.editTitle', 'Edit Contract Metadata') : t('data-contracts:basicForm.createTitle', 'Create Data Contract')}
        description={initial
          ? t('data-contracts:basicForm.editDescription', 'Update the core metadata for this data contract.')
          : t('data-contracts:basicForm.createDescription', 'Name it, choose the team that owns it and say what it is for. Schemas and quality rules come after it exists.')}
        footer={
          <>
            <Button variant="outline" onClick={handleCloseAttempt} disabled={isSubmitting}>
              {t('common:actions.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader size={12} color="currentColor" />}
              {isSubmitting ? t('data-contracts:form.saving', 'Saving...') : initial ? t('common:actions.saveChanges', 'Save Changes') : t('data-contracts:form.createContract', 'Create Contract')}
            </Button>
          </>
        }
      >
        <div className={classes.form}>
          <TextInput
            id="name"
            label={t('data-contracts:form.name', 'Name')}
            withAsterisk
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder={t('data-contracts:basicForm.namePlaceholder', 'e.g., Customer Data Contract')}
            classNames={FIELD_CLASSES}
            data-autofocus
          />

          <Select
            id="ownerTeamId"
            label={t('data-contracts:form.ownerTeam', 'Owner Team')}
            placeholder={t('data-contracts:basicForm.selectOwnerTeamOptional', 'Select an owner team (optional)')}
            data={teamOptions}
            value={ownerTeamId || NONE}
            onChange={(value) => value && setOwnerTeamId(value === NONE ? '' : value)}
            allowDeselect={false}
            disabled={teamsLoading}
            classNames={SELECT_CLASSES}
          />

          <Input.Wrapper label={t('data-contracts:form.domains', 'Domains')} labelElement="div" classNames={FIELD_CLASSES}>
            <DomainMultiSelector
              value={domainIds}
              primaryDomainId={primaryDomainId}
              onChange={(nextIds, nextPrimary) => {
                setDomainIds(nextIds)
                setPrimaryDomainId(nextPrimary)
              }}
              placeholder={t('data-contracts:form.selectDomainsOptional', 'Select domains (optional)')}
            />
          </Input.Wrapper>

          <Textarea
            id="descriptionPurpose"
            label={t('data-contracts:basicForm.purpose', 'Purpose')}
            value={descriptionPurpose}
            onChange={(e) => setDescriptionPurpose(e.currentTarget.value)}
            placeholder={t('data-contracts:basicForm.purposePlaceholder', 'What is the purpose of this data contract?')}
            autosize
            minRows={2}
            maxRows={8}
            classNames={FIELD_CLASSES}
          />

          {isEdit ? detailsFields : (
            <FormMoreDetails
              opened={detailsOpen}
              onToggle={() => setDetailsOpen((o) => !o)}
              label={t('data-contracts:basicForm.addDetails', 'Add details')}
              summary={t('data-contracts:basicForm.detailsSummary', 'Starts as {{status}}, version {{version}}. Project, tenant, usage, limitations and tags are optional.', {
                status: statusOptions.find((o) => o.value === status)?.label ?? status,
                version,
              })}
            >
              {detailsFields}
            </FormMoreDetails>
          )}
        </div>
      </Dialog>

      <Dialog
        role="alertdialog"
        size="sm"
        opened={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        title={t('common:confirmations.discardChanges', 'Discard unsaved changes?')}
        description={t('data-contracts:basicForm.discardDescription', 'You have unsaved changes that will be lost if you close this dialog. Are you sure you want to discard them?')}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowDiscardConfirm(false)}>
              {t('data-contracts:basicForm.continueEditing', 'Continue Editing')}
            </Button>
            <Button onClick={handleConfirmDiscard}>{t('data-contracts:basicForm.discardChanges', 'Discard Changes')}</Button>
          </>
        }
      />
    </>
  )
}

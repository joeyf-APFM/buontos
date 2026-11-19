import { useState, useEffect, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Input, Loader, Select, TextInput, Textarea } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Dialog } from '@/mantine/page';
import { ConsumerPrincipal, DataProduct, DataProductStatus } from '@/types/data-product';
import DomainMultiSelector from '@/components/ui/domain-multi-selector';
import { useTeams } from '@/hooks/use-teams';
import TagSelector from '@/components/ui/tag-selector';
import { ConsumerGroupsPicker } from '@/components/data-products/consumer-groups-picker';
import { useProjectContext } from '@/stores/project-store';
import { apiErrorOf, statusChangeErrorText } from '@/lib/status-change-error';
import { FormMoreDetails } from '@/components/common/form-more-details';
import classes from './data-product-create-dialog.module.css';

/**
 * ODPS v1.0.0 Data Product Creation Dialog
 *
 * Lightweight dialog for creating the essential product information.
 * Complex nested entities (ports, team, support) are edited in the details view.
 */

const productTypes = ['source', 'source-aligned', 'aggregate', 'consumer-aligned', 'sink'] as const;

// Schema factory so zod validation messages can be translated. The message
// strings are the only i18n-dependent part; the shape (and thus the inferred
// FormData type) is identical regardless of the passed t().
const buildDataProductCreateSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t('data-products:createDialog.validation.nameRequired')),
  version: z.string().min(1, t('data-products:createDialog.validation.versionRequired')),
  status: z.string().min(1, t('data-products:createDialog.validation.statusRequired')),
  productType: z.enum(productTypes).optional(),
  ownerTeamId: z.string().optional(),
  projectId: z.string().optional(),
  domain_ids: z.array(z.string()).optional(),
  primary_domain_id: z.string().nullable().optional(),
  tenant: z.string().optional(),
  purpose: z.string().optional(),
  limitations: z.string().optional(),
  usage: z.string().optional(),
  tags: z.array(z.union([z.string(), z.any()])).optional(),
  consumer_principals: z
    .array(z.object({ type: z.string(), value: z.string() }))
    .optional(),
});

type FormData = z.infer<ReturnType<typeof buildDataProductCreateSchema>>;

/** The project field's "None": sent as no project. */
const NO_PROJECT = '__none__';

/** One option per value, first one kept: Mantine's Select throws on a repeated value. */
const unique = (options: { value: string; label: string; disabled?: boolean }[]) =>
  options.filter((o, i) => options.findIndex((p) => p.value === o.value) === i);

const productTypeLabel = (type: string) => type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

interface DataProductCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (product: DataProduct) => void;
  product?: DataProduct;
  mode?: 'create' | 'edit';
}

export default function DataProductCreateDialog({
  open,
  onOpenChange,
  onSuccess,
  product,
  mode = 'create',
}: DataProductCreateDialogProps) {
  const { t } = useTranslation(['data-products', 'common']);
  const { toast } = useToast();
  const { teams, loading: teamsLoading } = useTeams();
  const { currentProject, availableProjects, isLoading: projectsLoading, fetchUserProjects } = useProjectContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Creating shows only what a new product needs; the rest sits behind "Add details"
  const [detailsOpen, setDetailsOpen] = useState(false);
  const formId = useId();

  const dataProductCreateSchema = useMemo(() => buildDataProductCreateSchema(t), [t]);

  const form = useForm<FormData>({
    resolver: zodResolver(dataProductCreateSchema),
    defaultValues: {
      name: '',
      version: '0.0.1',
      status: DataProductStatus.DRAFT,
      productType: undefined,
      ownerTeamId: '',
      projectId: '',
      domain_ids: [],
      primary_domain_id: null,
      tenant: '',
      purpose: '',
      limitations: '',
      usage: '',
      tags: [],
      consumer_principals: [],
    },
  });

  // Fetch user projects when dialog opens
  useEffect(() => {
    if (open) {
      fetchUserProjects();
    }
  }, [open, fetchUserProjects]);

  // Reset or populate form when dialog opens
  useEffect(() => {
    if (open) {
      setDetailsOpen(false);
      if (mode === 'edit' && product) {
        // Populate form with existing product data
        const productType = product.customProperties?.find(p => p.property === 'productType')?.value as any;
        form.reset({
          name: product.name || '',
          version: product.version || '0.0.1',
          status: product.status || DataProductStatus.DRAFT,
          productType: productType || undefined,
          ownerTeamId: product.owner_team_id || '',
          projectId: product.project_id || '',
          domain_ids: product.domain_ids || [],
          primary_domain_id: product.primary_domain_id ?? null,
          tenant: product.tenant || '',
          purpose: product.description?.purpose || '',
          limitations: product.description?.limitations || '',
          usage: product.description?.usage || '',
          tags: product.tags || [],
          consumer_principals: product.consumer_principals || [],
        });
      } else {
        // Reset to defaults for create mode, default to current project
        form.reset({
          name: '',
          version: '0.0.1',
          status: DataProductStatus.DRAFT,
          productType: undefined,
          ownerTeamId: '',
          projectId: currentProject?.id || '',
          domain_ids: [],
          primary_domain_id: null,
          tenant: '',
          purpose: '',
          limitations: '',
          usage: '',
          tags: [],
          consumer_principals: [],
        });
      }
    }
  }, [open, mode, product, form, currentProject]);

  // Read during render, so react-hook-form tracks it from the first change
  // (read only in the handler, it stayed false and the confirm never opened)
  const { isDirty } = form.formState;

  const handleCloseAttempt = () => {
    // Check if form has been modified
    if (isDirty && !isSubmitting) {
      setShowDiscardConfirm(true);
    } else {
      onOpenChange(false);
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    onOpenChange(false);
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      // Get selected team name
      const selectedTeam = teams.find(t => t.id === data.ownerTeamId);

      if (mode === 'edit' && product) {
        // Edit mode - prepare update payload
        // Normalize tags to FQNs (strings) for backend compatibility
        // Use fully_qualified_name so backend can look up existing tags by FQN
        const normalizedTags = (data.tags || []).map((tag: any) => {
          if (typeof tag === 'string') return tag;
          // Prefer fully_qualified_name for existing tags, fallback to tag_id object
          return tag.fully_qualified_name || { tag_id: tag.tag_id, assigned_value: tag.assigned_value };
        });

        const updateData: Partial<DataProduct> = {
          ...product,
          name: data.name,
          version: data.version,
          status: data.status,
          domain_ids: data.domain_ids || [],
          primary_domain_id: data.primary_domain_id ?? null,
          tenant: data.tenant || undefined,
          owner_team_id: data.ownerTeamId || undefined,
          project_id: data.projectId || undefined,
          tags: normalizedTags, // Use normalized tags from form
          consumer_principals: data.consumer_principals || [],
          description: {
            purpose: data.purpose || undefined,
            limitations: data.limitations || undefined,
            usage: data.usage || undefined,
          },
          // Update team reference if owner changed
          team: selectedTeam ? {
            name: selectedTeam.name,
            description: selectedTeam.description,
            members: product.team?.members || [],
          } : product.team,
          // Update productType in customProperties
          customProperties: [
            ...(product.customProperties?.filter(p => p.property !== 'productType') || []),
            ...(data.productType ? [{
              property: 'productType',
              value: data.productType,
              description: 'Type of data product in the value chain',
            }] : []),
          ],
        };

        const response = await fetch(`/api/data-products/${product.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(statusChangeErrorText(
            apiErrorOf(body, t('data-products:form.updateError')), t, 'data-products',
          ));
        }

        const updatedProduct: DataProduct = await response.json();

        toast({
          title: t('common:toast.success'),
          description: t('data-products:form.updateSuccess'),
        });

        onSuccess(updatedProduct);
      } else {
        // Create mode - construct new product
        // Normalize tags to FQNs (strings) for backend compatibility
        // Use fully_qualified_name so backend can look up existing tags by FQN
        const normalizedTags = (data.tags || []).map((tag: any) => {
          if (typeof tag === 'string') return tag;
          // Prefer fully_qualified_name for existing tags, fallback to tag_id object
          return tag.fully_qualified_name || { tag_id: tag.tag_id, assigned_value: tag.assigned_value };
        });

        const productData: Partial<DataProduct> = {
          apiVersion: 'v1.0.0',
          kind: 'DataProduct',
          name: data.name,
          version: data.version,
          status: data.status,
          domain_ids: data.domain_ids || [],
          primary_domain_id: data.primary_domain_id ?? null,
          tenant: data.tenant || undefined,
          owner_team_id: data.ownerTeamId || undefined,
          project_id: data.projectId || undefined,
          tags: normalizedTags.length > 0 ? normalizedTags : undefined,
          consumer_principals: (data.consumer_principals && data.consumer_principals.length > 0)
            ? data.consumer_principals
            : undefined,
          description: {
            purpose: data.purpose || undefined,
            limitations: data.limitations || undefined,
            usage: data.usage || undefined,
          },
          // Set team from selected team
          team: selectedTeam ? {
            name: selectedTeam.name,
            description: selectedTeam.description,
            members: [],
          } : undefined,
          // Initialize empty arrays for complex entities
          inputPorts: [],
          outputPorts: [],
          managementPorts: [],
          support: [],
          authoritativeDefinitions: [],
          customProperties: data.productType ? [{
            property: 'productType',
            value: data.productType,
            description: 'Type of data product in the value chain',
          }] : [],
        };

        const response = await fetch('/api/data-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(productData),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(statusChangeErrorText(
            apiErrorOf(body, t('data-products:form.createError')), t, 'data-products',
          ));
        }

        const createdProduct: DataProduct = await response.json();

        toast({
          title: t('common:toast.success'),
          description: t('data-products:createDialog.messages.createSuccessDesc'),
        });

        onSuccess(createdProduct);
      }

      onOpenChange(false);
    } catch (error: any) {
      console.error("Error", mode === 'edit' ? 'updating' : 'creating', "data product:", error);
      toast({
        title: t('common:toast.error'),
        description: error.message || (mode === 'edit' ? t('data-products:form.updateError') : t('data-products:form.createError')),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };


  const statusOptions = useMemo(
    () => Object.values(DataProductStatus).map((status) => ({
      value: status,
      label: t(`data-products:status.${status}`, status.charAt(0).toUpperCase() + status.slice(1)),
    })),
    [t],
  );
  const typeOptions = useMemo(() => productTypes.map((type) => ({ value: type, label: productTypeLabel(type) })), []);
  const teamOptions = useMemo(() => unique(teams.map((team) => ({ value: team.id, label: team.name }))), [teams]);
  const projectOptions = useMemo(
    () => unique([
      { value: NO_PROJECT, label: t('common:states.none') },
      ...availableProjects.map((project) => ({
        value: project.id,
        label: t('data-products:createDialog.projectOption', { name: project.name, count: project.team_count }),
      })),
    ]),
    [availableProjects, t],
  );

  const { errors } = form.formState;
  const isEdit = mode === 'edit';
  // An error in a hidden field must not stay hidden
  const hiddenFieldError = Boolean(errors.version || errors.status);
  useEffect(() => {
    if (hiddenFieldError) setDetailsOpen(true);
  }, [hiddenFieldError]);
  const fieldClassNames = { label: classes.label, error: classes.error, description: classes.hint };
  const selectClassNames = { ...fieldClassNames, option: classes.option };
  // Hints sit under their field, as before
  const hintBelow = ['label', 'input', 'description', 'error'] as ('label' | 'input' | 'description' | 'error')[];

  // The fields beyond what a new product needs: behind "Add details" when creating, always shown when editing
  const detailsFields = (
    <>
      <div className={classes.row}>
        <TextInput
          id="version"
          {...form.register('version')}
          label={t('data-products:form.version')}
          withAsterisk
          placeholder={t('data-products:createDialog.versionPlaceholder')}
          error={errors.version?.message}
          classNames={fieldClassNames}
        />

        <Select
          id="status"
          label={t('data-products:form.status')}
          withAsterisk
          data={statusOptions}
          value={form.watch('status')}
          onChange={(value) => value && form.setValue('status', value, { shouldDirty: true })}
          allowDeselect={false}
          disabled={mode === 'edit'}
          description={mode === 'edit' ? t('data-products:form.statusChangeHint') : undefined}
          inputWrapperOrder={hintBelow}
          error={errors.status?.message}
          classNames={selectClassNames}
        />
      </div>

      <Select
        id="productType"
        label={t('data-products:createDialog.productTypeLabel')}
        placeholder={t('data-products:createDialog.productTypePlaceholder')}
        data={typeOptions}
        value={form.watch('productType') ?? null}
        onChange={(value) => value && form.setValue('productType', value as FormData['productType'], { shouldDirty: true })}
        allowDeselect={false}
        description={t('data-products:createDialog.productTypeHint')}
        inputWrapperOrder={hintBelow}
        classNames={selectClassNames}
      />

      <Select
        id="projectId"
        label={t('data-products:createDialog.projectLabel')}
        placeholder={t('data-products:createDialog.selectProjectPlaceholder')}
        data={projectOptions}
        value={form.watch('projectId') || NO_PROJECT}
        onChange={(value) => value && form.setValue('projectId', value === NO_PROJECT ? '' : value, { shouldDirty: true })}
        allowDeselect={false}
        disabled={projectsLoading}
        description={t('data-products:createDialog.projectMemberHint')}
        inputWrapperOrder={hintBelow}
        classNames={selectClassNames}
      />

      <TextInput
        id="tenant"
        {...form.register('tenant')}
        label={t('data-products:createDialog.tenantLabel')}
        placeholder={t('data-products:createDialog.tenantPlaceholder')}
        classNames={fieldClassNames}
      />

    <Textarea
      id="limitations"
      {...form.register('limitations')}
      label={t('data-products:createDialog.limitationsLabel')}
      placeholder={t('data-products:createDialog.limitationsPlaceholder')}
      autosize
      minRows={2}
      maxRows={8}
      classNames={fieldClassNames}
    />

    <Textarea
      id="usage"
      {...form.register('usage')}
      label={t('data-products:form.usage')}
      placeholder={t('data-products:createDialog.usagePlaceholder')}
      autosize
      minRows={2}
      maxRows={8}
      classNames={fieldClassNames}
    />

      {/* Tags Section */}
      <section className={classes.section}>
        <Input.Wrapper
          label={t('data-products:form.tags')}
          labelElement="div"
          description={t('data-products:createDialog.tagsHint')}
          inputWrapperOrder={hintBelow}
          classNames={fieldClassNames}
        >
          <Controller
            name="tags"
            control={form.control}
            render={({ field }) => (
              <TagSelector
                value={field.value || []}
                onChange={field.onChange}
                placeholder={t('data-products:createDialog.tagsPlaceholder')}
                allowCreate={true}
              />
            )}
          />
        </Input.Wrapper>
      </section>

      {/* Consumer Groups Section */}
      <section className={classes.section}>
        <Input.Wrapper
          label={t('data-products:createDialog.consumerGroupsLabel')}
          labelElement="div"
          description={
            <>
              {t('data-products:form.sections.consumerGroupsDescriptionPart1')}<code className={classes.code}>{'{'}type: "group", value: "..."{'}'}</code>{t('data-products:form.sections.consumerGroupsDescriptionPart2')}<code className={classes.code}>${'{'}entity.consumer_principals{'}'}</code>.
            </>
          }
          classNames={fieldClassNames}
        >
          <Controller
            name="consumer_principals"
            control={form.control}
            render={({ field }) => (
              <ConsumerGroupsPicker
                value={field.value || []}
                onChange={(next: ConsumerPrincipal[]) => field.onChange(next)}
              />
            )}
          />
        </Input.Wrapper>
      </section>
    </>
  );

  return (
    <>
      <Dialog
        opened={open}
        onClose={handleCloseAttempt}
        // A click outside asks first too, as the Radix dialog's did
        closeOnClickOutside
        size="lg"
        title={mode === 'edit' ? t('data-products:createDialog.editTitle') : t('data-products:createDialog.createTitle')}
        description={mode === 'edit'
          ? t('data-products:createDialog.editDescription')
          : t('data-products:createDialog.createDescription')}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseAttempt}
              disabled={isSubmitting}
            >
              {t('common:actions.cancel')}
            </Button>
            {/* In the footer, outside the form: it submits the form by its id */}
            <Button type="submit" form={formId} disabled={isSubmitting}>
              {isSubmitting && <Loader size={12} color="currentColor" />}
              {mode === 'edit' ? t('common:actions.saveChanges') : t('data-products:createDialog.createProductButton')}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className={classes.form}>
          {/* Required Fields */}
          <TextInput
            id="name"
            {...form.register('name')}
            label={t('data-products:createDialog.productNameLabel')}
            withAsterisk
            placeholder={t('data-products:createDialog.productNamePlaceholder')}
            error={errors.name?.message}
            classNames={fieldClassNames}
            data-autofocus
          />

          <Select
            id="ownerTeamId"
            label={t('data-products:form.ownerTeam')}
            placeholder={teamsLoading
              ? t('data-products:createDialog.loadingTeams')
              : t('data-products:createDialog.selectTeamPlaceholder')}
            data={teamsLoading ? [] : teamOptions}
            value={form.watch('ownerTeamId') || null}
            onChange={(value) => value && form.setValue('ownerTeamId', value, { shouldDirty: true })}
            allowDeselect={false}
            disabled={teamsLoading}
            description={t('data-products:createDialog.ownerTeamHint')}
            inputWrapperOrder={hintBelow}
            classNames={selectClassNames}
          />

          <Input.Wrapper
            label={t('data-products:createDialog.domainsLabel')}
            labelElement="div"
            classNames={fieldClassNames}
          >
            <DomainMultiSelector
              value={form.watch('domain_ids') || []}
              primaryDomainId={form.watch('primary_domain_id')}
              onChange={(domainIds, primaryDomainId) => {
                form.setValue('domain_ids', domainIds, { shouldDirty: true });
                form.setValue('primary_domain_id', primaryDomainId, { shouldDirty: true });
              }}
              placeholder={t('data-products:createDialog.domainsPlaceholder')}
            />
          </Input.Wrapper>

          <Textarea
            id="purpose"
            {...form.register('purpose')}
            label={t('data-products:form.purpose')}
            placeholder={t('data-products:createDialog.purposePlaceholder')}
            autosize
            minRows={2}
            maxRows={8}
            classNames={fieldClassNames}
          />

          {isEdit ? detailsFields : (
            <FormMoreDetails
              opened={detailsOpen}
              onToggle={() => setDetailsOpen((o) => !o)}
              label={t('data-products:createDialog.addDetails')}
              summary={t('data-products:createDialog.detailsSummary', {
                status: statusOptions.find((o) => o.value === form.watch('status'))?.label ?? form.watch('status'),
                version: form.watch('version'),
              })}
            >
              {detailsFields}
            </FormMoreDetails>
          )}
        </form>
      </Dialog>

      <Dialog
        role="alertdialog"
        size="sm"
        opened={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        title={t('common:confirmations.discardChanges')}
        description={t('data-products:createDialog.discardDescription')}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowDiscardConfirm(false)}>
              {t('data-products:createDialog.continueEditing')}
            </Button>
            <Button onClick={handleConfirmDiscard}>{t('data-products:createDialog.discardChanges')}</Button>
          </>
        }
      />
    </>
  );
}

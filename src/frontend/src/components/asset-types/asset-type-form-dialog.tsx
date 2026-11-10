import { useState, useEffect, useId, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader, Select, TextInput, Textarea } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { AssetTypeRead, AssetTypeCategory, AssetTypeStatus } from '@/types/asset';
import { Dialog } from '@/mantine/page';
import classes from './asset-type-form-dialog.module.css';

const CATEGORIES: AssetTypeCategory[] = ['data', 'analytics', 'integration', 'system', 'custom'];
const STATUSES: AssetTypeStatus[] = ['active', 'deprecated'];
/** The category field's "No category": sent as no category at all. */
const NO_CATEGORY = 'none';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.string().optional(),
  icon: z.string().optional(),
  status: z.enum(['active', 'deprecated']),
});

type FormData = z.infer<typeof formSchema>;

interface AssetTypeFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  assetType?: AssetTypeRead | null;
  onSubmitSuccess: () => void;
  /**
   * Called once the dialog has closed and its exit transition has ended: the
   * caller then puts focus where it belongs (such as the row menu's button
   * it was opened from, which may have been re-rendered by then). It gets the
   * dialog's content element, so the caller can tell focus left in the closed
   * dialog from focus the user moved elsewhere. Without it, focus goes back to
   * what had it when the dialog opened.
   */
  onExited?: (content: HTMLElement | null) => void;
}

/** One option per value, first one kept: Mantine's Select throws on a repeated value. */
const unique = (options: { value: string; label: string }[]) =>
  options.filter((o, i) => options.findIndex((p) => p.value === o.value) === i);

export function AssetTypeFormDialog({
  isOpen, onOpenChange, assetType, onSubmitSuccess, onExited,
}: AssetTypeFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { post: apiPost, put: apiPut } = useApi();
  const { toast } = useToast();
  const { t } = useTranslation(['asset-types', 'common']);
  const formId = useId();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', description: '', category: NO_CATEGORY, icon: '', status: 'active' },
  });

  useEffect(() => {
    if (isOpen) {
      if (assetType) {
        form.reset({
          name: assetType.name,
          description: assetType.description || '',
          category: assetType.category || NO_CATEGORY,
          icon: assetType.icon || '',
          status: assetType.status,
        });
      } else {
        form.reset({ name: '', description: '', category: NO_CATEGORY, icon: '', status: 'active' });
      }
    }
  }, [isOpen, assetType, form]);

  // A saved category the list doesn't know still shows, by its value
  const savedCategory = assetType?.category;
  const categoryOptions = useMemo(
    () => unique([
      { value: NO_CATEGORY, label: t('form.noCategory') },
      ...CATEGORIES.map((cat) => ({ value: cat, label: t(`categories.${cat}`) })),
      ...(savedCategory ? [{ value: savedCategory, label: savedCategory }] : []),
    ]),
    [t, savedCategory],
  );
  const statusOptions = useMemo(
    () => STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) })),
    [t],
  );

  const handleSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      const payload = {
        name: data.name,
        description: data.description || undefined,
        category: data.category === NO_CATEGORY ? undefined : data.category,
        icon: data.icon || undefined,
        status: data.status,
      };

      const response = assetType
        ? await apiPut<AssetTypeRead>(`/api/asset-types/${assetType.id}`, payload)
        : await apiPost<AssetTypeRead>('/api/asset-types', payload);

      if (response.error) throw new Error(response.error);

      toast({
        title: assetType ? t('form.toasts.updated') : t('form.toasts.created'),
        description: assetType
          ? t('form.toasts.updatedDescription', { name: data.name })
          : t('form.toasts.createdDescription', { name: data.name }),
      });

      onSubmitSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: assetType ? t('form.toasts.updateFailed') : t('form.toasts.createFailed'),
        description: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const { errors } = form.formState;
  const fieldClassNames = { label: classes.label, error: classes.error };
  const selectClassNames = { ...fieldClassNames, option: classes.option };

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      title={assetType ? t('form.editTitle') : t('form.createTitle')}
      description={assetType ? t('form.editDescription') : t('form.createDescription')}
      onExited={onExited}
      // As before (Mantine's default on the Modal): a click outside closes it
      closeOnClickOutside
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          {/* In the footer, outside the form: it submits the form by its id */}
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {isSubmitting && <Loader size={12} color="currentColor" />}
            {assetType ? t('form.update') : t('form.create')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={form.handleSubmit(handleSubmit)} className={classes.form}>
        <TextInput
          {...form.register('name')}
          label={t('table.name')}
          placeholder={t('form.placeholders.name')}
          error={errors.name?.message}
          classNames={fieldClassNames}
          data-autofocus
        />

        <Textarea
          {...form.register('description')}
          label={t('table.description')}
          placeholder={t('form.placeholders.description')}
          error={errors.description?.message}
          classNames={fieldClassNames}
          autosize
          minRows={3}
          maxRows={12}
        />

        <Controller
          control={form.control}
          name="category"
          render={({ field, fieldState }) => (
            <Select
              ref={field.ref}
              name={field.name}
              label={t('table.category')}
              placeholder={t('form.placeholders.category')}
              data={categoryOptions}
              value={field.value ?? NO_CATEGORY}
              onChange={(value) => field.onChange(value ?? NO_CATEGORY)}
              onBlur={field.onBlur}
              allowDeselect={false}
              error={fieldState.error?.message}
              classNames={selectClassNames}
            />
          )}
        />

        <TextInput
          {...form.register('icon')}
          label={t('form.labels.icon')}
          placeholder={t('form.placeholders.icon')}
          error={errors.icon?.message}
          classNames={fieldClassNames}
        />

        <Controller
          control={form.control}
          name="status"
          render={({ field, fieldState }) => (
            <Select
              ref={field.ref}
              name={field.name}
              label={t('table.status')}
              data={statusOptions}
              value={field.value}
              onChange={(value) => value && field.onChange(value)}
              onBlur={field.onBlur}
              allowDeselect={false}
              error={fieldState.error?.message}
              classNames={selectClassNames}
            />
          )}
        />
      </form>
    </Dialog>
  );
}

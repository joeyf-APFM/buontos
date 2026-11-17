import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Input, Loader, Textarea } from '@mantine/core';
import { FileCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { MdmCreateReviewRequest, MdmCreateReviewResponse } from '@/types/mdm';
import { PrincipalPicker } from '@/components/common/principal-picker';
import { useOpenSession } from './use-open-session';
import classes from './mdm-dialogs.module.css';

type FormValues = {
  reviewer_email: string;
  notes?: string;
};

interface CreateReviewDialogProps {
  isOpen: boolean;
  runId: string;
  candidateCount: number;
  onClose: () => void;
  onSuccess: (reviewId: string) => void;
}

const FORM_ID = 'mdm-create-review-form';

/** The form: the dialog's body, so its fields start afresh each time it opens. */
function ReviewForm({ candidateCount, onSave }: { candidateCount: number; onSave: (data: MdmCreateReviewRequest) => void }) {
  const { t } = useTranslation(['mdm', 'common']);

  const formSchema = useMemo(
    () =>
      z.object({
        reviewer_email: z.string().email(t('mdm:review.emailRequired')),
        notes: z.string().optional(),
      }),
    [t]
  );

  const { control, register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reviewer_email: '',
      notes: '',
    },
  });
  const error = formState.errors.reviewer_email?.message;

  const submit = handleSubmit((values) =>
    onSave({
      reviewer_email: values.reviewer_email,
      notes: values.notes || undefined,
    })
  );

  return (
    <form id={FORM_ID} onSubmit={submit} className={form.form} noValidate>
      <div className={form.box}>
        <p className={form.muted}>
          {t('mdm:review.willCreatePrefix')}{' '}
          <span className={classes.count}>{candidateCount}</span>{' '}
          {t('mdm:review.willCreateSuffix')}
        </p>
      </div>

      <Input.Wrapper id="reviewer_email" label={t('common:labels.reviewer')} error={error} classNames={FIELD_CLASSES}>
        <Controller
          name="reviewer_email"
          control={control}
          render={({ field }) => (
            <PrincipalPicker
              id="reviewer_email"
              accepts={['user']}
              value={field.value || null}
              onChange={(next) => field.onChange(next ?? '')}
              placeholder={t('mdm:review.reviewerPlaceholder')}
              aria-label={t('common:labels.reviewer')}
            />
          )}
        />
      </Input.Wrapper>

      <Textarea
        id="notes"
        label={t('mdm:review.notesLabel')}
        placeholder={t('mdm:review.notesPlaceholder')}
        autosize
        minRows={3}
        maxRows={8}
        classNames={FIELD_CLASSES}
        {...register('notes')}
      />
    </form>
  );
}

export default function CreateReviewDialog({
  isOpen,
  runId,
  candidateCount,
  onClose,
  onSuccess,
}: CreateReviewDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  // A second click, or a click on the way out, sends nothing
  const busy = useRef(false);
  const session = useOpenSession(isOpen);

  const { t } = useTranslation(['mdm', 'common']);
  const { post } = useApi();
  const { toast } = useToast();

  const save = async (data: MdmCreateReviewRequest) => {
    if (busy.current || !isOpen) return;
    busy.current = true;
    setSubmitting(true);
    try {
      const response = await post<MdmCreateReviewResponse>(
        `/api/mdm/runs/${runId}/create-review`,
        data
      );

      // Check for errors first (useApi returns empty object on error, not null)
      if (response.error) {
        toast({
          title: t('common:status.error'),
          description: response.error,
          variant: 'destructive',
        });
        return;
      }

      // Verify we have a valid review_id before navigating
      if (response.data && response.data.review_id) {
        toast({
          title: t('common:status.success'),
          description: t('mdm:review.createdWithCount', { count: response.data.candidate_count }),
        });
        onSuccess(response.data.review_id);
      } else {
        toast({
          title: t('common:status.error'),
          description: t('mdm:review.noReviewId'),
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: t('common:status.error'),
        description: err.message || t('mdm:review.createFailed'),
        variant: 'destructive',
      });
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  // Escape and Cancel wait while the request is out
  const close = () => {
    if (busy.current) return;
    onClose();
  };

  return (
    <Dialog
      opened={isOpen}
      onClose={close}
      size="sm"
      title={
        <span className={form.titleLine}>
          <FileCheck size={16} aria-hidden />
          {t('mdm:review.dialogTitle')}
        </span>
      }
      description={t('mdm:review.dialogDescription')}
      footer={
        <>
          <Button type="button" variant="outline" onClick={close} disabled={submitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={submitting}>
            {submitting && <Loader size={12} color="currentColor" />}
            {t('mdm:candidates.createReview')}
          </Button>
        </>
      }
    >
      <ReviewForm key={session} candidateCount={candidateCount} onSave={save} />
    </Dialog>
  );
}

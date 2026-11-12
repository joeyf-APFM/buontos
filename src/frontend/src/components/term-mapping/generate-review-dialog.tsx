import { useEffect, useState, type RefObject } from 'react';
import { Alert, Checkbox, Loader, TextInput, Textarea } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES, HINT_BELOW } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import type {
  GenerateReviewRequest,
  GenerateReviewResponse,
  Run,
} from '@/types/term-mapping';

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  run: Run | null;
  currentUserEmail?: string;
  onCreated?: (reviewId: string) => void;
  /** Where focus goes once it has closed, when its opener is gone by then (Enrich's run summary's Request review). */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

export default function GenerateReviewDialog({
  isOpen,
  onOpenChange,
  run,
  currentUserEmail,
  onCreated,
  returnFocusTo,
}: Props) {
  const { t } = useTranslation(['term-mapping', 'common']);
  const { post } = useApi();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Default reviewer to caller — mirrors the MDM "self-review" default. Stewards
  // who want to hand off to someone else can edit before submit.
  const [reviewerEmail, setReviewerEmail] = useState(currentUserEmail ?? '');
  const [notes, setNotes] = useState('');
  const [includeAccepted, setIncludeAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReviewerEmail(currentUserEmail ?? '');
      setNotes('');
      setIncludeAccepted(false);
      setError(null);
    }
  }, [isOpen, currentUserEmail]);

  const stats = (run?.stats ?? {}) as Record<string, number | undefined>;
  const pending = stats.suggestions_pending ?? 0;
  const accepted = stats.suggestions_accepted ?? 0;
  const eligible = pending + (includeAccepted ? accepted : 0);

  const handleSubmit = async () => {
    if (!run) return;
    if (!reviewerEmail.trim()) {
      setError(t('generateReview.validation.reviewerRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: GenerateReviewRequest = {
        reviewer_email: reviewerEmail.trim(),
        notes: notes.trim() || undefined,
        include_accepted: includeAccepted,
      };
      const res = await post<GenerateReviewResponse>(
        `/api/term-mappings/runs/${run.id}/review`,
        payload,
      );
      if (res.error) throw new Error(res.error);
      const data = res.data!;
      toast({
        title: t('generateReview.toast.created'),
        description: t(
          data.suggestion_count === 1
            ? 'generateReview.toast.createdDescriptionOne'
            : 'generateReview.toast.createdDescriptionMany',
          { count: data.suggestion_count },
        ),
      });
      onCreated?.(data.review_request_id);
      onOpenChange(false);
      navigate(`/data-asset-reviews/${data.review_request_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateReview.toast.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      returnFocusTo={returnFocusTo}
      title={t('generateReview.title')}
      description={t('generateReview.description')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || eligible === 0}>
            {submitting && <Loader size={12} color="currentColor" />}
            {t('generateReview.submit')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <TextInput
          id="reviewer-email"
          type="email"
          label={t('generateReview.reviewerEmail')}
          description={t('generateReview.reviewerEmailHelp')}
          inputWrapperOrder={HINT_BELOW}
          value={reviewerEmail}
          onChange={(e) => setReviewerEmail(e.currentTarget.value)}
          placeholder={t('generateReview.reviewerEmailPlaceholder')}
          classNames={FIELD_CLASSES}
          data-autofocus
        />

        <Textarea
          id="notes"
          label={t('generateReview.notes')}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          placeholder={t('generateReview.notesPlaceholder')}
          rows={3}
          classNames={FIELD_CLASSES}
        />

        <Checkbox
          id="include-accepted"
          size="xs"
          checked={includeAccepted}
          onChange={(e) => setIncludeAccepted(e.currentTarget.checked)}
          label={t('generateReview.includeAccepted')}
          description={t('generateReview.includeAcceptedHelp')}
          classNames={{ description: form.hint }}
        />

        <div className={form.note}>
          <p>
            {t(
              eligible === 1
                ? 'generateReview.eligibleSummaryOne'
                : 'generateReview.eligibleSummaryMany',
              {
                eligible,
                pending,
                acceptedPart: includeAccepted
                  ? t('generateReview.acceptedPart', { accepted })
                  : '',
              },
            )}
          </p>
        </div>

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

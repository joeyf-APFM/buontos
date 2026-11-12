import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader } from '@mantine/core';
import { CheckCircle2, SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import form from '@/components/common/dialog-form.module.css';
import ReviewSuggestionsDialog from '@/components/enrich/review-suggestions-dialog';
import type { Run } from '@/types/term-mapping';
import classes from './run-result-dialog.module.css';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  run: Run | null;
  /** Live suggestion refs (term-mapping://{runId}/{suggestionId}). */
  suggestionRefs: { fqn: string }[];
  /** True while the run's suggestions are still being fetched. */
  loading?: boolean;
  /** Opt-in: hand the run's suggestions off to the Review Board via a request. */
  onRequestReview: () => void;
  /**
   * Where focus goes once the summary (or the reviewer it hands over to) has
   * closed: the summary opens as the run dialog closes, so its own opener is
   * that dialog's button, which is gone by then.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** Whether the user may decide the suggestions (term-mapping Read/Write); the reviewer is read-only otherwise. @default true */
  canWrite?: boolean;
}

/**
 * Post-run RESULT SUMMARY. Shown after "Create run" completes instead of
 * force-opening the delegate-to-reviewer form. The user sees what the run
 * found, then chooses to:
 *   - Review matches in place (primary; opens the shared accept/reject reviewer)
 *   - Request a Review-Board handoff (secondary opt-in; onRequestReview)
 * A run with zero suggestions shows a clear "no matches" state, not a dead-end.
 *
 * On the kit Dialog since wave 2 Task 14. Review matches hands over: the
 * summary closes as the reviewer opens (one dialog at a time), and closing
 * the reviewer closes both.
 */
export default function RunResultDialog({
  open,
  onOpenChange,
  run,
  suggestionRefs,
  loading = false,
  onRequestReview,
  returnFocusTo,
  canWrite = true,
}: Props) {
  const { t } = useTranslation(['term-mapping', 'common']);
  const [reviewOpen, setReviewOpen] = useState(false);

  const count = suggestionRefs.length;
  const hasSuggestions = count > 0;

  return (
    <>
      <Dialog
        opened={open && !reviewOpen}
        onClose={() => onOpenChange(false)}
        size="sm"
        returnFocusTo={returnFocusTo}
        title={
          <span className={form.titleLine}>
            {loading ? (
              <Loader size={14} />
            ) : hasSuggestions ? (
              <CheckCircle2 size={16} className={classes.found} aria-hidden />
            ) : (
              <SearchX size={16} className={classes.none} aria-hidden />
            )}
            {t('runResult.title', 'Run complete')}
          </span>
        }
        description={
          loading
            ? t('runResult.loading', 'Gathering suggested matches…')
            : hasSuggestions
              ? t('runResult.found', {
                  count,
                  defaultValue: 'Found {{count}} suggested match(es) to review.',
                })
              : t(
                  'runResult.none',
                  'No matches were found for this run. Nothing to review.',
                )
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} className={classes.close}>
              {t('common:actions.close', 'Close')}
            </Button>
            {!loading && hasSuggestions && (
              <>
                <Button variant="outline" onClick={onRequestReview}>
                  {t('runResult.requestReview', 'Request review')}
                </Button>
                <Button onClick={() => setReviewOpen(true)}>
                  {t('runResult.reviewMatches', 'Review matches')}
                </Button>
              </>
            )}
          </>
        }
      />

      {/* In-place accept/reject over this run's live suggestions. */}
      <ReviewSuggestionsDialog
        open={reviewOpen}
        onOpenChange={(o) => {
          setReviewOpen(o);
          if (!o) onOpenChange(false);
        }}
        schemeName={run?.comment || t('runResult.thisRun', 'this run')}
        suggestionRefs={suggestionRefs}
        reviewBoardHref="/data-asset-reviews"
        returnFocusTo={returnFocusTo}
        canWrite={canWrite}
      />
    </>
  );
}

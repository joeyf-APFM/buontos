import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Loader } from '@mantine/core';
import { ArrowRight, Check, CheckCircle2, ExternalLink, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import TermMappingSuggestionReview from '@/components/term-mapping/suggestion-review';
import classes from './review-suggestions-dialog.module.css';

// ---------------------------------------------------------------------------
// Inline "Review suggested matches" surface for the Map lane.
//
// Per the wireframe, review happens IN A MODAL — we do NOT route away to the
// Review Board. The accept/reject surface is the SAME shared component the
// term-mapping / MDM flows use (TermMappingSuggestionReview), embedded here.
//
// Two rendering paths:
//   1. When we have real suggestion FQNs (term-mapping://{runId}/{suggestionId})
//      we mount the shared reviewer, which talks to the live
//      /api/term-mappings decision endpoints. Accept/reject happens in-place.
//   2. When no run/suggestion context is available (the common case until the
//      coverage read-model wires a run id per scheme), we render a clearly
//      labelled placeholder list mirroring the same accept/reject affordance.
//      The placeholder rows are inert.
//
// TODO(cb-v2): the coverage read-model endpoint (see coverage-matrix.tsx) must
//   also return the term-mapping run id + pending suggestion ids per scheme so
//   we can hand real FQNs to the shared reviewer here. No endpoint returns that
//   mapping today — do NOT fabricate one.
// ---------------------------------------------------------------------------

export interface PendingSuggestionRef {
  /** FQN: term-mapping://{runId}/{suggestionId} — feeds the shared reviewer. */
  fqn: string;
}

/** One live pending suggestion for the scheme-review (accept-and-apply) path. */
export interface LiveSchemeSuggestion {
  id: string;
  runId: string;
  concept: string;
  target: string;
  reason: string;
  confidence: number; // 0..1
}

/** Inert sample rows shown when no live run context exists yet. */
export interface PlaceholderSuggestion {
  id: string;
  concept: string;
  target: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schemeName: string;
  /** Live suggestion refs; when present the shared reviewer is embedded. */
  suggestionRefs?: PendingSuggestionRef[];
  /**
   * Live pending suggestions for a scheme (Enrich Map path). When non-empty the
   * dialog lists them read-only with a single "Accept & apply all" action that
   * accepts every suggestion then materialises the links.
   */
  liveSuggestions?: LiveSchemeSuggestion[];
  /** True while liveSuggestions are being fetched. */
  loading?: boolean;
  /** Whether the current user may write (accept & apply). */
  canWrite?: boolean;
  /**
   * Accept every live suggestion then apply the run(s). Must throw on failure.
   * The dialog owns the submitting/done UI so the action can't be double-fired.
   */
  onAcceptAndApplyAll?: () => Promise<void>;
  /** Sample rows rendered when no live refs are available. */
  placeholders?: PlaceholderSuggestion[];
  /** Count of schema-drift items to resolve (placeholder metric). */
  driftCount?: number;
  /** Optional escape hatch to the full Review Board. */
  reviewBoardHref?: string;
  /** Where focus goes once it has closed, when its opener is gone by then (the run summary's). */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

function confidenceBucket(c: number): PlaceholderSuggestion['confidence'] {
  if (c >= 0.75) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}

export default function ReviewSuggestionsDialog({
  open,
  onOpenChange,
  schemeName,
  suggestionRefs,
  liveSuggestions,
  loading = false,
  canWrite = true,
  onAcceptAndApplyAll,
  placeholders = [],
  driftCount = 0,
  reviewBoardHref,
  returnFocusTo,
}: Props) {
  const { t } = useTranslation(['concepts', 'term-mapping', 'common']);
  const [activeIndex, setActiveIndex] = useState(0);
  // Accept-and-apply lifecycle for the scheme-review path. `submitting` guards
  // the in-flight request (kills the endless-click bug); `done` locks the action
  // after a successful apply so it can never be re-applied.
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Reset the accept-and-apply lifecycle whenever the dialog (re)opens so a
  // previous success/error state doesn't leak into a new scheme review.
  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setDone(false);
      setApplyError(null);
    }
  }, [open, schemeName]);

  const hasLive = Array.isArray(suggestionRefs) && suggestionRefs.length > 0;
  const liveRef = hasLive ? suggestionRefs![Math.min(activeIndex, suggestionRefs!.length - 1)] : null;

  const scheme = Array.isArray(liveSuggestions) ? liveSuggestions : [];
  const hasScheme = scheme.length > 0;

  const handleAcceptApply = async () => {
    if (!onAcceptAndApplyAll || submitting || done) return;
    setSubmitting(true);
    setApplyError(null);
    try {
      await onAcceptAndApplyAll();
      setDone(true);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const row = (s: { id: string; concept: string; target: string; reason: string }, conf: PlaceholderSuggestion['confidence'], actions?: ReactNode) => (
    <li key={s.id} className={classes.row}>
      <div className={classes.main}>
        <div className={classes.mapping}>
          <span className={classes.concept}>{s.concept}</span>
          <ArrowRight size={14} className={classes.arrow} aria-hidden />
          <span className={classes.target} title={s.target}>
            {s.target}
          </span>
        </div>
        <p className={classes.reason}>{s.reason}</p>
      </div>
      <span className={classes.confidence} data-confidence={conf}>
        {conf}
      </span>
      {actions}
    </li>
  );

  return (
    <Dialog
      opened={open}
      onClose={() => onOpenChange(false)}
      size="lg"
      returnFocusTo={returnFocusTo}
      title={
        <>
          {t('enrich.review.title', 'Review suggested matches')}
          <span className={classes.scheme}> · {schemeName}</span>
        </>
      }
      description={t(
        'enrich.review.subtitle',
        'Accept or reject each concept-to-Asset match. Nothing syncs until you accept it.',
      )}
      footer={
        <>
          {reviewBoardHref && (
            <a href={reviewBoardHref} className={classes.boardLink}>
              {t('enrich.review.openFull', 'Open full Review Board')}
              <ExternalLink size={12} aria-hidden />
            </a>
          )}
          {hasScheme && onAcceptAndApplyAll && !done && (
            <Button
              onClick={handleAcceptApply}
              disabled={submitting || done || !canWrite}
            >
              {submitting ? <Loader size={12} color="currentColor" /> : <Check size={14} aria-hidden />}
              {submitting
                ? t('enrich.review.applying', 'Applying…')
                : t('enrich.review.acceptApplyAll', {
                    count: scheme.length,
                    defaultValue: 'Accept & apply all {{count}}',
                  })}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {done
              ? t('common:actions.done', 'Done')
              : t('common:actions.close', 'Close')}
          </Button>
        </>
      }
    >
      {hasLive && liveRef ? (
        // Real accept/reject via the shared reviewer, in-place.
        <TermMappingSuggestionReview
          key={liveRef.fqn}
          assetFqn={liveRef.fqn}
          currentIndex={activeIndex + 1}
          totalCount={suggestionRefs!.length}
          hasNext={activeIndex < suggestionRefs!.length - 1}
          onNext={() => setActiveIndex((i) => Math.min(i + 1, suggestionRefs!.length - 1))}
        />
      ) : loading && !hasScheme && placeholders.length === 0 ? (
        <div className={classes.loading}>
          <Loader size="xs" />
          {t('enrich.review.loading', 'Loading suggested matches…')}
        </div>
      ) : hasScheme ? (
        // Live scheme-review path: list the scheme's pending suggestions and
        // accept-and-apply them all in one action.
        <>
          {done ? (
            <Alert color="green" variant="light" icon={<CheckCircle2 size={16} />} className={classes.notice}>
              {t('enrich.review.applied', {
                count: scheme.length,
                defaultValue: 'Applied {{count}} match(es). They will sync on next delivery.',
              })}
            </Alert>
          ) : (
            applyError && (
              <Alert color="red" variant="light" className={classes.notice}>
                {t('enrich.review.applyError', 'Could not apply matches: ')}
                {applyError}
              </Alert>
            )
          )}
          <ul className={classes.list}>
            {scheme.map((s) => row(s, confidenceBucket(s.confidence)))}
          </ul>
        </>
      ) : (
        <>
          <p className={classes.sampleNote}>
            {t(
              'enrich.review.placeholderNote',
              'Sample matches shown for illustration.',
            )}
          </p>
          <ul className={classes.list}>
            {placeholders.map((s) =>
              row(
                s,
                s.confidence,
                <div className={classes.actions}>
                  <Button variant="outline" size="sm" disabled>
                    <X size={14} aria-hidden />
                    {t('enrich.review.reject', 'Reject')}
                  </Button>
                  <Button size="sm" disabled>
                    <Check size={14} aria-hidden />
                    {t('enrich.review.accept', 'Accept')}
                  </Button>
                </div>,
              ),
            )}
            {driftCount > 0 && (
              <li className={classes.row}>
                <span className={classes.main}>{t('enrich.review.drift', 'Schema drift to resolve')}</span>
                <Badge size="sm" radius="sm" variant="outline" color="gray">{driftCount}</Badge>
              </li>
            )}
          </ul>
        </>
      )}
    </Dialog>
  );
}

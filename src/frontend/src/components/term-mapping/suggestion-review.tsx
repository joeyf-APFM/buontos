import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Loader, TextInput, Textarea } from '@mantine/core';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  HelpCircle,
  Sparkles,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FIELD_CLASSES } from '@/components/common/dialog-form';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { bucketConfidence, type Suggestion } from '@/types/term-mapping';
import classes from './suggestion-review.module.css';

interface Props {
  /** FQN format: term-mapping://{run_id}/{suggestion_id} */
  assetFqn: string;
  /** Called once decided so the parent (asset-review-editor) can advance the
   *  underlying ReviewedAsset status in its in-memory list. */
  onReviewComplete?: (status: 'approved' | 'rejected') => void;
  onNext?: () => void;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
  readOnly?: boolean;
}

function parseFqn(fqn: string): { runId: string; suggestionId: string } | null {
  // term-mapping://{run_id}/{suggestion_id}
  const m = fqn.match(/^term-mapping:\/\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { runId: m[1], suggestionId: m[2] };
}

export default function TermMappingSuggestionReview({
  assetFqn,
  onReviewComplete,
  onNext,
  hasNext = false,
  currentIndex,
  totalCount,
  readOnly = false,
}: Props) {
  const { t } = useTranslation(['term-mapping', 'common']);
  const { get, post } = useApi();
  const { toast } = useToast();
  const parsed = parseFqn(assetFqn);

  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [customIri, setCustomIri] = useState('');
  const [comment, setComment] = useState('');
  // Bumped by Retry, to load the suggestion again
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!parsed) {
        setError(t('suggestion.errors.unparseable', { fqn: assetFqn }));
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        // No dedicated GET-by-id endpoint yet; list suggestions for the run
        // and find ours. Lists are paginated to 500 by default which more
        // than covers a typical run.
        const res = await get<Suggestion[]>(
          `/api/term-mappings/runs/${parsed.runId}/suggestions?limit=5000`,
        );
        if (res.error) throw new Error(res.error);
        if (cancelled) return;
        const found = (res.data ?? []).find((s) => s.id === parsed.suggestionId);
        if (!found) throw new Error(t('suggestion.errors.notFound'));
        setSuggestion(found);
        setCustomIri(found.custom_iri ?? '');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('suggestion.errors.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [assetFqn, get, t, attempt]);

  if (!parsed) {
    return (
      <Alert color="red" variant="light" icon={<AlertCircle size={16} />}>
        {t('suggestion.invalidFqn')}
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className={classes.loading}>
        <Loader size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={classes.error}>
        <Alert color="red" variant="light" icon={<AlertCircle size={16} />}>
          <span className={classes.wrap}>{error}</span>
        </Alert>
        <div>
          <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            {t('common:retry', 'Retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (!suggestion) {
    return null;
  }

  const isTerminal =
    suggestion.status === 'applied' ||
    suggestion.status === 'rejected' ||
    suggestion.status === 'accepted' ||
    suggestion.status === 'superseded';
  const disabled = readOnly || isTerminal;

  const submitDecision = async (
    decision: 'accept' | 'reject' | 'clarify',
  ): Promise<boolean> => {
    if (!suggestion) return false;
    setSubmitting(true);
    try {
      const body = {
        decisions: [
          {
            id: suggestion.id,
            decision,
            custom_iri:
              decision === 'accept' && customIri.trim() && customIri.trim() !== suggestion.target_concept_iri
                ? customIri.trim()
                : undefined,
            comment: comment.trim() || undefined,
          },
        ],
      };
      const res = await post<{ accepted: number; rejected: number; skipped: number; errors: string[] }>(
        `/api/term-mappings/runs/${suggestion.run_id}/decisions`,
        body,
      );
      if (res.error) throw new Error(res.error);
      const result = res.data!;
      if (result.errors?.length) {
        toast({
          title: t('suggestion.toast.savedWithWarnings'),
          description: result.errors[0],
          variant: 'destructive',
        });
      } else {
        toast({
          title:
            decision === 'accept'
              ? t('suggestion.toast.approved')
              : decision === 'reject'
                ? t('suggestion.toast.rejected')
                : t('suggestion.toast.clarified'),
        });
      }
      onReviewComplete?.(decision === 'accept' ? 'approved' : 'rejected');
      return true;
    } catch (e) {
      toast({
        title: t('suggestion.toast.decisionFailed'),
        description: e instanceof Error ? e.message : t('toast.unknownError'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptAndNext = async () => {
    const ok = await submitDecision('accept');
    if (ok && onNext) onNext();
  };

  const sourceTypeLabel = suggestion.source_entity_type.replace(/_/g, ' ');
  const bucket = bucketConfidence(suggestion.confidence);

  return (
    <div className={classes.root}>
      {/* Header with progress + status */}
      <div className={classes.header}>
        <div className={classes.heading}>
          <Sparkles size={18} className={classes.icon} aria-hidden />
          <div>
            <h3 className={classes.title}>{t('suggestion.header')}</h3>
            {typeof currentIndex === 'number' && typeof totalCount === 'number' && (
              <p className={classes.muted}>
                {t('suggestion.progress', { current: currentIndex, total: totalCount })}
              </p>
            )}
          </div>
        </div>
        <Badge variant={isTerminal ? 'secondary' : 'outline'} className={classes.cap}>
          {suggestion.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {/* Mapping: source → target */}
      <section className={classes.mapping}>
        <div className={classes.pair}>
          <Badge variant="secondary">{sourceTypeLabel}</Badge>
          <span className={classes.source} title={suggestion.source_entity_id}>
            {suggestion.source_label || suggestion.source_entity_id}
          </span>
          <ArrowRight size={16} className={classes.arrow} aria-hidden />
          <Badge variant="default">{t('suggestion.concept')}</Badge>
          <span className={classes.target}>
            {suggestion.target_concept_label ?? suggestion.target_concept_iri}
          </span>
        </div>
        <p className={classes.iri}>{suggestion.target_concept_iri}</p>
        <div className={classes.rule} />
        <div className={classes.facts}>
          <span className={classes.muted}>{t('suggestion.confidence')}</span>
          <span className={classes.confidence} data-bucket={bucket}>
            {t('suggestion.confidenceValue', {
              value: (suggestion.confidence * 100).toFixed(0),
              bucket,
            })}
          </span>
          {suggestion.auto_apply && (
            <Badge variant="outline">{t('suggestion.autoApply')}</Badge>
          )}
          <Badge variant="outline" className={classes.cap}>{suggestion.engine}</Badge>
        </div>
        <div>
          <div className={classes.label}>{t('suggestion.whyMatch')}</div>
          <p className={classes.reason}>
            {suggestion.reason || t('suggestion.noReason')}
          </p>
        </div>
        {Array.isArray(suggestion.warnings) && suggestion.warnings.length > 0 && (
          <Alert color="red" variant="light" icon={<AlertCircle size={16} />} className={classes.warnings}>
            {suggestion.warnings.join(', ')}
          </Alert>
        )}
      </section>

      {/* Decision form: custom IRI override + comment */}
      <div className={classes.fields}>
        <TextInput
          id="custom-iri"
          label={t('suggestion.overrideIri')}
          description={t('suggestion.overrideIriHelp')}
          inputWrapperOrder={['label', 'input', 'description', 'error']}
          value={customIri}
          onChange={(e) => setCustomIri(e.currentTarget.value)}
          placeholder={suggestion.target_concept_iri}
          disabled={disabled}
          classNames={{ ...FIELD_CLASSES, input: classes.mono }}
        />
        <Textarea
          id="decision-comment"
          label={t('suggestion.comment')}
          value={comment}
          onChange={(e) => setComment(e.currentTarget.value)}
          placeholder={t('suggestion.commentPlaceholder')}
          rows={2}
          disabled={disabled}
          classNames={FIELD_CLASSES}
        />
      </div>

      {/* Action bar */}
      <div className={classes.actions}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => submitDecision('clarify')}
          disabled={disabled || submitting}
        >
          <HelpCircle size={14} aria-hidden /> {t('suggestion.needsClarification')}
        </Button>
        <div className={classes.decide}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => submitDecision('reject')}
            disabled={disabled || submitting}
          >
            {submitting ? <Loader size={12} color="currentColor" /> : <X size={14} aria-hidden />}
            {t('suggestion.reject')}
          </Button>
          <Button
            size="sm"
            onClick={() => submitDecision('accept')}
            disabled={disabled || submitting}
          >
            {submitting ? <Loader size={12} color="currentColor" /> : <Check size={14} aria-hidden />}
            {t('suggestion.acceptApply')}
          </Button>
          {hasNext && (
            <Button
              variant="default"
              size="sm"
              onClick={handleAcceptAndNext}
              disabled={disabled || submitting}
            >
              {t('suggestion.acceptNext')}
              <ChevronRight size={14} aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

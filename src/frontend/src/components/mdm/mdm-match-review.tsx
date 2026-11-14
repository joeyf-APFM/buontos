import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Divider, Loader, ScrollArea, Table, TextInput, Textarea, Tooltip, UnstyledButton } from '@mantine/core';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Edit2,
  Database,
  GitCompare,
  AlertCircle,
  Sparkles,
  ArrowLeftRight,
  ChevronRight,
  SkipForward,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FIELD_CLASSES } from '@/components/common/dialog-form';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import {
  MdmMatchCandidate,
  MdmMatchCandidateStatus,
  MdmMatchType,
  SurvivorshipStrategy,
} from '@/types/mdm';
import classes from './mdm-editors.module.css';

interface MdmMatchReviewProps {
  assetFqn: string; // mdm://config_id/run_id/candidate_id
  onReviewComplete?: (status: 'approved' | 'rejected') => void;
  onNext?: () => void; // Callback to navigate to next asset
  hasNext?: boolean; // Whether there's a next asset to review
  currentIndex?: number; // Current index in the list (1-based for display)
  totalCount?: number; // Total number of assets to review
  readOnly?: boolean;
}

interface FieldValue {
  field: string;
  masterValue: unknown;
  sourceValue: unknown;
  selectedSource: 'master' | 'source' | 'custom';
  customValue?: unknown;
  survivorshipStrategy?: SurvivorshipStrategy;
}

function parseMdmFqn(fqn: string): { configId: string; runId: string; candidateId: string } | null {
  // Format: mdm://config_id/run_id/candidate_id
  const match = fqn.match(/^mdm:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return {
    configId: match[1],
    runId: match[2],
    candidateId: match[3],
  };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function areValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a).toLowerCase().trim() === String(b).toLowerCase().trim();
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

/** A candidate, not an error's empty object, a list or text. */
const isCandidate = (data: unknown): data is MdmMatchCandidate =>
  !!data && typeof data === 'object' && !Array.isArray(data) && typeof (data as MdmMatchCandidate).status === 'string';

// Filter out internal/system fields
const SYSTEM_FIELDS = ['golden_id', 'source_record_id', 'created_at', 'updated_at', 'last_merged_at', 'confidence_score', 'source_systems'];

/** One field's values and initial choice, sorted by field name. */
function initialFieldValues(data: MdmMatchCandidate): FieldValue[] {
  const masterData = data.master_record_data || {};
  const sourceData = data.source_record_data || {};
  const mergedData = data.merged_record_data || {};

  // Get all unique fields from both records
  const allFields = new Set([
    ...Object.keys(masterData),
    ...Object.keys(sourceData),
  ]);

  return Array.from(allFields)
    .filter((field) => !SYSTEM_FIELDS.includes(field))
    .map((field) => {
      const masterValue = masterData[field];
      const sourceValue = sourceData[field];
      const mergedValue = mergedData[field];

      // Determine initial selection
      let selectedSource: 'master' | 'source' | 'custom' = 'master';
      let customValue: unknown = undefined;

      if (mergedValue !== undefined) {
        // Already has a merged value
        if (areValuesEqual(mergedValue, masterValue)) {
          selectedSource = 'master';
        } else if (areValuesEqual(mergedValue, sourceValue)) {
          selectedSource = 'source';
        } else {
          selectedSource = 'custom';
          customValue = mergedValue;
        }
      } else if (data.match_type === 'new') {
        // New record - default to source
        selectedSource = 'source';
      } else if (sourceValue !== null && sourceValue !== undefined &&
                 (masterValue === null || masterValue === undefined)) {
        // Source has value, master doesn't
        selectedSource = 'source';
      }

      return {
        field,
        masterValue,
        sourceValue,
        selectedSource,
        customValue,
      };
    })
    .sort((a, b) => a.field.localeCompare(b.field));
}

export default function MdmMatchReview({
  assetFqn,
  onReviewComplete,
  onNext,
  hasNext = false,
  currentIndex,
  totalCount,
  readOnly = false,
}: MdmMatchReviewProps) {
  const { t } = useTranslation(['mdm', 'common']);
  const { get, put } = useApi();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [candidate, setCandidate] = useState<MdmMatchCandidate | null>(null);
  const [fieldValues, setFieldValues] = useState<FieldValue[]>([]);
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);
  // A second click (Approve twice, Approve then Reject) sends nothing while one is out
  const busy = useRef(false);

  const parsedFqn = useMemo(() => parseMdmFqn(assetFqn), [assetFqn]);

  // Fetch candidate details; a late answer for the previous asset is dropped
  useEffect(() => {
    let current = true;
    const fetchCandidate = async () => {
      if (!parsedFqn) {
        setError(t('mdm:matchReview.invalidFqn'));
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await get<MdmMatchCandidate>(
          `/api/mdm/candidates/${parsedFqn.candidateId}`
        );
        if (!current) return;

        if (response.error) {
          setError(response.error);
          return;
        }

        if (isCandidate(response.data)) {
          setCandidate(response.data);
          setFieldValues(initialFieldValues(response.data));
        } else {
          setCandidate(null);
        }
      } catch (err: any) {
        if (current) setError(err.message || t('mdm:matchReview.loadFailed'));
      } finally {
        if (current) setLoading(false);
      }
    };

    fetchCandidate();
    return () => {
      current = false;
    };
    // t is stable; only another asset loads again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedFqn, get]);

  const handleFieldSourceChange = (index: number, source: 'master' | 'source' | 'custom') => {
    setFieldValues(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        selectedSource: source,
        customValue: source === 'custom' ? updated[index].customValue || updated[index].masterValue : undefined,
      };
      return updated;
    });
  };

  const handleCustomValueChange = (index: number, value: string) => {
    setFieldValues(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        customValue: value,
      };
      return updated;
    });
  };

  const buildMergedRecord = (): Record<string, unknown> => {
    const merged: Record<string, unknown> = {};

    // Include system fields from master if it's a match
    if (candidate?.master_record_data) {
      merged['golden_id'] = candidate.master_record_data['golden_id'];
    }
    merged['source_record_id'] = candidate?.source_record_id;

    for (const fv of fieldValues) {
      if (fv.selectedSource === 'master') {
        merged[fv.field] = fv.masterValue;
      } else if (fv.selectedSource === 'source') {
        merged[fv.field] = fv.sourceValue;
      } else {
        merged[fv.field] = fv.customValue;
      }
    }

    return merged;
  };

  const handleApprove = async (): Promise<boolean> => {
    if (!candidate || !parsedFqn || busy.current) return false;

    busy.current = true;
    setSaving(true);
    try {
      const mergedData = buildMergedRecord();

      const response = await put<MdmMatchCandidate>(
        `/api/mdm/candidates/${parsedFqn.candidateId}`,
        {
          status: MdmMatchCandidateStatus.APPROVED,
          merged_record_data: mergedData,
        }
      );

      if (response.error) {
        toast({
          title: t('common:status.error'),
          description: response.error,
          variant: 'destructive',
        });
        return false;
      }

      toast({
        title: t('mdm:matchReview.approvedTitle'),
        description: t('mdm:matchReview.approvedDescription'),
      });

      onReviewComplete?.('approved');
      return true;
    } catch (err: any) {
      toast({
        title: t('common:status.error'),
        description: err.message || t('mdm:matchReview.approveFailed'),
        variant: 'destructive',
      });
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const handleApproveAndNext = async () => {
    const success = await handleApprove();
    if (success && onNext) {
      onNext();
    }
  };

  const handleReject = async () => {
    if (!candidate || !parsedFqn || busy.current) return;

    busy.current = true;
    setSaving(true);
    try {
      const response = await put<MdmMatchCandidate>(
        `/api/mdm/candidates/${parsedFqn.candidateId}`,
        {
          status: MdmMatchCandidateStatus.REJECTED,
        }
      );

      if (response.error) {
        toast({
          title: t('common:status.error'),
          description: response.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('mdm:matchReview.rejectedTitle'),
        description: t('mdm:matchReview.rejectedDescription'),
      });

      onReviewComplete?.('rejected');
    } catch (err: any) {
      toast({
        title: t('common:status.error'),
        description: err.message || t('mdm:matchReview.rejectFailed'),
        variant: 'destructive',
      });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const applyAllMaster = () => {
    setFieldValues(prev => prev.map(fv => ({ ...fv, selectedSource: 'master' as const })));
  };

  const applyAllSource = () => {
    setFieldValues(prev => prev.map(fv => ({ ...fv, selectedSource: 'source' as const })));
  };

  const applySmartMerge = () => {
    // Apply intelligent defaults: prefer non-null values, prefer more recent
    setFieldValues(prev => prev.map(fv => {
      // If values are equal, keep master
      if (areValuesEqual(fv.masterValue, fv.sourceValue)) {
        return { ...fv, selectedSource: 'master' as const };
      }
      // If master is empty but source has value, use source
      if (isEmpty(fv.masterValue) && !isEmpty(fv.sourceValue)) {
        return { ...fv, selectedSource: 'source' as const };
      }
      // Otherwise keep master (trust existing data)
      return { ...fv, selectedSource: 'master' as const };
    }));

    toast({
      title: t('mdm:matchReview.smartMergeTitle'),
      description: t('mdm:matchReview.smartMergeDescription'),
    });
  };

  if (loading) {
    return (
      <div className={classes.message} role="status">
        <Loader size={16} />
        <span>{t('mdm:matchReview.loadingDetails')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={classes.message} data-error="" role="alert">
        <AlertCircle size={18} aria-hidden />
        <span>{error}</span>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className={classes.message}>
        <AlertCircle size={18} aria-hidden />
        <span>{t('mdm:matchReview.notFound')}</span>
      </div>
    );
  }

  const isAlreadyReviewed = candidate.status !== MdmMatchCandidateStatus.PENDING;
  const choosable = !readOnly && !isAlreadyReviewed;

  /** A master or source value: a toggle to choose it while the review is open, else its text. */
  const valueCell = (fv: FieldValue, index: number, side: 'master' | 'source') => {
    const value = side === 'master' ? fv.masterValue : fv.sourceValue;
    const text = formatValue(value);
    const chosen = fv.selectedSource === side;
    const content = (
      <>
        <span className={`${classes.valueText} ${isEmpty(value) ? classes.emptyValue : ''}`} title={text}>
          {text}
        </span>
        {chosen && <Check size={14} className={classes.check} data-side={side} aria-hidden />}
      </>
    );
    if (!choosable) {
      return <span className={classes.value}>{content}</span>;
    }
    return (
      <UnstyledButton
        className={classes.choice}
        data-side={side}
        aria-pressed={chosen}
        onClick={() => handleFieldSourceChange(index, side)}
      >
        {content}
      </UnstyledButton>
    );
  };

  const bulkButton = (label: string, tooltip: string, icon: ReactNode, onClick: () => void) => (
    <Tooltip label={tooltip}>
      <Button variant="outline" size="sm" onClick={onClick}>
        {icon}
        {label}
      </Button>
    </Tooltip>
  );

  return (
    <div className={classes.review}>
      {/* Match Summary */}
      <section className={classes.block}>
        <div className={classes.blockHead}>
          <h3 className={classes.blockTitle}>
            <GitCompare size={16} aria-hidden />
            {t('mdm:matchReview.title')}
          </h3>
          <div className={classes.badges}>
            <Badge variant={candidate.match_type !== MdmMatchType.NEW ? 'default' : 'secondary'}>
              {candidate.match_type !== MdmMatchType.NEW ? t('mdm:matchReview.matchFound') : t('mdm:matchReview.newRecord')}
            </Badge>
            <Badge
              variant={
                candidate.status === MdmMatchCandidateStatus.APPROVED ? 'default' :
                candidate.status === MdmMatchCandidateStatus.REJECTED ? 'destructive' :
                'outline'
              }
            >
              {candidate.status}
            </Badge>
          </div>
        </div>
        <p className={classes.summary}>
          <span>
            {t('mdm:matchReview.confidenceScore')}: <span className={classes.score}>{(candidate.confidence_score * 100).toFixed(1)}%</span>
          </span>
          {candidate.matched_fields && candidate.matched_fields.length > 0 && (
            <span>
              {t('mdm:matchReview.matchedOn')}: {candidate.matched_fields.join(', ')}
            </span>
          )}
        </p>
      </section>

      {/* Field Comparison Table */}
      <section className={classes.block}>
        <div className={classes.blockHead}>
          <h3 className={classes.blockTitle}>
            <Database size={16} aria-hidden />
            {t('mdm:matchReview.fieldComparison')}
          </h3>
          {choosable && (
            <div className={classes.bulk}>
              {bulkButton(t('mdm:matchReview.allMaster'), t('mdm:matchReview.allMasterTooltip'), <ArrowRight size={14} />, applyAllMaster)}
              {bulkButton(t('mdm:matchReview.allSource'), t('mdm:matchReview.allSourceTooltip'), <ArrowLeft size={14} />, applyAllSource)}
              {bulkButton(t('mdm:matchReview.smartMerge'), t('mdm:matchReview.smartMergeTooltip'), <Sparkles size={14} />, applySmartMerge)}
            </div>
          )}
        </div>
        <ScrollArea.Autosize mah={400} type="auto" offsetScrollbars="y">
          <Table className={classes.table} withRowBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th className={classes.colField}>{t('mdm:matchReview.field')}</Table.Th>
                <Table.Th>{t('mdm:matchReview.masterValue')}</Table.Th>
                <Table.Th className={classes.colCompare}>
                  <ArrowLeftRight size={14} aria-hidden />
                </Table.Th>
                <Table.Th>{t('mdm:matchReview.sourceValue')}</Table.Th>
                <Table.Th className={classes.colFinal}>{t('mdm:matchReview.finalValue')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {fieldValues.map((fv, index) => {
                const valuesMatch = areValuesEqual(fv.masterValue, fv.sourceValue);
                const finalText = fv.selectedSource === 'custom'
                  ? formatValue(fv.customValue)
                  : fv.selectedSource === 'master'
                    ? formatValue(fv.masterValue)
                    : formatValue(fv.sourceValue);

                return (
                  <Table.Tr key={fv.field} className={valuesMatch ? classes.same : undefined}>
                    <Table.Td>
                      <div className={classes.fieldCell}>
                        <span className={classes.fieldName} title={fv.field}>{fv.field}</span>
                        {candidate.matched_fields?.includes(fv.field) && (
                          <Badge variant="outline">{t('mdm:matchReview.matched')}</Badge>
                        )}
                      </div>
                    </Table.Td>
                    <Table.Td>{valueCell(fv, index, 'master')}</Table.Td>
                    <Table.Td className={classes.colCompare}>
                      <span className={classes.compare} data-same={valuesMatch ? '' : undefined}>
                        {valuesMatch ? '=' : '≠'}
                      </span>
                    </Table.Td>
                    <Table.Td>{valueCell(fv, index, 'source')}</Table.Td>
                    <Table.Td>
                      {!choosable ? (
                        <span className={classes.finalValue} title={finalText}>{finalText}</span>
                      ) : fv.selectedSource === 'custom' ? (
                        <TextInput
                          value={String(fv.customValue || '')}
                          onChange={(e) => handleCustomValueChange(index, e.currentTarget.value)}
                          aria-label={`${t('mdm:matchReview.finalValue')}: ${fv.field}`}
                          classNames={FIELD_CLASSES}
                        />
                      ) : (
                        <div className={classes.final}>
                          <span>
                            {fv.selectedSource === 'master' ? t('mdm:matchReview.master') : t('mdm:matchReview.source')}
                          </span>
                          <ActionIcon
                            variant="subtle"
                            className={classes.edit}
                            onClick={() => handleFieldSourceChange(index, 'custom')}
                            aria-label={t('common:actions.edit')}
                            title={t('common:actions.edit')}
                          >
                            <Edit2 size={12} />
                          </ActionIcon>
                        </div>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      </section>

      {/* Review Actions */}
      {choosable && (
        <section className={classes.block}>
          <Textarea
            id="review-comments"
            label={t('mdm:matchReview.commentsLabel')}
            placeholder={t('mdm:matchReview.commentsPlaceholder')}
            value={comments}
            onChange={(e) => setComments(e.currentTarget.value)}
            autosize
            minRows={2}
            maxRows={6}
            classNames={FIELD_CLASSES}
          />

          <Divider />

          <div className={classes.actions}>
            {/* Progress indicator */}
            {currentIndex !== undefined && totalCount !== undefined && (
              <p className={classes.progress}>
                {t('mdm:matchReview.reviewingProgress', { current: currentIndex, total: totalCount })}
              </p>
            )}

            <div className={classes.buttons}>
              {/* Skip to next without saving */}
              {hasNext && onNext && (
                <Button
                  variant="ghost"
                  onClick={onNext}
                  disabled={saving}
                >
                  <SkipForward size={14} />
                  {t('mdm:matchReview.skip')}
                </Button>
              )}

              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={saving}
              >
                {saving ? <Loader size={12} color="currentColor" /> : <X size={14} />}
                {t('common:actions.reject')}
              </Button>

              <Button
                variant="outline"
                onClick={handleApprove}
                disabled={saving}
              >
                {saving ? <Loader size={12} color="currentColor" /> : <Check size={14} />}
                {t('common:actions.approve')}
              </Button>

              {/* Save & Next button - only shown when there's a next item */}
              {hasNext && onNext && (
                <Button
                  variant="default"
                  onClick={handleApproveAndNext}
                  disabled={saving}
                >
                  {saving ? <Loader size={12} color="currentColor" /> : <ChevronRight size={14} />}
                  {t('mdm:matchReview.approveAndNext')}
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {isAlreadyReviewed && (
        <section className={`${classes.block} ${classes.reviewed}`}>
          <div className={classes.message}>
            <AlertCircle size={18} aria-hidden />
            <span>
              {t('mdm:matchReview.alreadyReviewed', { status: candidate.status.toLowerCase() })}
              {candidate.reviewed_by && ` ${t('mdm:matchReview.byReviewer', { reviewer: candidate.reviewed_by })}`}
              {candidate.reviewed_at && ` ${t('mdm:matchReview.onDate', { date: new Date(candidate.reviewed_at).toLocaleString() })}`}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

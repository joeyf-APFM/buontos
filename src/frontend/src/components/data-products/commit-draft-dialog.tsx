import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Radio, TextInput, Textarea } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import detail from '@/components/common/detail-page.module.css';
import classes from './commit-draft-dialog.module.css';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { DiffFromParentResponse } from '@/types/data-product';

interface CommitDraftDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName?: string;
  onSuccess: (newProductId: string) => void;
}

function calculateNextSemver(currentVersion: string, bump: 'major' | 'minor' | 'patch'): string {
  const version = currentVersion.replace('-draft', '');
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return '0.0.1';
  
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10);
  
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export default function CommitDraftDialog({
  isOpen,
  onOpenChange,
  productId,
  productName,
  onSuccess,
}: CommitDraftDialogProps) {
  const { t } = useTranslation(['data-products', 'common']);
  const { get, post } = useApi();
  const { toast } = useToast();
  
  const [loadingDiff, setLoadingDiff] = useState(true);
  const [diffAnalysis, setDiffAnalysis] = useState<DiffFromParentResponse | null>(null);
  const [suggestedVersion, setSuggestedVersion] = useState('');
  const [selectedVersionBump, setSelectedVersionBump] = useState<'major' | 'minor' | 'patch' | 'custom'>('patch');
  const [customVersion, setCustomVersion] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch diff when dialog opens
  useEffect(() => {
    if (isOpen && productId) {
      fetchDiff();
    }
  }, [isOpen, productId]);

  const fetchDiff = async () => {
    setLoadingDiff(true);
    setError(null);
    try {
      const response = await get<DiffFromParentResponse>(`/api/data-products/${productId}/diff-from-parent`);
      if (response.error) {
        throw new Error(response.error);
      }
      if (response.data) {
        setDiffAnalysis(response.data);
        setSuggestedVersion(response.data.suggested_version);
        setSelectedVersionBump(response.data.suggested_bump as 'major' | 'minor' | 'patch');
      }
    } catch (e: any) {
      // If no parent, just use 1.0.0
      if (e.message?.includes('no parent')) {
        setSuggestedVersion('1.0.0');
        setSelectedVersionBump('minor');
      } else {
        setError(e.message || t('data-products:commitDraft.errorAnalyze'));
      }
    } finally {
      setLoadingDiff(false);
    }
  };

  const getVersionForBump = (bump: 'major' | 'minor' | 'patch' | 'custom'): string => {
    if (bump === 'custom') return customVersion;
    if (!diffAnalysis) return suggestedVersion;
    return calculateNextSemver(diffAnalysis.parent_version, bump);
  };

  const handleSubmit = async () => {
    const finalVersion = getVersionForBump(selectedVersionBump);
    
    if (!finalVersion || !/^\d+\.\d+\.\d+$/.test(finalVersion)) {
      setError(t('data-products:commitDraft.validationInvalidVersion'));
      return;
    }

    if (!changeSummary.trim()) {
      setError(t('data-products:commitDraft.validationNoSummary'));
      return;
    }
    
    setError(null);
    setIsCommitting(true);
    
    try {
      const response = await post(`/api/data-products/${productId}/commit`, {
        new_version: finalVersion,
        change_summary: changeSummary.trim(),
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      toast({
        title: t('data-products:commitDraft.toastCommittedTitle'),
        description: t('data-products:commitDraft.toastCommittedDescription', { version: finalVersion }),
      });

      onSuccess(productId);
      onOpenChange(false);

    } catch (e: any) {
      setError(e.message || t('data-products:commitDraft.errorCommit'));
    } finally {
      setIsCommitting(false);
    }
  };

  /** A bump choice's label: the bump, its version, then what it's for. */
  const bumpLabel = (bump: 'major' | 'minor' | 'patch') => (
    <>
      {t(`data-products:commitDraft.${bump}`)} ({diffAnalysis ? calculateNextSemver(diffAnalysis.parent_version, bump) : '?.?.?'})
      {' '}<span className={form.muted}>- {t(`data-products:commitDraft.${bump}Description`)}</span>
    </>
  );

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="md"
      title={
        <span className={form.titleLine}>
          <CheckCircle2 size={16} className={classes.done} aria-hidden />
          {t('data-products:commitDraft.title')}
        </span>
      }
      description={
        <>
          {productName && <span className={form.strong}>{productName}</span>}
          {productName && ' '}
          {t('data-products:commitDraft.description')}
        </>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCommitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isCommitting || loadingDiff}>
            {isCommitting ? (
              <>
                <Loader2 className={detail.spin} aria-hidden />
                {t('data-products:commitDraft.committing')}
              </>
            ) : (
              t('data-products:commitDraft.commitButton')
            )}
          </Button>
        </>
      }
    >
      {loadingDiff ? (
        <div className={classes.loading}>
          <Loader2 size={20} className={detail.spin} aria-hidden />
          {t('data-products:commitDraft.analyzing')}
        </div>
      ) : (
        <div className={form.form}>
          {/* Change Analysis Summary */}
          {diffAnalysis && (
            <Alert color="blue" variant="light" title={t('data-products:commitDraft.changeAnalysisTitle')}>
              {t('data-products:commitDraft.changeAnalysisDescription', { bump: diffAnalysis.suggested_bump })}
              {diffAnalysis.analysis?.summary && (
                <p className={classes.summary}>{diffAnalysis.analysis.summary}</p>
              )}
            </Alert>
          )}

          {/* Version Selection */}
          <Radio.Group
            label={t('data-products:commitDraft.selectVersion')}
            value={selectedVersionBump}
            onChange={(v) => setSelectedVersionBump(v as typeof selectedVersionBump)}
            classNames={FIELD_CLASSES}
          >
            <div className={form.choices}>
              <Radio value="patch" id="patch" label={bumpLabel('patch')} classNames={{ label: classes.choiceLabel }} />
              <Radio value="minor" id="minor" label={bumpLabel('minor')} classNames={{ label: classes.choiceLabel }} />
              <Radio value="major" id="major" label={bumpLabel('major')} classNames={{ label: classes.choiceLabel }} />
              <Radio value="custom" id="custom" label={t('data-products:commitDraft.customVersion')} classNames={{ label: classes.choiceLabel }} />
            </div>
          </Radio.Group>

          {selectedVersionBump === 'custom' && (
            <TextInput
              aria-label={t('data-products:commitDraft.customVersion')}
              value={customVersion}
              onChange={(e) => setCustomVersion(e.currentTarget.value)}
              placeholder={t('data-products:commitDraft.customVersionPlaceholder')}
            />
          )}

          {/* Change Summary */}
          <Textarea
            id="change-summary"
            label={t('data-products:commitDraft.changeSummaryLabel')}
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.currentTarget.value)}
            placeholder={t('data-products:commitDraft.changeSummaryPlaceholder')}
            minRows={4}
            autosize
            disabled={isCommitting}
            classNames={FIELD_CLASSES}
          />

          {/* Error Display */}
          {error && (
            <Alert color="red" variant="light" icon={<AlertCircle size={16} />} role="alert">
              {error}
            </Alert>
          )}
        </div>
      )}
    </Dialog>
  );
}

import { useEffect, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader, Textarea } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { FIELD_CLASSES } from '@/components/common/dialog-form';
import { Dialog } from '@/mantine/page';
import form from '@/components/common/dialog-form.module.css';
import classes from './publish-version-dialog.module.css';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// PublishVersionDialog — drives the signed-off versioning contract §4
// (POST /api/semantic-models/concepts/version/publish).
//
// Framed for the Simple view as "Save new version": you edit the definition,
// optionally say what changed, and a new current version is saved. NO version
// integers or IRIs are shown in Simple. Advanced view adds a quiet hint that
// this will create v{current+1}.
// ---------------------------------------------------------------------------

interface PublishVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  iri: string;
  /** Prefill for the editable definition field (current definition). */
  currentDefinition: string;
  /** Current version integer, used ONLY for the advanced-view hint. */
  currentVersion?: number | null;
  /** Called after a successful publish so the parent can refetch. */
  onPublished: () => void | Promise<void>;
  /**
   * Where focus goes once the dialog has closed: for an opener that is gone
   * by then, such as the Request dialog's confirm (the kit gives focus back
   * to the opener otherwise).
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

interface PublishResult {
  iri: string;
  label?: string | null;
  new_version: number;
  is_current: boolean;
}

export function PublishVersionDialog({
  open,
  onOpenChange,
  iri,
  currentDefinition,
  currentVersion,
  onPublished,
  returnFocusTo,
}: PublishVersionDialogProps) {
  const { t } = useTranslation(['semantic-models', 'common']);
  const { toast } = useToast();

  const [definition, setDefinition] = useState(currentDefinition);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset the form to the current definition each time the dialog opens, so a
  // reopened dialog never shows a stale edit from a previous cancel.
  useEffect(() => {
    if (open) {
      setDefinition(currentDefinition);
      setNote('');
    }
  }, [open, currentDefinition]);

  const trimmedNew = definition.trim();
  const unchanged = trimmedNew === (currentDefinition ?? '').trim();
  const canSubmit = trimmedNew.length > 0 && !unchanged && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const response = await fetch(
        '/api/semantic-models/concepts/version/publish',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            iri,
            changes: { definition: trimmedNew },
            change_note: note.trim() || undefined,
          }),
        },
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any));
        throw new Error(err?.detail || 'Failed to save new version');
      }
      const result: PublishResult = await response.json().catch(() => ({} as any));
      toast({
        title: t('common:toast.success'),
        description: t(
          'semantic-models:versionHistory.saved',
          'New version saved',
        ),
      });
      onOpenChange(false);
      // Kept for the advanced hint only; result is otherwise unused.
      void result;
      await onPublished();
    } catch (err: any) {
      toast({
        title: t('common:toast.error'),
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const title = t('semantic-models:versionHistory.saveNewVersion', 'Save new version');

  return (
    <Dialog
      opened={open}
      onClose={() => onOpenChange(false)}
      title={title}
      returnFocusTo={returnFocusTo}
      description={
        <>
          {t(
            'semantic-models:versionHistory.saveDescription',
            'Edit the definition and save it as a new version. The previous definition is kept in the history.',
          )}
          {/* Advanced-only mechanic: which version integer this creates. */}
          {typeof currentVersion === 'number' && (
            <span className={`adv-only ${classes.willCreate}`}>
              {t(
                'semantic-models:versionHistory.willCreate',
                'This will create v{{next}}.',
                { next: currentVersion + 1 },
              )}
            </span>
          )}
        </>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {busy && <Loader size={12} color="currentColor" />}
            {title}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <Textarea
          id="version-definition"
          label={t('semantic-models:fields.definition', 'Definition')}
          value={definition}
          onChange={(e) => setDefinition(e.currentTarget.value)}
          minRows={4}
          autosize
          data-autofocus
          classNames={FIELD_CLASSES}
        />
        <Textarea
          id="version-note"
          label={
            <>
              {t('semantic-models:versionHistory.whatChanged', 'What changed?')}{' '}
              <span className={classes.optional}>
                {t('common:optional', '(optional)')}
              </span>
            </>
          }
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          minRows={2}
          autosize
          placeholder={t(
            'semantic-models:versionHistory.notePlaceholder',
            'e.g. tightened the wording for clarity',
          )}
          classNames={FIELD_CLASSES}
        />
      </div>
    </Dialog>
  );
}

export default PublishVersionDialog;

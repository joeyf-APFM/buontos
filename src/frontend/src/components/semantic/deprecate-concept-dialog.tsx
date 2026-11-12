import { useState, useCallback, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader, UnstyledButton } from '@mantine/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { X } from 'lucide-react';
import ConceptSelectDialog from './concept-select-dialog';
import form from '@/components/common/dialog-form.module.css';
import classes from './deprecate-concept-dialog.module.css';

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  conceptIri: string;
  onSuccess: () => void;
  /**
   * Where focus goes once the dialog has closed: for an opener that is gone
   * by then, such as the Request dialog's confirm (the kit gives focus back
   * to the opener otherwise).
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

export function DeprecateConceptDialog({ isOpen, onOpenChange, conceptIri, onSuccess, returnFocusTo }: Props) {
  const { t } = useTranslation(['semantic-models', 'common']);
  const { post } = useApi();
  const { toast } = useToast();
  const [successorIris, setSuccessorIris] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessorPicker, setShowSuccessorPicker] = useState(false);

  const handleAddSuccessor = useCallback((iri: string) => {
    if (!successorIris.includes(iri) && iri !== conceptIri) {
      setSuccessorIris([...successorIris, iri]);
    }
    setShowSuccessorPicker(false);
  }, [successorIris, conceptIri]);

  const handleRemoveSuccessor = useCallback((iri: string) => {
    setSuccessorIris(successorIris.filter((s) => s !== iri));
  }, [successorIris]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const body = {
        iri: conceptIri,
        replaced_by: successorIris.length > 0 ? successorIris : [],
      };
      const response = await post('/api/semantic-models/concepts/deprecate', body);
      if (response.error) {
        throw new Error(response.error);
      }
      onOpenChange(false);
      setSuccessorIris([]);
      onSuccess();
    } catch (err: any) {
      toast({
        title: t('common:toast.error'),
        description: err?.message || t('semantic-models:messages.error', 'Error'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const localName = (iri: string) => iri.split(/[/#]/).pop() || iri;

  return (
    <>
      {/* A confirm: the alertdialog role and no corner close. The successor
          picker opens on top of it, kit on kit, and closes alone on Escape. */}
      <Dialog
        opened={isOpen}
        onClose={() => {
          if (!isSubmitting) onOpenChange(false);
        }}
        size="sm"
        role="alertdialog"
        returnFocusTo={returnFocusTo}
        title={t('semantic-models:dialogs.deprecate.title', 'Deprecate concept')}
        description={t(
          'semantic-models:dialogs.deprecate.description',
          'Optionally specify one or more successor concepts to indicate what this concept was replaced by.'
        )}
        footer={
          <>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              {t('common:actions.cancel', 'Cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting && <Loader size={12} color="currentColor" />}
              {t('semantic-models:lifecycle.deprecate', 'Deprecate')}
            </Button>
          </>
        }
      >
        <div className={form.form}>
          <div>
            <p className={form.label} id="deprecate-successors">
              {t('semantic-models:dialogs.deprecate.successors', 'Successor concepts')}
            </p>
            <div className={classes.successors} role="group" aria-labelledby="deprecate-successors">
              {successorIris.length === 0 ? (
                <p className={classes.none}>
                  {t('semantic-models:dialogs.deprecate.noSuccessors', 'None selected')}
                </p>
              ) : (
                successorIris.map((iri) => (
                  <Badge key={iri} variant="secondary" className={classes.chip}>
                    <span className={classes.chipLabel} title={iri}>
                      {localName(iri)}
                    </span>
                    <UnstyledButton
                      className={classes.chipRemove}
                      onClick={() => handleRemoveSuccessor(iri)}
                      aria-label={t('semantic-models:dialogs.deprecate.removeSuccessor', 'Remove {{name}}', { name: localName(iri) })}
                    >
                      <X aria-hidden />
                    </UnstyledButton>
                  </Badge>
                ))
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSuccessorPicker(true)}
            className={classes.add}
          >
            {t('semantic-models:dialogs.deprecate.addSuccessor', '+ Add successor')}
          </Button>
        </div>
      </Dialog>

      {/* Successor concept picker dialog */}
      <ConceptSelectDialog
        isOpen={showSuccessorPicker}
        onOpenChange={setShowSuccessorPicker}
        onSelect={handleAddSuccessor}
        entityType="class"
      />
    </>
  );
}

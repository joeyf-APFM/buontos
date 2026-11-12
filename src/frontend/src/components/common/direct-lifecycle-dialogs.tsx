import { Loader, Select } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { useTranslation } from 'react-i18next';
import { SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import type { CertificationLevel } from '@/types/lifecycle';
import { PUBLICATION_SCOPE_LABELS, type PublicationScope } from '@/types/lifecycle';

const PUBLICATION_SCOPES: PublicationScope[] = ['none', 'domain', 'organization', 'external'];

interface DirectCertifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  certificationLevels: CertificationLevel[];
  selectedLevelOrder: number | null;
  onSelectedLevelOrderChange: (order: number | null) => void;
  isSubmitting: boolean;
  onConfirm: () => void;
}

export function DirectCertifyDialog({
  open,
  onOpenChange,
  title,
  description,
  certificationLevels,
  selectedLevelOrder,
  onSelectedLevelOrderChange,
  isSubmitting,
  onConfirm,
}: DirectCertifyDialogProps) {
  const { t } = useTranslation('common');
  const sorted = [...certificationLevels].sort((a, b) => a.level_order - b.level_order);
  const options = uniqueOptions(sorted.map((lvl) => ({ value: String(lvl.level_order), label: lvl.name })));
  return (
    <Dialog
      opened={open}
      onClose={() => onOpenChange(false)}
      size="sm"
      title={title || t('common:lifecycleDialogs.certifyTitle')}
      description={description || t('common:lifecycleDialogs.certifyDescription')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSubmitting || selectedLevelOrder == null || sorted.length === 0}
          >
            {isSubmitting && <Loader size={12} color="currentColor" />}
            {t('common:actions.confirm')}
          </Button>
        </>
      }
    >
      <Select
        label={t('common:lifecycleDialogs.certificationLevel')}
        placeholder={t('common:lifecycleDialogs.selectLevel')}
        data={options}
        value={selectedLevelOrder != null ? String(selectedLevelOrder) : null}
        onChange={(v) => v && onSelectedLevelOrderChange(parseInt(v, 10))}
        allowDeselect={false}
        classNames={SELECT_CLASSES}
      />
    </Dialog>
  );
}

interface DirectPublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  selectedScope: PublicationScope;
  onSelectedScopeChange: (scope: PublicationScope) => void;
  isSubmitting: boolean;
  onConfirm: () => void;
}

export function DirectPublishDialog({
  open,
  onOpenChange,
  title,
  description,
  selectedScope,
  onSelectedScopeChange,
  isSubmitting,
  onConfirm,
}: DirectPublishDialogProps) {
  const { t } = useTranslation('common');
  const options = PUBLICATION_SCOPES.map((scope) => ({ value: scope, label: PUBLICATION_SCOPE_LABELS[scope] }));
  return (
    <Dialog
      opened={open}
      onClose={() => onOpenChange(false)}
      size="sm"
      title={title || t('common:lifecycleDialogs.publishTitle')}
      description={description || t('common:lifecycleDialogs.publishDescription')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting && <Loader size={12} color="currentColor" />}
            {t('common:actions.confirm')}
          </Button>
        </>
      }
    >
      <Select
        label={t('common:lifecycleDialogs.publicationScope')}
        data={options}
        value={selectedScope}
        onChange={(v) => v && onSelectedScopeChange(v as PublicationScope)}
        allowDeselect={false}
        classNames={SELECT_CLASSES}
      />
    </Dialog>
  );
}

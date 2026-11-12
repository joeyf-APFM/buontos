import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES } from '@/components/common/dialog-form';

interface CreateVersionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentVersion: string;
  productTitle: string;
  onSubmit: (newVersion: string) => void; // Callback with the new version string
  /** Accept only an X.Y.Z version (contract versions are cloned, which requires it) */
  requireSemver?: boolean;
}

const SEMVER = /^\d+\.\d+\.\d+$/;

const CreateVersionDialog: React.FC<CreateVersionDialogProps> = ({
  isOpen,
  onOpenChange,
  currentVersion,
  productTitle,
  onSubmit,
  requireSemver = false,
}) => {
  const { t } = useTranslation(['data-products', 'common']);
  const [newVersion, setNewVersion] = useState<string>(currentVersion); // Pre-fill with current
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const trimmedVersion = newVersion.trim();
    // A refused version keeps the dialog open
    if (!trimmedVersion) {
      setError(t('data-products:createVersion.errors.versionEmpty'));
      return;
    }
    if (requireSemver && !SEMVER.test(trimmedVersion)) {
      setError(t('data-products:createVersion.errors.versionFormat', { version: trimmedVersion }));
      return;
    }
    setError(null);
    onSubmit(trimmedVersion);
    onOpenChange(false); // Close dialog on successful submit
  };

  const handleCancel = () => {
    setError(null);
    setNewVersion(currentVersion); // Reset input on cancel
    onOpenChange(false);
  };

  // Reset input when dialog opens/closes externally
  React.useEffect(() => {
    if (isOpen) {
      setNewVersion(currentVersion); // Reset to current when opened
      setError(null);
    }
  }, [isOpen, currentVersion]);


  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      role="alertdialog"
      size="sm"
      title={t('data-products:createVersion.title')}
      description={t('data-products:createVersion.description', { productTitle, currentVersion })}
      footer={
        <>
          {/* Focus starts on Cancel, as in the Radix AlertDialog */}
          <Button variant="outline" onClick={handleCancel} data-autofocus>{t('common:actions.cancel')}</Button>
          <Button onClick={handleSubmit}>{t('data-products:createVersion.createButton')}</Button>
        </>
      }
    >
      <TextInput
        id="new-version-input"
        label={t('data-products:createVersion.versionLabel')}
        value={newVersion}
        onChange={(e) => setNewVersion(e.currentTarget.value)}
        placeholder={t(requireSemver
          ? 'data-products:createVersion.versionPlaceholderSemver'
          : 'data-products:createVersion.versionPlaceholder')}
        error={error}
        classNames={FIELD_CLASSES}
      />
    </Dialog>
  );
};

export default CreateVersionDialog; 
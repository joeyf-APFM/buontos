import { useEffect, useState } from 'react';
import { TextInput } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import type { InputPort } from '@/types/data-product';
import { FIELD_CLASSES, HINT_BELOW } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';

type InputPortFormProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (port: InputPort) => Promise<void>;
  initial?: InputPort;
};

export default function InputPortFormDialog({ isOpen, onOpenChange, onSubmit, initial }: InputPortFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation(['data-products', 'common']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [contractId, setContractId] = useState('');
  const [assetType, setAssetType] = useState('');
  const [assetIdentifier, setAssetIdentifier] = useState('');

  useEffect(() => {
    if (isOpen && initial) {
      setName(initial.name || '');
      setVersion(initial.version || '1.0.0');
      setContractId(initial.contractId || '');
      setAssetType(initial.assetType || '');
      setAssetIdentifier(initial.assetIdentifier || '');
    } else if (isOpen && !initial) {
      setName('');
      setVersion('1.0.0');
      setContractId('');
      setAssetType('');
      setAssetIdentifier('');
    }
  }, [isOpen, initial]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: 'Validation Error', description: 'Port name is required', variant: 'destructive' });
      return;
    }

    if (!version.trim()) {
      toast({ title: 'Validation Error', description: 'Port version is required', variant: 'destructive' });
      return;
    }

    if (!contractId.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Contract ID is required (ODPS v1.0.0 requirement)',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const port: InputPort = {
        name: name.trim(),
        version: version.trim(),
        contractId: contractId.trim(),
        assetType: assetType.trim() || undefined,
        assetIdentifier: assetIdentifier.trim() || undefined,
      };

      await onSubmit(port);
      onOpenChange(false);
      toast({
        title: 'Success',
        description: initial ? 'Consumable updated' : 'Consumable added',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to save consumable',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="md"
      title={initial ? t('data-products:inputPortForm.editTitle') : t('data-products:inputPortForm.addTitle')}
      description={t('data-products:inputPortForm.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : initial ? 'Save Changes' : 'Add Consumable'}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <TextInput
          id="name"
          label={t('data-products:inputPortForm.labels.consumableName')}
          withAsterisk
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder={t('data-products:inputPortForm.placeholders.name')}
          classNames={FIELD_CLASSES}
          data-autofocus
        />

        <TextInput
          id="version"
          label={t('common:labels.version')}
          withAsterisk
          value={version}
          onChange={(e) => setVersion(e.currentTarget.value)}
          placeholder="1.0.0"
          description="Version of this consumable (e.g., 1.0.0, 2.1.3)"
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />

        <TextInput
          id="contractId"
          label={t('data-products:inputPortForm.labels.contractId')}
          withAsterisk
          value={contractId}
          onChange={(e) => setContractId(e.currentTarget.value)}
          placeholder={t('data-products:inputPortForm.placeholders.contractId')}
          description="Reference to the data contract ID (REQUIRED in ODPS v1.0.0)"
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />

        <section className={form.section}>
          <h4 className={form.sectionTitle}>{t('data-products:inputPortForm.labels.databricksExtensions')}</h4>

          <TextInput
            id="assetType"
            label={t('data-products:inputPortForm.labels.assetType')}
            value={assetType}
            onChange={(e) => setAssetType(e.currentTarget.value)}
            placeholder={t('data-products:inputPortForm.placeholders.assetType')}
            description="Type of Databricks asset"
            inputWrapperOrder={HINT_BELOW}
            classNames={FIELD_CLASSES}
          />

          <TextInput
            id="assetIdentifier"
            label={t('data-products:inputPortForm.labels.assetIdentifier')}
            value={assetIdentifier}
            onChange={(e) => setAssetIdentifier(e.currentTarget.value)}
            placeholder={t('data-products:inputPortForm.placeholders.assetIdentifier')}
            description="Unique identifier for the Databricks asset"
            inputWrapperOrder={HINT_BELOW}
            classNames={FIELD_CLASSES}
          />
        </section>
      </div>
    </Dialog>
  );
}

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Loader, Select, TextInput } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES, HINT_BELOW, SELECT_CLASSES } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import { AlertCircle, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';

interface CreateFromContractDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractName: string;
  onSuccess?: (productId: string) => void;
}

const PRODUCT_TYPES = [
  { value: 'source', label: 'Source' },
  { value: 'source-aligned', label: 'Source Aligned' },
  { value: 'aggregate', label: 'Aggregate' },
  { value: 'consumer-aligned', label: 'Consumer Aligned' },
  { value: 'sink', label: 'Sink' },
];

const CreateFromContractDialog: React.FC<CreateFromContractDialogProps> = ({
  isOpen,
  onOpenChange,
  contractId,
  contractName,
  onSuccess,
}) => {
  const { post } = useApi();
  const { toast } = useToast();
  const { t } = useTranslation(['data-products', 'common']);

  const [productName, setProductName] = useState('');
  const [productType, setProductType] = useState<string>('source-aligned');
  const [version, setVersion] = useState('v1.0.0');
  const [outputPortName, setOutputPortName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    // Validation
    if (!productName.trim()) {
      setError(t('data-products:createFromContract.errors.nameRequired'));
      return;
    }

    if (!version.trim()) {
      setError(t('data-products:createFromContract.errors.versionRequired'));
      return;
    }

    if (!productType) {
      setError(t('data-products:createFromContract.errors.typeRequired'));
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await post('/api/data-products/from-contract', {
        contract_id: contractId,
        product_name: productName.trim(),
        product_type: productType,
        version: version.trim(),
        output_port_name: outputPortName.trim() || undefined,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      toast({
        title: t('data-products:createFromContract.messages.productCreated'),
        description: t('data-products:createFromContract.messages.productCreatedDesc', { productName }),
      });

      // Call success callback with product ID
      const productData = response.data as { id?: string };
      if (onSuccess && productData?.id) {
        onSuccess(productData.id);
      }

      // Reset form and close dialog
      handleClose();

    } catch (e: any) {
      setError(e.message || t('data-products:createFromContract.errors.createError'));
      toast({
        title: t('common:toast.error'),
        description: e.message || t('data-products:createFromContract.errors.createError'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setProductName('');
    setProductType('source-aligned');
    setVersion('v1.0.0');
    setOutputPortName('');
    setError(null);
    onOpenChange(false);
  };

  // Reset form when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setProductName('');
      setProductType('source-aligned');
      setVersion('v1.0.0');
      setOutputPortName('');
      setError(null);
    }
  }, [isOpen]);

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="md"
      title={
        <span className={form.titleLine}>
          <FileText size={18} aria-hidden />
          {t('data-products:createFromContract.title')}
        </span>
      }
      description={t('data-products:createFromContract.description')}
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !productName.trim() || !version.trim()}
          >
            {submitting && <Loader size={12} color="currentColor" />}
            {submitting ? t('data-products:createFromContract.creating') : t('data-products:createFromContract.createButton')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        {/* Contract Information */}
        <div className={form.box}>
          <div className={form.inline}>
            <span className={form.muted}>{t('data-products:createFromContract.contractLabel')}</span>
            <span className={form.code}>{contractId}</span>
          </div>
          <div className={form.strong}>{contractName}</div>
        </div>

        {/* Product Name */}
        <TextInput
          id="product-name"
          label={t('data-products:createFromContract.productNameLabel')}
          value={productName}
          onChange={(e) => setProductName(e.currentTarget.value)}
          placeholder={t('data-products:createFromContract.productNamePlaceholder')}
          disabled={submitting}
          classNames={FIELD_CLASSES}
        />

        {/* Product Type */}
        <Select
          id="product-type"
          label={t('data-products:createFromContract.productTypeLabel')}
          placeholder={t('data-products:createFromContract.productTypePlaceholder')}
          data={PRODUCT_TYPES}
          value={productType}
          onChange={(value) => value && setProductType(value)}
          allowDeselect={false}
          disabled={submitting}
          classNames={SELECT_CLASSES}
        />

        {/* Version */}
        <TextInput
          id="version"
          label={t('data-products:createFromContract.versionLabel')}
          value={version}
          onChange={(e) => setVersion(e.currentTarget.value)}
          placeholder={t('data-products:createFromContract.versionPlaceholder')}
          disabled={submitting}
          classNames={FIELD_CLASSES}
        />

        {/* Output Port Name (Optional) */}
        <TextInput
          id="output-port-name"
          label={t('data-products:createFromContract.deliverableNameLabel')}
          value={outputPortName}
          onChange={(e) => setOutputPortName(e.currentTarget.value)}
          placeholder={t('data-products:createFromContract.deliverableNamePlaceholder', { contractName })}
          disabled={submitting}
          description={t('data-products:createFromContract.deliverableNameHint')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />

        {/* Error Alert */}
        {error && (
          <Alert color="red" variant="light" icon={<AlertCircle size={16} />} role="alert">
            {error}
          </Alert>
        )}
      </div>
    </Dialog>
  );
};

export default CreateFromContractDialog;

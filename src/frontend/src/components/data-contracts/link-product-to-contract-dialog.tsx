import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox, Loader, Radio, Select, TextInput, type SelectProps } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES, HINT_BELOW, SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import type { DataProduct, OutputPort } from '@/types/data-product';

type LinkProductToContractDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractName: string;
  onSuccess: () => void;
};

export default function LinkProductToContractDialog({
  isOpen,
  onOpenChange,
  contractId,
  contractName,
  onSuccess
}: LinkProductToContractDialogProps) {
  const { t } = useTranslation(['data-contracts', 'common']);
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [products, setProducts] = useState<DataProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<DataProduct | null>(null);
  const [assignmentMode, setAssignmentMode] = useState<'existing' | 'new'>('existing');
  const [selectedPortIndex, setSelectedPortIndex] = useState<string>('');
  const [newPortName, setNewPortName] = useState('');
  const [newPortVersion, setNewPortVersion] = useState('1.0.0');

  const availablePorts = selectedProduct?.outputPorts?.filter(port => !port.contractId) || [];

  useEffect(() => {
    if (isOpen) {
      fetchProducts();
      resetForm();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedProductId) {
      fetchProductDetails(selectedProductId);
    } else {
      setSelectedProduct(null);
    }
  }, [selectedProductId]);

  const resetForm = () => {
    setSelectedProductId('');
    setSelectedProduct(null);
    setAssignmentMode('existing');
    setSelectedPortIndex('');
    setNewPortName('');
    setNewPortVersion('1.0.0');
  };

  const fetchProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const response = await fetch('/api/data-products');
      if (!response.ok) throw new Error('Failed to fetch products');

      const data: DataProduct[] = await response.json();
      setProducts(data);
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error?.message || t('data-contracts:linkProduct.loadProductsError', 'Failed to load products'),
        variant: 'destructive'
      });
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const fetchProductDetails = async (productId: string) => {
    try {
      const response = await fetch(`/api/data-products/${productId}`);
      if (!response.ok) throw new Error('Failed to fetch product details');

      const data: DataProduct = await response.json();
      setSelectedProduct(data);

      // Reset port selection when product changes
      setSelectedPortIndex('');

      // Auto-select mode based on available ports
      if (data.outputPorts && data.outputPorts.some(p => !p.contractId)) {
        setAssignmentMode('existing');
      } else {
        setAssignmentMode('new');
      }
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error?.message || t('data-contracts:linkProduct.loadDetailsError', 'Failed to load product details'),
        variant: 'destructive'
      });
    }
  };

  const handleSubmit = async () => {
    if (!selectedProductId || !selectedProduct) {
      toast({
        title: t('data-contracts:linkProduct.validationError', 'Validation Error'),
        description: t('data-contracts:linkProduct.selectProductError', 'Please select a product'),
        variant: 'destructive'
      });
      return;
    }

    if (assignmentMode === 'existing' && selectedPortIndex === '') {
      toast({
        title: t('data-contracts:linkProduct.validationError', 'Validation Error'),
        description: t('data-contracts:linkProduct.selectDeliverableError', 'Please select a deliverable'),
        variant: 'destructive'
      });
      return;
    }

    if (assignmentMode === 'new') {
      if (!newPortName.trim()) {
        toast({
          title: t('data-contracts:linkProduct.validationError', 'Validation Error'),
          description: t('data-contracts:linkProduct.portNameRequired', 'Port name is required'),
          variant: 'destructive'
        });
        return;
      }
      if (!newPortVersion.trim()) {
        toast({
          title: t('data-contracts:linkProduct.validationError', 'Validation Error'),
          description: t('data-contracts:linkProduct.portVersionRequired', 'Port version is required'),
          variant: 'destructive'
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let updatedPorts: OutputPort[];

      if (assignmentMode === 'existing') {
        // Update existing port
        const portIdx = parseInt(selectedPortIndex);
        updatedPorts = [...(selectedProduct.outputPorts || [])];
        updatedPorts[portIdx] = {
          ...updatedPorts[portIdx],
          contractId: contractId
        };
      } else {
        // Create new port with contract
        const newPort: OutputPort = {
          name: newPortName.trim(),
          version: newPortVersion.trim(),
          contractId: contractId
        };
        updatedPorts = [...(selectedProduct.outputPorts || []), newPort];
      }

      // Normalize tags to FQN strings or tag_id objects for backend compatibility
      const normalizedTags = selectedProduct.tags?.map((tag: any) =>
        typeof tag === 'string' ? tag : (tag.fully_qualified_name || { tag_id: tag.tag_id, assigned_value: tag.assigned_value })
      );

      // Update product
      const updateResponse = await fetch(`/api/data-products/${selectedProductId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selectedProduct,
          tags: normalizedTags,
          outputPorts: updatedPorts
        })
      });

      if (!updateResponse.ok) throw new Error('Failed to link contract to product');

      toast({
        title: t('data-contracts:linkProduct.contractLinked', 'Contract Linked'),
        description: t('data-contracts:linkProduct.linkSuccess', 'Contract "{{contractName}}" successfully linked to product deliverable', { contractName })
      });

      onSuccess();
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error?.message || t('data-contracts:linkProduct.linkError', 'Failed to link contract to product'),
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const productOptions = uniqueOptions((Array.isArray(products) ? products : []).map((product) => ({
    value: product.id,
    label: product.name || t('data-contracts:linkProduct.unnamedProduct', 'Unnamed Product'),
    version: `v${product.version || t('common:states.notAvailable')}`,
    status: product.status,
  })));
  // The product's version and status beside its name, as the Radix items showed them
  const productBadges = (option: typeof productOptions[number]) => (
    <>
      <Badge variant="secondary">{option.version}</Badge>
      {option.status && <Badge variant="outline">{option.status}</Badge>}
    </>
  );
  const renderProduct: SelectProps['renderOption'] = ({ option }) => (
    <span className={form.optionLine}>
      <span>{option.label}</span>
      {productBadges(option as typeof productOptions[number])}
    </span>
  );
  const chosenProduct = productOptions.find((o) => o.value === selectedProductId);

  // The deliverables with no contract yet, by their index in the product's ports
  const portOptions = uniqueOptions(availablePorts.map((port) => {
    const actualIndex = selectedProduct?.outputPorts?.findIndex(p => p === port) ?? -1;
    return { value: actualIndex.toString(), label: port.name, version: `v${port.version}` };
  }));
  const renderPort: SelectProps['renderOption'] = ({ option }) => (
    <span className={form.optionLine}>
      <span>{option.label}</span>
      <Badge variant="outline">{(option as typeof portOptions[number]).version}</Badge>
    </span>
  );
  const chosenPort = portOptions.find((o) => o.value === selectedPortIndex);

  /** A Select's chosen badges before its chevron, as the Radix SelectValue repeated the item */
  const withBadge = (badge: ReactNode) => ({
    rightSection: (
      <span className={form.fieldBadge}>
        {badge}
        <Combobox.Chevron />
      </span>
    ),
    rightSectionWidth: 'auto' as const,
    rightSectionPointerEvents: 'none' as const,
  });

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="lg"
      title={t('data-contracts:linkProduct.title', 'Link Contract to Existing Product')}
      description={
        <>
          {t('data-contracts:linkProduct.descriptionBefore', 'Link')} <strong>{contractName}</strong> {t('data-contracts:linkProduct.descriptionAfter', 'to a deliverable of an existing data product')}
        </>
      }
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common:actions.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedProductId}
          >
            {isSubmitting ? (
              <>
                <Loader size={12} color="currentColor" />
                {t('data-contracts:linkProduct.linking', 'Linking...')}
              </>
            ) : (
              t('data-contracts:linkProduct.linkButton', 'Link to Product')
            )}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        {/* Product Selection */}
        {isLoadingProducts ? (
          <div className={form.loading} role="status" aria-label={t('data-contracts:linkProduct.selectProductLabel', 'Select Product')}>
            <Loader size={20} />
          </div>
        ) : (
          <Select
            id="product"
            label={t('data-contracts:linkProduct.selectProductLabel', 'Select Product')}
            required
            placeholder={t('data-contracts:linkProduct.chooseProductPlaceholder', 'Choose a product...')}
            data={productOptions}
            value={selectedProductId || null}
            onChange={(value) => value && setSelectedProductId(value)}
            allowDeselect={false}
            renderOption={renderProduct}
            {...(chosenProduct ? withBadge(productBadges(chosenProduct)) : {})}
            nothingFoundMessage={t('data-contracts:linkProduct.noProducts', 'No products available')}
            classNames={SELECT_CLASSES}
          />
        )}

        {/* Port Assignment Section - only show after product selected */}
        {selectedProduct && (
          <>
            <section className={form.section}>
              <Radio.Group
                label={t('data-contracts:linkProduct.deliverableAssignment', 'Deliverable Assignment')}
                value={assignmentMode}
                onChange={(value) => setAssignmentMode(value as 'existing' | 'new')}
                classNames={FIELD_CLASSES}
              >
                <div className={form.choices}>
                  <Radio
                    value="existing"
                    id="existing"
                    disabled={availablePorts.length === 0}
                    label={`${t('data-contracts:linkProduct.assignExisting', 'Assign to Existing Deliverable')}${availablePorts.length === 0 ? ` ${t('data-contracts:linkProduct.noAvailableDeliverables', '(no available deliverables)')}` : ''}`}
                  />
                  <Radio value="new" id="new" label={t('data-contracts:linkProduct.createNew', 'Create New Deliverable')} />
                </div>
              </Radio.Group>

              {assignmentMode === 'existing' && availablePorts.length > 0 && (
                <div className={form.indent}>
                  <Select
                    id="port"
                    label={t('data-contracts:linkProduct.selectDeliverableLabel', 'Select Deliverable')}
                    placeholder={t('data-contracts:linkProduct.chooseDeliverablePlaceholder', 'Choose a deliverable...')}
                    data={portOptions}
                    value={selectedPortIndex || null}
                    onChange={(value) => value && setSelectedPortIndex(value)}
                    allowDeselect={false}
                    renderOption={renderPort}
                    {...(chosenPort ? withBadge(<Badge variant="outline">{chosenPort.version}</Badge>) : {})}
                    description={t('data-contracts:linkProduct.onlyUnassigned', 'Only showing deliverables without an assigned contract')}
                    inputWrapperOrder={HINT_BELOW}
                    classNames={SELECT_CLASSES}
                  />
                </div>
              )}

              {assignmentMode === 'new' && (
                <div className={form.indent}>
                  <div className={form.form}>
                    <TextInput
                      id="portName"
                      label={t('data-contracts:linkProduct.deliverableNameLabel', 'Deliverable Name')}
                      required
                      value={newPortName}
                      onChange={(e) => setNewPortName(e.currentTarget.value)}
                      placeholder={t('data-contracts:linkProduct.deliverableNamePlaceholder', 'e.g., analytics-output')}
                      classNames={FIELD_CLASSES}
                    />
                    <TextInput
                      id="portVersion"
                      label={t('data-contracts:linkProduct.deliverableVersionLabel', 'Deliverable Version')}
                      required
                      value={newPortVersion}
                      onChange={(e) => setNewPortVersion(e.currentTarget.value)}
                      placeholder={t('data-contracts:linkProduct.deliverableVersionPlaceholder', '1.0.0')}
                      classNames={FIELD_CLASSES}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Product Info Summary */}
            <div className={form.box}>
              <div className={form.strong}>{t('data-contracts:linkProduct.selectedProduct', 'Selected Product')}</div>
              <div className={form.inline}>
                <span className={form.strong}>{selectedProduct.name}</span>
                <Badge variant="outline">v{selectedProduct.version}</Badge>
              </div>
              <div className={form.muted}>
                {t('data-contracts:linkProduct.currentDeliverables', 'Current deliverables: {{total}} ({{available}} available for linking)', { total: selectedProduct.outputPorts?.length || 0, available: availablePorts.length })}
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

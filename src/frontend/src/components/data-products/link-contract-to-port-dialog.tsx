import { useEffect, useState } from 'react';
import { Input, Loader } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import type { OutputPort, DataProduct } from '@/types/data-product';
import CreateContractInlineDialog from '@/components/data-contracts/create-contract-inline-dialog';
import EntityVersionPicker, { type ScopeValue } from '@/components/common/entity-version-picker';
import { FIELD_CLASSES, HINT_BELOW } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';

type LinkContractToPortDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  portIndex: number;
  currentPort?: OutputPort;
  onSuccess: () => void;
};

export default function LinkContractToPortDialog({
  isOpen,
  onOpenChange,
  productId,
  portIndex,
  currentPort,
  onSuccess
}: LinkContractToPortDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation(['data-products', 'common']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // PRD #442 picker value. Entity-pinned only for now — switching the
  // output-port write path to support family-follow-latest requires the
  // schema work in the reference-storage slice (still pending).
  const [pickerValue, setPickerValue] = useState<ScopeValue | null>(null);
  const [isCreateContractOpen, setIsCreateContractOpen] = useState(false);
  const [product, setProduct] = useState<DataProduct | null>(null);

  // Only contracts that are safe to attach to a live deliverable should
  // appear. The backend's role-aware visibility already enforces the
  // personal-draft and consumer rules; this filter narrows further to
  // the producer-publishable subset.
  const activeStatuses = ['active', 'approved'];

  useEffect(() => {
    if (isOpen) {
      fetchProduct();
      setPickerValue(null);
    }
  }, [isOpen]);

  const fetchProduct = async () => {
    try {
      const response = await fetch(`/api/data-products/${productId}`);
      if (response.ok) {
        const data = await response.json();
        setProduct(data);
      }
    } catch (e) {
      console.warn('Failed to fetch product:', e);
    }
  };

  const handleSubmit = async () => {
    const selectedContractId = pickerValue?.scope === 'entity' ? pickerValue.entityId : '';
    if (!selectedContractId) {
      toast({
        title: 'Validation Error',
        description: 'Please select a contract',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Fetch current product details
      const productResponse = await fetch(`/api/data-products/${productId}`);
      if (!productResponse.ok) throw new Error('Failed to fetch product');
      const productData: DataProduct = await productResponse.json();

      // Update the specific output port
      const updatedPorts = [...(productData.outputPorts || [])];
      if (updatedPorts[portIndex]) {
        updatedPorts[portIndex] = {
          ...updatedPorts[portIndex],
          contractId: selectedContractId
        };
      }

      // Normalize tags to FQN strings or tag_id objects for backend compatibility
      const normalizedTags = productData.tags?.map((tag: any) => 
        typeof tag === 'string' ? tag : (tag.fully_qualified_name || { tag_id: tag.tag_id, assigned_value: tag.assigned_value })
      );

      // Update product
      const updateResponse = await fetch(`/api/data-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...productData,
          tags: normalizedTags,
          outputPorts: updatedPorts
        })
      });

      if (!updateResponse.ok) throw new Error('Failed to link contract');

      toast({
        title: 'Contract Linked',
        description: 'Contract successfully linked to deliverable'
      });

      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to link contract',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContractCreated = (contractId: string) => {
    // The picker fetches its own list, so we just hand it the new
    // entity-pinned value; it'll resolve display metadata on next mount.
    setPickerValue({
      scope: 'entity',
      entityKind: 'contract',
      entityId: contractId,
    });
    setIsCreateContractOpen(false);
  };

  return (
    <>
      <Dialog
        opened={isOpen}
        onClose={() => onOpenChange(false)}
        size="md"
        title={t('data-products:linkContract.title')}
        description={
          <>
            {t('data-products:linkContract.descriptionPrefix')} <strong>{currentPort?.name || t('data-products:linkContract.thisDeliverable')}</strong>
          </>
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || pickerValue?.scope !== 'entity'}
            >
              {isSubmitting ? (
                <>
                  <Loader size={12} color="currentColor" />
                  Linking...
                </>
              ) : (
                'Link Contract'
              )}
            </Button>
          </>
        }
      >
        {currentPort && (
          <div className={form.box}>
            <span className={form.strong}>{t('data-products:linkContract.labels.deliverable')}</span>
            <div className={form.inline}>
              <span className={form.strong}>{currentPort.name}</span>
              <Badge variant="outline">v{currentPort.version}</Badge>
            </div>
            {currentPort.description && (
              <p className={form.muted}>{currentPort.description}</p>
            )}
          </div>
        )}

        {/* EntityVersionPicker disambiguates same-named contracts by
            showing the version inline (closes #69). Entity-pinned
            only for now; family-follow-latest mode lands once the
            output-port reference column is added. PRD #442. */}
        <Input.Wrapper
          label={t('data-products:linkContract.labels.selectContract')}
          labelElement="div"
          withAsterisk
          description={t('data-products:linkContract.statusFilterNote')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        >
          <EntityVersionPicker
            entityKind="contract"
            value={pickerValue}
            onChange={setPickerValue}
            allowedScopes={['entity']}
            statusFilter={activeStatuses}
            placeholder={t('data-products:linkContract.placeholders.chooseContract')}
          />
        </Input.Wrapper>

        <div className={form.divider}>{t('data-products:linkContract.labels.or')}</div>

        <Button
          type="button"
          variant="outline"
          className={form.fullWidth}
          onClick={() => setIsCreateContractOpen(true)}
        >
          <Plus aria-hidden />
          Create New Contract
        </Button>
      </Dialog>

      <CreateContractInlineDialog
        isOpen={isCreateContractOpen}
        onOpenChange={setIsCreateContractOpen}
        onSuccess={handleContractCreated}
        prefillData={{
          domain: product?.domain,
          domainId: product?.domain,
          tenant: product?.tenant,
          owner_team_id: product?.owner_team_id
        }}
      />
    </>
  );
}


import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Combobox, Input, Loader, Radio, Select, Switch, TextInput, Textarea, type SelectProps } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/mantine/page';
import { useToast } from '@/hooks/use-toast';
import { Plus, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { OutputPort, DataProduct } from '@/types/data-product';
import type { DataContractListItem } from '@/types/data-contract';
import type { DeliveryMethodRead } from '@/types/delivery-method';
import CreateContractInlineDialog from '@/components/data-contracts/create-contract-inline-dialog';
import { FIELD_CLASSES, HINT_BELOW, SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';

const DELIVERY_METHOD_HINT = 'How this deliverable serves data to consumers (e.g., Table Access, Serving Endpoint)';

type OutputPortFormProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (port: OutputPort) => Promise<void>;
  initial?: OutputPort;
  product?: DataProduct;
};

export default function OutputPortFormDialog({ isOpen, onOpenChange, onSubmit, initial, product }: OutputPortFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation(['data-products', 'common']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('');
  const [contractId, setContractId] = useState('');
  const [deliveryMethodId, setDeliveryMethodId] = useState('');
  const [status, setStatus] = useState('');
  const [containsPii, setContainsPii] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  
  // Delivery methods
  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethodRead[]>([]);
  const [isLoadingDeliveryMethods, setIsLoadingDeliveryMethods] = useState(false);

  // Contract selection states
  const [contractSelectionMode, setContractSelectionMode] = useState<'none' | 'existing' | 'create'>('none');
  const [contracts, setContracts] = useState<DataContractListItem[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);
  const [isCreateContractOpen, setIsCreateContractOpen] = useState(false);

  const activeStatuses = ['active', 'approved'];

  useEffect(() => {
    if (isOpen) {
      fetchDeliveryMethods();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initial) {
      setName(initial.name || '');
      setVersion(initial.version || '1.0.0');
      setDescription(initial.description || '');
      setType(initial.type || '');
      setContractId(initial.contractId || '');
      setDeliveryMethodId(initial.deliveryMethodId || '');
      setStatus(initial.status || '');
      setContainsPii(initial.containsPii || false);
      setAutoApprove(initial.autoApprove || false);
      setContractSelectionMode(initial.contractId ? 'existing' : 'none');
    } else if (isOpen && !initial) {
      setName('');
      setVersion('1.0.0');
      setDescription('');
      setType('');
      setContractId('');
      setDeliveryMethodId('');
      setStatus('');
      setContainsPii(false);
      setAutoApprove(false);
      setContractSelectionMode('none');
    }
  }, [isOpen, initial]);

  useEffect(() => {
    if (isOpen && contractSelectionMode === 'existing' && contracts.length === 0) {
      fetchContracts();
    }
  }, [isOpen, contractSelectionMode]);

  const fetchDeliveryMethods = async () => {
    setIsLoadingDeliveryMethods(true);
    try {
      const response = await fetch('/api/delivery-methods?status=active');
      if (!response.ok) throw new Error('Failed to fetch delivery methods');
      const data: DeliveryMethodRead[] = await response.json();
      setDeliveryMethods(data);
    } catch (error: any) {
      toast({
        title: 'Warning',
        description: 'Could not load delivery methods',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingDeliveryMethods(false);
    }
  };

  const fetchContracts = async () => {
    setIsLoadingContracts(true);
    try {
      const response = await fetch('/api/data-contracts');
      if (!response.ok) throw new Error('Failed to fetch contracts');
      const data: DataContractListItem[] = await response.json();
      const filteredContracts = data.filter(c => 
        activeStatuses.includes(c.status?.toLowerCase() || '')
      );
      setContracts(filteredContracts);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to load contracts',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingContracts(false);
    }
  };

  const handleContractCreated = (newContractId: string) => {
    setContractId(newContractId);
    setIsCreateContractOpen(false);
    fetchContracts();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: 'Validation Error', description: 'Name is required', variant: 'destructive' });
      return;
    }

    if (!version.trim()) {
      toast({ title: 'Validation Error', description: 'Version is required', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const port: OutputPort = {
        id: initial?.id,
        name: name.trim(),
        version: version.trim(),
        description: description.trim() || undefined,
        type: type.trim() || undefined,
        contractId: contractId.trim() || undefined,
        deliveryMethodId: deliveryMethodId || undefined,
        status: status.trim() || undefined,
        containsPii,
        autoApprove,
      };

      await onSubmit(port);
      onOpenChange(false);
      toast({
        title: 'Success',
        description: initial ? 'Deliverable updated' : 'Deliverable added',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to save deliverable',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const deliveryMethodOptions = useMemo(
    () => uniqueOptions((Array.isArray(deliveryMethods) ? deliveryMethods : []).map((dm) => ({ value: dm.id, label: dm.name, category: dm.category }))),
    [deliveryMethods],
  );
  const contractOptions = useMemo(
    () => uniqueOptions((Array.isArray(contracts) ? contracts : []).map((c) => ({ value: c.id, label: c.name, version: c.version }))),
    [contracts],
  );

  // An option's name and its badge: the delivery method's category, the contract's version
  const renderDeliveryMethod: SelectProps['renderOption'] = ({ option }) => {
    const { category } = option as typeof deliveryMethodOptions[number];
    return (
      <span className={form.optionLine}>
        <span>{option.label}</span>
        {category && <Badge variant="outline">{category}</Badge>}
      </span>
    );
  };
  const renderContract: SelectProps['renderOption'] = ({ option }) => (
    <span className={form.optionLine}>
      <span>{option.label}</span>
      <Badge variant="secondary">v{(option as typeof contractOptions[number]).version}</Badge>
    </span>
  );

  // The chosen option's badge stays in the field, before the chevron, as the
  // Radix SelectValue repeated the item's badge
  const chosenMethod = deliveryMethodOptions.find((o) => o.value === deliveryMethodId);
  const chosenContract = contractOptions.find((o) => o.value === contractId);
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

  // A switch's row: its label and hint, the switch at the end; the hint describes the switch
  const toggle = (id: string, label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className={form.toggle}>
      <div>
        <label htmlFor={id} className={form.toggleLabel}>{label}</label>
        <p id={`${id}-hint`} className={form.hint}>{hint}</p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-hint`}
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </div>
  );

  return (
    <>
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="lg"
      title={initial ? t('data-products:outputPortForm.editTitle') : t('data-products:outputPortForm.addTitle')}
      description={t('data-products:outputPortForm.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : initial ? 'Save Changes' : 'Add Deliverable'}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        {/* Required Fields */}
        <TextInput
          id="name"
          label={t('common:labels.name')}
          withAsterisk
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder={t('data-products:outputPortForm.placeholders.name')}
          classNames={FIELD_CLASSES}
          data-autofocus
        />

        <TextInput
          id="version"
          label="Version"
          withAsterisk
          value={version}
          onChange={(e) => setVersion(e.currentTarget.value)}
          placeholder="1.0.0"
          classNames={FIELD_CLASSES}
        />

        {/* Delivery Method */}
        <section className={form.section}>
          {isLoadingDeliveryMethods ? (
            <Input.Wrapper
              label={t('data-products:outputPortForm.labels.deliveryMethod')}
              labelElement="div"
              description={DELIVERY_METHOD_HINT}
              inputWrapperOrder={HINT_BELOW}
              classNames={FIELD_CLASSES}
            >
              <div className={form.loading}>
                <Loader size={14} />
                <span>Loading...</span>
              </div>
            </Input.Wrapper>
          ) : (
            <Select
              id="deliveryMethod"
              label={t('data-products:outputPortForm.labels.deliveryMethod')}
              placeholder={t('data-products:outputPortForm.placeholders.deliveryMethod')}
              data={deliveryMethodOptions}
              value={deliveryMethodId || null}
              onChange={(value) => value && setDeliveryMethodId(value)}
              allowDeselect={false}
              renderOption={renderDeliveryMethod}
              {...(chosenMethod?.category ? withBadge(<Badge variant="outline">{chosenMethod.category}</Badge>) : {})}
              description={DELIVERY_METHOD_HINT}
              inputWrapperOrder={HINT_BELOW}
              classNames={SELECT_CLASSES}
            />
          )}
        </section>

        {/* Optional Fields */}
        <section className={form.section}>
          <h4 className={form.sectionTitle}>{t('common:labels.details')}</h4>

          <Textarea
            id="description"
            label={t('common:labels.description')}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            placeholder={t('data-products:outputPortForm.placeholders.description')}
            rows={2}
            classNames={FIELD_CLASSES}
          />

          <TextInput
            id="type"
            label={t('common:labels.type')}
            value={type}
            onChange={(e) => setType(e.currentTarget.value)}
            placeholder={t('data-products:outputPortForm.placeholders.type')}
            classNames={FIELD_CLASSES}
          />

          <TextInput
            id="status"
            label={t('common:labels.status')}
            value={status}
            onChange={(e) => setStatus(e.currentTarget.value)}
            placeholder={t('data-products:outputPortForm.placeholders.status')}
            classNames={FIELD_CLASSES}
          />

          <Radio.Group
            label={t('data-products:outputPortForm.labels.contractAssignment')}
            value={contractSelectionMode}
            onChange={(value) => {
              const mode = value as 'none' | 'existing' | 'create';
              setContractSelectionMode(mode);
              if (mode === 'none') setContractId('');
            }}
            classNames={FIELD_CLASSES}
          >
            <div className={form.choices}>
              <Radio value="none" id="no-contract" label={t('data-products:outputPortForm.contractOptions.noContract')} />
              <Radio value="existing" id="existing-contract" label={t('data-products:outputPortForm.contractOptions.selectExisting')} />
              <Radio value="create" id="create-contract" label={t('data-products:outputPortForm.contractOptions.createNew')} />
            </div>
          </Radio.Group>

          {contractSelectionMode === 'existing' && (
            <div className={form.indent}>
              {isLoadingContracts ? (
                <div className={form.loading}>
                  <Loader size={14} />
                </div>
              ) : (
                <Select
                  aria-label={t('data-products:outputPortForm.contractOptions.selectExisting')}
                  placeholder={t('data-products:outputPortForm.placeholders.chooseContract')}
                  data={contractOptions}
                  value={contractId || null}
                  onChange={(value) => value && setContractId(value)}
                  allowDeselect={false}
                  renderOption={renderContract}
                  {...(chosenContract ? withBadge(<Badge variant="secondary">{`v${chosenContract.version}`}</Badge>) : {})}
                  nothingFoundMessage="No active/approved contracts available"
                  description="Only showing active/approved/certified contracts"
                  inputWrapperOrder={HINT_BELOW}
                  classNames={SELECT_CLASSES}
                />
              )}
            </div>
          )}

          {contractSelectionMode === 'create' && (
            <div className={form.indent}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateContractOpen(true)}
                className={form.fullWidth}
              >
                <Plus aria-hidden />
                Create New Contract
              </Button>
              {contractId && (
                <div className={form.box}>
                  <span>Contract created: <span className={form.code}>{contractId}</span></span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Flags */}
        <section className={form.section}>
          <h4 className={form.sectionTitle}>{t('data-products:outputPortForm.labels.accessAndPrivacy')}</h4>
          {toggle('containsPii', 'Contains PII', 'Does this deliverable contain personally identifiable information?', containsPii, setContainsPii)}
          {toggle('autoApprove', 'Auto Approve', 'Automatically approve access requests for this deliverable?', autoApprove, setAutoApprove)}
        </section>

        {/* Info note */}
        <div className={form.note}>
          <Info size={14} aria-hidden />
          <p>
            After creating this deliverable, you can link assets (tables, views, datasets, etc.) to it from the detail page.
          </p>
        </div>
      </div>
    </Dialog>

    <CreateContractInlineDialog
      isOpen={isCreateContractOpen}
      onOpenChange={setIsCreateContractOpen}
      onSuccess={handleContractCreated}
      prefillData={{
        domainIds: product?.domain_ids,
        primaryDomainId: product?.primary_domain_id,
        tenant: product?.tenant,
        owner_team_id: product?.owner_team_id
      }}
    />
  </>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Loader, Select, TextInput } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import DomainMultiSelector from '@/components/ui/domain-multi-selector';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES, HINT_BELOW, SELECT_CLASSES } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import { internalErrorText } from '@/lib/server-error-text';

type PrefillData = {
  domain?: string;
  domainId?: string;
  domainIds?: string[];
  primaryDomainId?: string | null;
  tenant?: string;
  owner_team_id?: string;
};

type CreateContractInlineDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (contractId: string) => void;
  prefillData?: PrefillData;
};

export default function CreateContractInlineDialog({
  isOpen,
  onOpenChange,
  onSuccess,
  prefillData
}: CreateContractInlineDialogProps) {
  const { t } = useTranslation(['data-contracts', 'common']);
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [status, setStatus] = useState('draft');
  const [ownerTeamId, setOwnerTeamId] = useState('');
  const [domainIds, setDomainIds] = useState<string[]>([]);
  const [primaryDomainId, setPrimaryDomainId] = useState<string | null>(null);
  const [tenant, setTenant] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Reset or prefill fields when dialog opens
      setName('');
      setVersion('1.0.0');
      setStatus('draft');
      setOwnerTeamId(prefillData?.owner_team_id || '');
      setDomainIds(prefillData?.domainIds || (prefillData?.domainId ? [prefillData.domainId] : []));
      setPrimaryDomainId(prefillData?.primaryDomainId ?? prefillData?.domainId ?? null);
      setTenant(prefillData?.tenant || '');
    }
  }, [isOpen, prefillData]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: t('data-contracts:form.validationErrorTitle', 'Validation Error'),
        description: t('data-contracts:form.nameRequired', 'Contract name is required'),
        variant: 'destructive'
      });
      return;
    }

    if (!version.trim()) {
      toast({
        title: t('data-contracts:form.validationErrorTitle', 'Validation Error'),
        description: t('data-contracts:form.versionRequired', 'Version is required'),
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        name: name.trim(),
        version: version.trim(),
        status: status,
        kind: 'DataContract',
        apiVersion: '3.0.2'
      };

      // Add optional fields if provided
      if (ownerTeamId.trim()) payload.owner_team_id = ownerTeamId.trim();
      if (domainIds.length > 0) {
        payload.domainIds = domainIds;
        payload.primaryDomainId = primaryDomainId;
      }
      if (tenant.trim()) payload.tenant = tenant.trim();

      const response = await fetch('/api/data-contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          internalErrorText(errorText) ?? (errorText || t('data-contracts:createInline.createError', 'Failed to create contract'))
        );
      }

      const createdContract = await response.json();
      
      toast({
        title: t('data-contracts:createInline.createdTitle', 'Contract Created'),
        description: t('data-contracts:createInline.createdSuccess', 'Contract "{{name}}" (v{{version}}) created successfully', { name, version })
      });

      onSuccess(createdContract.id);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: t('data-contracts:messages.error', 'Error'),
        description: error?.message || t('data-contracts:createInline.createError', 'Failed to create contract'),
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusOptions = [
    { value: 'draft', label: t('data-contracts:status.draft', 'Draft') },
    { value: 'proposed', label: t('data-contracts:status.proposed', 'Proposed') },
    { value: 'under_review', label: t('data-contracts:status.under_review', 'Under Review') },
    { value: 'active', label: t('data-contracts:status.active', 'Active') },
    { value: 'approved', label: t('data-contracts:status.approved', 'Approved') },
  ];

  // It opens over a port's form (a kit Dialog too), so its fields keep
  // Mantine's own ids: fixed ones such as "name" would be the form's twice
  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="lg"
      title={t('data-contracts:createInline.title', 'Create New Contract')}
      description={t('data-contracts:createInline.description', 'Create a minimal data contract. You can add schemas and quality rules later.')}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader size={12} color="currentColor" />
                {t('data-contracts:createInline.creating', 'Creating...')}
              </>
            ) : (
              t('data-contracts:form.createContract', 'Create Contract')
            )}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <TextInput
          label={t('data-contracts:createInline.nameLabel', 'Contract Name')}
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder={t('data-contracts:createInline.namePlaceholder', 'e.g., Customer Analytics Contract')}
          classNames={FIELD_CLASSES}
          data-autofocus
        />

        <TextInput
          label={t('data-contracts:form.version', 'Version')}
          required
          value={version}
          onChange={(e) => setVersion(e.currentTarget.value)}
          placeholder="1.0.0"
          classNames={FIELD_CLASSES}
        />

        <Select
          label={t('data-contracts:form.status', 'Status')}
          data={statusOptions}
          value={status}
          onChange={(value) => value && setStatus(value)}
          allowDeselect={false}
          classNames={SELECT_CLASSES}
        />

        <Input.Wrapper label={t('data-contracts:form.domains', 'Domains')} labelElement="div" classNames={FIELD_CLASSES}>
          <DomainMultiSelector
            value={domainIds}
            primaryDomainId={primaryDomainId}
            onChange={(nextIds, nextPrimary) => {
              setDomainIds(nextIds);
              setPrimaryDomainId(nextPrimary);
            }}
            placeholder={t('data-contracts:form.selectDomainsOptional', 'Select domains (optional)')}
          />
        </Input.Wrapper>

        <TextInput
          label={t('data-contracts:form.tenant', 'Tenant')}
          value={tenant}
          onChange={(e) => setTenant(e.currentTarget.value)}
          placeholder={t('data-contracts:createInline.tenantPlaceholder', 'e.g., production')}
          classNames={FIELD_CLASSES}
        />

        <TextInput
          label={t('data-contracts:createInline.ownerTeamIdLabel', 'Owner Team ID')}
          value={ownerTeamId}
          onChange={(e) => setOwnerTeamId(e.currentTarget.value)}
          placeholder={t('data-contracts:createInline.ownerTeamIdPlaceholder', 'UUID of owning team')}
          description={t('data-contracts:createInline.ownerTeamIdHint', 'Optional: Inherited from product if available')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />
      </div>
    </Dialog>
  );
}

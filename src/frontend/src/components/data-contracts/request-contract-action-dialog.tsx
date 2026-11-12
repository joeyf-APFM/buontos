import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Loader, Select, TextInput, Textarea, type SelectProps } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES, HINT_BELOW, SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import classes from './contract-form-dialogs.module.css';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { contractActionErrorText } from '@/lib/contract-action-error';
import { needsStatusChangeRequest } from '@/lib/status-change-error';
import { useNotificationsStore } from '@/stores/notifications-store';
import { AlertCircle, FileText, Eye, Database, ShieldCheck, Info, RefreshCw, Rocket } from 'lucide-react';
import type { DeploymentPolicy } from '@/types/deployment-policy';
import AccessRequestFields from '@/components/access/access-request-fields';
import {
  getAllowedTransitions,
  getStatusConfig,
  getStatusText,
  getRecommendedActionText,
} from '@/lib/odcs-lifecycle';

type RequestType = 'access' | 'review' | 'deploy' | 'publish' | 'certify' | 'status_change';

interface CertificationLevelOption {
  id: string;
  level_order: number;
  name: string;
  color: string | null;
}

interface RequestContractActionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractName?: string;
  contractStatus?: string;
  onSuccess?: () => void;
  /** If true, status changes are applied directly without approval workflow */
  canDirectStatusChange?: boolean;
}

export default function RequestContractActionDialog({
  isOpen,
  onOpenChange,
  contractId,
  contractName,
  contractStatus,
  onSuccess,
  canDirectStatusChange: allowDirectStatusChange = false
}: RequestContractActionDialogProps) {
  const { t } = useTranslation(['data-contracts', 'common']);
  const { post, get } = useApi();
  const { toast } = useToast();
  const refreshNotifications = useNotificationsStore((state) => state.refreshNotifications);
  // A contract status in the UI language (the API and the lifecycle use the raw value)
  const statusLabel = (status?: string) =>
    t(`data-contracts:status.${(status || '').toLowerCase()}`, { defaultValue: status || '' });
  
  const [requestType, setRequestType] = useState<RequestType>('deploy');
  const [message, setMessage] = useState('');
  const [justification, setJustification] = useState('');
  const [catalog, setCatalog] = useState('');
  const [schema, setSchema] = useState('');
  const [targetStatus, setTargetStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  
  // Deployment policy state
  const [deploymentPolicy, setDeploymentPolicy] = useState<DeploymentPolicy | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [certificationLevel, setCertificationLevel] = useState<number | null>(null);
  const [certificationLevels, setCertificationLevels] = useState<CertificationLevelOption[]>([]);
  const [publicationScope, setPublicationScope] = useState('organization');
  // A direct change the API refused because the contract is certified: the
  // user can send it as a status change request instead (certified guard)
  const [canRequestInstead, setCanRequestInstead] = useState(false);
  const [requestInstead, setRequestInstead] = useState(false);
  const canDirectStatusChange = allowDirectStatusChange && !requestInstead;

  useEffect(() => {
    get<CertificationLevelOption[]>('/api/certification-levels').then(({ data }) => {
      if (Array.isArray(data)) setCertificationLevels(data);
    });
  }, [get]);

  useEffect(() => {
    if (isOpen) {
      setCertificationLevel(null);
      setPublicationScope('organization');
      setCanRequestInstead(false);
      setRequestInstead(false);
    }
  }, [isOpen]);

  const getRequestTypeConfig = (type: RequestType) => {
    switch (type) {
      case 'access':
        return {
          icon: <Eye size={14} aria-hidden />,
          title: t('data-contracts:requests.access.title', 'Request Access to Contract'),
          description: t('data-contracts:requests.access.description', 'Request permission to view and use this data contract.'),
          enabled: true,
          endpoint: '/api/access-grants/request',
        };
      case 'review':
        return {
          icon: <FileText size={14} aria-hidden />,
          title: t('data-contracts:requests.review.title', 'Request Data Steward Review'),
          description: t('data-contracts:requests.review.description', 'Submit this contract for review by a data steward (transitions to PROPOSED status).'),
          enabled: contractStatus?.toLowerCase() === 'draft',
          endpoint: `/api/data-contracts/${contractId}/request-review`,
        };
      case 'deploy':
        return {
          icon: <Database size={14} aria-hidden />,
          title: t('data-contracts:requests.deploy.title', 'Request Deploy to Unity Catalog'),
          description: t('data-contracts:requests.deploy.description', 'Request approval to deploy this contract to Unity Catalog.'),
          enabled: true,
          endpoint: `/api/data-contracts/${contractId}/request-deploy`,
        };
      case 'publish':
        return {
          icon: <Rocket size={14} aria-hidden />,
          title: t('data-contracts:requests.publish.title', 'Request Publish'),
          description: t('data-contracts:requests.publish.description', 'Request to publish this contract with a defined visibility scope.'),
          enabled:
            contractStatus?.toLowerCase() === 'approved' ||
            contractStatus?.toLowerCase() === 'active',
          endpoint: `/api/data-contracts/${contractId}/request-publish`,
        };
      case 'certify':
        return {
          icon: <ShieldCheck size={14} aria-hidden />,
          title: t('data-contracts:requests.certify.title', 'Request Certification'),
          description: t('data-contracts:requests.certify.description', 'Request that this contract be certified at a specific level.'),
          enabled: true,
          endpoint: `/api/data-contracts/${contractId}/request-certify`,
        };
      case 'status_change':
        const allowedTransitions = contractStatus ? getAllowedTransitions(contractStatus) : [];
        return {
          icon: <RefreshCw size={14} aria-hidden />,
          title: canDirectStatusChange
            ? t('data-contracts:requests.statusChange.changeTitle', 'Change Status')
            : t('data-contracts:requests.statusChange.requestTitle', 'Request Status Change'),
          description: canDirectStatusChange
            ? t('data-contracts:requests.statusChange.changeDescription', 'Directly change the lifecycle status of this contract.')
            : t('data-contracts:requests.statusChange.requestDescription', 'Request approval to change the lifecycle status of this contract.'),
          enabled: allowedTransitions.length > 0,
          endpoint: canDirectStatusChange 
            ? `/api/data-contracts/${contractId}/change-status`
            : `/api/data-contracts/${contractId}/request-status-change`,
        };
    }
  };

  const validateForm = (): boolean => {
    setError(null);
    
    if (requestType === 'access') {
      if (!message.trim()) {
        setError(t('data-contracts:requests.validation.accessReasonRequired', 'Please provide a reason for requesting access'));
        return false;
      }
      if (message.trim().length < 10) {
        setError(t('data-contracts:requests.validation.accessReasonTooShort', 'Please provide a more detailed reason (at least 10 characters)'));
        return false;
      }
    }
    
    if (requestType === 'review') {
      // Message is optional for review
    }
    
    if (requestType === 'deploy') {
      // Catalog and schema are optional
    }
    
    if (requestType === 'status_change') {
      if (!targetStatus) {
        setError(t('data-contracts:requests.validation.targetStatusRequired', 'Please select a target status'));
        return false;
      }
      // Justification is only required for approval requests, not direct changes
      if (!canDirectStatusChange) {
        if (!justification.trim()) {
          setError(t('data-contracts:requests.validation.justificationRequired', 'Please provide a justification for the status change'));
          return false;
        }
        if (justification.trim().length < 20) {
          setError(t('data-contracts:requests.validation.justificationTooShort', 'Please provide a more detailed justification (at least 20 characters)'));
          return false;
        }
      }
    }

    if (requestType === 'certify') {
      if (!certificationLevel) {
        setError(t('data-contracts:requests.validation.certLevelRequired', 'Please select a certification level'));
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    const config = getRequestTypeConfig(requestType);
    if (!config.enabled) {
      setError(t('data-contracts:requests.cannotRequest', '"{{type}}" isn\'t available for a contract with status {{status}}.', { type: config.title, status: statusLabel(contractStatus) }));
      return;
    }

    setError(null);
    setCanRequestInstead(false);
    setSubmitting(true);

    try {
      let payload: any;
      
      if (requestType === 'access') {
        // Use access grants endpoint
        payload = {
          entity_type: 'data_contract',
          entity_id: contractId,
          reason: message.trim(),
          requested_permission_level: 'READ',
          requested_duration_days: selectedDuration,
        };
      } else if (requestType === 'review') {
        payload = {
          message: message.trim() || undefined,
        };
      } else if (requestType === 'deploy') {
        payload = {
          catalog: catalog.trim() || undefined,
          schema: schema.trim() || undefined,
          message: message.trim() || undefined,
        };
      } else if (requestType === 'publish') {
        payload = {
          scope: publicationScope,
          justification: justification.trim() || undefined,
        };
      } else if (requestType === 'certify') {
        if (!certificationLevel) {
          setError(t('data-contracts:requests.validation.certLevelRequired', 'Please select a certification level'));
          setSubmitting(false);
          return;
        }
        payload = {
          certification_level: certificationLevel,
          message: message.trim() || undefined,
        };
      } else if (requestType === 'status_change') {
        if (canDirectStatusChange) {
          // Direct status change - different payload format
          payload = {
            new_status: targetStatus,
          };
        } else {
          // Request for approval
          payload = {
            target_status: targetStatus,
            justification: justification.trim(),
            current_status: contractStatus,
          };
        }
      }

      const response = await post(config.endpoint, payload);

      if (response.error) {
        setCanRequestInstead(
          requestType === 'status_change' && needsStatusChangeRequest(response),
        );
        throw new Error(contractActionErrorText(response, t));
      }

      // The request type as a word of the toasts' sentences, in the UI language
      const requestTypeName = t(`data-contracts:requests.toast.requestTypes.${requestType}`, { defaultValue: requestType });
      // The request was recorded; a failed workflow means nobody was asked to decide
      const outcome = response.data as
        | { workflow_status?: string; workflow_error_params?: { workflow?: string; failed_workflows?: string[] } }
        | undefined;
      if (outcome?.workflow_status === 'failed') {
        // The step's own error stays with the execution (admins open it in Workflows)
        toast({
          title: t('data-contracts:requests.toast.workflowFailedTitle', 'Request sent, but its workflow failed'),
          description: t('data-contracts:requests.toast.workflowFailedDescription', 'Nobody was asked to decide on your {{type}} request: its workflow "{{workflow}}" could not start. Please contact an administrator.', { type: requestTypeName, workflow: outcome.workflow_error_params?.workflow ?? '' }),
          variant: 'destructive',
        });
      } else if (outcome?.workflow_status === 'partially_failed') {
        // Some workflows succeeded/paused but at least one failed
        const failedWorkflows = outcome.workflow_error_params?.failed_workflows ?? [];
        toast({
          title: t('data-contracts:requests.toast.workflowPartiallyFailedTitle', 'Some request workflows failed'),
          description: t('data-contracts:requests.toast.workflowPartiallyFailedDescription', 'One of the {{type}} request workflows failed: {{workflows}}. Other approvals may still be pending.', { type: requestTypeName, workflows: failedWorkflows.join(', ') }),
          variant: 'destructive',
        });
      } else if (requestType === 'status_change' && canDirectStatusChange) {
        // Different success messages for direct changes vs requests
        toast({
          title: t('data-contracts:requests.toast.statusChangedTitle', 'Status Changed'),
          description: t('data-contracts:requests.toast.statusChangedDescription', 'Contract status changed from "{{from}}" to "{{to}}".', { from: statusLabel(contractStatus), to: statusLabel(targetStatus) })
        });
      } else {
        toast({
          title: t('data-contracts:requests.toast.submittedTitle', 'Request Submitted'),
          description: t('data-contracts:requests.toast.submittedDescription', 'Your {{type}} request has been submitted and you will be notified of the decision.', { type: requestTypeName })
        });
      }

      // Refresh notifications
      refreshNotifications();

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }

      // Reset form and close dialog
      setMessage('');
      setJustification('');
      setCatalog('');
      setSchema('');
      setTargetStatus('');
      setCertificationLevel(null);
      setPublicationScope('organization');
      onOpenChange(false);

    } catch (e: any) {
      setError(e.message || t('data-contracts:requests.errors.submitFailed', 'Failed to submit request'));
      toast({
        title: t('common:toast.error', 'Error'),
        description: e.message || t('data-contracts:requests.errors.submitFailed', 'Failed to submit request'),
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setMessage('');
    setJustification('');
    setCatalog('');
    setSchema('');
    setTargetStatus('');
    setError(null);
    onOpenChange(false);
  };

  // Fetch deployment policy when deploy option is selected
  useEffect(() => {
    const fetchDeploymentPolicy = async () => {
      if (requestType === 'deploy' && isOpen) {
        setLoadingPolicy(true);
        setPolicyError(null);
        
        try {
          const response = await get('/api/user/deployment-policy');
          
          if (response.error) {
            throw new Error(response.error);
          }
          
          const answer = response.data as Partial<DeploymentPolicy> | undefined;
          // No policy at all is an error (shown as one), not a policy with no catalogs
          if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
            throw new Error(t('data-contracts:requests.errors.loadPolicyFailed', 'Failed to load deployment policy'));
          }
          // Guard the lists the API sends: the form reads them as arrays
          const policy = {
            ...answer,
            allowed_catalogs: Array.isArray(answer?.allowed_catalogs) ? answer.allowed_catalogs : [],
            allowed_schemas: Array.isArray(answer?.allowed_schemas) ? answer.allowed_schemas : [],
          } as DeploymentPolicy;
          setDeploymentPolicy(policy);
          
          // Pre-populate with default catalog/schema if available and fields are empty
          if (policy.default_catalog && !catalog) {
            setCatalog(policy.default_catalog);
          }
          if (policy.default_schema && !schema) {
            setSchema(policy.default_schema);
          }
        } catch (e: any) {
          setPolicyError(e.message || t('data-contracts:requests.errors.loadPolicyFailed', 'Failed to load deployment policy'));
          console.error('Error fetching deployment policy:', e);
        } finally {
          setLoadingPolicy(false);
        }
      }
    };
    
    fetchDeploymentPolicy();
  }, [requestType, isOpen, get]);
  
  const currentConfig = getRequestTypeConfig(requestType);

  // The request types, in the old order, each with its icon
  const requestTypeOptions = (
    ['status_change', 'deploy', 'review', 'publish', 'certify', 'access'] as RequestType[]
  ).map((type) => {
    const config = getRequestTypeConfig(type);
    return { value: type, label: config.title, disabled: !config.enabled, icon: config.icon };
  });
  const renderRequestType: SelectProps['renderOption'] = ({ option }) => (
    <span className={form.optionLine}>
      {requestTypeOptions.find((o) => o.value === option.value)?.icon}
      <span>{option.label}</span>
    </span>
  );

  const allowedTransitions = contractStatus ? getAllowedTransitions(contractStatus) : [];
  /** A status's icon (an emoji) before its name */
  const statusLine = (status: string): ReactNode => (
    <span className={form.optionLine}>
      <span className={classes.statusIcon} aria-hidden>{getStatusConfig(status).icon}</span>
      <span>{getStatusText(status, t).label}</span>
    </span>
  );
  const transitionOptions = uniqueOptions(allowedTransitions.map((status) => ({ value: status, label: getStatusText(status, t).label })));
  const renderTransition: SelectProps['renderOption'] = ({ option }) => statusLine(option.value);

  const scopeOptions = [
    { value: 'domain', label: t('data-contracts:requests.publish.scopeDomain', 'Domain') },
    { value: 'organization', label: t('data-contracts:requests.publish.scopeOrganization', 'Organization') },
    { value: 'external', label: t('data-contracts:requests.publish.scopeExternal', 'External') },
  ];
  const certificationLevelOptions = uniqueOptions(certificationLevels.map((l) => ({ value: l.level_order.toString(), label: l.name })));

  /** A hint with its info icon, under a deployment target */
  const iconHint = (text: string) => (
    <div className={classes.iconHint}>
      <Info size={12} aria-hidden />
      {text}
    </div>
  );

  const LIFECYCLE = ['draft', 'proposed', 'under_review', 'approved', 'active', 'deprecated', 'retired'];

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="md"
      title={t('data-contracts:requests.dialogTitle', 'Request Action')}
      description={t('data-contracts:requests.dialogDescription', 'Select the type of request you want to submit for this data contract.')}
      footer={
        <>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={submitting}
          >
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !currentConfig.enabled}
          >
            {submitting && <Loader size={12} color="currentColor" />}
            {submitting
              ? (requestType === 'status_change' && canDirectStatusChange ? t('data-contracts:requests.changingStatus', 'Changing Status...') : t('data-contracts:requests.sendingRequest', 'Sending Request...'))
              : (requestType === 'status_change' && canDirectStatusChange ? t('data-contracts:requests.statusChange.changeTitle', 'Change Status') : t('data-contracts:requests.sendRequest', 'Send Request'))}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        {/* Contract Information */}
        <div className={form.box}>
          <div className={form.inline}>
            <span className={form.muted}>{t('data-contracts:requests.contractLabel', 'Contract:')}</span>
            <span className={form.code}>{contractId}</span>
          </div>
          {contractName && (
            <div className={form.strong}>{contractName}</div>
          )}
          {contractStatus && (
            <div className={form.muted}>
              {t('data-contracts:requests.statusLabel', 'Status:')} <span className={classes.upper}>{getStatusText(contractStatus, t).label}</span>
            </div>
          )}
        </div>

        {/* Request Type Selection */}
        <Select
          id="request-type"
          label={t('data-contracts:requests.requestTypeLabel', 'Request Type *')}
          data={requestTypeOptions.map(({ value, label, disabled }) => ({ value, label, disabled }))}
          value={requestType}
          onChange={(value) => value && setRequestType(value as RequestType)}
          allowDeselect={false}
          renderOption={renderRequestType}
          // The chosen type's icon stays in the field, as the Radix SelectValue repeated it
          leftSection={currentConfig.icon}
          leftSectionPointerEvents="none"
          classNames={SELECT_CLASSES}
        />
        <div className={form.box}>
          <p className={form.muted}>{currentConfig.description}</p>
          {!currentConfig.enabled && (
            <p className={form.error}>
              {t('data-contracts:requests.notAvailableForStatus', "Not available for status '{{status}}'", { status: statusLabel(contractStatus) })}
            </p>
          )}
        </div>

        {/* Dynamic Form Fields - Access Request using shared component */}
        {requestType === 'access' && (
          <AccessRequestFields
            entityType="data_contract"
            message={message}
            onMessageChange={setMessage}
            selectedDuration={selectedDuration}
            onDurationChange={setSelectedDuration}
            disabled={submitting}
          />
        )}

        {requestType === 'review' && (
          <Textarea
            id="review-message"
            label={t('data-contracts:requests.messageOptionalLabel', 'Message (Optional)')}
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            placeholder={t('data-contracts:requests.review.messagePlaceholder', 'Add any notes for the data steward reviewing this contract...')}
            autosize
            minRows={3}
            maxRows={10}
            disabled={submitting}
            classNames={FIELD_CLASSES}
          />
        )}

        {requestType === 'publish' && (
          <>
            <Select
              id="contract-pub-scope"
              label={t('data-contracts:requests.publish.scopeLabel', 'Publication Scope *')}
              data={scopeOptions}
              value={publicationScope}
              onChange={(value) => value && setPublicationScope(value)}
              allowDeselect={false}
              disabled={submitting}
              classNames={SELECT_CLASSES}
            />
            <Textarea
              id="contract-publish-justification"
              label={t('data-contracts:requests.publish.justificationLabel', 'Justification (optional)')}
              value={justification}
              onChange={(e) => setJustification(e.currentTarget.value)}
              placeholder={t('data-contracts:requests.publish.justificationPlaceholder', 'Why should this contract be published?')}
              autosize
              minRows={3}
              maxRows={10}
              disabled={submitting}
              classNames={FIELD_CLASSES}
            />
          </>
        )}

        {requestType === 'certify' && (
          <>
            <Select
              id="contract-cert-level"
              label={t('data-contracts:requests.certify.levelLabel', 'Certification Level *')}
              placeholder={t('data-contracts:requests.certify.levelPlaceholder', 'Select certification level')}
              data={certificationLevelOptions}
              value={certificationLevel !== null ? certificationLevel.toString() : null}
              onChange={(v) => v && setCertificationLevel(parseInt(v, 10))}
              allowDeselect={false}
              disabled={submitting}
              classNames={SELECT_CLASSES}
            />
            <Textarea
              id="contract-cert-message"
              label={t('data-contracts:requests.certify.messageLabel', 'Message (optional)')}
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
              placeholder={t('data-contracts:requests.certify.messagePlaceholder', 'Why should this contract be certified?')}
              autosize
              minRows={3}
              maxRows={10}
              disabled={submitting}
              classNames={FIELD_CLASSES}
            />
          </>
        )}

        {requestType === 'deploy' && (
          <>
            {/* Loading Policy Indicator */}
            {loadingPolicy && (
              <Alert color="gray" variant="light" icon={<Loader size={14} />}>
                {t('data-contracts:requests.deploy.loadingPolicy', 'Loading deployment policy...')}
              </Alert>
            )}

            {/* Policy Error */}
            {policyError && (
              <Alert color="red" variant="light" icon={<AlertCircle size={16} />}>
                {policyError}
              </Alert>
            )}

            {/* Policy Info Banner */}
            {deploymentPolicy && !loadingPolicy && (
              <Alert color="blue" variant="light" icon={<ShieldCheck size={16} />}>
                <strong>{t('data-contracts:requests.deploy.policyLabel', 'Deployment Policy:')}</strong> {t('data-contracts:requests.deploy.youCanDeployTo', 'You can deploy to')}{' '}
                {deploymentPolicy.allowed_catalogs.length === 0
                  ? t('data-contracts:requests.deploy.noCatalogsContactAdmin', 'no catalogs (contact admin)')
                  : deploymentPolicy.allowed_catalogs.length === 1
                  ? `${deploymentPolicy.allowed_catalogs[0]}`
                  : t('data-contracts:requests.deploy.allowedCatalogsCount', '{{count}} allowed catalogs', { count: deploymentPolicy.allowed_catalogs.length })}
                {deploymentPolicy.require_approval && t('data-contracts:requests.deploy.requiresApprovalSuffix', ' (requires approval)')}
              </Alert>
            )}

            <div className={form.row}>
              {/* Catalog Dropdown or Input */}
              <div>
                {deploymentPolicy && deploymentPolicy.allowed_catalogs.length > 0 && deploymentPolicy.allowed_catalogs.includes('*') ? (
                  // Wildcard - allow any catalog via text input
                  <TextInput
                    id="deploy-catalog"
                    label={t('data-contracts:requests.deploy.targetCatalogLabel', 'Target Catalog (Optional)')}
                    value={catalog}
                    onChange={(e) => setCatalog(e.currentTarget.value)}
                    placeholder={deploymentPolicy.default_catalog || t('data-contracts:requests.deploy.enterCatalogPlaceholder', 'Enter catalog name...')}
                    disabled={submitting || loadingPolicy}
                    classNames={FIELD_CLASSES}
                  />
                ) : deploymentPolicy && deploymentPolicy.allowed_catalogs.length > 0 ? (
                  // Specific catalogs - show dropdown
                  <Select
                    id="deploy-catalog"
                    label={t('data-contracts:requests.deploy.targetCatalogLabel', 'Target Catalog (Optional)')}
                    placeholder={t('data-contracts:requests.deploy.selectCatalogPlaceholder', 'Select catalog...')}
                    data={uniqueOptions(deploymentPolicy.allowed_catalogs.map((cat) => ({ value: cat, label: cat })))}
                    value={catalog || null}
                    onChange={(value) => value && setCatalog(value)}
                    allowDeselect={false}
                    disabled={submitting || loadingPolicy}
                    classNames={SELECT_CLASSES}
                  />
                ) : (
                  // No catalogs available
                  <Select
                    id="deploy-catalog"
                    label={t('data-contracts:requests.deploy.targetCatalogLabel', 'Target Catalog (Optional)')}
                    placeholder={t('data-contracts:requests.deploy.noCatalogsAvailable', 'No catalogs available')}
                    data={[]}
                    value={null}
                    disabled
                    classNames={SELECT_CLASSES}
                  />
                )}
                {deploymentPolicy?.default_catalog && catalog === deploymentPolicy.default_catalog &&
                  iconHint(t('data-contracts:requests.deploy.defaultCatalogForRole', 'Default catalog for your role'))}
                {deploymentPolicy?.allowed_catalogs.includes('*') &&
                  iconHint(t('data-contracts:requests.deploy.anyCatalog', 'You can deploy to any catalog'))}
              </div>

              {/* Schema Dropdown or Input */}
              <div>
                {deploymentPolicy && deploymentPolicy.allowed_schemas.length > 0 && !deploymentPolicy.allowed_schemas.includes('*') ? (
                  // Specific schemas - show dropdown
                  <Select
                    id="deploy-schema"
                    label={t('data-contracts:requests.deploy.targetSchemaLabel', 'Target Schema (Optional)')}
                    placeholder={t('data-contracts:requests.deploy.selectSchemaPlaceholder', 'Select schema...')}
                    data={uniqueOptions(deploymentPolicy.allowed_schemas.map((sch) => ({ value: sch, label: sch })))}
                    value={schema || null}
                    onChange={(value) => value && setSchema(value)}
                    allowDeselect={false}
                    disabled={submitting || loadingPolicy}
                    classNames={SELECT_CLASSES}
                  />
                ) : (
                  // A wildcard, or no specific schemas: any schema, as text
                  <TextInput
                    id="deploy-schema"
                    label={t('data-contracts:requests.deploy.targetSchemaLabel', 'Target Schema (Optional)')}
                    value={schema}
                    onChange={(e) => setSchema(e.currentTarget.value)}
                    placeholder={deploymentPolicy?.default_schema || t('data-contracts:requests.deploy.enterSchemaPlaceholder', 'Enter schema name...')}
                    disabled={submitting || loadingPolicy}
                    classNames={FIELD_CLASSES}
                  />
                )}
                {deploymentPolicy?.default_schema && schema === deploymentPolicy.default_schema &&
                  iconHint(t('data-contracts:requests.deploy.defaultSchemaForRole', 'Default schema for your role'))}
                {deploymentPolicy && (deploymentPolicy.allowed_schemas.length === 0 || deploymentPolicy.allowed_schemas.includes('*')) &&
                  iconHint(t('data-contracts:requests.deploy.anySchema', 'You can deploy to any schema'))}
              </div>
            </div>

            <Textarea
              id="deploy-message"
              label={t('data-contracts:requests.messageOptionalLabel', 'Message (Optional)')}
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
              placeholder={t('data-contracts:requests.deploy.messagePlaceholder', 'Add any deployment notes or requirements...')}
              autosize
              minRows={2}
              maxRows={10}
              disabled={submitting}
              classNames={FIELD_CLASSES}
            />
          </>
        )}

        {requestType === 'status_change' && (
          <>
            {/* Current Status */}
            {contractStatus && (
              <div className={form.box}>
                <div className={classes.statusLine}>
                  <span className={form.strong}>{t('data-contracts:requests.statusChange.currentStatusLabel', 'Current Status:')}</span>
                  {statusLine(contractStatus)}
                </div>
                <p className={form.muted}>{getStatusText(contractStatus, t).description}</p>
              </div>
            )}

            {/* Recommended Action */}
            {contractStatus && getRecommendedActionText(contractStatus, t) && (
              <Alert color="gray" variant="light" icon={<Info size={16} />}>
                <strong>{t('data-contracts:requests.statusChange.recommendedLabel', 'Recommended:')}</strong> {getRecommendedActionText(contractStatus, t)}
              </Alert>
            )}

            {/* Target Status Selection */}
            {contractStatus && allowedTransitions.length > 0 ? (
              <>
                <Select
                  id="target-status"
                  label={t('data-contracts:requests.statusChange.selectTargetLabel', 'Select Target Status *')}
                  placeholder={t('data-contracts:requests.statusChange.chooseTargetPlaceholder', 'Choose target status...')}
                  data={transitionOptions}
                  value={targetStatus || null}
                  onChange={(value) => value && setTargetStatus(value)}
                  allowDeselect={false}
                  renderOption={renderTransition}
                  // The chosen status's icon stays in the field, as the Radix SelectValue showed it
                  leftSection={targetStatus ? <span className={classes.statusIcon} aria-hidden>{getStatusConfig(targetStatus).icon}</span> : undefined}
                  leftSectionPointerEvents="none"
                  classNames={SELECT_CLASSES}
                />
                {targetStatus && (
                  <div className={form.box}>
                    <p className={form.muted}>{getStatusText(targetStatus, t).description}</p>
                  </div>
                )}
              </>
            ) : (
              <Alert color="red" variant="light" icon={<AlertCircle size={16} />}>
                <strong>{t('data-contracts:requests.statusChange.terminalStateLabel', 'Terminal State:')}</strong> {t('data-contracts:requests.statusChange.noTransitions', 'No transitions available from {{status}} status.', { status: contractStatus ? getStatusText(contractStatus, t).label : 'current' })}
              </Alert>
            )}

            {/* Justification - required for approval requests, optional for direct changes */}
            {!canDirectStatusChange && (
              <Textarea
                id="status-justification"
                label={t('data-contracts:requests.statusChange.justificationLabel', 'Justification *')}
                value={justification}
                onChange={(e) => setJustification(e.currentTarget.value)}
                placeholder={t('data-contracts:requests.statusChange.justificationPlaceholder', 'Explain why this status change is needed and any relevant context...')}
                autosize
                minRows={4}
                maxRows={10}
                disabled={submitting}
                description={t('data-contracts:requests.statusChange.justificationHint', 'Minimum 20 characters required. This will be reviewed by an admin.')}
                inputWrapperOrder={HINT_BELOW}
                classNames={FIELD_CLASSES}
              />
            )}

            {/* Lifecycle Diagram */}
            <div className={classes.lifecycle}>
              <div className={classes.lifecycleTitle}>{t('data-contracts:requests.statusChange.lifecycleFlowLabel', 'ODCS Lifecycle Flow:')}</div>
              <div className={classes.lifecycleFlow}>
                {LIFECYCLE.map((status, i) => (
                  <span key={status} className={classes.statusLine}>
                    {i > 0 && <span aria-hidden>→</span>}
                    <span className={contractStatus?.toLowerCase() === status ? classes.current : undefined}>{status}</span>
                  </span>
                ))}
              </div>
              <p className={classes.lifecycleNote}>
                {t('data-contracts:requests.statusChange.lifecycleNote', 'Current status is highlighted. Emergency deprecation allowed from any status.')}
              </p>
            </div>
          </>
        )}

        {/* Error Alert */}
        {error && (
          <Alert color="red" variant="light" icon={<AlertCircle size={16} />} role="alert">
            {error}
            {canRequestInstead && (
              <div className={form.alertActions}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRequestInstead(true);
                    setCanRequestInstead(false);
                    setError(null);
                  }}
                >
                  {t('workflow-gates:requestInstead')}
                </Button>
              </div>
            )}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Select, Textarea, type SelectProps } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { needsStatusChangeRequest, statusChangeErrorText } from '@/lib/status-change-error';
import { useApprovalWizardTrigger, type AppActionTriggerType } from '@/hooks/use-approval-wizard-trigger';
import { useNotificationsStore } from '@/stores/notifications-store';
import { Loader2, AlertCircle, FileText, Eye, Rocket, RefreshCw, ShieldCheck, Info } from 'lucide-react';
import AccessRequestFields from '@/components/access/access-request-fields';
import ApprovalWizardDialog from '@/components/workflows/approval-wizard-dialog';
import { FIELD_CLASSES, HINT_BELOW, SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import detail from '@/components/common/detail-page.module.css';

type RequestType = 'access' | 'review' | 'publish' | 'certify' | 'status_change';

/**
 * Map request type → app-action trigger type for approval-wizard lookup.
 *
 * Closes the wiring gap from PR #318: Subscribe was the only path that invoked
 * the wizard, even though all six ``for_request_*`` triggers existed in the
 * backend. Each request type below opens the same ApprovalWizardDialog when a
 * workflow is configured, falling through to today's direct-submit otherwise.
 */
const REQUEST_TYPE_TO_TRIGGER: Record<RequestType, AppActionTriggerType> = {
  access: 'for_request_access',
  review: 'for_request_review',
  publish: 'for_request_publish',
  certify: 'for_request_certify',
  status_change: 'for_request_status_change',
};

interface CertificationLevelOption {
  id: string;
  level_order: number;
  name: string;
  color: string | null;
}

interface RequestProductActionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName?: string;
  productStatus?: string;
  onSuccess?: () => void;
  /** If true, status changes are applied directly without approval workflow */
  canDirectStatusChange?: boolean;
  /** Initial request type to select when the dialog opens. Defaults to 'access',
   * since access requests are the most common entry point. Call sites that open
   * the dialog from a status-change-specific affordance should pass 'status_change'. */
  defaultRequestType?: RequestType;
}

// ODPS lifecycle transitions — label values are i18n key suffixes under
// data-products:requestAction.transitions.*; rendered via t() at the call site.
const ALLOWED_TRANSITIONS: Record<string, { target: string; label: string }[]> = {
  'draft': [
    { target: 'sandbox', label: 'moveToSandbox' },
    { target: 'proposed', label: 'submitForReview' },
  ],
  'sandbox': [
    { target: 'draft', label: 'returnToDraft' },
    { target: 'proposed', label: 'submitForReview' },
  ],
  'proposed': [
    { target: 'draft', label: 'returnToDraft' },
    { target: 'under_review', label: 'startReview' },
  ],
  'under_review': [
    { target: 'approved', label: 'approve' },
    { target: 'draft', label: 'rejectReturnToDraft' },
  ],
  'approved': [
    { target: 'active', label: 'publishActivate' },
    { target: 'draft', label: 'returnToDraft' },
  ],
  'active': [
    { target: 'deprecated', label: 'deprecate' },
  ],
  'deprecated': [
    { target: 'retired', label: 'retire' },
    { target: 'active', label: 'reactivate' },
  ],
  'retired': [],
};

function getAllowedTransitions(status: string): { target: string; label: string }[] {
  return ALLOWED_TRANSITIONS[status.toLowerCase()] || [];
}

export default function RequestProductActionDialog({
  isOpen,
  onOpenChange,
  productId,
  productName,
  productStatus,
  onSuccess,
  canDirectStatusChange: allowDirectStatusChange = false,
  defaultRequestType = 'access'
}: RequestProductActionDialogProps) {
  const { t } = useTranslation(['data-products', 'common']);
  const { post, get } = useApi();
  const { toast } = useToast();
  const { lookupWorkflowId } = useApprovalWizardTrigger();
  const refreshNotifications = useNotificationsStore((state) => state.refreshNotifications);
  // A product status in the UI language (the API and the lifecycle use the raw value)
  const statusLabel = (status?: string) =>
    t(`data-products:status.${(status || '').toLowerCase()}`, { defaultValue: status || '' });

  const [requestType, setRequestType] = useState<RequestType>(defaultRequestType);
  const [message, setMessage] = useState('');
  const [justification, setJustification] = useState('');
  const [targetStatus, setTargetStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [certificationLevel, setCertificationLevel] = useState<number | null>(null);
  const [certificationLevels, setCertificationLevels] = useState<CertificationLevelOption[]>([]);
  const [publicationScope, setPublicationScope] = useState('organization');
  // A direct change the API refused because the product is certified: the
  // user can send it as a status change request instead (certified guard)
  const [canRequestInstead, setCanRequestInstead] = useState(false);
  const [requestInstead, setRequestInstead] = useState(false);
  const canDirectStatusChange = allowDirectStatusChange && !requestInstead;

  // Approval wizard launch state.
  // When a `for_request_*` workflow is configured, we open the wizard before
  // the original direct-submit fires; on wizard completion the collected
  // wizard fields are merged into the submit body. When no workflow is
  // configured, this dialog falls through to today's direct-submit flow.
  const [wizardOpen, setWizardOpen] = useState(false);
  // Set when the wizard's completion sent the request; closing the wizard
  // then finishes like a direct submit (onSuccess, close)
  const sentFromWizardRef = useRef(false);
  const [wizardWorkflowId, setWizardWorkflowId] = useState<string | null>(null);
  // Stashed submit context — captured at the moment Submit is clicked so the
  // wizard's onComplete can replay the API call with merged fields.
  const [pendingSubmit, setPendingSubmit] = useState<{
    endpoint: string;
    payload: Record<string, unknown>;
    requestType: RequestType;
  } | null>(null);

  useEffect(() => {
    get<CertificationLevelOption[]>('/api/certification-levels').then(({ data }) => {
      if (Array.isArray(data)) setCertificationLevels(data);
    });
  }, [get]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setRequestType(defaultRequestType);
      setMessage('');
      setJustification('');
      setTargetStatus('');
      setError(null);
      setSelectedDuration(30);
      setCertificationLevel(null);
      setPublicationScope('organization');
      setWizardWorkflowId(null);
      setCanRequestInstead(false);
      setRequestInstead(false);
    }
  }, [isOpen, defaultRequestType]);

  /**
   * Resolve the configured approval workflow for the current request type at
   * dialog-open time (and on request-type changes). When a wizard is
   * configured, the dialog hides its own form fields so the user isn't asked
   * for the same input twice (e.g. typing a reason in both the dialog and the
   * wizard's user_action step). When none is configured — or lookup fails —
   * we leave wizardWorkflowId=null and the legacy direct-submit form renders.
   *
   * Direct status changes (admin path) skip the lookup entirely: that flow
   * always bypasses the wizard regardless of configuration.
   */
  useEffect(() => {
    if (!isOpen) return;
    if (requestType === 'status_change' && canDirectStatusChange) {
      setWizardWorkflowId(null);
      return;
    }
    let cancelled = false;
    const triggerType = REQUEST_TYPE_TO_TRIGGER[requestType];
    (async () => {
      try {
        const id = await lookupWorkflowId(triggerType);
        if (!cancelled) setWizardWorkflowId(id);
      } catch {
        if (!cancelled) setWizardWorkflowId(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, requestType, canDirectStatusChange, lookupWorkflowId]);

  const getRequestTypeConfig = (type: RequestType) => {
    switch (type) {
      case 'access':
        return {
          icon: <Eye size={16} aria-hidden />,
          title: t('data-products:requestAction.types.access.title'),
          description: t('data-products:requestAction.types.access.description'),
          enabled: true,
          endpoint: '/api/access-grants/request',
        };
      case 'review':
        return {
          icon: <FileText size={16} aria-hidden />,
          title: t('data-products:requestAction.types.review.title'),
          description: t('data-products:requestAction.types.review.description'),
          enabled: productStatus?.toLowerCase() === 'draft' || productStatus?.toLowerCase() === 'sandbox',
          endpoint: `/api/data-products/${productId}/request-review`,
        };
      case 'publish':
        return {
          icon: <Rocket size={16} aria-hidden />,
          title: t('data-products:requestAction.types.publish.title'),
          description: t('data-products:requestAction.types.publish.description'),
          // Only active products can be published (same rule as the backend).
          enabled: productStatus?.toLowerCase() === 'active',
          endpoint: `/api/data-products/${productId}/request-publish`,
        };
      case 'certify':
        return {
          icon: <ShieldCheck size={16} aria-hidden />,
          title: t('data-products:requestAction.types.certify.title'),
          description: t('data-products:requestAction.types.certify.description'),
          enabled: true,
          endpoint: `/api/data-products/${productId}/request-certify`,
        };
      case 'status_change':
        const allowedTransitions = productStatus ? getAllowedTransitions(productStatus) : [];
        return {
          icon: <RefreshCw size={16} aria-hidden />,
          title: canDirectStatusChange ? t('data-products:requestAction.types.statusChange.titleDirect') : t('data-products:requestAction.types.statusChange.titleRequest'),
          description: canDirectStatusChange
            ? t('data-products:requestAction.types.statusChange.descriptionDirect')
            : t('data-products:requestAction.types.statusChange.descriptionRequest'),
          enabled: allowedTransitions.length > 0,
          endpoint: canDirectStatusChange 
            ? `/api/data-products/${productId}/change-status`
            : `/api/data-products/${productId}/request-status-change`,
        };
    }
  };

  const validateForm = (): boolean => {
    setError(null);
    
    if (requestType === 'access') {
      if (!message.trim()) {
        setError(t('data-products:requestAction.validation.reasonRequired'));
        return false;
      }
      if (message.trim().length < 10) {
        setError(t('data-products:requestAction.validation.reasonTooShort'));
        return false;
      }
    }

    if (requestType === 'status_change') {
      if (!targetStatus) {
        setError(t('data-products:requestAction.validation.targetStatusRequired'));
        return false;
      }
      // Justification is only required for approval requests, not direct changes
      if (!canDirectStatusChange) {
        if (!justification.trim()) {
          setError(t('data-products:requestAction.validation.justificationRequired'));
          return false;
        }
        if (justification.trim().length < 20) {
          setError(t('data-products:requestAction.validation.justificationTooShort'));
          return false;
        }
      }
    }

    if (requestType === 'certify') {
      if (!certificationLevel) {
        setError(t('data-products:requestAction.validation.certLevelRequired'));
        return false;
      }
    }
    
    return true;
  };

  /**
   * Build the request body for the chosen request type.
   * Returns ``null`` when validation fails (callers have already surfaced an error).
   */
  const buildPayload = (type: RequestType): Record<string, unknown> | null => {
    if (type === 'access') {
      return {
        entity_type: 'data_product',
        entity_id: productId,
        reason: message.trim(),
        requested_permission_level: 'READ',
        requested_duration_days: selectedDuration,
      };
    } else if (type === 'review') {
      return {
        message: message.trim() || undefined,
      };
    } else if (type === 'publish') {
      return {
        scope: publicationScope,
        justification: justification.trim() || undefined,
      };
    } else if (type === 'certify') {
      if (!certificationLevel) {
        setError(t('data-products:requestAction.validation.certLevelRequired'));
        return null;
      }
      return {
        certification_level: certificationLevel,
        message: message.trim() || undefined,
      };
    } else if (type === 'status_change') {
      if (canDirectStatusChange) {
        return { new_status: targetStatus };
      }
      return {
        target_status: targetStatus,
        justification: justification.trim(),
        current_status: productStatus,
      };
    }
    return null;
  };

  /**
   * Execute the actual API submit. Called either directly from handleSubmit
   * (when no wizard is configured) or from the wizard's onComplete (with
   * merged wizard fields).
   */
  const executeSubmit = async (
    endpoint: string,
    payload: Record<string, unknown>,
    type: RequestType,
    { keepOpen = false }: { keepOpen?: boolean } = {},
  ): Promise<boolean> => {
    setError(null);
    setCanRequestInstead(false);
    setSubmitting(true);
    try {
      const response = await post(endpoint, payload);
      if (response.error) {
        setCanRequestInstead(type === 'status_change' && needsStatusChangeRequest(response));
        throw new Error(statusChangeErrorText(response, t, 'data-products'));
      }
      // The request type as a word of the toasts' sentences, in the UI language
      const typeName = t(`data-products:requestAction.toast.requestTypes.${type}`, { defaultValue: type });
      // The request was recorded; a failed workflow means nobody was asked to decide
      const outcome = response.data as
        | { workflow_status?: string; workflow_error_params?: { workflow?: string; failed_workflows?: string[] } }
        | undefined;
      if (outcome?.workflow_status === 'failed') {
        // The step's own error stays with the execution (admins open it in Workflows)
        toast({
          title: t('data-products:requestAction.toast.workflowFailed'),
          description: t('data-products:requestAction.toast.workflowFailedDesc', { type: typeName, workflow: outcome.workflow_error_params?.workflow ?? '' }),
          variant: 'destructive',
        });
      } else if (outcome?.workflow_status === 'partially_failed') {
        // Some workflows succeeded/paused but at least one failed
        const failedWorkflows = outcome.workflow_error_params?.failed_workflows ?? [];
        toast({
          title: t('data-products:requestAction.toast.workflowPartiallyFailed'),
          description: t('data-products:requestAction.toast.workflowPartiallyFailedDesc', { type: typeName, workflows: failedWorkflows.join(', ') }),
          variant: 'destructive',
        });
      } else if (type === 'status_change' && canDirectStatusChange) {
        // Different success messages for direct changes vs requests
        toast({
          title: t('data-products:requestAction.toast.statusChanged'),
          description: t('data-products:requestAction.toast.statusChangedDesc', { fromStatus: statusLabel(productStatus), toStatus: statusLabel(targetStatus) }),
        });
      } else {
        toast({
          title: t('data-products:requestAction.toast.requestSubmitted'),
          description: t('data-products:requestAction.toast.requestSubmittedDesc', { type: typeName }),
        });
      }
      refreshNotifications();
      // Reset form
      setMessage('');
      setJustification('');
      setTargetStatus('');
      setCertificationLevel(null);
      setPublicationScope('organization');
      // keepOpen: sent from the wizard's completion; onSuccess (which reloads
      // the page data) and closing wait until the user closes the wizard, so
      // its completion screen stays up
      if (!keepOpen) {
        if (onSuccess) onSuccess();
        onOpenChange(false);
      }
      return true;
    } catch (e: any) {
      setError(e.message || t('data-products:requestAction.errors.failedToSubmit'));
      toast({
        title: t('data-products:messages.error'),
        description: e.message || t('data-products:requestAction.errors.failedToSubmit'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    const config = getRequestTypeConfig(requestType);
    if (!config.enabled) {
      setError(t('data-products:requestAction.errors.cannotRequest', { requestType: config.title, productStatus: statusLabel(productStatus) }));
      return;
    }

    // When a wizard is configured for this request type, the wizard owns all
    // user input — skip dialog-side field validation so the dialog doesn't
    // reject empty fields it isn't going to collect anyway. The base payload
    // built here is merged with wizard-collected fields on completion.
    const wizardActive = !!wizardWorkflowId
      && !(requestType === 'status_change' && canDirectStatusChange);
    if (!wizardActive && !validateForm()) {
      return;
    }

    const payload = buildPayload(requestType);
    if (!payload) return;

    // Direct-status-change skips the wizard (it's an admin operation, not a request).
    if (requestType === 'status_change' && canDirectStatusChange) {
      await executeSubmit(config.endpoint, payload, requestType);
      return;
    }

    if (wizardActive) {
      // Stash the submit context so onComplete can replay it with merged fields.
      setPendingSubmit({ endpoint: config.endpoint, payload, requestType });
      setWizardOpen(true);
    } else {
      await executeSubmit(config.endpoint, payload, requestType);
    }
  };

  /**
   * Map of wizard-field-id → top-level payload key, per request type.
   *
   * When the wizard's ``user_action`` step collects a field whose id matches a
   * known top-level field on the backend's request model, hoist it onto the
   * payload root before submit. Without this, empty top-level fields fail
   * Pydantic validation (e.g. ``AccessGrantRequestCreate.reason`` has
   * ``min_length=10`` and the dialog form is hidden when a wizard is
   * configured, so its top-level ``reason`` ships as ``''``).
   *
   * The hoist only fires when the top-level field is currently empty/falsy —
   * we never overwrite a value the dialog already collected. Wizard fields
   * still live in ``wizard_data`` so Process workflows can reference them via
   * ``${entity.<field_id>}``; the hoist is purely additive.
   */
  const WIZARD_FIELD_HOIST: Record<RequestType, Record<string, string>> = {
    access: {
      reason: 'reason',
      // Wizard authors commonly name the duration field one of these; map
      // both onto the canonical ``requested_duration_days`` integer field.
      expiry_days: 'requested_duration_days',
      requested_duration_days: 'requested_duration_days',
    },
    review: { message: 'message' },
    publish: {
      justification: 'justification',
      scope: 'scope',
    },
    certify: {
      message: 'message',
      certification_level: 'certification_level',
    },
    status_change: {
      justification: 'justification',
      target_status: 'target_status',
    },
  };

  /** Numeric fields on the BE request body that need string→int coercion. */
  const NUMERIC_TOP_LEVEL_FIELDS = new Set<string>([
    'requested_duration_days',
    'certification_level',
  ]);

  /**
   * Hoist wizard-collected fields onto the top-level payload when the field id
   * matches a known top-level field for the request type. Returns a new object;
   * never mutates inputs. Empty strings on the wizard side are skipped so they
   * don't clobber a non-empty dialog-side value.
   */
  const hoistWizardFieldsToPayload = (
    payload: Record<string, unknown>,
    wizardFields: Record<string, unknown>,
    type: RequestType,
  ): Record<string, unknown> => {
    const map = WIZARD_FIELD_HOIST[type] ?? {};
    const out: Record<string, unknown> = { ...payload };
    for (const [wizardKey, topLevelKey] of Object.entries(map)) {
      const wizardValue = wizardFields[wizardKey];
      if (wizardValue === undefined || wizardValue === null) continue;
      if (typeof wizardValue === 'string' && wizardValue.trim() === '') continue;
      const existing = out[topLevelKey];
      const existingIsEmpty =
        existing === undefined ||
        existing === null ||
        (typeof existing === 'string' && existing.trim() === '');
      // For numeric duration we override only when default 30 wasn't user-typed
      // but rather the literal initial state — heuristic: hoist whenever wizard
      // gave a value AND existing is empty OR field is the default-only path.
      // Simpler rule: don't overwrite a non-empty existing value.
      if (!existingIsEmpty) continue;
      if (NUMERIC_TOP_LEVEL_FIELDS.has(topLevelKey) && typeof wizardValue === 'string') {
        const parsed = parseInt(wizardValue, 10);
        if (Number.isFinite(parsed)) {
          out[topLevelKey] = parsed;
        }
        // Non-numeric string for a numeric field — silently drop (BE would 422).
        continue;
      }
      out[topLevelKey] = wizardValue;
    }
    return out;
  };

  const handleWizardComplete = async (
    _agreementId: string | null,
    _pdfStoragePath: string | null,
    wizardFields?: Record<string, unknown>,
  ) => {
    if (!pendingSubmit) return;
    const fields = wizardFields ?? {};
    // Step 1: hoist matching wizard fields onto the top-level payload so BE
    // request-model validation (e.g. ``reason`` min_length on access requests)
    // doesn't reject submissions that route their input through the wizard.
    const hoisted = hoistWizardFieldsToPayload(
      pendingSubmit.payload,
      fields,
      pendingSubmit.requestType,
    );
    const merged = {
      ...hoisted,
      // Step 2: keep the full wizard map under ``wizard_data`` so the BE can
      // forward it into ``entity_data`` for downstream Process workflows
      // without colliding with first-class request fields (reason, duration).
      wizard_data: fields,
    };
    // Submitted as soon as the wizard completes, not when it's closed, so
    // leaving the page on the completion screen doesn't lose the request.
    // The wizard stays open on its completion screen (PDF download).
    setPendingSubmit(null);
    const sent = await executeSubmit(
      pendingSubmit.endpoint, merged, pendingSubmit.requestType, { keepOpen: true },
    );
    sentFromWizardRef.current = sent;
  };

  /** The user closed the wizard after it completed. */
  const handleWizardClosedAfterComplete = () => {
    setWizardOpen(false);
    setWizardWorkflowId(null);
    if (sentFromWizardRef.current) {
      sentFromWizardRef.current = false;
      if (onSuccess) onSuccess();
      onOpenChange(false);
    }
  };

  const allowedTransitions = productStatus ? getAllowedTransitions(productStatus) : [];
  const config = getRequestTypeConfig(requestType);
  // Direct status changes always render their form (admin path bypasses the wizard).
  const isDirectStatusChange = requestType === 'status_change' && canDirectStatusChange;
  // When true, the wizard owns user input — hide per-request-type form fields
  // and skip dialog-side validation. See the lookup effect above.
  const wizardActive = !!wizardWorkflowId && !isDirectStatusChange;

  // The request types, in the old order, each with its icon
  const requestTypeOptions: Array<{ value: RequestType; label: string; disabled?: boolean; icon: ReactNode }> = [
    {
      value: 'status_change',
      label: canDirectStatusChange ? t('data-products:requestAction.types.statusChange.titleDirect') : t('data-products:requestAction.types.statusChange.titleRequest'),
      icon: <RefreshCw size={14} aria-hidden />,
    },
    { value: 'review', label: t('data-products:requestAction.selectItems.review'), disabled: !getRequestTypeConfig('review').enabled, icon: <FileText size={14} aria-hidden /> },
    { value: 'publish', label: t('data-products:requestAction.selectItems.publish'), disabled: !getRequestTypeConfig('publish').enabled, icon: <Rocket size={14} aria-hidden /> },
    { value: 'certify', label: t('data-products:requestAction.selectItems.certify'), disabled: !getRequestTypeConfig('certify').enabled, icon: <ShieldCheck size={14} aria-hidden /> },
    { value: 'access', label: t('data-products:requestAction.selectItems.access'), icon: <Eye size={14} aria-hidden /> },
  ];
  const renderRequestType: SelectProps['renderOption'] = ({ option }) => (
    <span className={form.optionLine}>
      {requestTypeOptions.find((o) => o.value === option.value)?.icon}
      <span>{option.label}</span>
    </span>
  );
  const transitionOptions = uniqueOptions(allowedTransitions.map((transition) => ({
    value: transition.target,
    label: t(`data-products:requestAction.transitions.${transition.label}`),
  })));
  const scopeOptions = [
    { value: 'domain', label: t('common:labels.domain') },
    { value: 'organization', label: t('data-products:requestAction.scopes.organization') },
    { value: 'external', label: t('data-products:requestAction.scopes.external') },
  ];
  const certificationLevelOptions = uniqueOptions(certificationLevels.map((l) => ({
    value: l.level_order.toString(),
    label: l.name,
  })));

  return (
    <>
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="md"
      title={
        <span className={form.titleLine}>
          {config.icon}
          {config.title}
        </span>
      }
      description={(productName || productStatus) ? (
        <>
          {productName && <span className={form.strong}>{productName}</span>}
          {productName && productStatus && ' '}
          {productStatus && <span>({productStatus})</span>}
        </>
      ) : undefined}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !config.enabled}>
            {submitting ? (
              <>
                <Loader2 className={detail.spin} aria-hidden />
                {isDirectStatusChange ? t('data-products:requestAction.buttons.changingStatus') : (wizardActive ? t('data-products:requestAction.buttons.opening') : t('data-products:requestAction.buttons.sendingRequest'))}
              </>
            ) : (
              isDirectStatusChange ? t('data-products:requestAction.types.statusChange.titleDirect') : (wizardActive ? t('data-products:requestAction.buttons.continue') : t('data-products:requestAction.buttons.sendRequest'))
            )}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        {/* Request Type Selector */}
        <Select
          id="request-type"
          label={t('data-products:requestAction.labels.requestType')}
          placeholder={t('data-products:requestAction.placeholders.selectRequestType')}
          data={requestTypeOptions.map(({ value, label, disabled }) => ({ value, label, disabled }))}
          value={requestType}
          onChange={(value) => value && setRequestType(value as RequestType)}
          allowDeselect={false}
          renderOption={renderRequestType}
          // The chosen type's icon stays in the field, as the Radix SelectValue repeated it
          leftSection={requestTypeOptions.find((o) => o.value === requestType)?.icon}
          leftSectionPointerEvents="none"
          description={config.description}
          inputWrapperOrder={HINT_BELOW}
          classNames={SELECT_CLASSES}
        />

        {/* Wizard-configured notice — replaces the per-request-type form
            when a `for_request_*` workflow is wired up, since the wizard
            collects all input itself (preventing the duplicate-prompt UX
            that surfaced during Path B testing). */}
        {wizardActive && (
          <Alert color="blue" variant="light" icon={<Info size={16} />}>
            {t('data-products:requestAction.wizard.noticeBefore')}
            {' '}<strong>{t('data-products:requestAction.buttons.continue')}</strong>{' '}
            {t('data-products:requestAction.wizard.noticeAfter')}
          </Alert>
        )}

        {/* Status Change Fields — shown for direct status change always, and
            for status-change requests only when no wizard is configured. */}
        {requestType === 'status_change' && (isDirectStatusChange || !wizardActive) && (
          <>
            <Select
              id="target-status"
              label={`${t('data-products:requestAction.labels.targetStatus')} *`}
              placeholder={t('data-products:requestAction.placeholders.selectTargetStatus')}
              data={transitionOptions}
              value={targetStatus || null}
              onChange={(value) => value && setTargetStatus(value)}
              allowDeselect={false}
              disabled={submitting}
              description={allowedTransitions.length === 0 ? t('data-products:requestAction.hints.noTransitionsAvailable') : undefined}
              inputWrapperOrder={HINT_BELOW}
              classNames={SELECT_CLASSES}
            />

            {/* Justification - only for approval requests */}
            {!canDirectStatusChange && (
              <Textarea
                id="status-justification"
                label={`${t('data-products:requestAction.labels.justification')} *`}
                value={justification}
                onChange={(e) => setJustification(e.currentTarget.value)}
                placeholder={t('data-products:requestAction.placeholders.justification')}
                minRows={4}
                autosize
                disabled={submitting}
                description={t('data-products:requestAction.hints.justificationMinChars')}
                inputWrapperOrder={HINT_BELOW}
                classNames={FIELD_CLASSES}
              />
            )}
          </>
        )}

        {/* Access Request Fields - using shared component */}
        {requestType === 'access' && !wizardActive && (
          <AccessRequestFields
            entityType="data_product"
            message={message}
            onMessageChange={setMessage}
            selectedDuration={selectedDuration}
            onDurationChange={setSelectedDuration}
            disabled={submitting}
          />
        )}

        {/* Review Request Message */}
        {requestType === 'review' && !wizardActive && (
          <Textarea
            id="review-message"
            label={t('data-products:requestAction.labels.messageOptional')}
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            placeholder={t('data-products:requestAction.placeholders.reviewMessage')}
            minRows={3}
            autosize
            disabled={submitting}
            classNames={FIELD_CLASSES}
          />
        )}

        {/* Publish Request — scope + justification */}
        {requestType === 'publish' && !wizardActive && (
          <>
            <Select
              id="pub-scope"
              label={`${t('data-products:requestAction.labels.publicationScope')} *`}
              data={scopeOptions}
              value={publicationScope}
              onChange={(value) => value && setPublicationScope(value)}
              allowDeselect={false}
              disabled={submitting}
              classNames={SELECT_CLASSES}
            />
            <Textarea
              id="publish-justification"
              label={t('data-products:requestAction.labels.justificationOptional')}
              value={justification}
              onChange={(e) => setJustification(e.currentTarget.value)}
              placeholder={t('data-products:requestAction.placeholders.publishJustification')}
              minRows={3}
              autosize
              disabled={submitting}
              classNames={FIELD_CLASSES}
            />
          </>
        )}

        {requestType === 'certify' && !wizardActive && (
          <>
            <Select
              id="cert-level"
              label={`${t('data-products:requestAction.labels.certLevel')} *`}
              placeholder={t('data-products:requestAction.placeholders.selectCertLevel')}
              data={certificationLevelOptions}
              value={certificationLevel !== null ? certificationLevel.toString() : null}
              onChange={(v) => v && setCertificationLevel(parseInt(v, 10))}
              allowDeselect={false}
              disabled={submitting}
              classNames={SELECT_CLASSES}
            />
            <Textarea
              id="cert-message"
              label={t('data-products:requestAction.labels.messageOptional')}
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
              placeholder={t('data-products:requestAction.placeholders.certMessage')}
              minRows={3}
              autosize
              disabled={submitting}
              classNames={FIELD_CLASSES}
            />
          </>
        )}

        {/* Error Display */}
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
    {/* Approval wizard — opens when a `for_request_*` workflow is configured
        for the chosen request type. On completion, replays the submit with
        wizard-collected fields merged into the body. */}
    {wizardWorkflowId && (
      <ApprovalWizardDialog
        isOpen={wizardOpen}
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open && pendingSubmit) {
            // User dismissed wizard mid-flow — drop the pending submit so the
            // dialog stays open for the user to retry/cancel. We keep
            // wizardWorkflowId so the "wizard configured" notice and Continue
            // button remain (the wizard config didn't change just because the
            // user dismissed the modal).
            setPendingSubmit(null);
          }
        }}
        entityType="data_product"
        entityId={productId}
        entityName={productName}
        preselectedWorkflowId={wizardWorkflowId}
        autoStartWithPreselected
        onSessionComplete={handleWizardComplete}
        onComplete={handleWizardClosedAfterComplete}
      />
    )}
    </>
  );
}

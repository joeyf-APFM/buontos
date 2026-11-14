import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Alert, Loader, Select, TextInput, Textarea } from '@mantine/core';
import { Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES, SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { MdmEntityType, MdmConfigCreate, MatchingRule, SurvivorshipRule, MatchRuleType, SurvivorshipStrategy } from '@/types/mdm';
import { useOpenSession } from './use-open-session';
import classes from './mdm-dialogs.module.css';

interface DataContract {
  id: string;
  name: string;
  status: string;
  customProperties?: Record<string, any>;
}

type FormValues = {
  name: string;
  description?: string;
  entity_type: MdmEntityType;
  master_contract_id: string;
};

interface MdmConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const FORM_ID = 'mdm-config-form';

// Helper to parse rules from contract customProperties
function parseContractMdmRules(customProps: Record<string, any> | undefined): {
  matchingRules: MatchingRule[];
  survivorshipRules: SurvivorshipRule[];
} {
  if (!customProps) return { matchingRules: [], survivorshipRules: [] };

  let matchingRules: MatchingRule[] = [];
  let survivorshipRules: SurvivorshipRule[] = [];

  // Parse mdmMatchingRules
  let rawMatchingRules = customProps.mdmMatchingRules;
  if (typeof rawMatchingRules === 'string') {
    try { rawMatchingRules = JSON.parse(rawMatchingRules); } catch { rawMatchingRules = []; }
  }
  if (Array.isArray(rawMatchingRules)) {
    matchingRules = rawMatchingRules.map((r: any) => ({
      name: r.name || 'unnamed_rule',
      type: r.type === 'exact' ? 'deterministic' : r.type === 'fuzzy' ? 'probabilistic' : r.type,
      fields: r.fields || [],
      weight: r.weight || 1.0,
      threshold: r.threshold || 0.7,
      algorithm: r.algorithm,
    }));
  }

  // Parse mdmSurvivorshipRules
  let rawSurvivorshipRules = customProps.mdmSurvivorshipRules;
  if (typeof rawSurvivorshipRules === 'string') {
    try { rawSurvivorshipRules = JSON.parse(rawSurvivorshipRules); } catch { rawSurvivorshipRules = []; }
  }
  if (Array.isArray(rawSurvivorshipRules)) {
    survivorshipRules = rawSurvivorshipRules.map((r: any) => ({
      field: r.field || '',
      strategy: r.strategy || 'most_recent',
      priority: r.priority,
    }));
  }

  return { matchingRules, survivorshipRules };
}

// Sensible defaults when the contract has no MDM rules
const DEFAULT_MATCHING_RULES: MatchingRule[] = [
  { name: 'email_match', type: MatchRuleType.DETERMINISTIC, fields: ['email'], weight: 1.0, threshold: 1.0 },
  { name: 'name_fuzzy', type: MatchRuleType.PROBABILISTIC, fields: ['customer_name'], weight: 0.8, threshold: 0.8, algorithm: 'jaro_winkler' },
];
const DEFAULT_SURVIVORSHIP_RULES: SurvivorshipRule[] = [
  { field: 'email', strategy: SurvivorshipStrategy.MOST_TRUSTED },
  { field: 'customer_name', strategy: SurvivorshipStrategy.MOST_RECENT },
];

/** The form: the dialog's body, so its fields, rules and loads start afresh each time it opens. */
function ConfigForm({ onSave }: { onSave: (data: MdmConfigCreate) => void }) {
  const { t } = useTranslation(['mdm', 'common']);
  const { get } = useApi();
  const { toast } = useToast();
  const [contracts, setContracts] = useState<DataContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingContract, setLoadingContract] = useState(false);
  const [matchingRules, setMatchingRules] = useState<MatchingRule[]>([]);
  const [survivorshipRules, setSurvivorshipRules] = useState<SurvivorshipRule[]>([]);
  const [rulesSource, setRulesSource] = useState<'contract' | 'default' | 'empty'>('empty');
  // The contract whose rules are wanted now: a late answer for another is dropped
  const wanted = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const formSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t('mdm:config.nameRequired')),
        description: z.string().optional(),
        entity_type: z.nativeEnum(MdmEntityType),
        master_contract_id: z.string().min(1, t('mdm:config.masterContractRequired')),
      }),
    [t]
  );

  const { control, register, handleSubmit, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      entity_type: MdmEntityType.CUSTOMER,
      master_contract_id: '',
    },
  });
  const { errors } = formState;
  const selectedContractId = watch('master_contract_id');

  useEffect(() => {
    (async () => {
      try {
        const response = await get<DataContract[]>('/api/data-contracts');
        if (!alive.current) return;
        // Only active contracts; an error answer or a non-list is no contracts
        setContracts(Array.isArray(response.data) ? response.data.filter((c) => c.status === 'active') : []);
      } catch (err) {
        console.error('Error fetching contracts:', err);
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
  }, [get]);

  // When a contract is chosen, its customProperties give the MDM rules
  useEffect(() => {
    if (!selectedContractId) return;
    const contractId = selectedContractId;
    wanted.current = contractId;
    const current = () => alive.current && wanted.current === contractId;
    setLoadingContract(true);
    (async () => {
      try {
        const response = await get<DataContract>(`/api/data-contracts/${contractId}`);
        if (!current() || !response.data) return;
        const { matchingRules: mr, survivorshipRules: sr } = parseContractMdmRules(response.data.customProperties);
        if (mr.length > 0 || sr.length > 0) {
          setMatchingRules(mr);
          setSurvivorshipRules(sr);
          setRulesSource('contract');
          toast({
            title: t('mdm:config.rulesLoadedTitle'),
            description: t('mdm:config.rulesLoaded', { matching: mr.length, survivorship: sr.length }),
          });
        } else {
          setMatchingRules(DEFAULT_MATCHING_RULES);
          setSurvivorshipRules(DEFAULT_SURVIVORSHIP_RULES);
          setRulesSource('default');
        }
      } catch (err) {
        console.error('Error fetching contract:', err);
      } finally {
        if (current()) setLoadingContract(false);
      }
    })();
    // toast and t are stable enough; only a new contract loads again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContractId, get]);

  const entityTypes = useMemo(
    () => [
      { value: MdmEntityType.CUSTOMER, label: t('mdm:entityTypes.customer') },
      { value: MdmEntityType.PRODUCT, label: t('mdm:entityTypes.product') },
      { value: MdmEntityType.SUPPLIER, label: t('mdm:entityTypes.supplier') },
      { value: MdmEntityType.LOCATION, label: t('mdm:entityTypes.location') },
      { value: MdmEntityType.OTHER, label: t('mdm:entityTypes.other') },
    ],
    [t]
  );
  const contractOptions = useMemo(
    () => uniqueOptions(contracts.map((c) => ({ value: c.id, label: c.name }))),
    [contracts]
  );
  const contractName = contracts.find((c) => c.id === selectedContractId)?.name;

  const submit = handleSubmit((values) =>
    onSave({
      name: values.name,
      description: values.description || undefined,
      entity_type: values.entity_type,
      master_contract_id: values.master_contract_id,
      matching_rules: matchingRules,
      survivorship_rules: survivorshipRules,
    })
  );

  return (
    <form id={FORM_ID} onSubmit={submit} className={form.form} noValidate>
      <TextInput
        id="name"
        label={t('mdm:config.nameLabel')}
        placeholder={t('mdm:config.namePlaceholder')}
        error={errors.name?.message}
        classNames={FIELD_CLASSES}
        data-autofocus
        {...register('name')}
      />

      <Textarea
        id="description"
        label={t('common:labels.description')}
        placeholder={t('mdm:config.descriptionPlaceholder')}
        autosize
        minRows={3}
        maxRows={8}
        classNames={FIELD_CLASSES}
        {...register('description')}
      />

      {/* No clearing: the Radix Selects these replace could not be cleared either */}
      <Controller
        name="entity_type"
        control={control}
        render={({ field }) => (
          <Select
            id="entity_type"
            label={t('mdm:overview.entityType')}
            placeholder={t('mdm:config.selectEntityType')}
            data={entityTypes}
            value={field.value}
            onChange={(next) => next && field.onChange(next as MdmEntityType)}
            allowDeselect={false}
            classNames={SELECT_CLASSES}
          />
        )}
      />

      <Controller
        name="master_contract_id"
        control={control}
        render={({ field }) => (
          <Select
            id="master_contract"
            label={t('mdm:config.masterContractLabel')}
            placeholder={loading ? t('common:states.loading') : t('mdm:config.selectMasterContract')}
            data={contractOptions}
            value={field.value || null}
            onChange={(next) => next && field.onChange(next)}
            allowDeselect={false}
            disabled={loading}
            rightSection={loading ? <Loader size={12} /> : undefined}
            nothingFoundMessage={t('mdm:messages.noActiveContracts')}
            error={errors.master_contract_id?.message}
            title={contractName}
            classNames={SELECT_CLASSES}
          />
        )}
      />

      {/* The rules preview */}
      {selectedContractId && (
        <div className={form.section}>
          {loadingContract ? (
            <div className={form.loading}>
              <Loader size={12} />
              {t('mdm:config.loadingRules')}
            </div>
          ) : (
            <>
              {rulesSource !== 'empty' && (
                <Alert color="blue" variant="light" icon={<Info size={16} />}>
                  {rulesSource === 'contract'
                    ? t('mdm:config.rulesFromContract', { matching: matchingRules.length, survivorship: survivorshipRules.length })
                    : t('mdm:config.rulesDefaults')}
                </Alert>
              )}

              {matchingRules.length > 0 && (
                <div>
                  <p className={classes.previewHeading}>{t('mdm:config.matchingRulesHeading')}</p>
                  <ul className={classes.previewList}>
                    {matchingRules.slice(0, 3).map((rule, i) => (
                      <li key={i}>
                        <span className={classes.ident} title={rule.name}>{rule.name}</span>: {(Array.isArray(rule.fields) ? rule.fields : []).join(', ')} ({rule.type})
                      </li>
                    ))}
                    {matchingRules.length > 3 && (
                      <li className={classes.more}>{t('mdm:config.andMore', { count: matchingRules.length - 3 })}</li>
                    )}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
}

export default function MdmConfigDialog({ isOpen, onClose, onSuccess }: MdmConfigDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  // A second click, or a click on the way out, sends nothing
  const busy = useRef(false);
  const session = useOpenSession(isOpen);

  const { t } = useTranslation(['mdm', 'common']);
  const { post } = useApi();
  const { toast } = useToast();

  const save = async (data: MdmConfigCreate) => {
    if (busy.current || !isOpen) return;
    busy.current = true;
    setSubmitting(true);
    try {
      const response = await post('/api/mdm/configs', data);
      if (response.error) {
        console.error('[MDM Config] Creation failed:', response.error);
        toast({
          title: t('common:status.error'),
          description: response.error,
          variant: 'destructive',
        });
        return;
      }
      if (response.data) {
        const configData = response.data as { name?: string };
        toast({ title: t('common:status.success'), description: t('mdm:config.createSuccess', { name: configData.name }) });
        onSuccess();
      } else {
        toast({
          title: t('common:status.warning'),
          description: t('mdm:config.createUncertain'),
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      console.error('[MDM Config] Exception creating config:', err);
      toast({
        title: t('common:status.error'),
        description: err.message || t('mdm:config.createFailed'),
        variant: 'destructive',
      });
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  // Escape and Cancel wait while the create is out
  const close = () => {
    if (busy.current) return;
    onClose();
  };

  return (
    <Dialog
      opened={isOpen}
      onClose={close}
      size="md"
      title={t('mdm:newConfiguration')}
      description={t('mdm:config.dialogDescription')}
      footer={
        <>
          <Button type="button" variant="outline" onClick={close} disabled={submitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={submitting}>
            {submitting && <Loader size={12} color="currentColor" />}
            {t('mdm:config.createButton')}
          </Button>
        </>
      }
    >
      <ConfigForm key={session} onSave={save} />
    </Dialog>
  );
}

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ActionIcon, Alert, Loader, Select, TextInput, Tooltip } from '@mantine/core';
import { Plus, X, AlertCircle, Wand2, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES, HINT_BELOW, SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { MdmSourceLinkCreate } from '@/types/mdm';
import { useOpenSession } from './use-open-session';
import classes from './mdm-dialogs.module.css';

// Simple Levenshtein distance for fuzzy column matching
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

// Calculate similarity score (0-1)
function columnSimilarity(source: string, target: string): number {
  const s = source.toLowerCase().replace(/[_-]/g, '');
  const t = target.toLowerCase().replace(/[_-]/g, '');
  const maxLen = Math.max(s.length, t.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(s, t);
  return 1 - distance / maxLen;
}

// Find best matching target column for a source column
function findBestMatch(source: string, targets: string[], threshold = 0.6): string | null {
  let bestMatch: string | null = null;
  let bestScore = threshold;

  for (const target of targets) {
    const score = columnSimilarity(source, target);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = target;
    }
  }
  return bestMatch;
}

interface SchemaProperty {
  name: string;
  logicalType?: string;
  logical_type?: string;
  description?: string;
}

interface SchemaObject {
  name: string;
  properties?: SchemaProperty[];
}

interface DataContract {
  id: string;
  name: string;
  status: string;
  schema?: SchemaObject[];
  customProperties?: Record<string, any>;
}

type FormValues = {
  source_contract_id: string;
  key_column: string;
  priority: number;
};

interface LinkSourceDialogProps {
  isOpen: boolean;
  configId: string;
  masterContractId?: string; // To fetch master schema for column mapping
  onClose: () => void;
  onSuccess: () => void;
}

const FORM_ID = 'mdm-link-source-form';

/** The first schema's column names, or none. */
const columnsOf = (contract: DataContract | undefined): string[] | null => {
  const properties = contract?.schema?.[0]?.properties;
  return Array.isArray(properties) ? properties.map((p) => p.name) : null;
};

const asOptions = (values: string[]) => uniqueOptions(values.map((value) => ({ value, label: value })));

/** The form: the dialog's body, so its fields, mappings and loads start afresh each time it opens. */
function LinkForm({ masterContractId, onSave }: { masterContractId?: string; onSave: (data: MdmSourceLinkCreate) => void }) {
  const { t } = useTranslation(['mdm', 'common']);
  const { get } = useApi();
  const { toast } = useToast();
  const [contracts, setContracts] = useState<DataContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [newMappingSource, setNewMappingSource] = useState('');
  const [newMappingTarget, setNewMappingTarget] = useState('');

  // Schema columns for dropdowns
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [masterColumns, setMasterColumns] = useState<string[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  // The source whose schema is wanted now: a late answer for another is dropped
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
        source_contract_id: z.string().min(1, t('mdm:link.sourceContractRequired')),
        key_column: z.string().min(1, t('mdm:link.keyColumnRequired')),
        priority: z.coerce.number().min(0).max(100),
      }),
    [t]
  );

  const { control, register, handleSubmit, watch, setValue, getValues, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      source_contract_id: '',
      key_column: '',
      priority: 1,
    },
  });
  const { errors } = formState;
  const selectedSourceId = watch('source_contract_id');

  useEffect(() => {
    (async () => {
      try {
        const response = await get<DataContract[]>('/api/data-contracts');
        if (!alive.current) return;
        // Only active contracts, without the master; an error answer or a non-list is none
        setContracts(Array.isArray(response.data)
          ? response.data.filter((c) => c.status === 'active' && c.id !== masterContractId)
          : []);
      } catch (err) {
        console.error('Error fetching contracts:', err);
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
  }, [get, masterContractId]);

  // The master contract's schema, for the mapping's master columns
  useEffect(() => {
    if (!masterContractId) return;
    (async () => {
      try {
        const response = await get<DataContract>(`/api/data-contracts/${masterContractId}`);
        const columns = columnsOf(response.data);
        if (alive.current && columns) setMasterColumns(columns);
      } catch (err) {
        console.error('Error fetching master schema:', err);
      }
    })();
  }, [get, masterContractId]);

  // The source contract's schema, when a source is chosen
  useEffect(() => {
    if (!selectedSourceId) {
      wanted.current = null;
      setSourceColumns([]);
      return;
    }
    const contractId = selectedSourceId;
    wanted.current = contractId;
    const current = () => alive.current && wanted.current === contractId;
    setLoadingSchema(true);
    (async () => {
      try {
        const response = await get<DataContract>(`/api/data-contracts/${contractId}`);
        if (!current()) return;
        const columns = columnsOf(response.data);
        // A source without a schema has no columns (the previous source's stayed)
        if (!columns) {
          setSourceColumns([]);
          return;
        }
        setSourceColumns(columns);

        // Check for MDM config in customProperties
        const customProps = response.data.customProperties || {};

        // Auto-set key column from customProperties or detect it
        const mdmKeyColumn = customProps.mdmKeyColumn;
        if (mdmKeyColumn && columns.includes(mdmKeyColumn)) {
          setValue('key_column', mdmKeyColumn);
        } else {
          // Fallback: detect key column
          const keyCandidate = columns.find((c) =>
            c.endsWith('_id') || c === 'id' || c.includes('key') || c.includes('uuid')
          );
          if (keyCandidate && !getValues('key_column')) {
            setValue('key_column', keyCandidate);
          }
        }

        // Auto-set priority from customProperties
        const mdmPriority = customProps.mdmSourcePriority;
        if (mdmPriority !== undefined && mdmPriority !== null) {
          const priorityNum = typeof mdmPriority === 'number' ? mdmPriority : parseInt(String(mdmPriority), 10);
          if (!isNaN(priorityNum)) {
            setValue('priority', priorityNum);
          }
        }

        // Auto-populate column mappings from customProperties
        let mdmMappings = customProps.mdmColumnMappings;
        if (mdmMappings) {
          // Parse if stored as JSON string
          if (typeof mdmMappings === 'string') {
            try {
              mdmMappings = JSON.parse(mdmMappings);
            } catch (e) {
              console.error('Failed to parse mdmColumnMappings:', e);
              mdmMappings = null;
            }
          }

          if (mdmMappings && typeof mdmMappings === 'object') {
            // mdmMappings is source → master format
            const newMappings: Record<string, string> = {};
            for (const [sourceCol, masterCol] of Object.entries(mdmMappings)) {
              if (typeof masterCol === 'string' && columns.includes(sourceCol)) {
                newMappings[sourceCol] = masterCol;
              }
            }
            if (Object.keys(newMappings).length > 0) {
              setColumnMapping(newMappings);
              toast({
                title: t('mdm:link.configLoadedTitle'),
                description: t('mdm:link.mappingsLoaded', { count: Object.keys(newMappings).length }),
              });
            }
          }
        }
      } catch (err) {
        console.error('Error fetching source schema:', err);
      } finally {
        if (current()) setLoadingSchema(false);
      }
    })();
    // toast, t and the form's setters are stable; only a new source loads again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceId, get]);

  // Suggest column mappings using fuzzy matching
  const suggestMappings = () => {
    if (sourceColumns.length === 0 || masterColumns.length === 0) return;

    const suggestions: Record<string, string> = {};
    const usedTargets = new Set<string>();

    // First pass: exact name matches (source column exists in master with same name)
    for (const sourceCol of sourceColumns) {
      if (columnMapping[sourceCol]) continue; // Already mapped
      if (masterColumns.includes(sourceCol)) {
        suggestions[sourceCol] = sourceCol;
        usedTargets.add(sourceCol);
      }
    }

    // Second pass: fuzzy matches for remaining columns
    for (const sourceCol of sourceColumns) {
      if (columnMapping[sourceCol] || suggestions[sourceCol]) continue;

      const bestMatch = findBestMatch(sourceCol, masterColumns.filter((c) => !usedTargets.has(c)), 0.5);
      if (bestMatch) {
        suggestions[sourceCol] = bestMatch;
        usedTargets.add(bestMatch);
      }
    }

    if (Object.keys(suggestions).length > 0) {
      setColumnMapping((prev) => ({ ...prev, ...suggestions }));
      toast({
        title: t('mdm:link.mappingsSuggestedTitle'),
        description: t('mdm:link.mappingsFound', { count: Object.keys(suggestions).length }),
      });
    } else {
      toast({
        title: t('mdm:link.noSuggestionsTitle'),
        description: t('mdm:link.noMatchingColumns'),
        variant: 'destructive',
      });
    }
  };

  const addColumnMapping = () => {
    if (newMappingSource && newMappingTarget) {
      setColumnMapping((prev) => ({
        ...prev,
        [newMappingSource]: newMappingTarget,
      }));
      setNewMappingSource('');
      setNewMappingTarget('');
    }
  };

  const removeColumnMapping = (sourceCol: string) => {
    setColumnMapping((prev) => {
      const updated = { ...prev };
      delete updated[sourceCol];
      return updated;
    });
  };

  const contractOptions = useMemo(
    () => uniqueOptions(contracts.map((c) => ({ value: c.id, label: c.name }))),
    [contracts]
  );
  const sourceName = contracts.find((c) => c.id === selectedSourceId)?.name;
  const mappingCount = Object.keys(columnMapping).length;
  const unmappedSources = sourceColumns.filter((col) => !Object.keys(columnMapping).includes(col));

  const submit = handleSubmit((values) =>
    onSave({
      source_contract_id: values.source_contract_id,
      key_column: values.key_column,
      column_mapping: columnMapping,
      priority: values.priority,
    })
  );

  const addButton = (
    <ActionIcon
      type="button"
      variant="default"
      className={classes.add}
      onClick={addColumnMapping}
      disabled={!newMappingSource || !newMappingTarget}
      aria-label={t('common:actions.add')}
      title={t('common:actions.add')}
    >
      <Plus size={14} />
    </ActionIcon>
  );

  return (
    <form id={FORM_ID} onSubmit={submit} className={form.form} noValidate>
      {/* No clearing: the Radix Selects these replace could not be cleared either */}
      <Controller
        name="source_contract_id"
        control={control}
        render={({ field }) => (
          <Select
            id="source_contract"
            label={t('mdm:link.sourceContractLabel')}
            placeholder={loading ? t('common:states.loading') : t('mdm:link.selectSourceContract')}
            data={contractOptions}
            value={field.value || null}
            onChange={(next) => next && field.onChange(next)}
            allowDeselect={false}
            disabled={loading}
            rightSection={loading ? <Loader size={12} /> : undefined}
            nothingFoundMessage={t('mdm:messages.noActiveContracts')}
            error={errors.source_contract_id?.message}
            title={sourceName}
            classNames={SELECT_CLASSES}
            data-autofocus
          />
        )}
      />

      <div className={form.row}>
        {sourceColumns.length > 0 ? (
          <Controller
            name="key_column"
            control={control}
            render={({ field }) => (
              <Select
                id="key_column"
                label={t('mdm:sourcesTab.keyColumn')}
                placeholder={loadingSchema ? t('common:states.loading') : t('mdm:link.selectKeyColumn')}
                data={asOptions(sourceColumns)}
                value={field.value || null}
                onChange={(next) => next && field.onChange(next)}
                allowDeselect={false}
                disabled={loadingSchema}
                rightSection={loadingSchema ? <Loader size={12} /> : undefined}
                error={errors.key_column?.message}
                title={field.value || undefined}
                classNames={SELECT_CLASSES}
              />
            )}
          />
        ) : (
          <TextInput
            id="key_column"
            label={t('mdm:sourcesTab.keyColumn')}
            placeholder={t('mdm:link.selectSourceFirst')}
            disabled={!selectedSourceId}
            error={errors.key_column?.message}
            classNames={FIELD_CLASSES}
            {...register('key_column')}
          />
        )}

        <TextInput
          id="priority"
          type="number"
          min={0}
          max={100}
          label={t('common:labels.priority')}
          description={t('mdm:link.priorityHint')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
          {...register('priority')}
        />
      </div>

      <div className={form.section}>
        <div className={classes.mappingHead}>
          <div>
            <p className={`${form.label} ${classes.label}`}>{t('mdm:link.columnMappingLabel')}</p>
            <p className={form.hint}>{t('mdm:link.columnMappingHint')}</p>
          </div>
          <Tooltip label={t('mdm:link.suggestTooltip')}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={suggestMappings}
              disabled={sourceColumns.length === 0 || masterColumns.length === 0}
            >
              <Wand2 size={14} />
              {t('mdm:link.suggest')}
            </Button>
          </Tooltip>
        </div>

        {mappingCount > 0 && (
          <div className={classes.mappings}>
            {Object.entries(columnMapping).map(([source, target]) => (
              <span key={source} className={classes.mapping} data-mapping="">
                <span className={classes.mappingText} title={`${source} → ${target}`}>
                  {source} → {target}
                </span>
                <ActionIcon
                  type="button"
                  variant="subtle"
                  className={classes.remove}
                  onClick={() => removeColumnMapping(source)}
                  aria-label={t('common:actions.remove')}
                  title={t('common:actions.remove')}
                >
                  <X size={12} />
                </ActionIcon>
              </span>
            ))}
          </div>
        )}

        {sourceColumns.length > 0 && masterColumns.length > 0 ? (
          <div className={classes.addRow}>
            <Select
              aria-label={t('mdm:link.sourceColumn')}
              placeholder={t('mdm:link.sourceColumn')}
              data={asOptions(unmappedSources)}
              value={newMappingSource || null}
              onChange={(next) => setNewMappingSource(next ?? '')}
              allowDeselect={false}
              title={newMappingSource || undefined}
              classNames={SELECT_CLASSES}
            />
            <span className={classes.arrow} aria-hidden>→</span>
            <Select
              aria-label={t('mdm:link.masterColumn')}
              placeholder={t('mdm:link.masterColumn')}
              data={asOptions(masterColumns)}
              value={newMappingTarget || null}
              onChange={(next) => setNewMappingTarget(next ?? '')}
              allowDeselect={false}
              title={newMappingTarget || undefined}
              classNames={SELECT_CLASSES}
            />
            {addButton}
          </div>
        ) : (
          <div className={classes.addRow}>
            <TextInput
              aria-label={t('mdm:link.sourceColumn')}
              placeholder={t('mdm:link.sourceColumn')}
              value={newMappingSource}
              onChange={(e) => setNewMappingSource(e.currentTarget.value)}
              disabled={!selectedSourceId}
              classNames={FIELD_CLASSES}
            />
            <span className={classes.arrow} aria-hidden>→</span>
            <TextInput
              aria-label={t('mdm:link.masterColumn')}
              placeholder={t('mdm:link.masterColumn')}
              value={newMappingTarget}
              onChange={(e) => setNewMappingTarget(e.currentTarget.value)}
              disabled={!selectedSourceId}
              classNames={FIELD_CLASSES}
            />
            {addButton}
          </div>
        )}

        {selectedSourceId && sourceColumns.length === 0 && !loadingSchema && (
          <Alert color="red" variant="light" icon={<AlertCircle size={16} />}>
            {t('mdm:link.schemaLoadError')}
          </Alert>
        )}

        {mappingCount > 0 && (
          <Alert color="blue" variant="light" icon={<Info size={16} />}>
            {t('mdm:link.mappingsConfigured', { count: mappingCount })}
          </Alert>
        )}
      </div>
    </form>
  );
}

export default function LinkSourceDialog({ isOpen, configId, masterContractId, onClose, onSuccess }: LinkSourceDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  // A second click, or a click on the way out, sends nothing
  const busy = useRef(false);
  const session = useOpenSession(isOpen);

  const { t } = useTranslation(['mdm', 'common']);
  const { post } = useApi();
  const { toast } = useToast();

  const save = async (data: MdmSourceLinkCreate) => {
    if (busy.current || !isOpen) return;
    busy.current = true;
    setSubmitting(true);
    try {
      const response = await post(`/api/mdm/configs/${configId}/sources`, data);
      // useApi answers an error with an empty object, not a throw
      if (response.error) {
        toast({
          title: t('common:status.error'),
          description: response.error || t('mdm:link.linkFailed'),
          variant: 'destructive',
        });
        return;
      }
      if (response.data) {
        toast({ title: t('common:status.success'), description: t('mdm:link.linkSuccess') });
        onSuccess();
      }
    } catch (err: any) {
      toast({
        title: t('common:status.error'),
        description: err.message || t('mdm:link.linkFailed'),
        variant: 'destructive',
      });
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  // Escape and Cancel wait while the link is out
  const close = () => {
    if (busy.current) return;
    onClose();
  };

  return (
    <Dialog
      opened={isOpen}
      onClose={close}
      size="md"
      title={t('mdm:configDetails.linkSource')}
      description={t('mdm:link.dialogDescription')}
      footer={
        <>
          <Button type="button" variant="outline" onClick={close} disabled={submitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={submitting}>
            {submitting && <Loader size={12} color="currentColor" />}
            {t('mdm:link.submitButton')}
          </Button>
        </>
      }
    >
      <LinkForm key={session} masterContractId={masterContractId} onSave={save} />
    </Dialog>
  );
}

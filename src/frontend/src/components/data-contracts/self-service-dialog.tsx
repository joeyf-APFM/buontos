import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDefaultWorkflowText } from '@/lib/workflow-default-texts';
import { Alert, Checkbox, Loader, Select, TextInput } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES, SELECT_CLASSES } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import classes from './contract-form-dialogs.module.css';
import { AlertCircle, XCircle, CheckCircle } from 'lucide-react';
import SchemaPropertyEditor from '@/components/data-contracts/schema-property-editor';
import type { ColumnProperty } from '@/types/data-contract';
import { useProjectContext } from '@/stores/project-store';

interface WorkflowStepResult {
  step_id: string;
  passed: boolean;
  message?: string;
  policy_name?: string;
}

interface WorkflowResult {
  workflow_name: string;
  status: string;
  error?: string;
  step_results?: WorkflowStepResult[];
}

interface PreCreationError {
  message: string;
  workflows: WorkflowResult[];
}

type CreateType = 'catalog' | 'schema' | 'table';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialType?: 'catalog' | 'schema' | 'table';
};

export default function SelfServiceDialog({ isOpen, onOpenChange, initialType }: Props) {
  const { t } = useTranslation(['data-contracts', 'common']);
  const defaultWorkflowText = useDefaultWorkflowText();
  const { currentProject } = useProjectContext();
  const tableHeadingId = useId();

  const [createType, setCreateType] = useState<CreateType>('table');
  const [catalog, setCatalog] = useState('');
  const [schema, setSchema] = useState('');
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<ColumnProperty[]>([]);
  const [createContract, setCreateContract] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowErrors, setWorkflowErrors] = useState<PreCreationError | null>(null);
  const [success, setSuccess] = useState<any | null>(null);

  // Bootstrap defaults
  useEffect(() => {
    if (!isOpen) return;
    // Set initial type when opening
    if (initialType) {
      setCreateType(initialType);
    }
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/self-service/bootstrap');
        const data = await res.json();
        if (data?.defaults) {
          setCatalog(prev => prev || data.defaults.catalog || '');
          setSchema(prev => prev || data.defaults.schema || '');
        }
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  // Columns are managed inline via SchemaPropertyEditor

  const canSubmit = useMemo(() => {
    if (createType === 'catalog') return !!catalog;
    if (createType === 'schema') return !!catalog && !!schema;
    return !!catalog && !!schema && !!tableName;
  }, [createType, catalog, schema, tableName]);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      setWorkflowErrors(null);
      setSuccess(null);
      const payload: any = {
        type: createType,
        catalog,
        schema,
        createContract,
        defaultToUserCatalog: true,
        projectId: currentProject?.id,
      };
      if (createType === 'table') {
        payload.table = { name: tableName, columns };
      }
      const res = await fetch('/api/self-service/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Try to parse as JSON for workflow errors
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await res.json();
          // Check if it's a pre-creation validation error
          if (errorData.detail?.workflows) {
            setWorkflowErrors(errorData.detail as PreCreationError);
            return;
          }
          throw new Error(errorData.detail?.message || errorData.detail || `HTTP ${res.status}`);
        }
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSuccess(data);
    } catch (e: any) {
      setError(e?.message || t('data-contracts:selfService.errors.createFailed', 'Failed to create'));
    } finally {
      setLoading(false);
    }
  };

  const typeOptions = [
    { value: 'catalog', label: t('common:labels.catalog', 'Catalog') },
    { value: 'schema', label: t('common:labels.schema', 'Schema') },
    { value: 'table', label: t('common:labels.table', 'Table') },
  ];

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="lg"
      title={t('data-contracts:selfService.title', 'Self-service data curation')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common:actions.close', 'Close')}</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || loading}>
            {loading ? (<><Loader size={12} color="currentColor" /> {t('data-contracts:selfService.working', 'Working…')}</>) : t('common:actions.create', 'Create')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <div className={classes.threeCol}>
          <Select
            label={t('data-contracts:selfService.whatToCreateLabel', 'What to create')}
            placeholder={t('common:placeholders.selectType', 'Select type')}
            data={typeOptions}
            value={createType}
            onChange={(v) => v && setCreateType(v as CreateType)}
            allowDeselect={false}
            classNames={SELECT_CLASSES}
          />
          <TextInput
            label={t('common:labels.catalog', 'Catalog')}
            value={catalog}
            onChange={(e) => setCatalog(e.currentTarget.value)}
            placeholder={t('data-contracts:selfService.catalogPlaceholder', 'e.g. user_jdoe')}
            classNames={FIELD_CLASSES}
          />
          <TextInput
            label={t('common:labels.schema', 'Schema')}
            value={schema}
            onChange={(e) => setSchema(e.currentTarget.value)}
            placeholder={t('data-contracts:selfService.schemaPlaceholder', 'e.g. sandbox')}
            classNames={FIELD_CLASSES}
          />
        </div>

        {createType === 'table' && (
          <section className={form.section} aria-labelledby={tableHeadingId}>
            <h3 id={tableHeadingId} className={form.sectionTitle}>{t('data-contracts:selfService.tableDefinition', 'Table definition')}</h3>
            <TextInput
              className={classes.half}
              label={t('data-contracts:selfService.tableName', 'Table name')}
              value={tableName}
              onChange={(e) => setTableName(e.currentTarget.value)}
              placeholder={t('data-contracts:selfService.tableNamePlaceholder', 'e.g. clicks')}
              classNames={FIELD_CLASSES}
            />
            <SchemaPropertyEditor properties={columns} onChange={setColumns} />
          </section>
        )}

        {createType === 'table' && (
          <Checkbox
            checked={createContract}
            onChange={(e) => setCreateContract(e.currentTarget.checked)}
            label={t('data-contracts:selfService.createAsContract', 'Create as Data Contract')}
          />
        )}

        {error && (
          <Alert color="red" variant="light" icon={<AlertCircle size={16} />}>
            {error}
          </Alert>
        )}

        {workflowErrors && (
          <Alert color="red" variant="light" icon={<AlertCircle size={16} />} title={t('data-contracts:selfService.validationFailedTitle', 'Pre-creation validation failed')}>
            <p className={form.muted}>{workflowErrors.message}</p>
            <div className={classes.workflows}>
              {(Array.isArray(workflowErrors.workflows) ? workflowErrors.workflows : []).map((wf, i) => {
                const isPassed = wf.status === 'succeeded' || wf.status === 'passed';
                const failedSteps = (wf.step_results ?? []).filter(s => !s.passed);
                return (
                  <div key={i} className={classes.workflow} data-passed={isPassed || undefined}>
                    <div className={`${classes.workflowHead} ${isPassed ? classes.passed : ''}`}>
                      {isPassed ? (
                        <CheckCircle size={16} className={classes.passed} aria-hidden />
                      ) : (
                        <XCircle size={16} className={classes.failed} aria-hidden />
                      )}
                      {defaultWorkflowText(wf.workflow_name)}
                      <Badge variant="outline">{wf.status}</Badge>
                    </div>
                    {failedSteps.length > 0 && (
                      <ul className={classes.steps}>
                        {failedSteps.map((step, j) => (
                          <li key={j} className={classes.step}>
                            <XCircle size={12} className={classes.failed} aria-hidden />
                            <div>
                              {step.policy_name && (
                                <span className={classes.stepPolicy}>{step.policy_name}: </span>
                              )}
                              {step.message || t('data-contracts:selfService.stepValidationFailed', 'Validation failed')}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {wf.error && !wf.step_results?.length && (
                      <p className={classes.workflowError}>{wf.error}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className={form.muted}>{t('data-contracts:selfService.fixIssues', 'Please fix the issues above and try again.')}</p>
          </Alert>
        )}

        {success && (
          <Alert color="green" variant="light" icon={<CheckCircle size={16} />}>
            {t('data-contracts:selfService.createdPrefix', 'Created:')} {JSON.stringify(success.created)}{success.contractId ? t('data-contracts:selfService.contractSuffix', ', contract {{id}}', { id: success.contractId }) : ''}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

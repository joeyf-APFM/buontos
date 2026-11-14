import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, TextInput, Textarea } from '@mantine/core';
import classes from './compliance-policy-form.module.css';

// The categories and severities the dialog offers (a policy's own category
// is added when it is not one of these)
const CATEGORIES = [
  { value: 'Security', key: 'security' },
  { value: 'Data Quality', key: 'dataQuality' },
  { value: 'Privacy', key: 'privacy' },
  { value: 'Governance', key: 'governance' },
  { value: 'Maturity', key: 'maturity' },
] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

// Hints sit under their field
const HINT_BELOW = ['label', 'input', 'description', 'error'] as ('label' | 'input' | 'description' | 'error')[];
const FIELD_CLASSES = { label: classes.label, description: classes.hintText };
const SELECT_CLASSES = { ...FIELD_CLASSES, option: classes.option };

/** The fields of a policy the form starts from. */
export type PolicyFormSource = {
  name: string;
  description?: string;
  category?: string;
  severity?: string;
  rule: string;
  failure_message?: string;
};

export type PolicyValues = {
  name: string;
  description: string;
  category: string | null;
  severity: string | null;
  rule: string;
  failure_message: string;
};

/**
 * The create/edit form. It is the dialog's body, so its fields start afresh
 * each time the dialog opens, and its Save is the footer's (the `form` attribute).
 */
export function PolicyForm({
  formId,
  policy,
  onSave,
}: {
  formId: string;
  policy: PolicyFormSource | null;
  onSave: (values: PolicyValues) => void;
}) {
  const { t } = useTranslation(['compliance', 'common']);
  const [values, setValues] = useState<PolicyValues>({
    name: policy?.name ?? '',
    description: policy?.description ?? '',
    category: policy?.category || null,
    severity: policy?.severity || null,
    rule: policy?.rule ?? '',
    failure_message: policy?.failure_message ?? '',
  });
  const set = <K extends keyof PolicyValues>(key: K, value: PolicyValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const categories: { value: string; label: string }[] = CATEGORIES.map(({ value, key }) => ({
    value,
    label: t(`compliance:categories.${key}`),
  }));
  // A policy's own category stays selectable and is kept on save, even when the
  // dialog doesn't list it (a Select would show it blank, and save "General")
  if (values.category && !categories.some((c) => c.value === values.category)) {
    categories.push({ value: values.category, label: values.category });
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(values);
  };

  return (
    <form id={formId} onSubmit={submit} className={classes.form}>
      <TextInput
        id="name"
        label={t('common:labels.name')}
        withAsterisk
        required
        value={values.name}
        onChange={(e) => set('name', e.currentTarget.value)}
        classNames={FIELD_CLASSES}
        data-autofocus
      />
      <Textarea
        id="description"
        label={t('common:labels.description')}
        withAsterisk
        required
        autosize
        minRows={2}
        maxRows={8}
        value={values.description}
        onChange={(e) => set('description', e.currentTarget.value)}
        classNames={FIELD_CLASSES}
      />
      <Select
        id="category"
        label={t('common:labels.category')}
        placeholder={t('common:placeholders.selectCategory')}
        data={categories}
        value={values.category}
        onChange={(value) => set('category', value)}
        allowDeselect={false}
        classNames={SELECT_CLASSES}
      />
      <Select
        id="severity"
        label={t('common:labels.severity')}
        placeholder={t('common:placeholders.selectSeverity')}
        data={SEVERITIES.map((s) => ({ value: s, label: t(`compliance:severity.${s}`) }))}
        value={values.severity}
        onChange={(value) => set('severity', value)}
        allowDeselect={false}
        classNames={SELECT_CLASSES}
      />
      <Textarea
        id="rule"
        label={t('compliance:form.ruleCode')}
        withAsterisk
        required
        autosize
        minRows={8}
        maxRows={20}
        value={values.rule}
        onChange={(e) => set('rule', e.currentTarget.value)}
        placeholder={t('compliance:form.rulePlaceholder')}
        classNames={{ ...FIELD_CLASSES, input: classes.rule }}
        spellCheck={false}
      />
      <Textarea
        id="failure_message"
        label={t('compliance:form.failureMessage')}
        description={t('compliance:form.failureMessageHint')}
        inputWrapperOrder={HINT_BELOW}
        autosize
        minRows={3}
        maxRows={8}
        value={values.failure_message}
        onChange={(e) => set('failure_message', e.currentTarget.value)}
        placeholder={t('compliance:form.failureMessagePlaceholder')}
        classNames={FIELD_CLASSES}
      />
    </form>
  );
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, TextInput, Textarea } from '@mantine/core'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Dialog } from '@/mantine/page'
import { useOpenerRef } from '@/components/common/use-opener-ref'
import { FIELD_CLASSES, SELECT_CLASSES } from '@/components/common/dialog-form'
import form from '@/components/common/dialog-form.module.css'
import classes from './contract-form-dialogs.module.css'
import type { QualityRule } from '@/types/data-contract'

type QualityRuleFormProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (rule: QualityRule) => Promise<void>
  initial?: QualityRule
}

const QUALITY_DIMENSIONS = ['accuracy', 'completeness', 'conformity', 'consistency', 'coverage', 'timeliness', 'uniqueness']
const QUALITY_TYPES = ['text', 'library', 'sql', 'custom']
const QUALITY_SEVERITIES = ['info', 'warning', 'error']
const BUSINESS_IMPACTS = ['operational', 'regulatory']
const QUALITY_LEVELS = ['contract', 'object', 'property']

export default function QualityRuleFormDialog({ isOpen, onOpenChange, onSubmit, initial }: QualityRuleFormProps) {
  const { t } = useTranslation(['data-contracts', 'common'])
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Focus goes back to the opener only if free: a 409 hands it to the version prompt
  const opener = useOpenerRef(isOpen)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [level, setLevel] = useState('object')
  const [dimension, setDimension] = useState('completeness')
  const [businessImpact, setBusinessImpact] = useState('operational')
  const [severity, setSeverity] = useState('warning')
  const [type, setType] = useState('library')
  const [query, setQuery] = useState('')
  const [rule, setRule] = useState('')

  useEffect(() => {
    if (isOpen && initial) {
      setName(initial.name || '')
      setDescription(initial.description || '')
      setLevel(initial.level || 'object')
      setDimension(initial.dimension || 'completeness')
      setBusinessImpact(initial.businessImpact || 'operational')
      setSeverity(initial.severity || 'warning')
      setType(initial.type || 'library')
      setQuery(initial.query || '')
      setRule(initial.rule || '')
    } else if (isOpen && !initial) {
      setName('')
      setDescription('')
      setLevel('object')
      setDimension('completeness')
      setBusinessImpact('operational')
      setSeverity('warning')
      setType('library')
      setQuery('')
      setRule('')
    }
  }, [isOpen, initial])

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: t('data-contracts:quality.validationError', 'Validation Error'), description: t('data-contracts:quality.nameRequired', 'Rule name is required'), variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    try {
      const qualityRule: QualityRule = {
        name: name.trim(),
        description: description.trim() || undefined,
        level,
        dimension,
        businessImpact,
        severity,
        type,
        query: query.trim() || undefined,
        rule: rule.trim() || undefined,
      }

      await onSubmit(qualityRule)
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error?.message || t('data-contracts:quality.saveError', 'Failed to save quality rule'),
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * A Select of plain values, which are their own labels. The fields have
   * Mantine's own ids: this form also opens over the schema form (from its
   * column editor), whose fields would share fixed ones such as "name".
   */
  const valueSelect = (label: string, data: string[], value: string, onChange: (value: string) => void) => (
    <Select
      label={label}
      data={data}
      value={value}
      onChange={(next) => next && onChange(next)}
      allowDeselect={false}
      classNames={SELECT_CLASSES}
    />
  )

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      returnFocusTo={opener}
      size="lg"
      title={initial ? t('data-contracts:quality.editTitle', 'Edit Quality Rule') : t('data-contracts:quality.addTitle', 'Add Quality Rule')}
      description={t('data-contracts:quality.description', 'Define a data quality check for this contract.')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('common:actions.saving') : initial ? t('common:actions.saveChanges') : t('data-contracts:quality.addButton', 'Add Rule')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <TextInput
          label={t('data-contracts:quality.nameLabel', 'Rule Name')}
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder={t('data-contracts:quality.namePlaceholder', 'e.g., Check for null values')}
          classNames={FIELD_CLASSES}
        />

        <Textarea
          label={t('common:labels.description')}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder={t('data-contracts:quality.descriptionPlaceholder', 'Describe what this rule checks')}
          autosize
          minRows={2}
          maxRows={8}
          classNames={FIELD_CLASSES}
        />

        <div className={form.row}>
          {valueSelect(t('data-contracts:quality.levelLabel', 'Level'), QUALITY_LEVELS, level, setLevel)}
          {valueSelect(t('data-contracts:quality.dimensionLabel', 'Dimension'), QUALITY_DIMENSIONS, dimension, setDimension)}
        </div>

        <div className={form.row}>
          {valueSelect(t('data-contracts:quality.severityLabel', 'Severity'), QUALITY_SEVERITIES, severity, setSeverity)}
          {valueSelect(t('data-contracts:quality.businessImpactLabel', 'Business Impact'), BUSINESS_IMPACTS, businessImpact, setBusinessImpact)}
        </div>

        {valueSelect(t('data-contracts:quality.typeLabel', 'Type'), QUALITY_TYPES, type, setType)}

        {type === 'sql' && (
          <Textarea
            label={t('data-contracts:quality.sqlQueryLabel', 'SQL Query')}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={t('data-contracts:quality.sqlQueryPlaceholder', 'SELECT COUNT(*) FROM table WHERE...')}
            autosize
            minRows={4}
            maxRows={12}
            classNames={{ ...FIELD_CLASSES, input: classes.code }}
          />
        )}

        <Textarea
          label={t('data-contracts:quality.ruleExpressionLabel', 'Rule Expression')}
          value={rule}
          onChange={(e) => setRule(e.currentTarget.value)}
          placeholder={t('data-contracts:quality.ruleExpressionPlaceholder', 'e.g., col_name is not null')}
          autosize
          minRows={2}
          maxRows={8}
          classNames={FIELD_CLASSES}
        />
      </div>
    </Dialog>
  )
}

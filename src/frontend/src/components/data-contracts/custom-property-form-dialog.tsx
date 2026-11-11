import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, TextInput, Textarea } from '@mantine/core'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/mantine/page'
import { useOpenerRef } from '@/components/common/use-opener-ref'
import { FIELD_CLASSES, SELECT_CLASSES } from '@/components/common/dialog-form'
import form from '@/components/common/dialog-form.module.css'
import classes from './contract-form-dialogs.module.css'

interface CustomPropertyFormDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  initial?: { property: string; value: string }
  existingKeys?: string[]
  onSubmit: (data: { property: string; value: string }) => Promise<void>
}

type ValueType = 'string' | 'number' | 'boolean' | 'json'

export default function CustomPropertyFormDialog({
  isOpen,
  onOpenChange,
  initial,
  existingKeys = [],
  onSubmit,
}: CustomPropertyFormDialogProps) {
  const { t } = useTranslation(['data-contracts', 'common'])
  const [property, setProperty] = useState('')
  const [value, setValue] = useState('')
  const [valueType, setValueType] = useState<ValueType>('string')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Focus goes back to the opener only if free: a 409 hands it to the version prompt
  const opener = useOpenerRef(isOpen)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!initial

  useEffect(() => {
    if (isOpen) {
      if (initial) {
        setProperty(initial.property)
        setValue(initial.value)
        // Detect value type
        if (initial.value.startsWith('[') || initial.value.startsWith('{')) {
          setValueType('json')
        } else if (initial.value === 'true' || initial.value === 'false') {
          setValueType('boolean')
        } else if (!isNaN(Number(initial.value)) && initial.value !== '') {
          setValueType('number')
        } else {
          setValueType('string')
        }
      } else {
        setProperty('')
        setValue('')
        setValueType('string')
      }
      setError(null)
    }
  }, [isOpen, initial])

  const handleSubmit = async () => {
    setError(null)

    if (!property.trim()) {
      setError(t('data-contracts:customProperty.validation.nameRequired', 'Property name is required'))
      return
    }

    // Check for duplicate key when adding new
    if (!isEditing && existingKeys.includes(property.trim())) {
      setError(t('data-contracts:customProperty.validation.duplicate', 'A property with this name already exists'))
      return
    }

    // Validate JSON if type is json
    if (valueType === 'json') {
      try {
        JSON.parse(value)
      } catch {
        setError(t('data-contracts:customProperty.validation.invalidJson', 'Invalid JSON format'))
        return
      }
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        property: property.trim(),
        value: value,
      })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('data-contracts:customProperty.validation.saveFailed', 'Failed to save'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatJson = () => {
    if (valueType === 'json') {
      try {
        const parsed = JSON.parse(value)
        setValue(JSON.stringify(parsed, null, 2))
      } catch {
        // Ignore formatting errors
      }
    }
  }

  const valueTypeOptions = [
    { value: 'string', label: t('data-contracts:customProperty.valueTypes.string', 'String') },
    { value: 'number', label: t('data-contracts:customProperty.valueTypes.number', 'Number') },
    { value: 'boolean', label: t('data-contracts:customProperty.valueTypes.boolean', 'Boolean') },
    { value: 'json', label: t('data-contracts:customProperty.valueTypes.json', 'JSON (Array/Object)') },
  ]

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      returnFocusTo={opener}
      size="md"
      title={isEditing ? t('data-contracts:customProperty.editTitle', 'Edit Custom Property') : t('data-contracts:customProperty.addTitle', 'Add Custom Property')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('common:actions.saving', 'Saving...') : isEditing ? t('common:actions.update', 'Update') : t('common:actions.add', 'Add')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <TextInput
          id="property"
          label={t('data-contracts:customProperty.fields.propertyName', 'Property Name')}
          value={property}
          onChange={(e) => setProperty(e.currentTarget.value)}
          placeholder={t('data-contracts:customProperty.fields.propertyNamePlaceholder', 'e.g., mdmEntityType')}
          disabled={isEditing}
          classNames={FIELD_CLASSES}
        />

        <Select
          id="valueType"
          label={t('data-contracts:customProperty.fields.valueType', 'Value Type')}
          data={valueTypeOptions}
          value={valueType}
          onChange={(v) => v && setValueType(v as ValueType)}
          allowDeselect={false}
          classNames={SELECT_CLASSES}
        />

        <div>
          <div className={classes.labelRow}>
            <label htmlFor="value" className={form.label}>{t('data-contracts:customProperty.fields.value', 'Value')}</label>
            {valueType === 'json' && (
              <Button type="button" variant="ghost" size="sm" onClick={formatJson}>
                {t('data-contracts:customProperty.formatJson', 'Format JSON')}
              </Button>
            )}
          </div>
          {valueType === 'boolean' ? (
            <Select
              id="value"
              data={['true', 'false']}
              value={value || null}
              onChange={(v) => v && setValue(v)}
              allowDeselect={false}
              placeholder={t('data-contracts:customProperty.fields.selectValuePlaceholder', 'Select value')}
              classNames={SELECT_CLASSES}
            />
          ) : valueType === 'json' ? (
            <Textarea
              id="value"
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
              placeholder={t('data-contracts:customProperty.fields.jsonPlaceholder', '[{"name": "rule1", "type": "exact"}]')}
              autosize
              minRows={7}
              maxRows={16}
              classNames={{ input: classes.code }}
            />
          ) : (
            <TextInput
              id="value"
              type={valueType === 'number' ? 'number' : 'text'}
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
              placeholder={valueType === 'number' ? '0.8' : t('data-contracts:customProperty.fields.valuePlaceholder', 'Enter value')}
            />
          )}
        </div>

        {error && (
          <p className={form.error}>{error}</p>
        )}
      </div>
    </Dialog>
  )
}

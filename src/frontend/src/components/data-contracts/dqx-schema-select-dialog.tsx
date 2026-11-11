import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Checkbox } from '@mantine/core'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/mantine/page'
import { Sparkles, AlertCircle } from 'lucide-react'
import form from '@/components/common/dialog-form.module.css'
import classes from './contract-form-dialogs.module.css'
import type { DataContract } from '@/types/data-contract'

interface DqxSchemaSelectDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  contract: DataContract | null
  onConfirm: (selectedSchemaNames: string[]) => Promise<void>
}

export default function DqxSchemaSelectDialog({
  isOpen,
  onOpenChange,
  contract,
  onConfirm
}: DqxSchemaSelectDialogProps) {
  const { t } = useTranslation(['data-contracts', 'common'])
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)

  const schemas = contract?.schema || []

  const handleToggle = (schemaName: string) => {
    const newSet = new Set(selectedSchemas)
    if (newSet.has(schemaName)) {
      newSet.delete(schemaName)
    } else {
      newSet.add(schemaName)
    }
    setSelectedSchemas(newSet)
  }

  const handleSelectAll = () => {
    if (selectedSchemas.size === schemas.length) {
      setSelectedSchemas(new Set())
    } else {
      setSelectedSchemas(new Set(schemas.map(s => s.name)))
    }
  }

  const handleConfirm = async () => {
    if (selectedSchemas.size === 0) return

    setIsSubmitting(true)
    try {
      await onConfirm(Array.from(selectedSchemas))
      onOpenChange(false)
      setSelectedSchemas(new Set())
    } catch (error) {
      console.error('Failed to start profiling:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setSelectedSchemas(new Set())
    onOpenChange(false)
  }

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="lg"
      title={
        <span className={form.titleLine}>
          <Sparkles size={18} className={classes.titleIcon} aria-hidden />
          {t('data-contracts:dqx.title', 'Profile Schemas with DQX')}
        </span>
      }
      description={t('data-contracts:dqx.description', 'Select schemas to profile using Databricks DQX. The profiler will analyze your data and generate quality check suggestions.')}
      footer={
        <>
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedSchemas.size === 0 || isSubmitting}
          >
            {isSubmitting ? t('data-contracts:dqx.starting', 'Starting...') : t('data-contracts:dqx.profileButton', { count: selectedSchemas.size, defaultValue: 'Profile {{count}} Schemas' })}
          </Button>
        </>
      }
    >
      {schemas.length === 0 ? (
        <Alert color="gray" variant="light" icon={<AlertCircle size={16} />}>
          {t('data-contracts:dqx.noSchemas', 'No schemas defined in this contract. Add schemas first before profiling.')}
        </Alert>
      ) : (
        <div className={form.form}>
          <div className={classes.listHead}>
            <h3 className={form.sectionTitle}>{t('data-contracts:dqx.availableSchemas', 'Available Schemas')}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
            >
              {selectedSchemas.size === schemas.length ? t('data-contracts:dqx.deselectAll', 'Deselect All') : t('data-contracts:dqx.selectAll', 'Select All')}
            </Button>
          </div>

          {schemas.map((schema) => {
            const isSelected = selectedSchemas.has(schema.name)
            const columnCount = schema.propertyCount ?? schema.properties?.length ?? 0

            return (
              // The whole row toggles the schema, as before; the checkbox is the control
              <div
                key={schema.name}
                className={classes.choice}
                data-selected={isSelected || undefined}
                onClick={() => handleToggle(schema.name)}
              >
                <Checkbox
                  checked={isSelected}
                  onChange={() => handleToggle(schema.name)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={schema.name}
                />
                <div className={classes.choiceText}>
                  <div className={classes.choiceName}>{schema.name}</div>
                  {schema.physicalName && (
                    <div className={form.muted}>{schema.physicalName}</div>
                  )}
                  <div className={classes.choiceMeta}>
                    {t('data-contracts:dqx.columnCount', { count: columnCount, defaultValue: '{{count}} columns' })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Dialog>
  )
}

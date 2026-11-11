import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput } from '@mantine/core'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Dialog } from '@/mantine/page'
import { useOpenerRef } from '@/components/common/use-opener-ref'
import { FIELD_CLASSES, HINT_BELOW } from '@/components/common/dialog-form'
import form from '@/components/common/dialog-form.module.css'
import type { SLARequirements } from '@/types/data-contract'

type SLAFormProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (sla: SLARequirements) => Promise<void>
  initial?: SLARequirements
}

export default function SLAFormDialog({ isOpen, onOpenChange, onSubmit, initial }: SLAFormProps) {
  const { t } = useTranslation(['data-contracts', 'common'])
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Focus goes back to the opener only if free: a 409 hands it to the version prompt
  const opener = useOpenerRef(isOpen)

  const [uptimeTarget, setUptimeTarget] = useState('')
  const [maxDowntimeMinutes, setMaxDowntimeMinutes] = useState('')
  const [queryResponseTimeMs, setQueryResponseTimeMs] = useState('')
  const [dataFreshnessMinutes, setDataFreshnessMinutes] = useState('')

  useEffect(() => {
    if (isOpen && initial) {
      setUptimeTarget(initial.uptimeTarget?.toString() || '')
      setMaxDowntimeMinutes(initial.maxDowntimeMinutes?.toString() || '')
      setQueryResponseTimeMs(initial.queryResponseTimeMs?.toString() || '')
      setDataFreshnessMinutes(initial.dataFreshnessMinutes?.toString() || '')
    } else if (isOpen && !initial) {
      setUptimeTarget('')
      setMaxDowntimeMinutes('')
      setQueryResponseTimeMs('')
      setDataFreshnessMinutes('')
    }
  }, [isOpen, initial])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const sla: SLARequirements = {
        uptimeTarget: uptimeTarget ? parseFloat(uptimeTarget) : undefined,
        maxDowntimeMinutes: maxDowntimeMinutes ? parseInt(maxDowntimeMinutes, 10) : undefined,
        queryResponseTimeMs: queryResponseTimeMs ? parseInt(queryResponseTimeMs, 10) : undefined,
        dataFreshnessMinutes: dataFreshnessMinutes ? parseInt(dataFreshnessMinutes, 10) : undefined,
      }

      await onSubmit(sla)
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error?.message || t('data-contracts:sla.saveError', 'Failed to save SLA requirements'),
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      returnFocusTo={opener}
      size="sm"
      title={t('data-contracts:sla.editTitle', 'Edit SLA Requirements')}
      description={t('data-contracts:sla.description', 'Define service level agreement requirements for this contract.')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('common:actions.saving') : t('data-contracts:sla.saveButton', 'Save SLA')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <TextInput
          id="uptimeTarget"
          type="number"
          step="0.01"
          min="0"
          max="100"
          label={t('data-contracts:sla.uptimeTargetLabel', 'Uptime Target (%)')}
          value={uptimeTarget}
          onChange={(e) => setUptimeTarget(e.currentTarget.value)}
          placeholder={t('data-contracts:sla.uptimeTargetPlaceholder', 'e.g., 99.9')}
          description={t('data-contracts:sla.uptimeTargetHelp', 'Expected uptime percentage (0-100)')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />
        <TextInput
          id="maxDowntimeMinutes"
          type="number"
          min="0"
          label={t('data-contracts:sla.maxDowntimeLabel', 'Max Downtime (minutes)')}
          value={maxDowntimeMinutes}
          onChange={(e) => setMaxDowntimeMinutes(e.currentTarget.value)}
          placeholder={t('data-contracts:sla.maxDowntimePlaceholder', 'e.g., 60')}
          description={t('data-contracts:sla.maxDowntimeHelp', 'Maximum acceptable downtime per month')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />
        <TextInput
          id="queryResponseTimeMs"
          type="number"
          min="0"
          label={t('data-contracts:sla.queryResponseTimeLabel', 'Query Response Time (ms)')}
          value={queryResponseTimeMs}
          onChange={(e) => setQueryResponseTimeMs(e.currentTarget.value)}
          placeholder={t('data-contracts:sla.queryResponseTimePlaceholder', 'e.g., 1000')}
          description={t('data-contracts:sla.queryResponseTimeHelp', 'Maximum query response time in milliseconds')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />
        <TextInput
          id="dataFreshnessMinutes"
          type="number"
          min="0"
          label={t('data-contracts:sla.dataFreshnessLabel', 'Data Freshness (minutes)')}
          value={dataFreshnessMinutes}
          onChange={(e) => setDataFreshnessMinutes(e.currentTarget.value)}
          placeholder={t('data-contracts:sla.dataFreshnessPlaceholder', 'e.g., 15')}
          description={t('data-contracts:sla.dataFreshnessHelp', 'How fresh the data should be (in minutes)')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />
      </div>
    </Dialog>
  )
}

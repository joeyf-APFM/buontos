import { useEffect, useState } from 'react'
import { TextInput } from '@mantine/core'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Dialog } from '@/mantine/page'
import { FIELD_CLASSES, HINT_BELOW } from '@/components/common/dialog-form'
import form from '@/components/common/dialog-form.module.css'
import { useTranslation } from 'react-i18next'

type AuthoritativeDefinition = {
  id?: string
  url: string
  type: string
}

type AuthoritativeDefinitionFormProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (definition: AuthoritativeDefinition) => Promise<void>
  initial?: AuthoritativeDefinition
  level: 'contract' | 'schema' | 'property'
}

export default function AuthoritativeDefinitionFormDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  initial,
  level
}: AuthoritativeDefinitionFormProps) {
  const { toast } = useToast()
  const { t } = useTranslation(['data-contracts', 'common'])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [url, setUrl] = useState('')
  const [type, setType] = useState('')

  useEffect(() => {
    if (isOpen && initial) {
      setUrl(initial.url || '')
      setType(initial.type || '')
    } else if (isOpen && !initial) {
      setUrl('')
      setType('')
    }
  }, [isOpen, initial])

  const handleSubmit = async () => {
    if (!url.trim()) {
      toast({ title: t('data-contracts:authoritativeDefinition.toast.validationError', 'Validation Error'), description: t('data-contracts:authoritativeDefinition.toast.urlRequired', 'URL is required'), variant: 'destructive' })
      return
    }
    if (!type.trim()) {
      toast({ title: t('data-contracts:authoritativeDefinition.toast.validationError', 'Validation Error'), description: t('data-contracts:authoritativeDefinition.toast.typeRequired', 'Type is required'), variant: 'destructive' })
      return
    }

    // URL validation
    try {
      new URL(url.trim())
    } catch {
      toast({ title: t('data-contracts:authoritativeDefinition.toast.validationError', 'Validation Error'), description: t('data-contracts:authoritativeDefinition.toast.invalidUrl', 'Please enter a valid URL'), variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    try {
      const definition: AuthoritativeDefinition = {
        url: url.trim(),
        type: type.trim(),
      }

      await onSubmit(definition)
      onOpenChange(false)
      toast({
        title: t('common:toast.success', 'Success'),
        description: initial ? t('data-contracts:authoritativeDefinition.toast.updated', 'Authoritative definition updated') : t('data-contracts:authoritativeDefinition.toast.created', 'Authoritative definition created')
      })
    } catch (error: any) {
      toast({
        title: t('common:toast.error', 'Error'),
        description: error?.message || t('data-contracts:authoritativeDefinition.toast.saveError', 'Failed to save authoritative definition'),
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const levelLabels = {
    contract: t('data-contracts:authoritativeDefinition.levels.contract', 'Contract'),
    schema: t('data-contracts:authoritativeDefinition.levels.schema', 'Schema'),
    property: t('data-contracts:authoritativeDefinition.levels.property', 'Property')
  }

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="md"
      title={initial ? t('data-contracts:authoritativeDefinition.editTitle', 'Edit Authoritative Definition') : t('data-contracts:authoritativeDefinition.addTitle', 'Add Authoritative Definition')}
      description={t('data-contracts:authoritativeDefinition.description', '{{level}}-level authoritative source (ODCS compliant)', { level: levelLabels[level] })}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('common:actions.saving', 'Saving...') : initial ? t('common:actions.update', 'Update') : t('common:actions.add', 'Add')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        {/* URL */}
        <TextInput
          id="url"
          type="url"
          label={t('data-contracts:authoritativeDefinition.fields.url', 'URL')}
          required
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder={t('data-contracts:authoritativeDefinition.fields.urlPlaceholder', 'https://glossary.example.com/term/123')}
          description={t('data-contracts:authoritativeDefinition.fields.urlHelp', 'Full URL to the authoritative source')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
          data-autofocus
        />

        {/* Type */}
        <TextInput
          id="type"
          label={t('common:labels.type', 'Type')}
          required
          value={type}
          onChange={(e) => setType(e.currentTarget.value)}
          placeholder={t('data-contracts:authoritativeDefinition.fields.typePlaceholder', 'e.g., glossary, standard, documentation')}
          maxLength={255}
          description={t('data-contracts:authoritativeDefinition.fields.typeHelp', 'Type of authoritative source')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />
      </div>
    </Dialog>
  )
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, TextInput } from '@mantine/core'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/mantine/page'
import { useToast } from '@/hooks/use-toast'
import { PrincipalPicker } from '@/components/common/principal-picker'
import { buildContractTeamMember } from '@/lib/team-members'
import type { TeamMember } from '@/types/data-contract'
import { FIELD_CLASSES } from '@/components/common/dialog-form'
import form from '@/components/common/dialog-form.module.css'

type TeamMemberFormProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (member: TeamMember) => Promise<void>
  initial?: TeamMember
}

export default function TeamMemberFormDialog({ isOpen, onOpenChange, onSubmit, initial }: TeamMemberFormProps) {
  const { t } = useTranslation(['data-contracts', 'common'])
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [role, setRole] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    if (isOpen && initial) {
      setRole(initial.role || '')
      // Prefer email, fallback to username (for ODCS compatibility)
      setEmail(initial.email || initial.username || '')
      setName(initial.name || '')
    } else if (isOpen && !initial) {
      setRole('')
      setEmail('')
      setName('')
    }
  }, [isOpen, initial])

  const handleSubmit = async () => {
    if (!role.trim()) {
      toast({ title: t('data-contracts:team.validationError', 'Validation Error'), description: t('data-contracts:team.roleRequired', 'Role is required'), variant: 'destructive' })
      return
    }

    if (!email.trim()) {
      toast({ title: t('data-contracts:team.validationError', 'Validation Error'), description: t('data-contracts:team.emailRequired', 'Email/Username is required'), variant: 'destructive' })
      return
    }

    // Basic email validation (if it looks like an email)
    if (email.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: t('data-contracts:team.validationError', 'Validation Error'), description: t('data-contracts:team.invalidEmail', 'Please enter a valid email address'), variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    try {
      const member: TeamMember = buildContractTeamMember({
        emailOrUsername: email,
        role,
        name,
      })

      await onSubmit(member)
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error?.message || t('data-contracts:team.saveError', 'Failed to save team member'),
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
      size="sm"
      title={initial ? t('data-contracts:team.editTitle', 'Edit Team Member') : t('data-contracts:team.addTitle', 'Add Team Member')}
      description={t('data-contracts:team.description', 'Add a team member responsible for this data contract.')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('common:actions.saving') : initial ? t('common:actions.saveChanges') : t('data-contracts:team.addButton', 'Add Member')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <TextInput
          id="role"
          label={t('data-contracts:team.roleLabel', 'Role')}
          withAsterisk
          value={role}
          onChange={(e) => setRole(e.currentTarget.value)}
          placeholder={t('data-contracts:team.rolePlaceholder', 'e.g., Data Owner, Steward, Engineer')}
          classNames={FIELD_CLASSES}
        />

        <Input.Wrapper
          id="email"
          label={t('data-contracts:team.emailLabel', 'Email/Username')}
          withAsterisk
          classNames={FIELD_CLASSES}
        >
          <PrincipalPicker
            id="email"
            accepts={['user']}
            value={email || null}
            onChange={(next) => setEmail(next ?? '')}
            placeholder={t('data-contracts:team.emailPlaceholder', 'user@example.com or username')}
            aria-label={t('data-contracts:team.emailAriaLabel', 'Email or username')}
          />
        </Input.Wrapper>

        <TextInput
          id="name"
          label={t('common:labels.name')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder={t('data-contracts:team.namePlaceholder', 'Full name (optional)')}
          classNames={FIELD_CLASSES}
        />
      </div>
    </Dialog>
  )
}

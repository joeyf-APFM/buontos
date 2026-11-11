import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, TextInput, Textarea } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { useToast } from '@/hooks/use-toast';
import { PrincipalPicker } from '@/components/common/principal-picker';
import type { TeamMember } from '@/types/data-product';
import { FIELD_CLASSES, HINT_BELOW } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';

type TeamMemberFormProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (member: TeamMember) => Promise<void>;
  initial?: TeamMember;
};

export default function TeamMemberFormDialog({ isOpen, onOpenChange, onSubmit, initial }: TeamMemberFormProps) {
  const { t } = useTranslation(['data-products', 'common']);
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState('');
  const [dateIn, setDateIn] = useState('');
  const [dateOut, setDateOut] = useState('');

  useEffect(() => {
    if (isOpen && initial) {
      setUsername(initial.username || '');
      setName(initial.name || '');
      setDescription(initial.description || '');
      setRole(initial.role || '');
      setDateIn(initial.dateIn || '');
      setDateOut(initial.dateOut || '');
    } else if (isOpen && !initial) {
      setUsername('');
      setName('');
      setDescription('');
      setRole('');
      setDateIn('');
      setDateOut('');
    }
  }, [isOpen, initial]);

  const handleSubmit = async () => {
    if (!username.trim()) {
      toast({ title: t('data-products:messages.validationTitle'), description: t('data-products:teamMemberForm.validationUsernameRequired'), variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const member: TeamMember = {
        username: username.trim(),
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        role: role.trim() || undefined,
        dateIn: dateIn || undefined,
        dateOut: dateOut || undefined,
      };

      await onSubmit(member);
      onOpenChange(false);
      toast({
        title: t('common:toast.success'),
        description: initial ? t('data-products:teamMemberForm.successUpdated') : t('data-products:teamMemberForm.successAdded'),
      });
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error?.message || t('data-products:teamMemberForm.saveError'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="md"
      title={initial ? t('data-products:teamMemberForm.editTitle') : t('data-products:teamMemberForm.addTitle')}
      description={t('data-products:teamMemberForm.dialogDescription')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('common:actions.saving') : initial ? t('common:actions.saveChanges') : t('data-products:teamMemberForm.addButton')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <Input.Wrapper
          id="username"
          label={t('data-products:teamMemberForm.usernameLabel')}
          withAsterisk
          description={t('data-products:teamMemberForm.usernameHint')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        >
          <PrincipalPicker
            id="username"
            accepts={['user']}
            value={username || null}
            onChange={(next) => setUsername(next ?? '')}
            placeholder={t('data-products:teamMemberForm.usernamePlaceholder')}
            aria-label={t('data-products:teamMemberForm.usernameLabel')}
          />
        </Input.Wrapper>

        <TextInput
          id="name"
          label={t('data-products:teamMemberForm.fullNameLabel')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder={t('data-products:teamMemberForm.fullNamePlaceholder')}
          classNames={FIELD_CLASSES}
        />

        <TextInput
          id="role"
          label={t('data-products:teamMemberForm.roleLabel')}
          value={role}
          onChange={(e) => setRole(e.currentTarget.value)}
          placeholder={t('data-products:teamMemberForm.rolePlaceholder')}
          description={t('data-products:teamMemberForm.roleHint')}
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />

        <Textarea
          id="description"
          label={t('common:labels.description')}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder={t('data-products:teamMemberForm.descriptionPlaceholder')}
          rows={2}
          classNames={FIELD_CLASSES}
        />

        <div className={form.row}>
          <TextInput
            id="dateIn"
            type="date"
            label={t('data-products:teamMemberForm.dateJoinedLabel')}
            value={dateIn}
            onChange={(e) => setDateIn(e.currentTarget.value)}
            classNames={FIELD_CLASSES}
          />

          <TextInput
            id="dateOut"
            type="date"
            label={t('data-products:teamMemberForm.dateLeftLabel')}
            value={dateOut}
            onChange={(e) => setDateOut(e.currentTarget.value)}
            classNames={FIELD_CLASSES}
          />
        </div>
      </div>
    </Dialog>
  );
}

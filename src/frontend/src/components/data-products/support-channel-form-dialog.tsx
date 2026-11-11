import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, TextInput, Textarea } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { useToast } from '@/hooks/use-toast';
import type { Support } from '@/types/data-product';
import { FIELD_CLASSES, HINT_BELOW, SELECT_CLASSES } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';

type SupportChannelFormProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (support: Support) => Promise<void>;
  initial?: Support;
};

const SUPPORT_TOOLS = ['email', 'slack', 'teams', 'discord', 'ticket', 'other'];
const SUPPORT_SCOPES = ['interactive', 'announcements', 'issues'];

export default function SupportChannelFormDialog({ isOpen, onOpenChange, onSubmit, initial }: SupportChannelFormProps) {
  const { t } = useTranslation(['data-products', 'common']);
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [channel, setChannel] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [tool, setTool] = useState('slack');
  const [scope, setScope] = useState('interactive');
  const [invitationUrl, setInvitationUrl] = useState('');

  useEffect(() => {
    if (isOpen && initial) {
      setChannel(initial.channel || '');
      setUrl(initial.url || '');
      setDescription(initial.description || '');
      setTool(initial.tool || 'slack');
      setScope(initial.scope || 'interactive');
      setInvitationUrl(initial.invitationUrl || '');
    } else if (isOpen && !initial) {
      setChannel('');
      setUrl('');
      setDescription('');
      setTool('slack');
      setScope('interactive');
      setInvitationUrl('');
    }
  }, [isOpen, initial]);

  const handleSubmit = async () => {
    if (!channel.trim()) {
      toast({ title: 'Validation Error', description: 'Channel name is required', variant: 'destructive' });
      return;
    }

    if (!url.trim()) {
      toast({ title: 'Validation Error', description: 'URL is required', variant: 'destructive' });
      return;
    }

    // URL validation
    try {
      new URL(url.trim());
    } catch {
      toast({ title: 'Validation Error', description: 'Please enter a valid URL', variant: 'destructive' });
      return;
    }

    // Invitation URL validation if provided
    if (invitationUrl.trim()) {
      try {
        new URL(invitationUrl.trim());
      } catch {
        toast({ title: 'Validation Error', description: 'Please enter a valid invitation URL', variant: 'destructive' });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const support: Support = {
        channel: channel.trim(),
        url: url.trim(),
        description: description.trim() || undefined,
        tool: tool || undefined,
        scope: scope || undefined,
        invitationUrl: invitationUrl.trim() || undefined,
      };

      await onSubmit(support);
      onOpenChange(false);
      toast({
        title: 'Success',
        description: initial ? 'Support channel updated' : 'Support channel added',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to save support channel',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toolOptions = SUPPORT_TOOLS.map((tool) => ({ value: tool, label: tool.charAt(0).toUpperCase() + tool.slice(1) }));
  const scopeOptions = SUPPORT_SCOPES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="md"
      title={initial ? 'Edit Support Channel' : 'Add Support Channel'}
      description="Define a support channel for users of this data product (ODPS v1.0.0)."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : initial ? 'Save Changes' : 'Add Channel'}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <TextInput
          id="channel"
          label="Channel Name"
          withAsterisk
          value={channel}
          onChange={(e) => setChannel(e.currentTarget.value)}
          placeholder={t('data-products:supportChannelForm.channelNamePlaceholder')}
          classNames={FIELD_CLASSES}
          data-autofocus
        />

        <TextInput
          id="url"
          type="url"
          label="Access URL"
          withAsterisk
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder={t('data-products:supportChannelForm.accessUrlPlaceholder')}
          description="URL to access this support channel"
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />

        <div className={form.row}>
          <Select
            id="tool"
            label={t('data-products:supportChannelForm.tool')}
            data={toolOptions}
            value={tool || null}
            onChange={(value) => value && setTool(value)}
            allowDeselect={false}
            classNames={SELECT_CLASSES}
          />

          <Select
            id="scope"
            label={t('data-products:supportChannelForm.scope')}
            data={scopeOptions}
            value={scope || null}
            onChange={(value) => value && setScope(value)}
            allowDeselect={false}
            classNames={SELECT_CLASSES}
          />
        </div>

        <TextInput
          id="invitationUrl"
          type="url"
          label={t('data-products:supportChannelForm.invitationUrl')}
          value={invitationUrl}
          onChange={(e) => setInvitationUrl(e.currentTarget.value)}
          placeholder={t('data-products:supportChannelForm.invitationUrlPlaceholder')}
          description="Optional invitation link for new members"
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />

        <Textarea
          id="description"
          label={t('common:labels.description')}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder={t('data-products:supportChannelForm.descriptionPlaceholder')}
          rows={3}
          classNames={FIELD_CLASSES}
        />
      </div>
    </Dialog>
  );
}

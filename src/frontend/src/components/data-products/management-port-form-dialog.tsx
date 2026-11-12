import { useEffect, useState } from 'react';
import { Select, TextInput, Textarea } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import type { ManagementPort } from '@/types/data-product';
import { FIELD_CLASSES, HINT_BELOW, SELECT_CLASSES } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';

type ManagementPortFormProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (port: ManagementPort) => Promise<void>;
  initial?: ManagementPort;
};

const MANAGEMENT_PORT_CONTENTS = ['discoverability', 'observability', 'control', 'dictionary'];
const MANAGEMENT_PORT_TYPES = ['rest', 'topic'];

export default function ManagementPortFormDialog({ isOpen, onOpenChange, onSubmit, initial }: ManagementPortFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation(['data-products', 'common']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [content, setContent] = useState('observability');
  const [type, setType] = useState('rest');
  const [url, setUrl] = useState('');
  const [channel, setChannel] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isOpen && initial) {
      setName(initial.name || '');
      setContent(initial.content || 'observability');
      setType(initial.type || 'rest');
      setUrl(initial.url || '');
      setChannel(initial.channel || '');
      setDescription(initial.description || '');
    } else if (isOpen && !initial) {
      setName('');
      setContent('observability');
      setType('rest');
      setUrl('');
      setChannel('');
      setDescription('');
    }
  }, [isOpen, initial]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: 'Validation Error', description: 'Port name is required', variant: 'destructive' });
      return;
    }

    if (!content.trim()) {
      toast({ title: 'Validation Error', description: 'Content type is required', variant: 'destructive' });
      return;
    }

    // URL validation if provided
    if (url.trim()) {
      try {
        new URL(url.trim());
      } catch {
        toast({ title: 'Validation Error', description: 'Please enter a valid URL', variant: 'destructive' });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const port: ManagementPort = {
        name: name.trim(),
        content: content.trim(),
        type: type || 'rest',
        url: url.trim() || undefined,
        channel: channel.trim() || undefined,
        description: description.trim() || undefined,
      };

      await onSubmit(port);
      onOpenChange(false);
      toast({
        title: 'Success',
        description: initial ? 'Management port updated' : 'Management port added',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to save management port',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const contentOptions = MANAGEMENT_PORT_CONTENTS.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }));
  const typeOptions = MANAGEMENT_PORT_TYPES.map((p) => ({ value: p, label: p.toUpperCase() }));

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="md"
      title={initial ? t('data-products:managementPortForm.editTitle') : t('data-products:managementPortForm.addTitle')}
      description={t('data-products:managementPortForm.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : initial ? 'Save Changes' : 'Add Port'}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <TextInput
          id="name"
          label={t('data-products:managementPortForm.labels.portName')}
          withAsterisk
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder={t('data-products:managementPortForm.placeholders.name')}
          classNames={FIELD_CLASSES}
          data-autofocus
        />

        <div className={form.row}>
          <Select
            id="content"
            label={t('data-products:managementPortForm.labels.contentType')}
            withAsterisk
            data={contentOptions}
            value={content || null}
            onChange={(value) => value && setContent(value)}
            allowDeselect={false}
            description="Purpose of this management port"
            inputWrapperOrder={HINT_BELOW}
            classNames={SELECT_CLASSES}
          />

          <Select
            id="type"
            label={t('data-products:managementPortForm.labels.portType')}
            data={typeOptions}
            value={type || null}
            onChange={(value) => value && setType(value)}
            allowDeselect={false}
            classNames={SELECT_CLASSES}
          />
        </div>

        <TextInput
          id="url"
          type="url"
          label={t('data-products:managementPortForm.labels.url')}
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder={t('data-products:managementPortForm.placeholders.url')}
          description="Access URL for this management port"
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />

        <TextInput
          id="channel"
          label={t('data-products:managementPortForm.labels.channel')}
          value={channel}
          onChange={(e) => setChannel(e.currentTarget.value)}
          placeholder={t('data-products:managementPortForm.placeholders.channel')}
          description="Communication channel identifier"
          inputWrapperOrder={HINT_BELOW}
          classNames={FIELD_CLASSES}
        />

        <Textarea
          id="description"
          label={t('common:labels.description')}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder={t('data-products:managementPortForm.placeholders.description')}
          rows={3}
          classNames={FIELD_CLASSES}
        />
      </div>
    </Dialog>
  );
}

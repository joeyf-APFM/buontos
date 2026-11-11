import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Textarea } from '@mantine/core';
import { FIELD_CLASSES, HINT_BELOW, SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';

export interface AccessRequestFieldsProps {
  entityType: 'data_product' | 'data_contract';
  message: string;
  onMessageChange: (value: string) => void;
  selectedDuration: number;
  onDurationChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * Shared component for access request form fields.
 * Includes reason textarea and duration selector with localization.
 *
 * Mantine fields (wave 2 Task 11), for the request dialogs on the kit Dialog
 * (the product's and the contract's): the duration list is a Mantine Select,
 * whose Escape closes only the list.
 */
export default function AccessRequestFields({
  entityType,
  message,
  onMessageChange,
  selectedDuration,
  onDurationChange,
  disabled = false,
}: AccessRequestFieldsProps) {
  const { t } = useTranslation('access-grants');

  const [durationOptions, setDurationOptions] = useState<number[]>([30, 90, 180, 365]);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Fetch duration config from API
  useEffect(() => {
    // A change of entity type drops the answer of the load before it
    let live = true;
    setLoadingConfig(true);
    fetch(`/api/access-grants/config/${entityType}/options`)
      .then(res => res.json())
      .then(data => {
        if (!live) return;
        if (Array.isArray(data.duration_options) && data.duration_options.length > 0) {
          setDurationOptions(data.duration_options);
          // Only update selected duration if current isn't in options
          if (!data.duration_options.includes(selectedDuration)) {
            onDurationChange(data.default_duration || data.duration_options[0]);
          }
        }
      })
      .catch(() => {
        // Use defaults on error
        if (live) setDurationOptions([30, 90, 180, 365]);
      })
      .finally(() => { if (live) setLoadingConfig(false); });
    return () => { live = false; };
  }, [entityType]);

  // Format duration for display
  const formatDuration = (days: number): string => {
    if (days < 30) {
      return t('request.duration.days', { count: days });
    } else if (days < 365) {
      const months = Math.round(days / 30);
      return t('request.duration.months', { count: months });
    } else {
      const years = Math.round(days / 365);
      return t('request.duration.years', { count: years });
    }
  };

  const entityTypeLabel = t(`entityTypes.${entityType}`);
  const durationData = uniqueOptions(durationOptions.map((days) => ({ value: days.toString(), label: formatDuration(days) })));

  return (
    <div className={form.form}>
      <Textarea
        id="access-message"
        label={t('request.reason.label')}
        withAsterisk
        value={message}
        onChange={(e) => onMessageChange(e.currentTarget.value)}
        placeholder={t('request.reason.placeholder', { entityType: entityTypeLabel })}
        autosize
        minRows={4}
        maxRows={10}
        disabled={disabled}
        classNames={FIELD_CLASSES}
      />

      <Select
        id="access-duration"
        label={t('request.duration.label')}
        placeholder={t('request.duration.placeholder')}
        data={durationData}
        value={selectedDuration.toString()}
        onChange={(v) => v && onDurationChange(parseInt(v, 10))}
        allowDeselect={false}
        disabled={disabled || loadingConfig}
        description={t('request.duration.helpText')}
        inputWrapperOrder={HINT_BELOW}
        classNames={SELECT_CLASSES}
      />
    </div>
  );
}

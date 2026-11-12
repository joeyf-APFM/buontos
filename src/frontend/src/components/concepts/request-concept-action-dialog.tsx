import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  CheckCircle,
  CopyPlus,
  Rocket,
  Send,
  ShieldCheck,
  Undo2,
  ArchiveX,
  ArrowRightCircle,
} from 'lucide-react';
import { Loader, Select } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { SELECT_CLASSES } from '@/components/common/dialog-form';
import { Dialog } from '@/mantine/page';
import form from '@/components/common/dialog-form.module.css';
import classes from './request-concept-action-dialog.module.css';

// ---------------------------------------------------------------------------
// RequestConceptActionDialog: the concept detail page's single "Request"
// entry point (mirrors the data-contract / data-product request dialogs).
// The user picks an action, the body explains what will happen, and the
// primary button follows the selection. It consolidates:
//   * the lifecycle step(s) valid from the current status (Request Review for
//     a draft; approve / request changes / publish / certify / deprecate /
//     archive afterwards), and
//   * "New Version" (opens the PublishVersionDialog in the parent).
//
// The dialog is presentational: the parent decides WHICH transitions the user
// may run and owns every side effect (approval wizard, comment dialogs, API
// calls). It renders nothing when there is nothing to offer.
// ---------------------------------------------------------------------------

export interface ConceptTransitionItem {
  /** Target status, e.g. 'under_review'. */
  status: string;
  /** by-iri action verb, e.g. 'submit-review', 'approve'. */
  action: string;
  labelKey: string;
  defaultLabel: string;
}

export interface ConceptNewVersionOption {
  disabled: boolean;
  /** Why it is disabled; shown as helper text in the dialog. */
  disabledReason?: string;
  onSelect: () => void;
}

export interface RequestConceptActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conceptLabel?: string;
  currentStatus?: string;
  transitions: ConceptTransitionItem[];
  /** Omit to hide "New Version" entirely (no permission / not versionable). */
  newVersion?: ConceptNewVersionOption | null;
  onTransition: (status: string, action: string) => void;
  busy?: boolean;
}

const NEW_VERSION_KEY = '__new_version__';

interface OptionConfig {
  key: string;
  label: string;
  icon: ReactNode;
  description: string;
  confirmLabel: string;
  disabled: boolean;
  disabledReason?: string;
  run: () => void;
}

const transitionKey = (item: ConceptTransitionItem) => `${item.action || ''}::${item.status}`;

export function RequestConceptActionDialog({
  open,
  onOpenChange,
  conceptLabel,
  currentStatus,
  transitions,
  newVersion,
  onTransition,
  busy = false,
}: RequestConceptActionDialogProps): JSX.Element | null {
  const { t } = useTranslation(['semantic-models', 'common']);

  const options = useMemo<OptionConfig[]>(() => {
    const describe = (item: ConceptTransitionItem): Pick<OptionConfig, 'icon' | 'description'> => {
      const action = (item.action || '').toLowerCase();
      const status = (item.status || '').toLowerCase();
      if (action === 'submit-review') {
        return {
          icon: <Send aria-hidden />,
          description: t(
            'semantic-models:lifecycle.requestDialog.describe.submitReview',
            'Submit this concept for review. The reviewer is chosen in the next step.',
          ),
        };
      }
      if (action === 'approve') {
        return {
          icon: <CheckCircle aria-hidden />,
          description: t(
            'semantic-models:lifecycle.requestDialog.describe.approve',
            'Approve this concept so it can be published.',
          ),
        };
      }
      if (action === 'reject' || action === 'request-changes' || status === 'draft') {
        return {
          icon: <Undo2 aria-hidden />,
          description: t(
            'semantic-models:lifecycle.requestDialog.describe.requestChanges',
            'Send this concept back to draft. You can add a comment in the next step.',
          ),
        };
      }
      if (action === 'publish' || status === 'published') {
        return {
          icon: <Rocket aria-hidden />,
          description: t(
            'semantic-models:lifecycle.requestDialog.describe.publish',
            'Publish this concept so others can find and use it.',
          ),
        };
      }
      if (action === 'certify' || status === 'certified') {
        return {
          icon: <ShieldCheck aria-hidden />,
          description: t(
            'semantic-models:lifecycle.requestDialog.describe.certify',
            'Mark this concept as certified, a trusted reference.',
          ),
        };
      }
      if (action === 'deprecate' || status === 'deprecated') {
        return {
          icon: <ArchiveX aria-hidden />,
          description: t(
            'semantic-models:lifecycle.requestDialog.describe.deprecate',
            'Deprecate this concept. It stays visible but is flagged as no longer recommended.',
          ),
        };
      }
      if (action === 'archive' || status === 'archived') {
        return {
          icon: <Archive aria-hidden />,
          description: t(
            'semantic-models:lifecycle.requestDialog.describe.archive',
            'Archive this concept. It is retired and hidden from normal use.',
          ),
        };
      }
      return {
        icon: <ArrowRightCircle aria-hidden />,
        description: t('semantic-models:lifecycle.requestDialog.describe.generic', {
          defaultValue: 'Move this concept to the {{status}} status.',
          status: item.status,
        }),
      };
    };

    const list: OptionConfig[] = transitions.map((item) => {
      const label =
        item.action === 'submit-review'
          ? t('semantic-models:lifecycle.requestReview', 'Request Review')
          : t(item.labelKey, item.defaultLabel);
      return {
        key: transitionKey(item),
        label,
        confirmLabel: label,
        disabled: false,
        run: () => onTransition(item.status, item.action),
        ...describe(item),
      };
    });

    if (newVersion) {
      list.push({
        key: NEW_VERSION_KEY,
        label: t('semantic-models:versionHistory.newVersion', 'New Version'),
        confirmLabel: t('semantic-models:lifecycle.requestDialog.createNewVersion', 'Create New Version'),
        icon: <CopyPlus aria-hidden />,
        description: t(
          'semantic-models:lifecycle.requestDialog.describe.newVersion',
          'Save a new version of this concept. The IRI stays the same.',
        ),
        disabled: newVersion.disabled,
        disabledReason: newVersion.disabledReason,
        run: () => newVersion.onSelect(),
      });
    }
    return list;
  }, [transitions, newVersion, onTransition, t]);

  const firstEnabledKey = options.find((o) => !o.disabled)?.key ?? options[0]?.key ?? '';
  const [selectedKey, setSelectedKey] = useState<string>(firstEnabledKey);

  // Reset the selection every time the dialog opens.
  useEffect(() => {
    if (open) setSelectedKey(firstEnabledKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (options.length === 0) return null;

  const selected = options.find((o) => o.key === selectedKey) ?? options.find((o) => o.key === firstEnabledKey);
  const confirmDisabled = busy || !selected || selected.disabled;

  const handleConfirm = () => {
    if (!selected || confirmDisabled) return;
    onOpenChange(false);
    selected.run();
  };

  const pickerLabel = t('semantic-models:lifecycle.requestDialog.pickerLabel', 'What do you want to request?');

  return (
    <Dialog
      opened={open}
      onClose={() => onOpenChange(false)}
      title={t('semantic-models:lifecycle.requestDialog.title', 'Request Action')}
      description={
        <>
          {conceptLabel
            ? t('semantic-models:lifecycle.requestDialog.descriptionWithLabel', {
                defaultValue: 'Choose what you want to do with the concept "{{label}}".',
                label: conceptLabel,
              })
            : t('semantic-models:lifecycle.requestDialog.description', 'Choose what you want to do with this concept.')}
          {currentStatus && (
            <>
              {' '}
              {t('semantic-models:lifecycle.requestDialog.currentStatus', {
                defaultValue: 'Current status: {{status}}.',
                status: t(`semantic-models:lifecycle.status.${currentStatus.toLowerCase()}`, currentStatus),
              })}
            </>
          )}
        </>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={confirmDisabled}>
            {busy && <Loader size={12} color="currentColor" />}
            {selected?.confirmLabel ?? t('semantic-models:lifecycle.request', 'Request')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <Select
          id="request-concept-action"
          label={pickerLabel}
          aria-label={pickerLabel}
          data={options.map((o) => ({ value: o.key, label: o.label }))}
          value={selected?.key ?? null}
          onChange={(value) => value && setSelectedKey(value)}
          allowDeselect={false}
          classNames={SELECT_CLASSES}
        />

        {selected && (
          <div className={classes.body} data-testid="request-concept-action-body">
            <div className={classes.icon}>{selected.icon}</div>
            <div className={classes.text}>
              <p className={classes.label}>{selected.label}</p>
              <p className={classes.description}>{selected.description}</p>
              {selected.disabled && selected.disabledReason && (
                <p className={classes.reason}>{selected.disabledReason}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default RequestConceptActionDialog;

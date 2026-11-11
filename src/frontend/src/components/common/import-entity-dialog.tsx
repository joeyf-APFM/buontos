import React from 'react';
import { useDropzone, Accept } from 'react-dropzone';
import { Loader, Switch, Textarea } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import classes from './import-entity-dialog.module.css';

/**
 * Shared upload dialog for ODCS Data Contracts and ODPS Data Products.
 *
 * The two pages previously hand-rolled their own dialogs, which drifted apart
 * (one had a dropzone + paste box, the other a bare "Choose file(s)" button and
 * a subtitle). This single component keeps them identical: subtitle, the three
 * import toggles, a drag-&-drop zone, and an optional "paste JSON" box. Each page
 * supplies its own copy (`labels`), toggle state, and upload/paste handlers so
 * the per-feature i18n namespaces and backend calls stay where they belong.
 */

export interface ImportEntityDialogLabels {
  title: string;
  description: string;
  createMissingDomains: string;
  createMissingDomainsHint: string;
  adoptIds: string;
  adoptIdsHint: string;
  duplicatesAsNew: string;
  duplicatesAsNewHint: string;
  dropActive: string;
  dropInactive: string;
  supportedFormats: string;
  /** Paste section (optional — omit `paste` prop to hide it). */
  pasteLabel?: string;
  pastePlaceholder?: string;
  pasteButton?: string;
}

export interface ImportEntityToggleState {
  createMissingDomains: boolean;
  setCreateMissingDomains: (v: boolean) => void;
  adoptIds: boolean;
  setAdoptIds: (v: boolean) => void;
  duplicatesAsNew: boolean;
  setDuplicatesAsNew: (v: boolean) => void;
}

export interface ImportEntityPaste {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

interface ImportEntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ImportEntityDialogLabels;
  toggles: ImportEntityToggleState;
  /** react-dropzone accept map; restrict to the structured formats you support. */
  accept: Accept;
  /** Called with the dropped/selected files. */
  onFiles: (files: File[]) => void;
  uploading: boolean;
  disabled?: boolean;
  /** Optional paste-JSON section. */
  paste?: ImportEntityPaste;
  /** Optional alert/summary node rendered at the top of the dialog body. */
  alert?: React.ReactNode;
}

export function ImportEntityDialog({
  open,
  onOpenChange,
  labels,
  toggles,
  accept,
  onFiles,
  uploading,
  disabled = false,
  paste,
  alert,
}: ImportEntityDialogProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    multiple: true,
    disabled: uploading || disabled,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) onFiles(acceptedFiles);
    },
  });

  // An import option: its label and hint, the switch at the end. The hint
  // describes the switch; only the label names it.
  const toggle = (id: string, label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className={classes.option}>
      <div>
        <label htmlFor={id} className={classes.optionLabel}>{label}</label>
        <p id={`${id}-hint`} className={classes.optionHint}>{hint}</p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-hint`}
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        disabled={uploading}
      />
    </div>
  );

  return (
    <Dialog
      opened={open}
      onClose={() => onOpenChange(false)}
      title={labels.title}
      description={labels.description}
    >
      <div className={classes.body}>
        {alert}

        {toggle('ied-createMissingDomains', labels.createMissingDomains, labels.createMissingDomainsHint,
          toggles.createMissingDomains, toggles.setCreateMissingDomains)}
        {toggle('ied-adoptIds', labels.adoptIds, labels.adoptIdsHint, toggles.adoptIds, toggles.setAdoptIds)}
        {toggle('ied-duplicatesAsNew', labels.duplicatesAsNew, labels.duplicatesAsNewHint,
          toggles.duplicatesAsNew, toggles.setDuplicatesAsNew)}

        <div {...getRootProps()} className={classes.dropzone} data-active={isDragActive || undefined}>
          <input {...getInputProps()} />
          {uploading ? (
            <Loader size={24} />
          ) : (
            <>
              <p className={classes.dropText}>{isDragActive ? labels.dropActive : labels.dropInactive}</p>
              <p className={classes.dropHint}>{labels.supportedFormats}</p>
            </>
          )}
        </div>

        {paste && (
          <div className={classes.paste}>
            <Textarea
              id="ied-paste"
              label={labels.pasteLabel}
              placeholder={labels.pastePlaceholder}
              classNames={{ label: classes.pasteLabel, input: classes.pasteInput }}
              autosize
              minRows={6}
              maxRows={14}
              value={paste.value}
              onChange={(e) => paste.onChange(e.currentTarget.value)}
              disabled={paste.submitting || uploading}
            />
            <Button
              className={classes.pasteButton}
              disabled={!paste.value.trim() || paste.submitting || uploading}
              onClick={paste.onSubmit}
            >
              {paste.submitting && <Loader size={12} color="currentColor" />}
              {labels.pasteButton}
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default ImportEntityDialog;

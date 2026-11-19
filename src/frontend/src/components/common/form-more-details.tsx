import { useId, type ReactNode } from 'react';
import { Collapse } from '@mantine/core';
import { ChevronDown } from 'lucide-react';
import classes from './form-more-details.module.css';

interface FormMoreDetailsProps {
  /** Whether the optional fields are showing. */
  opened: boolean;
  onToggle: () => void;
  /** The toggle's text, naming what is inside, e.g. "Add details". */
  label: string;
  /** One line under the toggle saying what is already set, e.g. "Starts as Draft, version 0.0.1". */
  summary?: string;
  children: ReactNode;
}

/**
 * Hides a form's optional fields behind one toggle so the first screen holds only
 * what a new record needs. The fields stay mounted, so their values and
 * react-hook-form registration survive a collapse.
 */
export function FormMoreDetails({ opened, onToggle, label, summary, children }: FormMoreDetailsProps) {
  const regionId = useId();
  return (
    <div className={classes.root}>
      <button
        type="button"
        className={classes.toggle}
        aria-expanded={opened}
        aria-controls={regionId}
        onClick={onToggle}
      >
        <ChevronDown size={14} aria-hidden className={classes.chevron} data-opened={opened || undefined} />
        {label}
      </button>
      {summary && !opened && <p className={classes.summary}>{summary}</p>}
      <Collapse in={opened} id={regionId}>
        <div className={classes.fields}>{children}</div>
      </Collapse>
    </div>
  );
}

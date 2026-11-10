import { Fragment, type ReactNode } from 'react';
// The shared panels' label/value module (Task 8), so the two can't drift:
// an 86px label column in text-secondary, rows divided by border-subtle
import panel from '@/components/common/panel.module.css';
import classes from './page.module.css';

export interface DetailsRow {
  label: string;
  value: ReactNode;
}

export interface DetailsGridProps {
  rows: DetailsRow[];
}

/** Label / value rows, as in the explorer's details panel. */
export function DetailsGrid({ rows }: DetailsGridProps) {
  return (
    <dl className={`${panel.kv} ${classes.details}`}>
      {rows.map(({ label, value }, i) => (
        <Fragment key={`${i}:${label}`}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

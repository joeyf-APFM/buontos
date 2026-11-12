import type { ReactNode } from 'react';
// The shared panels' label/value module (Task 8), so the two can't drift:
// an 86px label column in text-secondary, rows about 23px apart with no rules
// between them (the explorer's density, R12), two pairs to a row (Task 13d)
import panel from '@/components/common/panel.module.css';
import classes from './page.module.css';

export interface DetailsRow {
  label: string;
  value: ReactNode;
}

export interface DetailsGridProps {
  rows: DetailsRow[];
  /** Pairs per row. Two everywhere, except a narrow pane such as the Asset Explorer's side panel (owner, Task 13d). */
  columns?: 1 | 2;
}

/** Label / value rows, as in the explorer's details panel. */
export function DetailsGrid({ rows, columns = 2 }: DetailsGridProps) {
  return (
    <dl className={`${panel.kv} ${classes.details}`} data-columns={columns}>
      {rows.map(({ label, value }, i) => (
        <div key={`${i}:${label}`}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

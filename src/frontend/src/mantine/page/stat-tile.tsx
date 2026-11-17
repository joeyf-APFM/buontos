import type { ReactNode } from 'react';
import classes from './page.module.css';

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'critical';
}

/** A figure: a 12px muted label above a 16px value, coloured by tone. */
export function StatTile({ label, value, tone = 'neutral' }: StatTileProps) {
  return (
    <div className={classes.statTile}>
      <div className={classes.statLabel}>{label}</div>
      <div className={classes.statValue} data-tone={tone}>
        {value}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Skeleton } from '@mantine/core';
import classes from './summary-stats.module.css';

/** A page's row of counts, under its header (My Requests, Owner Consumers): one bordered strip. */
export function SummaryStats({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={classes.stats}>
      {children}
    </div>
  );
}

/** One count in the strip: a tinted icon, the label, then the value (a skeleton while it loads). */
export function SummaryStat({ icon, tone, label, value, loading = false }: {
  icon: ReactNode;
  tone: 'warning' | 'info' | 'good' | 'accent';
  label: string;
  value: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className={classes.stat}>
      <span className={classes.icon} data-tone={tone}>{icon}</span>
      <div className={classes.text}>
        <div className={classes.label} title={label}>{label}</div>
        <div className={classes.value}>{loading ? <Skeleton height={16} width={28} radius="sm" /> : value}</div>
      </div>
    </div>
  );
}

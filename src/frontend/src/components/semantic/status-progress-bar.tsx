import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import classes from './status-progress-bar.module.css';

/**
 * Compact lifecycle progress bar for a concept. Shows the full ordered chain
 * (Draft → Under review → Approved → Published → Certified) with the current
 * position highlighted, so users get full-lifecycle visibility even though the
 * "Change status" dropdown only offers the single valid next hop.
 *
 * Deprecated / archived are terminal off-ramps, not part of the forward bar; a
 * concept in one of those states shows that terminal state as a trailing chip.
 */
const FORWARD_CHAIN = ['draft', 'under_review', 'approved', 'published', 'certified'] as const;
const TERMINAL = ['deprecated', 'archived'] as const;

interface Props {
  status: string;
  className?: string;
}

export function StatusProgressBar({ status, className }: Props) {
  const { t } = useTranslation(['semantic-models']);
  const isTerminal = (TERMINAL as readonly string[]).includes(status);
  const currentIdx = FORWARD_CHAIN.indexOf(status as (typeof FORWARD_CHAIN)[number]);

  const label = (s: string) => t(`semantic-models:status.${s}`, s.replace(/_/g, ' '));

  return (
    <div className={className ? `${classes.bar} ${className}` : classes.bar}>
      {FORWARD_CHAIN.map((s, i) => {
        const done = !isTerminal && currentIdx > i;
        const current = !isTerminal && currentIdx === i;
        return (
          <div key={s} className={classes.step}>
            <span className={classes.pill} data-step={current ? 'current' : done ? 'done' : 'todo'}>
              {done && <Check aria-hidden />}
              {label(s)}
            </span>
            {i < FORWARD_CHAIN.length - 1 && (
              <span className={classes.arrow} data-arrow aria-hidden>→</span>
            )}
          </div>
        );
      })}
      {isTerminal && (
        <>
          <span className={classes.arrow} aria-hidden>·</span>
          <span className={classes.pill} data-terminal>
            {label(status)}
          </span>
        </>
      )}
    </div>
  );
}

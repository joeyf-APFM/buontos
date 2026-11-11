import { UnstyledButton } from '@mantine/core';
import classes from './size-toggle.module.css';

// ---------------------------------------------------------------------------
// Compact segmented size toggle (S | M | L style). Purely presentational: the
// caller owns the value and persistence. Works for any number of options (2
// or 3 today). On Mantine since wave 2 Task 12a (size-toggle.module.css).
// ---------------------------------------------------------------------------

export interface SizeToggleOption<T extends string> {
  value: T;
  /** Short visible label, e.g. 'S' or 'L'. */
  label: string;
  /** Tooltip / accessible description shown via the native title attribute. */
  title: string;
}

interface SizeToggleProps<T extends string> {
  options: SizeToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Added to the group's own class, such as a caller's margin. */
  className?: string;
  'aria-label'?: string;
}

export function SizeToggle<T extends string>({
  options,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: SizeToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={className ? `${classes.group} ${className}` : classes.group}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <UnstyledButton
            key={option.value}
            type="button"
            className={classes.option}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            title={option.title}
            aria-label={option.title}
          >
            {option.label}
          </UnstyledButton>
        );
      })}
    </div>
  );
}

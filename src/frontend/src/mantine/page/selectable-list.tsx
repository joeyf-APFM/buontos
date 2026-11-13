import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import classes from './page.module.css';

export interface SelectableListItem {
  id: string;
  label: ReactNode;
  /** At the end of the row, such as a count. */
  meta?: ReactNode;
  disabled?: boolean;
}

export interface SelectableListProps {
  items: SelectableListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  'aria-label': string;
  /** Shown instead of the options when there are none. */
  emptyMessage?: ReactNode;
}

/**
 * A listbox of 28px rows with one selected, marked as the explorer tree marks
 * its selected row (accent-subtle background, 2px accent bar). Arrow keys move
 * focus between enabled rows; Enter or Space selects the focused one.
 */
export function SelectableList({
  items,
  selectedId,
  onSelect,
  'aria-label': ariaLabel,
  emptyMessage,
}: SelectableListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? []);
    const at = rows.indexOf(event.target as HTMLElement);
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowDown') next = rows[Math.min(at + 1, rows.length - 1)];
    else if (event.key === 'ArrowUp') next = rows[Math.max(at - 1, 0)];
    else if (event.key === 'Home') next = rows[0];
    else if (event.key === 'End') next = rows[rows.length - 1];
    else return;
    event.preventDefault();
    next?.focus();
  };

  if (items.length === 0) return <div className={classes.listEmpty}>{emptyMessage}</div>;

  // The selected row (else the first enabled one) is the tab stop
  const stopId = items.find((i) => i.id === selectedId && !i.disabled)?.id ?? items.find((i) => !i.disabled)?.id;
  return (
    <div ref={listRef} role="listbox" aria-label={ariaLabel} className={classes.selectable} onKeyDown={move}>
      {items.map((item) => (
        <div
          key={item.id}
          role="option"
          aria-selected={item.id === selectedId}
          aria-disabled={item.disabled || undefined}
          data-selected={item.id === selectedId || undefined}
          tabIndex={item.id === stopId ? 0 : -1}
          className={classes.selectableRow}
          onClick={() => !item.disabled && onSelect(item.id)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || item.disabled) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(item.id);
            }
          }}
        >
          <span className={classes.selectableLabel}>{item.label}</span>
          {item.meta != null && <span className={classes.selectableMeta}>{item.meta}</span>}
        </div>
      ))}
    </div>
  );
}

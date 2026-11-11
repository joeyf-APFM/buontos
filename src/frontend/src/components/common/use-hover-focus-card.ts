import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';

/** The elements a card can hand focus to, first one first. */
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A hover-and-focus card's open state, for a Mantine Popover drawn as a hover
 * card (Mantine's HoverCard opens on hover only, and its Tooltip takes no
 * pointer events, so neither can hold an action):
 *
 * - it opens on hover, after `openDelay`, and stays open while the pointer is
 *   over the target or the card; leaving either closes it after `closeDelay`;
 * - it opens on keyboard focus, and stays open while focus is in the target or
 *   the card (a press on a button in the card moves focus there first, so the
 *   click still lands); focus leaving both closes it;
 * - ArrowDown on the target opens the card if it is closed and moves focus to
 *   its first control, if it has one; Escape closes it (from inside the card,
 *   handing focus back to the target, where the card stays closed).
 *
 * Spread `target` on the Popover.Target's child and `dropdown` on the
 * Popover.Dropdown (it carries the dropdown's ref). Wave 2: Task 7's
 * MaturityInline and Task 10's DQX hint.
 */
export function useHoverFocusCard({ openDelay = 200, closeDelay = 150 }: { openDelay?: number; closeDelay?: number } = {}) {
  const [opened, setOpened] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const targetEl = useRef<HTMLElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // ArrowDown on a closed card: move into it once it has rendered
  const enterOnOpen = useRef(false);
  const clear = () => window.clearTimeout(timer.current);
  const later = (next: boolean, delay: number) => {
    clear();
    timer.current = window.setTimeout(() => setOpened(next), delay);
  };
  useEffect(() => clear, []);
  const firstControl = () => dropdownRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
  useEffect(() => {
    if (!opened || !enterOnOpen.current) return;
    enterOnOpen.current = false;
    // The Popover mounts its dropdown a frame or two after it opens
    let frame = 0;
    let tries = 0;
    const enter = () => {
      const first = firstControl();
      if (first) first.focus();
      else if (++tries < 10) frame = window.requestAnimationFrame(enter);
    };
    enter();
    return () => window.cancelAnimationFrame(frame);
  }, [opened]);
  const close = () => { clear(); setOpened(false); };
  // Focus still in the target or the card
  const inside = (node: EventTarget | null) =>
    node instanceof Node && (!!targetEl.current?.contains(node) || !!dropdownRef.current?.contains(node));
  const onEscape = (e: KeyboardEvent<HTMLElement>, refocus: boolean) => {
    if (e.key !== 'Escape' || !opened) return;
    e.stopPropagation();
    close();
    if (refocus) targetEl.current?.focus();
  };

  return {
    opened,
    close,
    target: {
      onMouseEnter: (e: MouseEvent<HTMLElement>) => { targetEl.current = e.currentTarget; later(true, openDelay); },
      onMouseLeave: () => later(false, closeDelay),
      onFocus: (e: FocusEvent<HTMLElement>) => { targetEl.current = e.currentTarget; clear(); setOpened(true); },
      onBlur: (e: FocusEvent<HTMLElement>) => { if (!inside(e.relatedTarget)) close(); },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.key === 'ArrowDown') {
          const first = opened ? firstControl() : null;
          if (first) {
            e.preventDefault();
            first.focus();
          } else if (!opened) {
            e.preventDefault();
            clear();
            enterOnOpen.current = true;
            setOpened(true);
          }
          return;
        }
        onEscape(e, false);
      },
    },
    dropdown: {
      ref: dropdownRef,
      onMouseEnter: clear,
      onMouseLeave: () => later(false, closeDelay),
      onBlur: (e: FocusEvent<HTMLElement>) => { if (!inside(e.relatedTarget)) close(); },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => onEscape(e, true),
    },
  };
}

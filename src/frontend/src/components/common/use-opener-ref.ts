import { useLayoutEffect, useRef } from 'react';

/**
 * The element that had focus when a dialog opened (its opener), for the kit
 * Dialog's `returnFocusTo`. The kit then puts focus back there once the dialog
 * has closed, only if `focusIsFree` says it may: a dialog that hands over to
 * another, such as a section form whose save answers 409 and opens the
 * version prompt, leaves focus in the one it opened. Mantine's own focus
 * return would take it back behind the prompt (wave 2 Task 11).
 *
 * Read before the Modal mounts its content (its transition mounts it a
 * render later), so focus is still on the opener.
 */
export function useOpenerRef(opened: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!opened) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [opened]);
  return opener;
}

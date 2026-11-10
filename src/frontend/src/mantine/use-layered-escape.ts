import { useEffect, useRef } from 'react';

/**
 * Escape closes a Mantine Modal unless a layer above it took the Escape
 * first. Use it with the Modal's `closeOnEscape={false}`.
 *
 * Mantine 8.3.18's Modal closes on any Escape (a window listener in the
 * capture phase, ahead of everything), so it would close under a shared
 * Radix layer opened over it, such as a picker's results or a Radix dialog:
 * both would close on one key. Radix's layers listen on the document in the
 * capture phase and prevent the default when they close; Mantine's own
 * comboboxes mark their input with data-mantine-stop-propagation while their
 * list is open. This listener sits on the window in the bubble phase, after
 * both, and closes only when neither took the key, as Radix's own dialog
 * stacking did.
 */
export function useLayeredEscape(opened: boolean, onClose: () => void): void {
  // The latest onClose, without re-adding the listener on every render
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!opened) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      const target = event.target as Element | null;
      if (target?.getAttribute?.('data-mantine-stop-propagation') === 'true') return;
      close.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [opened]);
}

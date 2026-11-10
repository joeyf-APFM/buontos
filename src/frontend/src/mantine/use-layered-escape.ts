import { useEffect, useRef } from 'react';

/** The open Mantine combobox's mark on its input (Mantine 8.3.18). */
const STOP = 'data-mantine-stop-propagation';

/**
 * Escape closes a Mantine Modal unless a layer above it took the Escape
 * first. Use it with the Modal's `closeOnEscape={false}`.
 *
 * Mantine 8.3.18's Modal closes on any Escape (a window listener in the
 * capture phase, ahead of everything), so it would close under a shared
 * Radix layer opened over it, such as a picker's results or a Radix dialog,
 * or with its own Select's list open: both would close on one key.
 *
 * - Radix's layers listen on the document in the capture phase and prevent
 *   the default when they close: the bubble listener sees `defaultPrevented`.
 * - Mantine's comboboxes mark their input with data-mantine-stop-propagation
 *   while their list is open, but in a browser the mark is gone before the
 *   key bubbles to the window (React commits the list's close in a microtask
 *   after its own handler). So a window listener in the capture phase,
 *   before any handler has run, notes the key as taken while the mark is
 *   still there; the bubble listener then leaves it.
 *
 * The Modal closes only when neither took the key, as Radix's own dialog
 * stacking did.
 */
export function useLayeredEscape(opened: boolean, onClose: () => void): void {
  // The latest onClose, without re-adding the listeners on every render
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!opened) return undefined;
    // Escapes a Mantine combobox had its list open for, noted in the capture phase
    const taken = new WeakSet<Event>();
    const onCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as Element | null;
      if (target?.getAttribute?.(STOP) === 'true') taken.add(event);
    };
    const onBubble = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || taken.has(event)) return;
      close.current();
    };
    window.addEventListener('keydown', onCapture, true);
    window.addEventListener('keydown', onBubble);
    return () => {
      window.removeEventListener('keydown', onCapture, true);
      window.removeEventListener('keydown', onBubble);
    };
  }, [opened]);
}

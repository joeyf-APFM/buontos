import { useCallback, useState } from 'react';

/**
 * For a Mantine Menu whose items open a dialog (ruling R51). Mantine's Menu
 * gives focus back to its target 10ms after it closes; when an item has just
 * opened a kit Dialog, that return can land after the dialog has taken focus,
 * leaving focus outside the modal. Wrap such items' handlers in `opensDialog`:
 * the menu then skips its return for that one close, and the kit Dialog gives
 * focus back to the menu's target when it closes (R41). Escape, an outside
 * click and the other items keep Mantine's return.
 *
 * One hook per Menu: spread `menuProps` on it. The return is switched back on
 * as the menu opens, never while it's closed (Mantine would read that change
 * as a close and move focus).
 */
export function useMenuItemFocus() {
  const [returnFocus, setReturnFocus] = useState(true);
  const onOpen = useCallback(() => setReturnFocus(true), []);
  const opensDialog = useCallback(
    <A extends unknown[]>(open: (...args: A) => void) =>
      (...args: A) => {
        setReturnFocus(false);
        open(...args);
      },
    [],
  );
  return { menuProps: { returnFocus, onOpen }, opensDialog };
}

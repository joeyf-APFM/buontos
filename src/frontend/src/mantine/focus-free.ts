/**
 * A floating dropdown (a Mantine Popover or Menu, a listbox) portalled
 * outside the element whose control opened it. Its target names it with
 * aria-controls while it's open; Mantine's dropdown also names its target
 * with aria-labelledby, which outlasts the target's aria-controls as it
 * closes.
 */
export const FLOATING_DROPDOWN = '.mantine-Popover-dropdown, [role="menu"], [role="listbox"]';

/** The control that opened the floating dropdown `node` is in, if it's in one. */
export function dropdownTarget(node: Element): HTMLElement | null {
  const dropdown = node.closest(FLOATING_DROPDOWN);
  if (!dropdown) return null;
  const byControls = dropdown.id ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(dropdown.id)}"]`) : null;
  if (byControls) return byControls;
  const label = dropdown.getAttribute('aria-labelledby');
  return label ? document.getElementById(label) : null;
}

/**
 * Whether a page may move focus after a Modal has closed (and any reload
 * after it has settled): only when focus is nowhere (the body, or null), or
 * still inside the Modal that closed (`closed`, its content element, which
 * may be on its way out of the DOM), or in a floating dropdown whose target
 * is inside it (a trapFocus Popover or Menu holds focus in its portal).
 * Focus anywhere else, including inside another open Modal, was put there by
 * the user and stays.
 */
export function focusIsFree(closed: Element | null): boolean {
  const active = document.activeElement;
  if (!active || active === document.body) return true;
  if (closed === null) return false;
  if (closed.contains(active)) return true;
  const target = dropdownTarget(active);
  return !!target && closed.contains(target);
}

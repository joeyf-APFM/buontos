/**
 * Whether a page may move focus after a Modal has closed (and any reload
 * after it has settled): only when focus is nowhere (the body, or null), or
 * still inside the Modal that closed (`closed`, its content element, which
 * may be on its way out of the DOM). Focus anywhere else, including inside
 * another open Modal, was put there by the user and stays.
 */
export function focusIsFree(closed: Element | null): boolean {
  const active = document.activeElement;
  return !active || active === document.body || (closed !== null && closed.contains(active));
}

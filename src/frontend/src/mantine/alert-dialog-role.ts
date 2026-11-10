/**
 * A callback ref that makes a Mantine Modal an alertdialog: pass it as
 * `ref` on `Modal.Content`, for a confirmation that needs a response (such
 * as a delete), as the Radix AlertDialog was.
 *
 * Mantine 8.3.18 sets `role="dialog"` on the content's <section> after the
 * spread props (ModalBaseContent), so a `role` prop loses. Modal.Content
 * forwards its ref through FocusTrap's innerRef to that <section>, so the
 * ref can set the attribute; React leaves it alone afterwards, because the
 * role it renders is a constant. Mantine's aria-modal, aria-labelledby and
 * aria-describedby stay as they are.
 *
 * A module-level function, so React calls it once per mount, not per render.
 */
export function alertDialogRole(node: HTMLElement | null): void {
  node?.setAttribute('role', 'alertdialog');
}

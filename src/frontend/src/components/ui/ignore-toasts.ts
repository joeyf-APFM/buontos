/**
 * Toasts render outside every Radix layer, so a click or focus on one counts
 * as "outside" an open dialog or sheet and would dismiss it. The old Radix
 * toast was a layer of its own and did not; these handlers keep that.
 */
const TOASTS = ".mantine-Notifications-root"

type OutsideEvent = { target: EventTarget | null; preventDefault(): void }

/** Runs the caller's handler, then keeps the layer open if the event came from a toast. */
export function ignoreToasts<E extends OutsideEvent>(handler?: (event: E) => void) {
  return (event: E) => {
    handler?.(event)
    if ((event.target as Element | null)?.closest?.(TOASTS)) event.preventDefault()
  }
}

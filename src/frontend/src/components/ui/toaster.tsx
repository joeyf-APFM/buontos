import { useEffect } from "react"
import { Notifications, notifications } from "@mantine/notifications"

/**
 * Escape with focus inside a toast closes only that toast. Radix dialogs listen
 * for Escape on the document in the capture phase, so this listener sits on the
 * window, ahead of them, and stops the event there.
 */
function closeToastOnEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return
  if (!(event.target as Element | null)?.closest?.(".mantine-Notification-root")) return
  event.stopPropagation()
  notifications.clean() // only one toast is ever showing
}

/**
 * Mount once, inside the MantineProvider. One toast at a time (see `toast()`).
 * `pointer-events: auto` keeps toasts clickable over a modal dialog, whose
 * overlay sets `pointer-events: none` on the body.
 */
export function Toaster() {
  useEffect(() => {
    window.addEventListener("keydown", closeToastOnEscape, true)
    return () => window.removeEventListener("keydown", closeToastOnEscape, true)
  }, [])
  return <Notifications position="bottom-right" limit={1} style={{ pointerEvents: "auto" }} />
}

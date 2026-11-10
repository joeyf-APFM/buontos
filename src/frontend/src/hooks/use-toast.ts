import type { ReactNode } from "react"
import { createElement, Fragment } from "react"
import { notifications } from "@mantine/notifications"

import type { ToastActionElement } from "../components/ui/toast"

/** Radix's default, kept so existing toasts stay up as long as before */
const DEFAULT_DURATION_MS = 5000

type Toast = {
  title?: ReactNode
  description?: ReactNode
  variant?: "default" | "destructive" | null
  action?: ToastActionElement
  /** Milliseconds before it closes itself; `Infinity` keeps it open */
  duration?: number
}

/** Map our toast props onto Mantine notification data. */
function toNotification({ title, description, variant, action, duration }: Toast) {
  const destructive = variant === "destructive"
  return {
    title,
    message: createElement(Fragment, null, description, action),
    color: destructive ? "red" : undefined,
    // Destructive toasts interrupt the reader; the rest are polite updates
    role: destructive ? "alert" : "status",
    autoClose: duration === undefined ? DEFAULT_DURATION_MS : duration === Infinity ? false : duration,
  }
}

/** One toast at a time: a new one replaces the last at once (Mantine's `limit` would queue it). */
function toast(props: Toast) {
  notifications.clean()
  const id = notifications.show(toNotification(props))
  return {
    id,
    dismiss: () => notifications.hide(id),
    update: (next: Toast) => notifications.update({ id, ...toNotification({ ...props, ...next }) }),
  }
}

function dismiss(toastId?: string) {
  if (toastId) notifications.hide(toastId)
  else notifications.clean()
}

function useToast() {
  return { toast, dismiss }
}

export { useToast, toast }

import * as React from "react"
import { Button, type ButtonProps } from "@mantine/core"

/** An action button for a toast; `altText` stays accepted for existing callers. */
const ToastAction = React.forwardRef<
  HTMLButtonElement,
  ButtonProps &
    Omit<React.ComponentPropsWithoutRef<"button">, "color"> & { altText?: string }
>(({ altText: _altText, ...props }, ref) => (
  <Button ref={ref} size="compact-xs" variant="default" mt="xs" {...props} />
))
ToastAction.displayName = "ToastAction"

type ToastActionElement = React.ReactElement<typeof ToastAction>

export { type ToastActionElement, ToastAction }

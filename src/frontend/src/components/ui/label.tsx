import * as React from "react"
import { Input } from "@mantine/core"

import { cn } from "@/lib/utils"

/** A form label: Mantine's input label, 12px, for any field by htmlFor. */
const Label = React.forwardRef<
  HTMLLabelElement,
  React.ComponentPropsWithoutRef<"label">
>(({ className, ...props }, ref) => (
  <Input.Label
    ref={ref}
    size="sm"
    className={cn(
      "leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    )}
    {...props}
  />
))
Label.displayName = "Label"

export { Label }

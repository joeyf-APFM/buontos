import * as React from "react"
import { Switch as MantineSwitch } from "@mantine/core"

import { cn } from "@/lib/utils"

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "size" | "type"> {
  onCheckedChange?(checked: boolean): void
  onChange?: React.ChangeEventHandler<HTMLInputElement>
}

/**
 * A Mantine switch with the Radix API: `checked`/`defaultChecked` and
 * `onCheckedChange` with the new state. The ref is the <input role="switch">.
 */
const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, onChange, onKeyDown, ...props }, ref) => (
    <MantineSwitch
      ref={ref}
      size="xs"
      className={cn("inline-flex shrink-0", className)}
      onChange={(event) => {
        onChange?.(event)
        onCheckedChange?.(event.currentTarget.checked)
      }}
      // The Radix switch was a button, so Enter toggled it; on a native
      // checkbox Enter does nothing or submits the form
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.key === "Enter" && !event.defaultPrevented) {
          event.preventDefault()
          event.currentTarget.click()
        }
      }}
      {...props}
    />
  )
)
Switch.displayName = "Switch"

export { Switch }

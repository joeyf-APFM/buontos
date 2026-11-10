import * as React from "react"
import { Radio } from "@mantine/core"

import { cn } from "@/lib/utils"

export interface RadioGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue" | "dir"> {
  value?: string
  defaultValue?: string
  // Method syntax, as in Radix, so handlers typed with a narrower value fit
  onValueChange?(value: string): void
  disabled?: boolean
  name?: string
  required?: boolean
}

/**
 * A Mantine radio group with the Radix API: `value`/`defaultValue` and
 * `onValueChange`. The caller's className lays out the items, as before.
 */
const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, defaultValue, onValueChange, disabled, name, required, children, ...props }, ref) => (
    <Radio.Group
      ref={ref}
      size="xs"
      value={value}
      defaultValue={defaultValue}
      onChange={(next) => onValueChange?.(next)}
      // Mantine lets a group's disabled override each item's, so only pass it
      // when the whole group is disabled
      disabled={disabled || undefined}
      name={name}
      required={required}
    >
      <div className={cn("grid gap-2", className)} {...props}>
        {children}
      </div>
    </Radio.Group>
  )
)
RadioGroup.displayName = "RadioGroup"

export interface RadioGroupItemProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "value"> {
  value: string
}

/** One option in a RadioGroup. The ref is the <input type="radio">. */
const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, ...props }, ref) => (
    <Radio ref={ref} size="xs" className={cn("inline-flex shrink-0", className)} {...props} />
  )
)
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }

import * as React from "react"
import { Checkbox as MantineCheckbox } from "@mantine/core"
import { useMergedRef } from "@mantine/hooks"

import { cn } from "@/lib/utils"

import { ignoreEnter } from "./field-props"

/** The Radix checkbox state: checked, unchecked or indeterminate. */
export type CheckedState = boolean | "indeterminate"

export interface CheckboxProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "checked" | "defaultChecked" | "onChange" | "size" | "type"
  > {
  checked?: CheckedState
  defaultChecked?: CheckedState
  onCheckedChange?(checked: CheckedState): void
  onChange?: React.ChangeEventHandler<HTMLInputElement>
}

/**
 * A Mantine checkbox with the Radix API: `checked` may be "indeterminate",
 * and `onCheckedChange` gets the new state. The ref is the <input>.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, defaultChecked, onCheckedChange, onChange, onKeyDown, ...props }, ref) => {
    // Mantine sets input.indeterminate only through an object ref, and the
    // caller's ref may be a callback, so it is set here
    const inputRef = React.useRef<HTMLInputElement>(null)
    const mergedRef = useMergedRef(ref, inputRef)
    const indeterminate = checked === "indeterminate"
    React.useEffect(() => {
      if (inputRef.current) inputRef.current.indeterminate = indeterminate
    }, [indeterminate])
    return (
      <MantineCheckbox
        ref={mergedRef}
        size="xs"
        className={cn("inline-flex shrink-0", className)}
        checked={checked === undefined ? undefined : checked === true}
        defaultChecked={defaultChecked === undefined ? undefined : defaultChecked === true}
        indeterminate={indeterminate}
        onChange={(event) => {
          onChange?.(event)
          onCheckedChange?.(event.currentTarget.checked)
        }}
        onKeyDown={ignoreEnter(onKeyDown)}
        {...props}
      />
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }

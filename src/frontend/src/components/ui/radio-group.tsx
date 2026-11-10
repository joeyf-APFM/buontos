import * as React from "react"
import { Radio } from "@mantine/core"

import { cn } from "@/lib/utils"

import { ignoreEnter } from "./field-props"

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

// Attributes that name or describe the group, as FormControl and callers
// set them on the Radix root (the role="radiogroup" element)
const isGroupAttribute = (key: string) => key === "id" || key.startsWith("aria-")

/**
 * A Mantine radio group with the Radix API: `value`/`defaultValue` and
 * `onValueChange`. The ref and the id/aria-* attributes are on the
 * role="radiogroup" element, as with Radix; the caller's className and other
 * props are on the div that lays out the items, as before.
 */
const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, defaultValue, onValueChange, disabled, name, required, children, ...props }, ref) => {
    const groupAttributes: Record<string, string> = {}
    const layoutProps: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(props)) {
      if (isGroupAttribute(key)) {
        if (val !== undefined && val !== null) groupAttributes[key] = String(val)
      } else layoutProps[key] = val
    }
    // Mantine renders the role="radiogroup" element itself and takes no
    // props for it, so the attributes are set on it here
    const groupRef = React.useRef<HTMLDivElement | null>(null)
    const layoutRef = React.useCallback((layout: HTMLDivElement | null) => {
      groupRef.current = (layout?.closest('[role="radiogroup"]') as HTMLDivElement | null) ?? null
    }, [])
    React.useImperativeHandle(ref, () => groupRef.current as HTMLDivElement)
    const attributeKey = JSON.stringify(groupAttributes)
    React.useLayoutEffect(() => {
      const group = groupRef.current
      if (!group) return
      const attributes = JSON.parse(attributeKey) as Record<string, string>
      for (const [key, val] of Object.entries(attributes)) group.setAttribute(key, val)
      return () => {
        for (const key of Object.keys(attributes)) group.removeAttribute(key)
      }
    }, [attributeKey])

    return (
      <Radio.Group
        size="xs"
        value={value}
        defaultValue={defaultValue}
        onChange={(next) => onValueChange?.(next)}
        // Mantine lets a group's disabled override each item's, so only pass
        // it when the whole group is disabled
        disabled={disabled || undefined}
        name={name}
        required={required}
      >
        <div ref={layoutRef} className={cn("grid gap-2", className)} {...layoutProps}>
          {children}
        </div>
      </Radio.Group>
    )
  }
)
RadioGroup.displayName = "RadioGroup"

export interface RadioGroupItemProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "value"> {
  value: string
}

/** One option in a RadioGroup. The ref is the <input type="radio">. */
const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, onKeyDown, ...props }, ref) => (
    <Radio
      ref={ref}
      size="xs"
      className={cn("inline-flex shrink-0", className)}
      onKeyDown={ignoreEnter(onKeyDown)}
      {...props}
    />
  )
)
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }

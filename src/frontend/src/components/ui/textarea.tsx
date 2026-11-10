import * as React from "react"
import { Input as MantineInput } from "@mantine/core"

import { cn } from "@/lib/utils"

import { isAriaInvalid, splitFieldClassName } from "./field-props"

type NativeProps = { id?: string; disabled?: boolean }

// As in input.tsx: withAria={false} keeps the caller's aria attributes, and
// this element puts id and disabled back on the <textarea>.
const NativeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & { nativeProps?: NativeProps }
>(({ nativeProps, ...props }, ref) => <textarea ref={ref} {...props} {...nativeProps} />)
NativeTextarea.displayName = "NativeTextarea"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, style, id, disabled, ...props }, ref) => {
  const classes = splitFieldClassName(className)
  return (
    <MantineInput<typeof NativeTextarea>
      component={NativeTextarea}
      ref={ref}
      size="xs"
      multiline
      withAria={false}
      error={isAriaInvalid(props["aria-invalid"])}
      disabled={disabled}
      nativeProps={{ id, disabled }}
      className={classes.root}
      // Mantine turns resizing off; the shadcn field kept the browser default
      classNames={{ input: cn("min-h-[60px] resize", classes.field) }}
      styles={style ? { input: style } : undefined}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }

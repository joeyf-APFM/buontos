import * as React from "react"
import { Input as MantineInput } from "@mantine/core"

import { isAriaInvalid, splitFieldClassName } from "./field-props"

type NativeProps = { id?: string; disabled?: boolean }

// Mantine's Input only puts id and disabled on the <input> when it also owns
// aria-invalid and aria-describedby, which form.tsx's FormControl sets. It
// runs with withAria={false}, so the caller's aria attributes pass through
// unchanged, and this element puts id and disabled back.
const NativeInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { nativeProps?: NativeProps }
>(({ nativeProps, ...props }, ref) => <input ref={ref} {...props} {...nativeProps} />)
NativeInput.displayName = "NativeInput"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, style, size, id, disabled, ...props }, ref) => {
    const classes = splitFieldClassName(className)
    return (
      <MantineInput<typeof NativeInput>
        component={NativeInput}
        ref={ref}
        size="xs"
        withAria={false}
        error={isAriaInvalid(props["aria-invalid"])}
        disabled={disabled}
        nativeProps={{ id, disabled }}
        inputSize={size === undefined ? undefined : String(size)}
        className={classes.root}
        classNames={classes.field ? { input: classes.field } : undefined}
        styles={style ? { input: style } : undefined}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

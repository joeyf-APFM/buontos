import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { Button as MantineButton, type ButtonVariant } from "@mantine/core"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { AURA } from "@/mantine/theme"

/**
 * Button classes for elements that are not a Button, such as links styled as
 * buttons. The Button itself is Mantine; these classes match its density
 * (28px default, 12px text) until wave 6 moves those links to Mantine too.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7 px-3",
        sm: "h-[26px] px-2.5",
        lg: "h-8 px-4",
        icon: "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type Variant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
type Size = NonNullable<VariantProps<typeof buttonVariants>["size"]>

const MANTINE_VARIANT: Record<Variant, ButtonVariant> = {
  default: "filled",
  destructive: "filled",
  outline: "default",
  secondary: "light",
  ghost: "subtle",
  link: "transparent",
}

const SIZE_VARS: Record<Size, Record<string, string>> = {
  default: { "--button-height": "28px", "--button-padding-x": "12px", "--button-fz": "12px" },
  sm: { "--button-height": "26px", "--button-padding-x": "10px", "--button-fz": "12px" },
  lg: { "--button-height": "32px", "--button-padding-x": "16px", "--button-fz": "12px" },
  icon: { "--button-height": "28px", "--button-padding-x": "0px", "--button-fz": "12px" },
}

// Mantine puts the children in inner and label spans. These classes let the
// caller's flex classes on the root (justify-*, gap-*) reach the children,
// keep svg icons at the shadcn size, and let badges overflow the button.
const ROOT_CLASSES =
  "inline-flex items-center justify-center gap-1.5 overflow-visible font-medium [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
const INNER_CLASSES = "grow [justify-content:inherit]"
const LABEL_CLASSES = "grow [justify-content:inherit] [gap:inherit]"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows a spinner and disables the button. */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, children, ...props }, ref) => {
    const v: Variant = variant ?? "default"
    const s: Size = size ?? "default"
    const child = asChild && React.isValidElement(children) ? children : null

    return (
      <MantineButton
        ref={ref}
        size="xs"
        variant={MANTINE_VARIANT[v]}
        color={v === "destructive" ? AURA.critical : undefined}
        vars={() => ({ root: SIZE_VARS[s] })}
        className={cn(
          ROOT_CLASSES,
          s === "icon" && "w-7",
          v === "link" && "underline-offset-4 hover:underline",
          className
        )}
        classNames={{ inner: INNER_CLASSES, label: LABEL_CLASSES }}
        // Mantine defaults to type="button"; the shadcn Button had the native
        // default, which submits inside a form
        type={type ?? "submit"}
        // asChild: the single child element becomes the root, with the
        // button's props and classes merged onto it (Radix Slot semantics);
        // it only gets a type if the caller gave one
        renderRoot={
          child
            ? ({ children: inner, type: _buttonType, ...rootProps }) => (
                <Slot {...rootProps} type={type}>
                  {React.cloneElement(child, undefined, inner)}
                </Slot>
              )
            : undefined
        }
        {...props}
      >
        {child ? (child.props as { children?: React.ReactNode }).children : children}
      </MantineButton>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

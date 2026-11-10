import * as React from "react"
import { Badge as MantineBadge, type BadgeVariant } from "@mantine/core"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { AURA } from "@/mantine/theme"

/**
 * Badge classes for elements that are not a Badge. The Badge itself is
 * Mantine; these classes match its density (18px high, 10.5px text).
 */
const badgeVariants = cva(
  "inline-flex h-[18px] items-center rounded-sm border px-1.5 text-[10.5px] font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-ring",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        info: "border-transparent bg-accent text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type Variant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

const MANTINE: Record<Variant, { variant: BadgeVariant; color?: string }> = {
  default: { variant: "filled" },
  secondary: { variant: "light", color: "gray" },
  destructive: { variant: "filled", color: AURA.critical },
  outline: { variant: "outline" },
  info: { variant: "light" },
}

const SIZE_VARS = {
  "--badge-height": "18px",
  "--badge-fz": "10.5px",
  "--badge-padding-x": "6px",
  "--badge-radius": "4px",
}
// The shadcn outline badge was neutral: body text on the pane border
const OUTLINE_VARS = {
  "--badge-color": AURA.textBody,
  "--badge-bd": `1px solid ${AURA.border}`,
}

// Mantine's badge is an uppercase, bold, letter-spaced grid; the shadcn badge
// was none of these, so the root goes back to an inline-flex in sentence case.
// Mantine puts the children in a label span, which lays them out in a row
// with the root's gap (a caller's gap-1), as the shadcn badge did.
const ROOT_CLASSES = "inline-flex items-center normal-case font-semibold tracking-normal"
const LABEL_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "inherit",
  gap: "inherit",
} as const

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, color, ...props }, ref) => {
    const v: Variant = variant ?? "default"
    return (
      <MantineBadge
        ref={ref}
        size="sm"
        variant={MANTINE[v].variant}
        color={color ?? MANTINE[v].color}
        vars={() => ({ root: v === "outline" ? { ...SIZE_VARS, ...OUTLINE_VARS } : SIZE_VARS })}
        className={cn(ROOT_CLASSES, className)}
        styles={{ label: LABEL_STYLE }}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge, badgeVariants }

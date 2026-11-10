import * as React from "react"
import { Divider } from "@mantine/core"

import { cn } from "@/lib/utils"
import { AURA } from "@/mantine/theme"

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical"
  /** Purely visual (the default): hidden from assistive technology. */
  decorative?: boolean
}

/**
 * A 1px line in the Aura border colour. Mantine's Divider is always
 * role="separator"; the Radix separator this replaces was role="none" unless
 * `decorative={false}`, so the root's role is set here.
 */
const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
    <Divider
      ref={ref}
      orientation={orientation}
      color={AURA.border}
      className={cn("shrink-0", orientation === "vertical" && "h-full", className)}
      renderRoot={(rootProps) => (
        <div
          {...rootProps}
          role={decorative ? "none" : "separator"}
          aria-orientation={!decorative && orientation === "vertical" ? "vertical" : undefined}
        />
      )}
      {...props}
    />
  )
)
Separator.displayName = "Separator"

export { Separator }

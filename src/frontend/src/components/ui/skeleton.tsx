import * as React from "react"
import { Skeleton as MantineSkeleton } from "@mantine/core"

import { cn } from "@/lib/utils"

/**
 * Mantine's pulsing placeholder. It paints in a pseudo-element, so the fill
 * is set with after:, in the Aura surface-strong colour the shadcn skeleton
 * (bg-muted) used. Size it with the caller's h-* and w-* classes; without
 * one it is w-auto, as the shadcn div was, not Mantine's 100%.
 */
const Skeleton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <MantineSkeleton
    ref={ref}
    className={cn("w-auto rounded-md after:bg-muted", className)}
    {...props}
  />
))
Skeleton.displayName = "Skeleton"

export { Skeleton }

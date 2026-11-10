import * as React from "react"
import { Progress as MantineProgress } from "@mantine/core"

import { cn } from "@/lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Progress out of `max`; null or undefined shows an empty bar. */
  value?: number | null
  max?: number
}

/**
 * An 8px accent bar on the surface-strong track. The root (the ref, the
 * caller's classes) is the track; Mantine puts role="progressbar" and its
 * aria-value* on the filled section inside it, so the caller's aria-label
 * and aria-labelledby go there too.
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    { className, value, max = 100, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, ...props },
    ref
  ) => {
    const percent = max > 0 ? Math.min(100, Math.max(0, ((value ?? 0) / max) * 100)) : 0
    return (
      <MantineProgress.Root
        ref={ref}
        size="md"
        className={cn("w-full rounded-full bg-secondary", className)}
        {...props}
      >
        <MantineProgress.Section
          value={percent}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
        />
      </MantineProgress.Root>
    )
  }
)
Progress.displayName = "Progress"

export { Progress }

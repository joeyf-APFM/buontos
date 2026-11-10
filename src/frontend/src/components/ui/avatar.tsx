import * as React from "react"
import { Avatar as MantineAvatar } from "@mantine/core"

import { cn } from "@/lib/utils"

type ImageStatus = "idle" | "loading" | "loaded" | "error"

const AvatarContext = React.createContext<{
  status: ImageStatus
  setStatus: (status: ImageStatus) => void
}>({ status: "idle", setStatus: () => {} })

// Mantine wraps the children in a placeholder span that is bold, grey and
// sized from the avatar; the parts style themselves, as with Radix
const PLACEHOLDER_STYLE = {
  background: "transparent",
  border: 0,
  color: "inherit",
  fontSize: "inherit",
  fontWeight: "inherit",
} as const

/**
 * A round avatar on Mantine. As with the Radix avatar, AvatarImage shows once
 * its image has loaded, and AvatarFallback shows until then (or after
 * `delayMs`), and when there is no image.
 */
const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    const [status, setStatus] = React.useState<ImageStatus>("idle")
    const context = React.useMemo(() => ({ status, setStatus }), [status])
    return (
      <AvatarContext.Provider value={context}>
        <MantineAvatar
          ref={ref as React.Ref<HTMLDivElement>}
          component="span"
          radius="xl"
          className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
          styles={{ placeholder: PLACEHOLDER_STYLE }}
          {...props}
        />
      </AvatarContext.Provider>
    )
  }
)
Avatar.displayName = "Avatar"

type AvatarImageProps = React.ComponentPropsWithoutRef<"img">

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, src, ...props }, ref) => {
    const { status, setStatus } = React.useContext(AvatarContext)
    React.useLayoutEffect(() => {
      if (!src) {
        setStatus("error")
        return
      }
      let active = true
      const image = new window.Image()
      image.onload = () => active && setStatus("loaded")
      image.onerror = () => active && setStatus("error")
      setStatus("loading")
      image.src = src
      return () => {
        active = false
      }
    }, [src, setStatus])
    if (status !== "loaded") return null
    return (
      <img ref={ref} src={src} className={cn("aspect-square h-full w-full", className)} {...props} />
    )
  }
)
AvatarImage.displayName = "AvatarImage"

const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { delayMs?: number }
>(({ className, delayMs, ...props }, ref) => {
  const { status } = React.useContext(AvatarContext)
  const [delayed, setDelayed] = React.useState(delayMs !== undefined)
  React.useEffect(() => {
    if (delayMs === undefined) return
    const timer = window.setTimeout(() => setDelayed(false), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs])
  if (delayed || status === "loaded") return null
  return (
    <span
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted",
        className
      )}
      {...props}
    />
  )
})
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }

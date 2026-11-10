import { Notifications } from "@mantine/notifications"

/** Mount once, inside the MantineProvider. */
export function Toaster() {
  return <Notifications position="bottom-right" limit={5} />
}

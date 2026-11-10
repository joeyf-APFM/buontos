/**
 * Stacking levels shared by the shell and the pages, beside the theme.
 * The shell's own levels live in mantine/shell/shell.module.css (the side
 * strip at 30, the top bar at 40); the shadcn/Radix overlays use Tailwind's
 * z-50 (components/ui/dialog.tsx and the other floating primitives).
 */
export const Z_INDEX = {
  /**
   * A Mantine Modal that a shared Radix Dialog may open over, such as the
   * import preview under the AssetSelector. One below the Radix dialogs'
   * z-50, so the Radix dialog stacks above it as it did over the Radix dialog
   * the Modal replaced; still above the top bar (40). Mantine's own popovers
   * and tooltips (300) and notifications (400) stay above it. Drop it once
   * those shared dialogs are on Mantine (their wave or wave 6), when the
   * Modal can go back to Mantine's default (200).
   */
  modalUnderRadix: 49,
} as const;

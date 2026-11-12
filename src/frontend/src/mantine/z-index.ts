/**
 * Stacking levels shared by the shell and the pages, beside the theme.
 * The shell's own levels live in mantine/shell/shell.module.css (the side
 * strip at 30, the top bar at 40); the shadcn/Radix overlays use Tailwind's
 * z-50 (components/ui/dialog.tsx and the other floating primitives).
 */
export const Z_INDEX = {
  /**
   * The floating assistant window (Helix, Ask Ontos;
   * mantine/assistant/assistant-window.tsx). Above the shell's top bar (40),
   * so it floats over the page, and below `modal` (49): dialogs cover
   * everything but the toasts (ruling, wave 2 Task 1 fix round 1). Its own
   * Mantine popovers portal at 300, above it.
   */
  assistant: 45,
  /**
   * Every kit Dialog (mantine/page/dialog.tsx), one level for all of them.
   * Above the top bar (40), so the overlay covers the shell. One below the
   * shadcn/Radix layers' z-50, so a Radix picker or dialog a Dialog opens
   * (the PrincipalPicker's results, the AssetSelector, a Radix Popover or
   * Select) stacks above it, as it did over the Radix dialog the Modal
   * replaced. Mantine's own popovers and tooltips (300), such as a Select's
   * list, and the toasts (Mantine notifications, 400) stay above it. Mantine's
   * default (200) would hide the Radix layers under the overlay. Raise it to
   * 200 once no Dialog holds a Radix layer (wave 6).
   */
  modal: 49,
} as const;

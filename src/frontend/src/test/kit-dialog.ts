/**
 * Checks shared by the dialog tests of wave 2 Task 8a: a dialog renders on
 * the kit Dialog (mantine/page/dialog.tsx), and none of the shadcn layout
 * classes of the Radix dialog it replaced are left in its own markup.
 */
import { expect } from 'vitest';
import { within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import dialogKit from '@/mantine/page/dialog.module.css';

/** The kit Dialog's content element: Mantine's Modal content, with the kit's look. */
export function expectKitDialog(dialog: HTMLElement) {
  expect(dialog).toHaveClass('mantine-Modal-content', dialogKit.content);
}

/**
 * The Tailwind layout and text classes the Radix dialogs used. The ui Button
 * and Badge render Mantine with a few Tailwind classes of their own, until
 * wave 6; they are left out.
 */
const OLD_MARKUP = [
  '.space-y-2', '.space-y-3', '.space-y-4', '.py-2', '.py-4', '.ml-6', '.mt-2',
  '.grid-cols-2', '.grid-cols-4', '.border-t', '.rounded-lg', '.text-destructive',
  '.text-muted-foreground', '.text-sm', '.text-xs', '.font-medium', '.animate-spin',
].map((c) => `${c}:not(button):not(.mantine-Badge-root)`).join(', ');

export function expectNoOldMarkup(dialog: HTMLElement) {
  expect(dialog.querySelector(OLD_MARKUP)).toBeNull();
}

/** A Mantine Select's field (jsdom gives it the textbox role; the restyle check records it as a combobox, R3). */
export function selectField(dialog: HTMLElement, name: string | RegExp) {
  const field = within(dialog).getByRole('textbox', { name });
  expect(field).toHaveAttribute('aria-haspopup', 'listbox');
  return field;
}

/** The names of a Select's options, opening and closing its list. */
export async function optionNames(user: ReturnType<typeof userEvent.setup>, field: HTMLElement) {
  await user.click(field);
  const list = document.getElementById(field.getAttribute('aria-controls') ?? '') as HTMLElement;
  const names = within(list).queryAllByRole('option', { hidden: true }).map((o) => o.textContent);
  await user.click(field);
  return names;
}

/** Picks an option in a Select's list. */
export async function pick(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, name: string | RegExp) {
  await user.click(field);
  const list = document.getElementById(field.getAttribute('aria-controls') ?? '') as HTMLElement;
  await user.click(within(list).getByRole('option', { name, hidden: true }));
}

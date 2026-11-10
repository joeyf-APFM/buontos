/**
 * The Radix compound primitives at Aura density, with their behaviour kept:
 * keyboard paths, focus trap, Escape and the localised close label.
 *
 * jsdom loads no Tailwind, so these tests check that each part carries the
 * density classes; the computed sizes are checked in a real browser in
 * tests/e2e/compound-density.spec.ts (ruling R10).
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@/test/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogTitle } from './alert-dialog';
import { Sheet, SheetContent, SheetTitle } from './sheet';
import { ignoreToasts } from './ignore-toasts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';

describe('compound primitives at Aura density', () => {
  it('select trigger is 28px and opens with keyboard', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger aria-label="Status">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="active">Active</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Status' });
    expect(trigger).toHaveClass('h-7', 'text-xs', 'rounded-sm');

    trigger.focus();
    await user.keyboard('{Enter}');
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    options.forEach((option) => expect(option).toHaveClass('min-h-[26px]', 'text-xs'));

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('dialog keeps focus trap and Esc and its close label', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Rename</DialogTitle>
            <input aria-label="Name" />
          </DialogContent>
        </Dialog>
      );
    }
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('rounded-lg', 'p-4', 'shadow-floating');
    expect(screen.getByText('Rename')).toHaveClass('text-sm', 'font-semibold', 'text-[color:var(--aura-text-navy)]');

    const name = screen.getByRole('textbox', { name: 'Name' });
    const close = screen.getByRole('button', { name: 'Close' });
    name.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(name).toHaveFocus(); // the focus trap wraps

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tabs switch with arrow keys and show the accent indicator', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First</TabsContent>
        <TabsContent value="two">Second</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tablist')).toHaveClass('h-[30px]');
    const one = screen.getByRole('tab', { name: 'One' });
    const two = screen.getByRole('tab', { name: 'Two' });
    const indicator = 'data-[state=active]:shadow-[inset_0_-2px_0_var(--aura-accent)]';
    expect(one).toHaveClass(indicator, 'text-xs');

    one.focus();
    await user.keyboard('{ArrowRight}');
    expect(two).toHaveFocus();
    expect(two).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Second')).toBeVisible();
  });

  it('dropdown items are 26px and activate with Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Edit</DropdownMenuItem>
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    screen.getByRole('button', { name: 'Actions' }).focus();
    await user.keyboard('{Enter}');
    const items = await screen.findAllByRole('menuitem');
    items.forEach((item) => expect(item).toHaveClass('min-h-[26px]', 'text-xs'));
    expect(screen.getByRole('menu')).toHaveClass('shadow-floating');

    expect(items[0]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

/**
 * Ruling R8: a click on a toast over an open dialog leaves the dialog open, as
 * it did when the toast was a Radix layer.
 */
describe('dialogs ignore outside events from the toasts', () => {
  function toastButton() {
    const root = document.createElement('div');
    root.className = 'mantine-Notifications-root';
    const button = document.createElement('button');
    button.textContent = 'Undo';
    root.append(button);
    document.body.append(root);
    return { button, remove: () => root.remove() };
  }
  // Radix starts listening for outside pointerdowns a tick after it mounts.
  const listening = () => new Promise((resolve) => setTimeout(resolve, 0));
  // Radix dismisses on the click that follows a primary-button pointerdown.
  const press = (el: Element) => {
    fireEvent.pointerDown(el);
    fireEvent.click(el);
  };

  it('a sheet stays open for a click in a toast, and closes for one elsewhere', async () => {
    const onOpenChange = vi.fn();
    const onPointerDownOutside = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent onPointerDownOutside={onPointerDownOutside}>
          <SheetTitle>Filters</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const toast = toastButton();
    await listening();
    press(toast.button);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onPointerDownOutside).toHaveBeenCalledTimes(1); // the caller's handler still runs

    press(document.body);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    toast.remove();
  });

  it('a dialog whose caller allows outside dismissal still ignores the toasts', async () => {
    const onOpenChange = vi.fn();
    const onInteractOutside = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent onInteractOutside={onInteractOutside}>
          <DialogTitle>Edit</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const toast = toastButton();
    await listening();
    press(toast.button);
    expect(onInteractOutside).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    press(document.body);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    toast.remove();
  });

  it('an alert dialog stays open for a toast click', async () => {
    const onOpenChange = vi.fn();
    render(
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete?</AlertDialogTitle>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const toast = toastButton();
    await listening();
    press(toast.button);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveClass('rounded-lg', 'p-4', 'shadow-floating');
    toast.remove();
  });

  // jsdom's focus trap swallows focusin before Radix sees it, so the focus path
  // is checked on the handler itself (and with a real toast in Playwright).
  it('the handler keeps the layer open only for events from a toast, after the caller', () => {
    const toast = toastButton();
    const calls: string[] = [];
    const event = (target: Element) => {
      const e = { target, defaultPrevented: false, preventDefault: () => { e.defaultPrevented = true; } };
      return e;
    };
    const handler = ignoreToasts<ReturnType<typeof event>>((e) => { calls.push(`caller:${e.defaultPrevented}`); });
    const fromToast = event(toast.button);
    handler(fromToast);
    expect(fromToast.defaultPrevented).toBe(true);
    const fromPage = event(document.body);
    handler(fromPage);
    expect(fromPage.defaultPrevented).toBe(false);
    expect(calls).toEqual(['caller:false', 'caller:false']);
    toast.remove();
  });
});

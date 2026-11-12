/**
 * Ruling R51: a Menu item that opens a dialog keeps focus where the dialog
 * put it; the menu's own focus return still works for Escape. The dialog here
 * is a stand-in that takes focus at once. Mantine gives focus back 10ms after
 * the menu closes; the item is clicked under fake timers, so that return runs
 * only when the test moves the clock, never while the click is still being
 * checked (a slow run used to let it land early). The kit Dialog itself is
 * checked in a real browser (tests/e2e/concepts-explore.spec.ts,
 * concepts-define-collections.spec.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Menu } from '@mantine/core';
import { renderWithMantine, userEvent } from '@/test/utils';
import { useMenuItemFocus } from './use-menu-item-focus';

function Harness({ withHook }: { withHook: boolean }) {
  const [open, setOpen] = useState(false);
  const { menuProps, opensDialog } = useMenuItemFocus();
  const openEditor = () => {
    setOpen(true);
    // A dialog that takes focus at once
    document.querySelector<HTMLInputElement>('[aria-label="Name"]')?.focus();
  };
  return (
    <>
      <Menu {...(withHook ? menuProps : {})} transitionProps={{ duration: 0 }}>
        <Menu.Target>
          <button type="button">Actions</button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={withHook ? opensDialog(openEditor) : openEditor}>Rename</Menu.Item>
          <Menu.Item>Other</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <div role="dialog" aria-label="Rename scheme" hidden={!open}>
        <input aria-label="Name" />
      </div>
    </>
  );
}

/**
 * Opens the menu, then clicks Rename with the clock stopped: the dialog has
 * focus, and Mantine's 10ms return hasn't run yet. The caller moves the clock
 * with `elapse`.
 */
async function openRename(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  const rename = await screen.findByRole('menuitem', { name: 'Rename', hidden: true });
  vi.useFakeTimers();
  act(() => {
    fireEvent.click(rename);
  });
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
}

/** Past Mantine's 10ms return (and its transitions), then real time again. */
function elapse(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  vi.useRealTimers();
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('useMenuItemFocus', () => {
  it('without it, the menu takes focus back out of the dialog its item opened', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness withHook={false} />);
    await openRename(user);
    elapse(60);
    expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus();
  });

  it('with it, focus stays in the dialog an item opened', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness withHook />);
    await openRename(user);
    elapse(60);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('leaves the menu\'s own return on for Escape, also after an item opened a dialog', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness withHook />);
    await openRename(user);
    elapse(60);
    const target = screen.getByRole('button', { name: 'Actions' });
    await user.click(target);
    await screen.findByRole('menuitem', { name: 'Other', hidden: true });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(target).toHaveFocus());
  });
});

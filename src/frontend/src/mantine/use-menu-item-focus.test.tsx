/**
 * Ruling R51: a Menu item that opens a dialog keeps focus where the dialog
 * put it; the menu's own focus return still works for Escape. The dialog here
 * is a stand-in that takes focus at once, which makes Mantine's 10ms return
 * race deterministic; the kit Dialog itself is checked in a real browser
 * (tests/e2e/concepts-explore.spec.ts, concepts-define-collections.spec.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
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

const pause = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

async function openRename(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Rename', hidden: true }));
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
}

afterEach(cleanup);

describe('useMenuItemFocus', () => {
  it('without it, the menu takes focus back out of the dialog its item opened', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness withHook={false} />);
    await openRename(user);
    await pause(60);
    expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus();
  });

  it('with it, focus stays in the dialog an item opened', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness withHook />);
    await openRename(user);
    await pause(60);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('leaves the menu\'s own return on for Escape, also after an item opened a dialog', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness withHook />);
    await openRename(user);
    const target = screen.getByRole('button', { name: 'Actions' });
    await user.click(target);
    await screen.findByRole('menuitem', { name: 'Other', hidden: true });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(target).toHaveFocus());
  });
});

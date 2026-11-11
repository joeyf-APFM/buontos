/**
 * The kit Dialog (Mantine Modal) in jsdom: its roles, names, Escape and
 * focus. Its look and stacking are measured in a real browser in
 * tests/e2e/page-kit.spec.ts (ruling R10).
 */
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Menu } from '@mantine/core';
import { renderWithMantine, userEvent } from '@/test/utils';
import { Dialog, type DialogProps } from '.';
import classes from './dialog.module.css';

type HarnessProps = Partial<Omit<DialogProps, 'opened' | 'onClose' | 'returnFocusTo'>> & {
  withReturnFocus?: boolean;
  onClose?: () => void;
};

/** An opener, a field outside the dialog, and the dialog it opens. */
function Harness({ withReturnFocus, onClose, title = 'Rename', ...props }: HarnessProps) {
  const [opened, setOpened] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={opener} type="button" onClick={() => setOpened(true)}>
        Open
      </button>
      <input aria-label="Elsewhere" />
      <Dialog
        opened={opened}
        onClose={() => {
          onClose?.();
          setOpened(false);
        }}
        title={title}
        returnFocusTo={withReturnFocus ? opener : undefined}
        {...props}
      >
        <input aria-label="Name" />
      </Dialog>
    </>
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Open' }));
};

describe('kit Dialog', () => {
  it('Dialog has role dialog, a labelled title and description', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <Harness
        description="The new name shows everywhere."
        footer={<button type="button">Save</button>}
      />,
    );
    await open(user);
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    expect(dialog).toHaveClass('mantine-Modal-content', classes.content);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('The new name shows everywhere.');
    expect(within(dialog).getByRole('heading', { name: 'Rename' })).toHaveClass(classes.title);
    // The body, then the footer, then the corner Close (last, as Radix's:
    // focus starts in the content)
    expect(within(dialog).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Save', 'Close',
    ]);
    expect(within(dialog).getByRole('button', { name: 'Save' }).parentElement).toHaveClass(classes.footer);
    expect(within(dialog).getByRole('textbox', { name: 'Name' }).parentElement).toHaveClass(classes.body);
  });

  it('Dialog without a description has none', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness />);
    await open(user);
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    expect(dialog).not.toHaveAttribute('aria-describedby');
    expect(dialog.querySelector(`.${classes.footer}`)).toBeNull();
  });

  it('Dialog role alertdialog sets the role', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness role="alertdialog" title="Delete it?" description="This cannot be undone." />);
    await open(user);
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete it?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    expect(screen.queryByRole('dialog')).toBeNull();
    // As the Radix AlertDialog: no corner close, a response is needed
    expect(within(dialog).queryByRole('button')).toBeNull();
  });

  it('Dialog leaves the corner close unnamed when closeLabel is null (R16)', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness closeLabel={null} />);
    await open(user);
    const close = within(await screen.findByRole('dialog')).getByRole('button');
    expect(close).not.toHaveAttribute('aria-label');
    expect(close).toHaveAccessibleName('');
  });

  it('Dialog returns focus to returnFocusTo once, only when focus is free', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness withReturnFocus />);
    const opener = screen.getByRole('button', { name: 'Open' });
    // Clicking Open focuses it too: count only the dialog's calls
    const focus = vi.spyOn(opener, 'focus');

    // Closed from inside: focus was in the dialog, so it goes back to the opener
    await open(user);
    focus.mockClear();
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    await user.click(within(dialog).getByRole('textbox', { name: 'Name' }));
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(focus).toHaveBeenCalledTimes(1);

    // Focus the user put elsewhere stays there
    await open(user);
    await screen.findByRole('dialog', { name: 'Rename' });
    focus.mockClear();
    const elsewhere = screen.getByRole('textbox', { name: 'Elsewhere', hidden: true });
    elsewhere.focus();
    fireEvent.keyDown(elsewhere, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Past the exit transition
    await new Promise((r) => setTimeout(r, 300));
    expect(elsewhere).toHaveFocus();
    expect(focus).not.toHaveBeenCalled();
  });

  it('Dialog calls onExited once with its content, after its exit', async () => {
    const user = userEvent.setup();
    const onExited = vi.fn();
    renderWithMantine(<Harness onExited={onExited} />);
    await open(user);
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onExited).toHaveBeenCalledTimes(1));
    expect(onExited).toHaveBeenCalledWith(dialog);
  });

  it('Dialog closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithMantine(<Harness onClose={onClose} />);
    await open(user);
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    await user.click(within(dialog).getByRole('textbox', { name: 'Name' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Dialog leaves an Escape that a layer above it took', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithMantine(<Harness onClose={onClose} />);
    await open(user);
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    const take = (e: KeyboardEvent) => e.preventDefault();
    document.addEventListener('keydown', take, true);
    fireEvent.keyDown(within(dialog).getByRole('textbox', { name: 'Name' }), { key: 'Escape' });
    document.removeEventListener('keydown', take, true);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Dialog stays open on a click outside unless closeOnClickOutside', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = renderWithMantine(<Harness onClose={onClose} />);
    await open(user);
    await screen.findByRole('dialog');
    const overlay = () => document.querySelector('.mantine-Modal-overlay') as HTMLElement;
    fireEvent.click(overlay());
    expect(onClose).not.toHaveBeenCalled();
    rerender(<Harness onClose={onClose} closeOnClickOutside />);
    fireEvent.click(overlay());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * Wave 2 Task 11 fix round 1 (ruling R41): the kit puts focus back itself,
 * never Mantine. It records the opener when the dialog opens (also when it
 * mounts open), and after the exit gives focus back only if the opener is
 * still there, focus is free, no newer kit dialog holds it, and the page
 * hasn't moved on.
 */
describe('kit Dialog focus return (R41)', () => {
  /** A dialog that mounts already open, from a button that both mounts and opens it. */
  function MountOpen() {
    const [shown, setShown] = useState(false);
    const [opened, setOpened] = useState(false);
    return (
      <>
        <button type="button" onClick={() => { setShown(true); setOpened(true); }}>Open</button>
        {shown && (
          <Dialog opened={opened} onClose={() => setOpened(false)} title="Rename">
            <input aria-label="Name" />
          </Dialog>
        )}
      </>
    );
  }

  /**
   * A form that hands over to a prompt (the 409 path): Save opens the prompt
   * and the form closes once the prompt has focus. Mantine's own focus return
   * (before R41) took focus back to Open, behind the prompt.
   */
  function Handover() {
    const [form, setForm] = useState(false);
    const [prompt, setPrompt] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setForm(true)}>Open</button>
        <Dialog opened={form} onClose={() => setForm(false)} title="Edit SLA">
          <button
            type="button"
            onClick={() => {
              setPrompt(true);
              window.setTimeout(() => setForm(false), 100);
            }}
          >
            Save
          </button>
        </Dialog>
        <Dialog opened={prompt} onClose={() => setPrompt(false)} title="Version prompt">
          <button type="button">Keep</button>
        </Dialog>
      </>
    );
  }

  /**
   * A form with a discard confirm whose Discard closes both (as in
   * data-contract-basic-form-dialog and data-product-create-dialog). The
   * confirm closes a moment after the form, so the form's exit ends while the
   * confirm is still on its way out and still holds focus: the race the two
   * do in one handler, made certain.
   */
  function DiscardBoth() {
    const [form, setForm] = useState(false);
    const [confirm, setConfirm] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setForm(true)}>Open</button>
        <Dialog opened={form} onClose={() => setConfirm(true)} title="New product">
          <button type="button" onClick={() => setConfirm(true)}>Cancel</button>
        </Dialog>
        <Dialog opened={confirm} onClose={() => setConfirm(false)} title="Discard changes?" role="alertdialog">
          <button
            type="button"
            onClick={() => {
              setForm(false);
              window.setTimeout(() => setConfirm(false), 50);
            }}
          >
            Discard
          </button>
        </Dialog>
      </>
    );
  }

  /** A dialog opened from a Menu item: the item goes with the menu. */
  function FromMenu() {
    const [opened, setOpened] = useState(false);
    return (
      <>
        <Menu>
          <Menu.Target>
            <button type="button">Actions</button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => setOpened(true)}>Rename…</Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <Dialog opened={opened} onClose={() => setOpened(false)} title="Rename">
          <input aria-label="Name" />
        </Dialog>
      </>
    );
  }

  // Inside act: the exits' state updates land while it waits
  const pastExit = () => act(() => new Promise<void>((r) => setTimeout(r, 400)));

  it('Dialog gives focus back to the element that opened it, without scrolling', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await open(user);
    const focus = vi.spyOn(opener, 'focus');
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(opener).toHaveFocus());
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('Dialog records its opener when it mounts already open', async () => {
    const user = userEvent.setup();
    renderWithMantine(<MountOpen />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('Dialog leaves focus in the dialog it handed over to', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Handover />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    const form = await screen.findByRole('dialog', { name: 'Edit SLA' });
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    const prompt = await screen.findByRole('dialog', { name: 'Version prompt' });
    await waitFor(() => expect(prompt.contains(document.activeElement)).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit SLA' })).toBeNull());
    await pastExit();
    expect(prompt.contains(document.activeElement)).toBe(true);
    expect(opener).not.toHaveFocus();
  });

  it('Dialog gives focus back to the opener when it closes together with its confirm', async () => {
    const user = userEvent.setup();
    renderWithMantine(<DiscardBoth />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    const form = await screen.findByRole('dialog', { name: 'New product' });
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    await waitFor(() => expect(confirm.contains(document.activeElement)).toBe(true));
    await user.click(within(confirm).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await pastExit();
    expect(opener).toHaveFocus();
  });

  it('Dialog opened from a Menu item gives focus back to the menu\'s target', async () => {
    const user = userEvent.setup();
    renderWithMantine(<FromMenu />);
    const target = screen.getByRole('button', { name: 'Actions' });
    await user.click(target);
    await user.click(await screen.findByRole('menuitem', { name: 'Rename…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(target).toHaveFocus());
  });

  it('Dialog leaves focus alone once the page has moved on', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await open(user);
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    const before = window.location.href;
    window.history.pushState({}, '', '/elsewhere');
    try {
      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await pastExit();
      expect(opener).not.toHaveFocus();
    } finally {
      window.history.pushState({}, '', before);
    }
  });

  it('Dialog leaves focus alone when its opener has gone', async () => {
    function GoneOpener() {
      const [opened, setOpened] = useState(false);
      const [hidden, setHidden] = useState(false);
      return (
        <>
          {!hidden && <button type="button" onClick={() => setOpened(true)}>Open</button>}
          <Dialog opened={opened} onClose={() => setOpened(false)} title="Rename">
            <button type="button" onClick={() => setHidden(true)}>Remove the opener</button>
          </Dialog>
        </>
      );
    }
    const user = userEvent.setup();
    renderWithMantine(<GoneOpener />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    const focus = vi.spyOn(opener, 'focus');
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove the opener' }));
    expect(opener.isConnected).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await pastExit();
    expect(focus).not.toHaveBeenCalled();
  });
});

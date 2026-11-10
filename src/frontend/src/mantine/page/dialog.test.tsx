/**
 * The kit Dialog (Mantine Modal) in jsdom: its roles, names, Escape and
 * focus. Its look and stacking are measured in a real browser in
 * tests/e2e/page-kit.spec.ts (ruling R10).
 */
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

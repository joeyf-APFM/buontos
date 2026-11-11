/**
 * Wave 2 Task 8a: the new-version confirm (Data Product, contract page, DQX
 * suggestions) on the kit Dialog as an alertdialog: no corner close, and a
 * refused version keeps it open. The version rules are in
 * create-version-dialog.test.tsx.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import CreateVersionDialog from './create-version-dialog';

function render() {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn();
  renderWithMantine(
    <CreateVersionDialog isOpen onOpenChange={onOpenChange} currentVersion="1.0.0" productTitle="orders" onSubmit={onSubmit} />,
  );
  return { onOpenChange, onSubmit };
}

describe('create version dialog', () => {
  it('create version dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('alertdialog', { name: 'Create New Version' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription(/for data product "orders".*\(1\.0\.0\)/);
  });

  it('create version dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSubmit } = render();
    const dialog = await screen.findByRole('alertdialog', { name: 'Create New Version' });
    const field = within(dialog).getByRole('textbox', { name: 'New Version String' });
    expect(field).toHaveValue('1.0.0');
    // Focus starts on Cancel, as in the Radix AlertDialog
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    expect(within(dialog).getByRole('button', { name: 'Create Version' })).toBeInTheDocument();
    // A confirm: no corner close
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
    expectNoOldMarkup(dialog);

    // An empty version is refused and the confirm stays open, the message tied to the field
    await user.clear(field);
    await user.click(within(dialog).getByRole('button', { name: 'Create Version' }));
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Version string cannot be empty.');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.type(field, '1.1.0');
    await user.click(within(dialog).getByRole('button', { name: 'Create Version' }));
    expect(onSubmit).toHaveBeenCalledWith('1.1.0');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('create version dialog closes on Escape and on Cancel', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSubmit } = render();
    await screen.findByRole('alertdialog', { name: 'Create New Version' });
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

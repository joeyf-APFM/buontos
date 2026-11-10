import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Modal } from '@mantine/core';
import { renderWithMantine } from '@/test/utils';
import { alertDialogRole } from './alert-dialog-role';

function Confirm({ opened, count = 0 }: { opened: boolean; count?: number }) {
  return (
    <Modal.Root opened={opened} onClose={() => {}}>
      <Modal.Overlay />
      <Modal.Content ref={alertDialogRole}>
        <Modal.Header>
          <Modal.Title>Delete it?</Modal.Title>
        </Modal.Header>
        <Modal.Body>This cannot be undone. ({count})</Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

describe('alertDialogRole', () => {
  it('makes a Mantine Modal an alertdialog, keeping its name, description and modality', async () => {
    renderWithMantine(<Confirm opened />);
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete it?' });
    expect(dialog.tagName).toBe('SECTION');
    expect(dialog).toHaveClass('mantine-Modal-content');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone. (0)');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the role across re-renders and a reopen', async () => {
    const { rerender } = renderWithMantine(<Confirm opened />);
    await screen.findByRole('alertdialog', { name: 'Delete it?' });
    rerender(<Confirm opened count={1} />);
    expect(screen.getByRole('alertdialog', { name: 'Delete it?' })).toHaveAccessibleDescription('This cannot be undone. (1)');
    rerender(<Confirm opened={false} />);
    rerender(<Confirm opened />);
    expect(await screen.findByRole('alertdialog', { name: 'Delete it?' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaves a Modal without it a dialog', async () => {
    renderWithMantine(
      <Modal opened onClose={() => {}} title="Edit it">
        body
      </Modal>,
    );
    expect(await screen.findByRole('dialog', { name: 'Edit it' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

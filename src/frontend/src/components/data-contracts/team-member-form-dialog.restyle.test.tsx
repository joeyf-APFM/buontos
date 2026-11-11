/**
 * Wave 2 Task 8a: the team member form (Data Product and contract pages) on
 * the kit Dialog, with Mantine fields around the shared PrincipalPicker. The
 * checks, the member it builds and the failed save are the Radix dialog's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import { useDirectoryStore } from '@/stores/directory-store';
import TeamMemberFormDialog from './team-member-form-dialog';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

beforeEach(() => {
  toast.mockClear();
  // No directory: the picker takes typed entries
  useDirectoryStore.setState({
    status: { configured: false, provider_type: null, connection_name: null },
    loaded: true,
    degraded: false,
    _inflight: null,
  });
});
afterEach(() => {
  // Unmounted first: a store reset under a mounted picker updates it outside act
  cleanup();
  useDirectoryStore.getState().reset();
  vi.restoreAllMocks();
});

function render(props: Partial<Parameters<typeof TeamMemberFormDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn(async () => {});
  renderWithMantine(<TeamMemberFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
  return { onOpenChange, onSubmit };
}

describe('team member form dialog', () => {
  it('team member form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Team Member' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Add a team member responsible for this data contract.');
  });

  it('team member form dialog keeps its fields and actions', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Team Member' });
    expect(within(dialog).getByRole('textbox', { name: /Role/ })).toHaveAttribute('placeholder', 'e.g., Data Owner, Steward, Engineer');
    expect(within(dialog).getByText('Email/Username')).toBeInTheDocument();
    // The label points at the picker's input, the only element with its id
    expect(within(dialog).getByTestId('principal-picker-input')).toHaveAttribute('id', 'email');
    expect(document.querySelectorAll('#email')).toHaveLength(1);
    expect(within(dialog).getByText('Email/Username').closest('label')).toHaveAttribute('for', 'email');
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'Full name (optional)');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Member' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);
  });

  it('team member form dialog checks the role and email, then submits the member', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Team Member' });
    await user.click(within(dialog).getByRole('button', { name: 'Add Member' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Role is required', variant: 'destructive' }));
    await user.type(within(dialog).getByRole('textbox', { name: /Role/ }), 'Steward');
    await user.click(within(dialog).getByRole('button', { name: 'Add Member' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Email/Username is required' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(within(dialog).getByTestId('principal-picker-input'), 'ana@example.com{Enter}');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Ana');
    await user.click(within(dialog).getByRole('button', { name: 'Add Member' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ role: 'Steward', email: 'ana@example.com', name: 'Ana' })));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('team member form dialog stays open with an error when the save fails', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render({
      initial: { role: 'Owner', username: 'ana', email: 'ana@example.com', name: 'Ana' },
      onSubmit: vi.fn(async () => { throw new Error('Member exists'); }),
    });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Team Member' });
    expect(within(dialog).getByRole('textbox', { name: /Role/ })).toHaveValue('Owner');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Member exists', variant: 'destructive' })));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

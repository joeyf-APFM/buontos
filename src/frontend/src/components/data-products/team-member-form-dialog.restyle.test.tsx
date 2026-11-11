/**
 * Wave 2 Task 8a fix round 1: the Data Product team member form (product
 * page) on the kit Dialog, with Mantine fields around the shared
 * PrincipalPicker. The username check, the ODPS member it builds, the toasts
 * and the failed save are the Radix dialog's.
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

describe('product team member form dialog', () => {
  it('product team member form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Team Member' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Add a team member responsible for this data product (ODPS v1.0.0).');
  });

  it('product team member form dialog keeps its fields and actions', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Team Member' });
    // The label points at the picker's input, the only element with its id; the hint is under it
    const picker = within(dialog).getByTestId('principal-picker-input');
    expect(picker).toHaveAttribute('id', 'username');
    expect(document.querySelectorAll('#username')).toHaveLength(1);
    expect(within(dialog).getByText('Username').closest('label')).toHaveAttribute('for', 'username');
    expect(within(dialog).getByText("User's username or email address (REQUIRED in ODPS)")).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Full Name' })).toHaveAttribute('placeholder', 'Full name (optional)');
    expect(within(dialog).getByRole('textbox', { name: 'Role' })).toHaveAccessibleDescription(
      "User's role in the team (e.g., owner, data steward, contributor)",
    );
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveProperty('tagName', 'TEXTAREA');
    expect(within(dialog).getByLabelText('Date Joined')).toHaveAttribute('type', 'date');
    expect(within(dialog).getByLabelText('Date Left')).toHaveAttribute('type', 'date');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Member' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);
  });

  it('product team member form dialog checks the username, then submits the member', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Team Member' });
    await user.click(within(dialog).getByRole('button', { name: 'Add Member' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Username is required', variant: 'destructive' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(within(dialog).getByTestId('principal-picker-input'), 'ana@example.com{Enter}');
    await user.type(within(dialog).getByRole('textbox', { name: 'Role' }), 'owner');
    await user.type(within(dialog).getByLabelText('Date Joined'), '2026-11-01');
    await user.click(within(dialog).getByRole('button', { name: 'Add Member' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      username: 'ana@example.com', name: undefined, description: undefined, role: 'owner', dateIn: '2026-11-01', dateOut: undefined,
    }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(toast).toHaveBeenLastCalledWith({ title: 'Success', description: 'Team member added' });
  });

  it('product team member form dialog shows no success toast when the save fails', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render({
      initial: { username: 'ana', name: 'Ana', role: 'owner', dateIn: '2026-01-02' },
      onSubmit: vi.fn(async () => { throw new Error('Member exists'); }),
    });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Team Member' });
    expect(within(dialog).getByRole('textbox', { name: 'Full Name' })).toHaveValue('Ana');
    expect(within(dialog).getByLabelText('Date Joined')).toHaveValue('2026-01-02');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Member exists', variant: 'destructive' })));
    expect(toast.mock.calls.filter(([arg]) => arg.title === 'Success')).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

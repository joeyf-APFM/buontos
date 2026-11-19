/**
 * Wave 2 Task 6: the contract metadata dialog (create on Data Contracts, edit
 * on the contract page) on the kit Dialog, with Mantine fields. The look and
 * the Escape layering in a real browser are in tests/e2e/data-contracts.spec.ts
 * (ruling R10); these tests check every field, the options, the payload, the
 * failed save and the discard confirm.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import dialogKit from '@/mantine/page/dialog.module.css';
import DataContractBasicFormDialog from './data-contract-basic-form-dialog';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

// Stable, as the real store's: the dialog loads the projects when it changes
const { fetchUserProjects } = vi.hoisted(() => ({ fetchUserProjects: () => {} }));
vi.mock('@/stores/project-store', () => ({
  useProjectContext: () => ({
    currentProject: null,
    availableProjects: [
      { id: 'proj-1', name: 'Revenue', team_count: 2 },
      // The same project twice must not break the field
      { id: 'proj-1', name: 'Revenue', team_count: 2 },
    ],
    isLoading: false,
    fetchUserProjects,
  }),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/api/teams/summary') return json([{ id: 't-1', name: 'Sales Analytics' }, { id: 't-2', name: 'Finance' }]);
    return json([]);
  }));
  toast.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const CREATE = 'Create Data Contract';

/** A Mantine Select's field (jsdom gives it the textbox role; the restyle check records it as a combobox, R3). */
const selectField = (dialog: HTMLElement, name: RegExp) => {
  const field = within(dialog).getByRole('textbox', { name });
  expect(field).toHaveAttribute('aria-haspopup', 'listbox');
  return field;
};
async function optionNames(user: ReturnType<typeof userEvent.setup>, field: HTMLElement) {
  await user.click(field);
  const list = document.getElementById(field.getAttribute('aria-controls') ?? '') as HTMLElement;
  const names = within(list).getAllByRole('option', { hidden: true }).map((o) => o.textContent);
  await user.click(field);
  return names;
}

function renderDialog(props: Partial<Parameters<typeof DataContractBasicFormDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn(async () => {});
  const view = renderWithMantine(
    <DataContractBasicFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />,
  );
  return { ...view, onOpenChange, onSubmit };
}

/** Creating hides the optional fields behind "Add details". */
async function openDetails(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('button', { name: 'Add details' }));
  // The collapse opens on the next animation frame
  await within(dialog).findByRole('textbox', { name: 'Version' });
}

describe('contract metadata dialog on the kit Dialog', () => {
  it('data contract create dialog keeps every field', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: CREATE });
    expect(dialog).toHaveClass('mantine-Modal-content', dialogKit.content);
    expect(dialog).toHaveAccessibleDescription(/Name it, choose the team that owns it/);

    expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveValue('');
    expect(within(dialog).getByRole('textbox', { name: 'Purpose' })).toHaveProperty('tagName', 'TEXTAREA');
    // Only what a new contract needs is shown; the rest waits behind "Add details", with what it starts as
    const toggle = within(dialog).getByRole('button', { name: 'Add details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).getByText(/Starts as Draft, version 0\.0\.1/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: 'Version' })).toBeNull();
    await openDetails(user, dialog);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByRole('textbox', { name: 'Version' })).toHaveValue('0.0.1');
    expect(within(dialog).getByRole('textbox', { name: 'Tenant' })).toBeInTheDocument();
    for (const name of ['Usage', 'Limitations']) {
      expect(within(dialog).getByRole('textbox', { name })).toHaveProperty('tagName', 'TEXTAREA');
    }
    const status = selectField(dialog, /Status/);
    expect(status).toBeEnabled();
    expect(status).toHaveValue('Draft');
    await waitFor(() => expect(selectField(dialog, /Owner Team/)).toBeEnabled());
    expect(selectField(dialog, /Owner Team/)).toHaveValue('None');
    expect(await optionNames(user, selectField(dialog, /Owner Team/))).toEqual(['None', 'Sales Analytics', 'Finance']);
    // One option per project, the repeated one dropped
    expect(await optionNames(user, selectField(dialog, /Project/))).toEqual(['None', 'Revenue (2 teams)']);
    expect(within(dialog).getByText('You can only select projects you are a member of')).toBeInTheDocument();

    expect(within(dialog).getByText('Domains')).toBeInTheDocument();
    expect(within(dialog).getByText('Tags')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create Contract' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    // No shadcn or Tailwind markup left in the form's own markup (the domain
    // and tag pickers are consumed as they are)
    expect(dialog.querySelector('.space-y-4, .grid-cols-2, .text-destructive, .border-t.pt-4, .text-base.font-semibold')).toBeNull();
  });

  it('data contract create dialog checks the name, then submits the payload', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: CREATE });
    await user.click(within(dialog).getByRole('button', { name: 'Create Contract' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Contract name is required', variant: 'destructive' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), ' Orders ');
    await openDetails(user, dialog);
    await user.click(selectField(dialog, /Status/));
    await user.click(await screen.findByRole('option', { name: 'Proposed', hidden: true }));
    await waitFor(() => expect(selectField(dialog, /Owner Team/)).toBeEnabled());
    await user.click(selectField(dialog, /Owner Team/));
    await user.click(await screen.findByRole('option', { name: 'Finance', hidden: true }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Purpose' }), 'Billing');
    await user.click(within(dialog).getByRole('button', { name: 'Create Contract' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Orders', version: '0.0.1', status: 'proposed', owner_team_id: 't-2', project_id: undefined,
      kind: 'DataContract', apiVersion: 'v3.1.0', description: { purpose: 'Billing', usage: undefined, limitations: undefined },
    }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('data contract create dialog stays open with the input when the save fails', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => { throw new Error('Name taken'); });
    const { onOpenChange } = renderDialog({ onSubmit });
    const dialog = await screen.findByRole('dialog', { name: CREATE });
    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Orders');
    await user.click(within(dialog).getByRole('button', { name: 'Create Contract' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Name taken', variant: 'destructive' })));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveValue('Orders');
    expect(within(dialog).getByRole('button', { name: 'Create Contract' })).toBeEnabled();
  });

  it('data contract edit dialog fills the fields and keeps the status read-only', async () => {
    renderDialog({ initial: { name: 'Orders', version: '1.0.0', status: 'active', owner_team_id: 't-1', tenant: 'retail' } });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract Metadata' });
    expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveValue('Orders');
    expect(within(dialog).getByRole('textbox', { name: 'Version' })).toHaveValue('1.0.0');
    expect(within(dialog).getByRole('textbox', { name: 'Tenant' })).toHaveValue('retail');
    expect(selectField(dialog, /Status/)).toBeDisabled();
    expect(selectField(dialog, /Status/)).toHaveValue('Active');
    await waitFor(() => expect(selectField(dialog, /Owner Team/)).toHaveValue('Sales Analytics'));
    expect(within(dialog).getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });

  it('data contract edit dialog keeps a status outside the lifecycle list as an option', async () => {
    renderDialog({ initial: { name: 'Old', status: 'certified' } });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Contract Metadata' });
    expect(selectField(dialog, /Status/)).toHaveValue('Certified');
  });

  it('data contract create dialog asks before discarding a change, in a stacked alertdialog', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: CREATE });

    // Unchanged: every close closes
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();

    // A change made only in a Select counts
    await openDetails(user, dialog);
    await user.click(selectField(dialog, /Status/));
    await user.click(await screen.findByRole('option', { name: 'Approved', hidden: true }));
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' });
    expect(confirm).toHaveClass(dialogKit.content);
    expect(onOpenChange).not.toHaveBeenCalled();

    // Escape closes only the confirm
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('dialog', { name: CREATE })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    // Escape on the dialog asks too; Continue Editing keeps the input
    await user.keyboard('{Escape}');
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Continue Editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(selectField(dialog, /Status/)).toHaveValue('Approved');
    expect(onOpenChange).not.toHaveBeenCalled();

    // Discard closes the dialog
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard Changes' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

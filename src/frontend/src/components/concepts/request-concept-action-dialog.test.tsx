import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithMantine as render, userEvent } from '@/test/utils';
import { optionNames, pick, selectField } from '@/test/kit-dialog';
import {
  RequestConceptActionDialog,
  type ConceptTransitionItem,
  type RequestConceptActionDialogProps,
} from './request-concept-action-dialog';

// The dialog is on the kit Dialog with a Mantine Select (wave 2 Task 15):
// it's driven through its field and listbox (test/kit-dialog), no longer a
// native <select> standing in for the Radix one.
const PICKER = 'What do you want to request?';

const reviewTransitions: ConceptTransitionItem[] = [
  { status: 'under_review', action: 'submit-review', labelKey: 'x:submit', defaultLabel: 'Submit' },
];
const reviewerTransitions: ConceptTransitionItem[] = [
  { status: 'approved', action: 'approve', labelKey: 'x:approve', defaultLabel: 'Approve' },
  { status: 'draft', action: 'reject', labelKey: 'x:requestChanges', defaultLabel: 'Request Changes' },
];

function renderDialog(overrides: Partial<RequestConceptActionDialogProps> = {}) {
  const props: RequestConceptActionDialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    conceptLabel: 'Customer',
    currentStatus: 'draft',
    transitions: reviewTransitions,
    newVersion: { disabled: false, onSelect: vi.fn() },
    onTransition: vi.fn(),
    ...overrides,
  };
  const utils = render(<RequestConceptActionDialog {...props} />);
  return { ...utils, props };
}

describe('RequestConceptActionDialog', () => {
  it('lists every transition plus New Version and mentions the concept', async () => {
    const user = userEvent.setup();
    renderDialog({ transitions: [...reviewTransitions, ...reviewerTransitions] });
    const dialog = await screen.findByRole('dialog', { name: 'Request Action' });
    expect(within(dialog).getByText(/Customer/)).toBeInTheDocument();
    const select = selectField(dialog, PICKER);
    expect(await optionNames(user, select)).toEqual(['Request Review', 'Approve', 'Request Changes', 'New Version']);
  });

  it('adapts the description and primary label to the selection', async () => {
    const user = userEvent.setup();
    renderDialog({ transitions: reviewerTransitions });
    const body = screen.getByTestId('request-concept-action-body');
    expect(within(body).getByText(/Approve this concept/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();

    const select = selectField(screen.getByRole('dialog'), PICKER);
    await pick(user, select, 'Request Changes');
    expect(within(body).getByText(/back to draft/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request Changes' })).toBeEnabled();

    await pick(user, select, 'New Version');
    expect(within(body).getByText(/IRI stays the same/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create New Version' })).toBeEnabled();
  });

  it('confirm closes the dialog and calls onTransition with status and action', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    expect(screen.getByText(/reviewer is chosen in the next step/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request Review' }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onTransition).toHaveBeenCalledWith('under_review', 'submit-review');
    expect(props.newVersion!.onSelect).not.toHaveBeenCalled();
  });

  it('New Version calls newVersion.onSelect', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({ transitions: [] });
    await user.click(screen.getByRole('button', { name: 'Create New Version' }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.newVersion!.onSelect).toHaveBeenCalledTimes(1);
    expect(props.onTransition).not.toHaveBeenCalled();
  });

  it('disabled New Version shows the reason and cannot be confirmed', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderDialog({
      newVersion: { disabled: true, disabledReason: 'Publish the concept first.', onSelect },
    });
    // Default selection skips the disabled option.
    expect(screen.getByRole('button', { name: 'Request Review' })).toBeEnabled();

    await pick(user, selectField(screen.getByRole('dialog'), PICKER), 'New Version');
    expect(screen.getByText('Publish the concept first.')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Create New Version' });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders nothing when there is nothing to offer', () => {
    const { container } = renderDialog({ transitions: [], newVersion: null });
    // The Mantine provider's own markup aside, it renders nothing
    expect(container.querySelector(':not(style)')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Request Action')).not.toBeInTheDocument();
  });

  it('busy disables confirm', () => {
    renderDialog({ busy: true });
    expect(screen.getByRole('button', { name: 'Request Review' })).toBeDisabled();
  });

  it('resets the selection when reopened', async () => {
    const user = userEvent.setup();
    const props: RequestConceptActionDialogProps = {
      open: true,
      onOpenChange: vi.fn(),
      transitions: reviewerTransitions,
      newVersion: null,
      onTransition: vi.fn(),
    };
    const { rerender } = render(<RequestConceptActionDialog {...props} />);
    await pick(user, selectField(await screen.findByRole('dialog'), PICKER), 'Request Changes');
    expect(screen.getByRole('button', { name: 'Request Changes' })).toBeInTheDocument();
    rerender(<RequestConceptActionDialog {...props} open={false} />);
    rerender(<RequestConceptActionDialog {...props} open />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });
});

/**
 * Wave 2 Task 8b: the Data Product page's commit-draft dialog
 * (components/data-products/commit-draft-dialog.tsx, the copy the product page
 * imports) on the kit Dialog, with a Mantine Radio.Group for the version and
 * Mantine Alerts. The diff, the version rule and the commit are unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import CommitDraftDialog from './commit-draft-dialog';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockToast = vi.fn();
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ get: mockGet, post: mockPost }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const DIFF = {
  parent_version: '1.2.3',
  suggested_bump: 'minor',
  suggested_version: '1.3.0',
  analysis: { summary: 'Added an output port' },
};

function renderDialog() {
  const handlers = { onOpenChange: vi.fn(), onSuccess: vi.fn() };
  renderWithMantine(<CommitDraftDialog isOpen productId="p-1" productName="Orders" {...handlers} />);
  return handlers;
}

describe('product CommitDraftDialog on the kit Dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: DIFF });
    mockPost.mockResolvedValue({ data: {} });
  });

  it('product commit draft dialog renders on the kit Dialog', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Commit Draft Changes' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Orders Commit your personal draft to make it visible to your team.');
  });

  it('product commit draft dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Commit Draft Changes' });
    expect(await within(dialog).findByText('Change Analysis')).toBeInTheDocument();
    expect(within(dialog).getByText('Based on your changes, we recommend a minor version bump.')).toBeInTheDocument();
    expect(within(dialog).getByText('Added an output port')).toBeInTheDocument();

    const group = within(dialog).getByRole('radiogroup', { name: 'Select Version' });
    expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['patch', 'minor', 'major', 'custom']);
    expect(within(group).getByRole('radio', { name: /^Minor \(1\.3\.0\)/ })).toBeChecked();
    expect(within(group).getByRole('radio', { name: /^Patch \(1\.2\.4\) - Bug fixes/ })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: /^Major \(2\.0\.0\)/ })).toBeInTheDocument();
    // The custom field shows only for a custom version
    expect(within(dialog).queryByPlaceholderText('e.g., 2.0.0')).toBeNull();
    await user.click(within(group).getByRole('radio', { name: 'Custom version' }));
    expect(within(dialog).getByRole('textbox', { name: 'Custom version' })).toHaveAttribute('placeholder', 'e.g., 2.0.0');

    expect(within(dialog).getByRole('textbox', { name: 'Change Summary *' })).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Commit Draft' })).toBeEnabled();
    expectNoOldMarkup(dialog);
  });

  it('product commit draft dialog commits the chosen version', async () => {
    const user = userEvent.setup();
    const { onSuccess, onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Commit Draft Changes' });
    await within(dialog).findByText('Change Analysis');
    await user.click(within(dialog).getByRole('button', { name: 'Commit Draft' }));
    expect(await within(dialog).findByText('Please provide a summary of changes')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: /^Major/ }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Change Summary *' }), 'New port');
    await user.click(within(dialog).getByRole('button', { name: 'Commit Draft' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('p-1'));
    expect(mockPost).toHaveBeenCalledWith('/api/data-products/p-1/commit', { new_version: '2.0.0', change_summary: 'New port' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Draft Committed' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('product commit draft dialog shows no success toast when the commit fails', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue({ error: 'Version taken' });
    const { onSuccess, onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Commit Draft Changes' });
    await within(dialog).findByText('Change Analysis');
    await user.type(within(dialog).getByRole('textbox', { name: 'Change Summary *' }), 'New port');
    await user.click(within(dialog).getByRole('button', { name: 'Commit Draft' }));
    expect(await within(dialog).findByText('Version taken')).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

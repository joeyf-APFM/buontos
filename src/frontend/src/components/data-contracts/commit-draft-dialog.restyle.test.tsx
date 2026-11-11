/**
 * Wave 2 Task 8b: the contract page's commit-draft dialog on the kit Dialog,
 * with kit Tabs for the change analysis, a Mantine Radio.Group for the bump
 * and Mantine Alerts. The diff fetch, the version rule and the commit are
 * unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import CommitDraftDialog from './commit-draft-dialog';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const DIFF = {
  parent_version: '1.2.3',
  parent_status: 'active',
  suggested_bump: 'minor',
  suggested_version: '1.3.0',
  analysis: {
    change_type: 'feature',
    version_bump: 'minor',
    summary: 'Added a column',
    breaking_changes: ['Dropped column x'],
    new_features: ['Added column y'],
    fixes: [],
  },
};

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const fetchMock = vi.fn();

function renderDialog() {
  const handlers = { onOpenChange: vi.fn(), onSuccess: vi.fn() };
  renderWithMantine(
    <CommitDraftDialog isOpen contractId="c-1" contractName="Orders" {...handlers} />,
  );
  return handlers;
}

describe('contract CommitDraftDialog on the kit Dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/diff-from-parent') ? json(DIFF) : json({}));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('contract commit draft dialog renders on the kit Dialog', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Commit Personal Draft' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Review your changes and commit to make this version visible to your team.');
  });

  it('contract commit draft dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Commit Personal Draft' });
    await within(dialog).findByText('1.2.3');

    // The versions, the suggestion and the breaking-change warning
    expect(within(dialog).getByText('1.3.0')).toBeInTheDocument();
    expect(within(dialog).getByText('MINOR')).toBeInTheDocument();
    expect(within(dialog).getByText('Breaking Changes Detected')).toBeInTheDocument();

    // The change analysis tabs: summary, breaking and features (no fixes)
    const tabs = within(dialog).getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Summary', 'Breaking (1)', 'Features (1)']);
    await user.click(within(dialog).getByRole('tab', { name: 'Breaking (1)' }));
    expect(within(dialog).getByRole('tabpanel')).toHaveTextContent('Dropped column x');

    // The bump: four choices, the suggested one chosen; custom opens its field
    const group = within(dialog).getByRole('radiogroup', { name: 'Version Bump Type' });
    expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['major', 'minor', 'patch', 'custom']);
    expect(within(group).getByRole('radio', { name: 'Minor (New Features)' })).toBeChecked();
    const custom = within(dialog).getByRole('textbox', { name: 'Custom Version' });
    expect(custom).toBeDisabled();
    await user.click(within(group).getByRole('radio', { name: 'Major (Breaking Changes)' }));
    expect(within(dialog).getByText('2.0.0')).toBeInTheDocument();

    // The summary, filled from the analysis
    expect(within(dialog).getByRole('textbox', { name: /Change Summary/ })).toHaveValue('Added a column');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Commit Version 2.0.0' })).toBeEnabled();
    expectNoOldMarkup(dialog);
  });

  it('contract commit draft dialog commits a custom version', async () => {
    const user = userEvent.setup();
    const { onSuccess, onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Commit Personal Draft' });
    await within(dialog).findByText('1.2.3');
    await user.click(within(dialog).getByRole('radio', { name: 'Custom Version' }));
    const custom = within(dialog).getByRole('textbox', { name: 'Custom Version' });
    await user.type(custom, '3.1');
    await user.click(within(dialog).getByRole('button', { name: 'Commit Version 3.1' }));
    expect(await within(dialog).findByText('Version must be in format X.Y.Z (e.g., 1.1.0)')).toBeInTheDocument();
    await user.type(custom, '.0');
    await user.click(within(dialog).getByRole('button', { name: 'Commit Version 3.1.0' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenLastCalledWith('/api/data-contracts/c-1/commit', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ new_version: '3.1.0', change_summary: 'Added a column' }),
    }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Draft Committed' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('contract commit draft dialog shows no success toast when the commit fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/diff-from-parent') ? json(DIFF) : json({ detail: 'Version taken' }, false));
    const { onSuccess, onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Commit Personal Draft' });
    await within(dialog).findByText('1.2.3');
    await user.click(within(dialog).getByRole('button', { name: 'Commit Version 1.3.0' }));
    expect(await within(dialog).findByText('Version taken')).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

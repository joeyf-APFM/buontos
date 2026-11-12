/**
 * Wave 2 Task 8a: the versioning recommendation (Data Product and contract
 * pages) on the kit Dialog, with kit Tabs for the change lists. The tabs, the
 * breaking-change alert, the detailed changes and the three actions are the
 * Radix dialog's.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import VersioningRecommendationDialog from './versioning-recommendation-dialog';

const ANALYSIS = {
  change_type: 'schema',
  version_bump: 'major',
  summary: 'Dropped a column\nAdded a port',
  breaking_changes: ['Dropped orders.amount'],
  new_features: ['Added port orders_api', 'Added a tag'],
  fixes: [],
  schema_changes: [{ change_type: 'removed', schema_name: 'orders', field_name: 'amount', severity: 'critical' }],
  port_changes: [{ change_type: 'added', port_type: 'output', port_name: 'orders_api', severity: 'minor' }],
};

function render(props: Partial<Parameters<typeof VersioningRecommendationDialog>[0]> = {}) {
  const handlers = { onOpenChange: vi.fn(), onUpdateInPlace: vi.fn(), onCreateNewVersion: vi.fn() };
  renderWithMantine(<VersioningRecommendationDialog isOpen analysis={ANALYSIS} userCanOverride {...handlers} {...props} />);
  return handlers;
}

const TITLE = 'Changes Detected - Version Recommendation';

describe('versioning recommendation dialog', () => {
  it('versioning recommendation dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Review the detected changes and decide whether to update in place or create a new version.');
  });

  it('versioning recommendation dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onUpdateInPlace, onCreateNewVersion } = render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expect(within(dialog).getByText('Recommended Version Bump:')).toBeInTheDocument();
    expect(within(dialog).getByText('MAJOR MAJOR')).toBeInTheDocument();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Breaking Changes Detected!');

    // One tab per kind of change there is (no fixes here)
    const tabs = within(dialog).getByRole('tablist');
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Summary', 'Breaking (1)', 'Features (2)']);
    expect(within(tabs).getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('tabpanel')).toHaveTextContent('Dropped a column');
    await user.click(within(tabs).getByRole('tab', { name: 'Breaking (1)' }));
    expect(within(dialog).getByRole('tabpanel')).toHaveTextContent('Dropped orders.amount');
    await user.click(within(tabs).getByRole('tab', { name: 'Features (2)' }));
    expect(within(within(dialog).getByRole('tabpanel')).getAllByRole('listitem')).toHaveLength(2);

    expect(within(dialog).getByText('Detailed Changes')).toBeInTheDocument();
    expect(within(dialog).getByText('Critical')).toBeInTheDocument();
    expect(within(dialog).getAllByText('orders_api').length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole('button', { name: 'Update In Place' }));
    expect(onUpdateInPlace).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: 'Create New Version' }));
    expect(onCreateNewVersion).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expectNoOldMarkup(dialog);
  });

  it('versioning recommendation dialog without an override offers only a new version', async () => {
    render({ userCanOverride: false, isUpdating: true });
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expect(dialog).toHaveAccessibleDescription('Breaking changes detected. A new version is required to maintain compatibility.');
    expect(within(dialog).queryByRole('button', { name: 'Update In Place' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('versioning recommendation dialog renders nothing without an analysis', () => {
    render({ analysis: null });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

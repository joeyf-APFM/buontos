/**
 * Wave 2 Task 8a: the direct certify and publish dialogs (Data Product and
 * contract pages) on the kit Dialog, each with a named Mantine Select. The
 * caller holds the choice and the submit, as before.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import type { CertificationLevel } from '@/types/lifecycle';
import { DirectCertifyDialog, DirectPublishDialog } from './direct-lifecycle-dialogs';

const level = (id: string, level_order: number, name: string): CertificationLevel =>
  ({ id, level_order, name, description: null, icon: null, color: null });
const LEVELS = [level('l-3', 3, 'Gold'), level('l-1', 1, 'Bronze'), level('l-2', 2, 'Silver')];

function renderCertify(props: Partial<Parameters<typeof DirectCertifyDialog>[0]> = {}) {
  const handlers = { onOpenChange: vi.fn(), onSelectedLevelOrderChange: vi.fn(), onConfirm: vi.fn() };
  renderWithMantine(
    <DirectCertifyDialog open certificationLevels={LEVELS} selectedLevelOrder={null} isSubmitting={false} {...handlers} {...props} />,
  );
  return handlers;
}

function renderPublish(props: Partial<Parameters<typeof DirectPublishDialog>[0]> = {}) {
  const handlers = { onOpenChange: vi.fn(), onSelectedScopeChange: vi.fn(), onConfirm: vi.fn() };
  renderWithMantine(<DirectPublishDialog open selectedScope="domain" isSubmitting={false} {...handlers} {...props} />);
  return handlers;
}

describe('direct certify dialog', () => {
  it('direct certify dialog renders on the kit Dialog', async () => {
    renderCertify();
    const dialog = await screen.findByRole('dialog', { name: 'Certify' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Choose a certification level. This applies immediately.');
  });

  it('direct certify dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onSelectedLevelOrderChange, onConfirm, onOpenChange } = renderCertify();
    const dialog = await screen.findByRole('dialog', { name: 'Certify' });
    const field = selectField(dialog, 'Certification level');
    expect(field).toHaveAttribute('placeholder', 'Select level');
    expect(await optionNames(user, field)).toEqual(['Bronze', 'Silver', 'Gold']);
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await pick(user, field, 'Silver');
    expect(onSelectedLevelOrderChange).toHaveBeenLastCalledWith(2);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
    expectNoOldMarkup(dialog);
  });

  it('direct certify dialog confirms a chosen level, with its own title', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderCertify({ selectedLevelOrder: 3, title: 'Certify Orders', description: 'Pick one' });
    const dialog = await screen.findByRole('dialog', { name: 'Certify Orders' });
    expect(selectField(dialog, 'Certification level')).toHaveValue('Gold');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('direct certify dialog keeps one option per level when two share an order', async () => {
    const user = userEvent.setup();
    renderCertify({ certificationLevels: [...LEVELS, level('l-dup', 2, 'Silver (copy)')] });
    const dialog = await screen.findByRole('dialog', { name: 'Certify' });
    expect(await optionNames(user, selectField(dialog, 'Certification level'))).toEqual(['Bronze', 'Silver', 'Gold']);
  });

  it('direct certify dialog can\'t confirm while submitting or with no levels', async () => {
    renderCertify({ selectedLevelOrder: 1, certificationLevels: [] });
    const dialog = await screen.findByRole('dialog', { name: 'Certify' });
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});

describe('direct publish dialog', () => {
  it('direct publish dialog renders on the kit Dialog', async () => {
    renderPublish();
    const dialog = await screen.findByRole('dialog', { name: 'Set publication scope' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Choose who can discover this entity when published.');
  });

  it('direct publish dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onSelectedScopeChange, onConfirm } = renderPublish();
    const dialog = await screen.findByRole('dialog', { name: 'Set publication scope' });
    const field = selectField(dialog, 'Publication scope');
    expect(field).toHaveValue('Domain');
    expect(await optionNames(user, field)).toEqual(['Not Published', 'Domain', 'Organization', 'External']);
    await pick(user, field, 'External');
    expect(onSelectedScopeChange).toHaveBeenLastCalledWith('external');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expectNoOldMarkup(dialog);
  });

  it('direct publish dialog disables its actions while submitting', async () => {
    renderPublish({ isSubmitting: true });
    const dialog = await screen.findByRole('dialog', { name: 'Set publication scope' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});
